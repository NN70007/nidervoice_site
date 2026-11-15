<?php
/**
 * Dictée NiderVoice en ligne (usage personnel de l'auteur).
 * Connexion par code à usage unique envoyé par e-mail (adresses de NV_DICTEE_EMAILS seulement).
 * Le modèle est stocké CHIFFRÉ hors du dossier public et n'est envoyé qu'après connexion.
 * La reconnaissance se fait dans le navigateur : ni le son ni le texte ne sont envoyés au serveur.
 */
declare(strict_types=1);

const NV_DICTEE_EMAILS = ['jb.niedercorn@gmail.com', 'jb@niedercorn.com'];
const NV_MAIL_FROM = 'NiderVoice <licences@nidervoice.com>';
const NV_COOKIE = 'nvdictee';
const NV_SESSION_HOURS = 12;
const NV_CODE_MINUTES = 10;

date_default_timezone_set('Europe/Luxembourg');

function nv_https(): bool
{
    return (($_SERVER['HTTPS'] ?? '') !== '' && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

function nv_dev(): bool
{
    return getenv('NV_DEV') === '1';
}

/** Dossier des données, à côté de public_html (jamais dans le dossier public). */
function nv_data_dir(): string
{
    $env = getenv('NV_DICTEE_DATA');
    $dir = $env ? rtrim($env, '/') : dirname(__DIR__, 3) . '/nidervoice_dictee';
    if (!is_dir($dir) && !@mkdir($dir, 0700, true)) {
        throw new RuntimeException('Dossier des données inaccessible');
    }
    return $dir;
}

function nv_db(): PDO
{
    static $db = null;
    if ($db !== null) {
        return $db;
    }
    $path = nv_data_dir() . '/dictee.sqlite';
    $db = new PDO('sqlite:' . $path, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    @chmod($path, 0600);
    $db->exec('PRAGMA busy_timeout = 5000');
    $db->exec('CREATE TABLE IF NOT EXISTS codes (email TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0)');
    $db->exec('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL)');
    $db->exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
    $db->exec('CREATE TABLE IF NOT EXISTS journal (at INTEGER NOT NULL, email TEXT NOT NULL, action TEXT NOT NULL)');
    $db->prepare('DELETE FROM sessions WHERE expires_at < ?')->execute([time()]);
    $db->prepare('DELETE FROM codes WHERE expires_at < ?')->execute([time()]);
    return $db;
}

function nv_log(string $email, string $action): void
{
    nv_db()->prepare('INSERT INTO journal (at, email, action) VALUES (?, ?, ?)')->execute([time(), $email, $action]);
}

function nv_set_cookie(string $value, int $expires): void
{
    setcookie(NV_COOKIE, $value, [
        'expires' => $expires, 'path' => '/dictee/', 'secure' => nv_https(),
        'httponly' => true, 'samesite' => 'Strict',
    ]);
}

function nv_session(): ?array
{
    $tok = $_COOKIE[NV_COOKIE] ?? '';
    if (!is_string($tok) || !preg_match('/^[0-9a-f]{64}$/', $tok)) {
        return null;
    }
    $st = nv_db()->prepare('SELECT email, csrf, expires_at FROM sessions WHERE token_hash = ?');
    $st->execute([hash('sha256', $tok)]);
    $s = $st->fetch();
    return ($s && (int) $s['expires_at'] >= time()) ? $s : null;
}

function nv_send_code(string $email): void
{
    $db = nv_db();
    $now = time();
    $st = $db->prepare('SELECT expires_at FROM codes WHERE email = ?');
    $st->execute([$email]);
    $prev = $st->fetchColumn();
    if ($prev !== false && (int) $prev - NV_CODE_MINUTES * 60 > $now - 60) {
        return; // une demande par minute
    }
    $hour = 'codes_' . gmdate('YmdH');
    $st = $db->prepare('SELECT v FROM meta WHERE k = ?');
    $st->execute([$hour]);
    $count = (int) $st->fetchColumn();
    if ($count >= 10) {
        return; // au plus 10 codes par heure
    }
    $db->prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')->execute([$hour, (string) ($count + 1)]);
    $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $db->prepare('INSERT INTO codes (email, code_hash, expires_at, attempts) VALUES (?, ?, ?, 0)
                  ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0')
        ->execute([$email, password_hash($code, PASSWORD_DEFAULT), $now + NV_CODE_MINUTES * 60]);
    if (nv_dev()) {
        file_put_contents(nv_data_dir() . '/dernier_code.txt', "$email $code\n");
        return;
    }
    $body = "Bonjour,\n\nVotre code d'accès à la dictée NiderVoice : $code\n\n"
        . 'Il est valable ' . NV_CODE_MINUTES . " minutes et ne peut servir qu'une fois.\n"
        . "Si vous n'avez pas demandé ce code, ignorez ce message.\n\nNiderVoice\n";
    $headers = 'From: ' . NV_MAIL_FROM . "\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit";
    @mail($email, mb_encode_mimeheader("Code d'accès — dictée NiderVoice", 'UTF-8'), $body, $headers);
}

function nv_check_code(string $email, string $code): bool
{
    $db = nv_db();
    $st = $db->prepare('SELECT code_hash, expires_at, attempts FROM codes WHERE email = ?');
    $st->execute([$email]);
    $r = $st->fetch();
    if (!$r || (int) $r['expires_at'] < time() || (int) $r['attempts'] >= 5) {
        return false;
    }
    $db->prepare('UPDATE codes SET attempts = attempts + 1 WHERE email = ?')->execute([$email]);
    if (!password_verify($code, $r['code_hash'])) {
        return false;
    }
    $db->prepare('DELETE FROM codes WHERE email = ?')->execute([$email]);
    return true;
}

/** En-têtes communs : isolation (calcul multi-cœurs dans le navigateur) et aucune connexion vers un autre site. */
function nv_headers(string $csp): void
{
    header('Cache-Control: no-store');
    header('Content-Security-Policy: ' . $csp);
    header('Cross-Origin-Opener-Policy: same-origin');
    header('Cross-Origin-Embedder-Policy: require-corp');
    header('Cross-Origin-Resource-Policy: same-origin');
    header('X-Frame-Options: DENY');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    header('X-Robots-Tag: noindex, nofollow');
    header('Permissions-Policy: microphone=(self), camera=(), geolocation=()');
}

function h(?string $s): string
{
    return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
