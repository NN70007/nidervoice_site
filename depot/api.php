<?php
/**
 * Dépôt chiffré NiderVoice — réception des morceaux CHIFFRÉS envoyés par la page (session ouverte seulement).
 * Le serveur ne voit jamais ni le contenu, ni le nom des fichiers, ni la clé : tout est chiffré dans le navigateur
 * avec la clé publique de CHX. Il range les morceaux hors du dossier public ; CHX les récupère par SSH,
 * les déchiffre puis les efface. Aucune lecture ni téléchargement n'est possible par le web.
 *
 * Actions (POST, jeton CSRF dans l'en-tête X-CSRF) :
 *   start              → {id}
 *   chunk&id&i         → corps = morceau chiffré n° i (dans n'importe quel ordre, en parallèle,
 *                        ≤ NV_DEPOT_CHUNK + 16 octets), écrit à sa place ; <id>.ok note les morceaux reçus
 *   finish&id          → corps JSON {k: clé enveloppée b64, m: manifeste chiffré b64, n: nombre de morceaux}
 */
declare(strict_types=1);
const NV_APP = 'depot';
require_once __DIR__ . '/../dictee/lib/base.php';

const NV_DEPOT_CHUNK = 4 * 1024 * 1024;   // taille d'un morceau en clair (doit égaler CHUNK dans app.js)
const NV_DEPOT_MAX_BYTES = 20 * 1024 ** 3; // au plus 20 Go en attente sur le serveur
const NV_DEPOT_PART_HOURS = 24;           // envois inachevés effacés après 24 h

function depot_dir(): string
{
    $d = nv_data_dir() . '/depot';
    if (!is_dir($d) && !@mkdir($d, 0700, true)) {
        throw new RuntimeException('Dossier du dépôt inaccessible');
    }
    return $d;
}

function depot_used(string $d): int
{
    $t = 0;
    foreach (glob($d . '/*') ?: [] as $f) {
        $t += (int) @filesize($f);
    }
    return $t;
}

function fail(int $code, string $msg): never
{
    http_response_code($code);
    echo json_encode(['erreur' => $msg]);
    exit;
}

nv_headers("default-src 'none'; frame-ancestors 'none'");
header('Content-Type: application/json; charset=utf-8');
try {
    $s = nv_session();
    if (!$s || $_SERVER['REQUEST_METHOD'] !== 'POST' || !hash_equals($s['csrf'], (string) ($_SERVER['HTTP_X_CSRF'] ?? ''))) {
        fail(403, 'Session expirée : rechargez la page.');
    }
    $d = depot_dir();
    $action = (string) ($_GET['a'] ?? '');
    $id = (string) ($_GET['id'] ?? '');
    if ($action !== 'start' && !preg_match('/^[0-9a-f]{32}$/', $id)) {
        fail(400, 'Identifiant invalide.');
    }
    $part = "$d/$id.part";

    if ($action === 'start') {
        foreach (glob("$d/*.part") ?: [] as $old) {
            if (filemtime($old) < time() - NV_DEPOT_PART_HOURS * 3600) {
                @unlink($old);
                @unlink(substr($old, 0, -5) . '.ok');
            }
        }
        if (depot_used($d) > NV_DEPOT_MAX_BYTES) {
            fail(507, 'Espace d\'attente plein : CHX doit d\'abord récupérer les dépôts précédents.');
        }
        $id = bin2hex(random_bytes(16));
        touch("$d/$id.part");
        @chmod("$d/$id.part", 0600);
        echo json_encode(['id' => $id]);
    } elseif ($action === 'chunk') {
        $i = (int) ($_GET['i'] ?? -1);
        $offset = $i * (NV_DEPOT_CHUNK + 16);
        if (!is_file($part) || $i < 0 || $offset + NV_DEPOT_CHUNK + 16 > NV_DEPOT_MAX_BYTES) {
            fail(400, 'Morceau invalide.');
        }
        $body = file_get_contents('php://input', false, null, 0, NV_DEPOT_CHUNK + 17);
        if ($body === false || strlen($body) < 16 || strlen($body) > NV_DEPOT_CHUNK + 16) {
            fail(400, 'Morceau invalide.');
        }
        if (depot_used($d) + strlen($body) > NV_DEPOT_MAX_BYTES) {
            fail(507, 'Espace d\'attente plein.');
        }
        $f = fopen($part, 'c');
        flock($f, LOCK_EX);
        fseek($f, $offset);
        fwrite($f, $body);
        fflush($f);
        flock($f, LOCK_UN);
        fclose($f);
        $ok = fopen("$d/$id.ok", 'c');   // un octet « 1 » par morceau reçu
        flock($ok, LOCK_EX);
        fseek($ok, $i);
        fwrite($ok, '1');
        flock($ok, LOCK_UN);
        fclose($ok);
        @chmod("$d/$id.ok", 0600);
        echo json_encode(['ok' => true]);
    } elseif ($action === 'finish') {
        $j = json_decode((string) file_get_contents('php://input', false, null, 0, 65536), true);
        $n = (int) ($j['n'] ?? 0);
        $k = (string) ($j['k'] ?? '');
        $m = (string) ($j['m'] ?? '');
        clearstatcache();
        $size = is_file($part) ? filesize($part) : -1;
        $okSize = $n >= 1 && $size > ($n - 1) * (NV_DEPOT_CHUNK + 16) && $size <= $n * (NV_DEPOT_CHUNK + 16);
        $allChunks = @file_get_contents("$d/$id.ok") === str_repeat('1', max(1, $n));
        if (!$okSize || !$allChunks || !preg_match('#^[A-Za-z0-9+/=]{684}$#', $k) || !preg_match('#^[A-Za-z0-9+/=]{20,40000}$#', $m)) {
            fail(400, 'Fin d\'envoi invalide.');
        }
        rename($part, "$d/$id.bin");
        @unlink("$d/$id.ok");
        $tmp = "$d/$id.tmp";
        file_put_contents($tmp, json_encode(['v' => 1, 'k' => $k, 'm' => $m, 'n' => $n, 'c' => NV_DEPOT_CHUNK]));
        @chmod($tmp, 0600);
        rename($tmp, "$d/$id.json"); // le .json n'apparaît qu'une fois tout en place : CHX ne prend que ceux-là
        nv_log($s['email'], 'depot ' . $size . ' octets');
        echo json_encode(['ok' => true]);
    } else {
        fail(400, 'Action inconnue.');
    }
} catch (Throwable $e) {
    error_log('Dépôt NiderVoice : ' . $e->getMessage());
    fail(500, 'Erreur du serveur.');
}
