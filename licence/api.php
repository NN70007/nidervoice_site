<?php
/**
 * Licences NiderVoice — vérification appelée par le logiciel (au plus une
 * fois par jour, en HTTPS).
 *
 * Reçu : identifiant d'installation aléatoire, édition, version, choix pour
 * les statistiques et, seulement si l'utilisateur l'a autorisé, le nombre de
 * dictées par jour, modèle et langue. Jamais de texte, de son ni de nom.
 * L'adresse de connexion sert uniquement à déduire pays et ville (si les
 * statistiques sont autorisées) ; elle n'est jamais enregistrée.
 *
 * Renvoyé : un jeton signé (Ed25519) valable 30 jours, indiquant si la
 * licence est active ou désactivée.
 */
declare(strict_types=1);

require_once __DIR__ . '/lib/store.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function nv_reply(int $code, array $body): never
{
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($method === 'GET') {
        if (isset($_GET['cle'])) {
            nv_reply(200, ['ok' => true, 'public_key' => nv_public_key_b64()]);
        }
        nv_reply(200, ['ok' => true, 'service' => 'licences NiderVoice']);
    }
    if ($method !== 'POST') {
        nv_reply(405, ['ok' => false, 'error' => 'method']);
    }

    $raw = file_get_contents('php://input', false, null, 0, 32768);
    $in = json_decode((string) $raw, true);
    if (!is_array($in) || ($in['v'] ?? null) !== 1) {
        nv_reply(400, ['ok' => false, 'error' => 'format']);
    }
    $id = $in['install'] ?? '';
    $nonce = $in['nonce'] ?? '';
    $edition = $in['edition'] ?? '';
    $version = $in['version'] ?? '';
    $stats = $in['stats'] ?? null;
    if (!is_string($id) || !preg_match('/^[0-9a-f]{32}$/', $id)
        || !is_string($nonce) || !preg_match('/^[0-9a-f]{32}$/', $nonce)
        || !in_array($edition, NV_EDITIONS, true)
        || !is_string($version) || !preg_match('/^[0-9A-Za-z.+-]{1,32}$/', $version)
        || !is_bool($stats)) {
        nv_reply(400, ['ok' => false, 'error' => 'champs']);
    }

    // Comptages (uniquement si l'utilisateur a autorisé les statistiques).
    $usage = [];
    if ($stats) {
        $list = $in['usage'] ?? [];
        if (!is_array($list) || count($list) > 500) {
            nv_reply(400, ['ok' => false, 'error' => 'usage']);
        }
        $oldest = gmdate('Y-m-d', time() - 45 * 86400);
        $newest = gmdate('Y-m-d', time() + 86400);
        foreach ($list as $u) {
            if (!is_array($u)) {
                continue;
            }
            $d = $u['d'] ?? '';
            $m = $u['m'] ?? '';
            $l = $u['l'] ?? '';
            $n = $u['n'] ?? null;
            if (is_string($d) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) && $d >= $oldest && $d <= $newest
                && is_string($m) && preg_match('/^[a-z0-9._-]{1,64}$/', $m)
                && is_string($l) && preg_match('/^([a-z]{2,3}|auto)$/', $l)
                && is_int($n) && $n >= 0 && $n <= 100000) {
                $usage[] = [$d, $m, $l, $n];
            }
        }
    }

    $db = nv_db();
    $now = time();
    [$country, $city] = $stats ? nv_geolocate(nv_client_ip()) : [null, null];

    $db->beginTransaction();
    $db->prepare(<<<SQL
INSERT INTO installations (id, created_at, last_seen, edition, app_version, stats_consent, country, city, status)
VALUES (:id, :now, :now, :edition, :version, :stats, :country, :city, 'active')
ON CONFLICT(id) DO UPDATE SET
  last_seen = :now, edition = :edition, app_version = :version, stats_consent = :stats,
  country = CASE WHEN :stats = 1 THEN COALESCE(:country, installations.country) ELSE NULL END,
  city = CASE WHEN :stats = 1 THEN COALESCE(:city, installations.city) ELSE NULL END
SQL)->execute([
        ':id' => $id, ':now' => $now, ':edition' => $edition, ':version' => $version,
        ':stats' => $stats ? 1 : 0, ':country' => $country, ':city' => $city,
    ]);
    if ($stats) {
        $st = $db->prepare(<<<SQL
INSERT INTO usage_daily (install_id, day, model, lang, dictations) VALUES (?, ?, ?, ?, ?)
ON CONFLICT(install_id, day, model, lang) DO UPDATE SET dictations = MAX(dictations, excluded.dictations)
SQL);
        foreach ($usage as [$d, $m, $l, $n]) {
            $st->execute([$id, $d, $m, $l, $n]);
        }
    } else {
        // Statistiques refusées ou retirées : rien n'est gardé, l'historique est effacé.
        $db->prepare('DELETE FROM usage_daily WHERE install_id = ?')->execute([$id]);
    }
    $stStatus = $db->prepare('SELECT status FROM installations WHERE id = ?');
    $stStatus->execute([$id]);
    $status = (string) $stStatus->fetchColumn();
    $db->commit();

    try {
        nv_purge();
    } catch (Throwable $e) {
        error_log('NiderVoice licences, effacement : ' . $e->getMessage());
    }

    $token = nv_sign_token([
        'v' => 1,
        'install' => $id,
        'status' => $status === 'revoked' ? 'revoked' : 'active',
        'issued' => $now,
        'expires' => $now + NV_TOKEN_DAYS * 86400,
        'nonce' => $nonce,
    ]);
    nv_reply(200, ['ok' => true, 'token' => $token]);
} catch (Throwable $e) {
    if (isset($db) && $db->inTransaction()) {
        $db->rollBack();
    }
    error_log('NiderVoice licences : ' . $e->getMessage());
    nv_reply(500, ['ok' => false, 'error' => 'serveur']);
}
