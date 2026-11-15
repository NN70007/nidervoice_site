<?php
/**
 * Change le verrou du modèle (cle.json) quand l'utilisateur change sa phrase secrète.
 * Le navigateur envoie seulement la clé du modèle déjà re-verrouillée par la nouvelle phrase :
 * ni la phrase ni la clé en clair ne passent par le serveur.
 */
declare(strict_types=1);
require_once __DIR__ . '/lib/base.php';

nv_headers("default-src 'none'; frame-ancestors 'none'");
header('Content-Type: application/json');
try {
    $s = nv_session();
    if (!$s || $_SERVER['REQUEST_METHOD'] !== 'POST' || !hash_equals($s['csrf'], (string) ($_SERVER['HTTP_X_CSRF'] ?? ''))) {
        http_response_code(403);
        exit('{"ok":false}');
    }
    $raw = file_get_contents('php://input', false, null, 0, 2048);
    $c = json_decode((string) $raw, true);
    $b64 = static fn($v, int $len) => is_string($v) && ($d = base64_decode($v, true)) !== false && strlen($d) === $len;
    if (!is_array($c) || ($c['version'] ?? null) !== 1 || ($c['kdf'] ?? null) !== 'PBKDF2-SHA256'
        || !is_int($c['iter'] ?? null) || $c['iter'] < 300000 || $c['iter'] > 5000000
        || !$b64($c['salt'] ?? null, 16) || !$b64($c['iv'] ?? null, 12) || !$b64($c['wrapped'] ?? null, 48)) {
        http_response_code(400);
        exit('{"ok":false}');
    }
    $dir = nv_data_dir() . '/modele';
    $clean = json_encode(['version' => 1, 'kdf' => 'PBKDF2-SHA256', 'iter' => $c['iter'], 'salt' => $c['salt'], 'iv' => $c['iv'], 'wrapped' => $c['wrapped']], JSON_PRETTY_PRINT);
    @copy("$dir/cle.json", "$dir/cle.precedente.json");
    file_put_contents("$dir/cle.json.tmp", $clean);
    @chmod("$dir/cle.json.tmp", 0600);
    rename("$dir/cle.json.tmp", "$dir/cle.json");
    nv_log($s['email'], 'phrase secrète changée');
    echo '{"ok":true}';
} catch (Throwable $e) {
    error_log('Dictée NiderVoice (cle) : ' . $e->getMessage());
    http_response_code(500);
    echo '{"ok":false}';
}
