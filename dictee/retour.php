<?php
/**
 * Fiche de retour de la dictée : reçoit une liste de mots corrigés DÉJÀ CHIFFRÉE dans le navigateur
 * avec la clé publique de CHX, et la range dans l'attente du dépôt chiffré (même format qu'un dépôt d'un
 * seul morceau). CHX la récupère, la déchiffre et la range dans Dropbox\Retours-dictee.
 * Ne fait PAS : le serveur ne peut pas lire la liste ; aucune lecture ni téléchargement par le web.
 * Limites : 64 Ko par envoi, 20 envois par jour.
 */
declare(strict_types=1);
require_once __DIR__ . '/lib/base.php';

const NV_RETOUR_MAX = 65536;
const NV_RETOUR_PAR_JOUR = 20;
const NV_DEPOT_CHUNK = 4 * 1024 * 1024; // même valeur que depot/api.php (taille annoncée à CHX)

nv_headers("default-src 'none'; frame-ancestors 'none'");
header('Content-Type: application/json; charset=utf-8');
try {
    $s = nv_session();
    if (!$s || $_SERVER['REQUEST_METHOD'] !== 'POST' || !hash_equals($s['csrf'], (string) ($_SERVER['HTTP_X_CSRF'] ?? ''))) {
        http_response_code(403);
        exit('{"ok":false}');
    }
    $j = json_decode((string) file_get_contents('php://input', false, null, 0, NV_RETOUR_MAX * 2), true);
    $k = (string) ($j['k'] ?? '');
    $m = (string) ($j['m'] ?? '');
    $c = base64_decode((string) ($j['c'] ?? ''), true);
    if (!preg_match('#^[A-Za-z0-9+/=]{684}$#', $k) || !preg_match('#^[A-Za-z0-9+/=]{20,4000}$#', $m)
        || $c === false || strlen($c) < 17 || strlen($c) > NV_RETOUR_MAX) {
        http_response_code(400);
        exit('{"ok":false}');
    }
    $db = nv_db();
    $jour = 'retours_' . date('Ymd');
    $st = $db->prepare('SELECT v FROM meta WHERE k = ?');
    $st->execute([$jour]);
    $n = (int) $st->fetchColumn();
    if ($n >= NV_RETOUR_PAR_JOUR) {
        http_response_code(429);
        exit('{"ok":false}');
    }
    $db->prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')->execute([$jour, (string) ($n + 1)]);
    $d = nv_data_dir() . '/depot';
    if (!is_dir($d) && !@mkdir($d, 0700, true)) {
        throw new RuntimeException('Dossier du dépôt inaccessible');
    }
    $id = bin2hex(random_bytes(16));
    file_put_contents("$d/$id.bin", $c);
    @chmod("$d/$id.bin", 0600);
    file_put_contents("$d/$id.tmp", json_encode(['v' => 1, 'k' => $k, 'm' => $m, 'n' => 1, 'c' => NV_DEPOT_CHUNK]));
    @chmod("$d/$id.tmp", 0600);
    rename("$d/$id.tmp", "$d/$id.json"); // CHX ne prend un dépôt qu'une fois son .json présent
    nv_log($s['email'], 'retour de mots ' . strlen($c) . ' octets');
    echo '{"ok":true}';
} catch (Throwable $e) {
    error_log('Dictée NiderVoice (retour) : ' . $e->getMessage());
    http_response_code(500);
    echo '{"ok":false}';
}
