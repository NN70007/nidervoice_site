<?php
/**
 * Licences NiderVoice — base de données, signature des jetons,
 * géolocalisation et effacement automatique.
 */
declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/mmdb.php';

function nv_db(): PDO
{
    static $db = null;
    if ($db !== null) {
        return $db;
    }
    $path = nv_data_dir() . '/licences.sqlite';
    $db = new PDO('sqlite:' . $path, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    @chmod($path, 0600);
    $db->exec('PRAGMA journal_mode = WAL');
    $db->exec('PRAGMA busy_timeout = 5000');
    $db->exec('PRAGMA foreign_keys = ON');
    $db->exec(<<<SQL
CREATE TABLE IF NOT EXISTS installations (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  edition TEXT NOT NULL,
  app_version TEXT NOT NULL,
  stats_consent INTEGER NOT NULL DEFAULT 0,
  country TEXT,
  city TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  status_changed_at INTEGER,
  note TEXT
);
CREATE TABLE IF NOT EXISTS usage_daily (
  install_id TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  model TEXT NOT NULL,
  lang TEXT NOT NULL,
  dictations INTEGER NOT NULL,
  PRIMARY KEY (install_id, day, model, lang)
);
CREATE TABLE IF NOT EXISTS usage_monthly (
  month TEXT NOT NULL,
  country TEXT NOT NULL,
  model TEXT NOT NULL,
  lang TEXT NOT NULL,
  dictations INTEGER NOT NULL,
  installations INTEGER NOT NULL,
  PRIMARY KEY (month, country, model, lang)
);
CREATE TABLE IF NOT EXISTS admin_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  csrf TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_log (
  at INTEGER NOT NULL,
  email TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT
);
CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
SQL);
    return $db;
}

function nv_meta_get(string $k): ?string
{
    $st = nv_db()->prepare('SELECT v FROM meta WHERE k = ?');
    $st->execute([$k]);
    $v = $st->fetchColumn();
    return $v === false ? null : (string) $v;
}

function nv_meta_set(string $k, string $v): void
{
    nv_db()->prepare('INSERT INTO meta(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
        ->execute([$k, $v]);
}

/* ---------- Signature des jetons (Ed25519) ---------- */

/** Clé de signature, créée une seule fois par le serveur lui-même. */
function nv_signing_key(): array
{
    $file = nv_data_dir() . '/cle_signature.json';
    if (is_file($file)) {
        $k = json_decode((string) file_get_contents($file), true);
        if (is_array($k) && isset($k['secret'], $k['public'])) {
            return [base64_decode($k['secret']), base64_decode($k['public'])];
        }
        throw new RuntimeException('Clé de signature illisible');
    }
    // Verrou : une seule clé est créée, même si deux demandes arrivent ensemble.
    $lock = fopen($file . '.lock', 'c');
    flock($lock, LOCK_EX);
    try {
        if (!is_file($file)) {
            $pair = sodium_crypto_sign_keypair();
            $json = json_encode([
                'avertissement' => 'CLÉ PRIVÉE des licences NiderVoice — ne jamais diffuser. À sauvegarder : si elle est perdue, les logiciels installés devront être mis à jour.',
                'cree_le' => gmdate('c'),
                'secret' => base64_encode(sodium_crypto_sign_secretkey($pair)),
                'public' => base64_encode(sodium_crypto_sign_publickey($pair)),
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            $tmp = $file . '.tmp';
            file_put_contents($tmp, $json);
            @chmod($tmp, 0600);
            rename($tmp, $file);
        }
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
    return nv_signing_key();
}

function nv_public_key_b64(): string
{
    return base64_encode(nv_signing_key()[1]);
}

/** Jeton = base64(charge utile JSON) "." base64(signature de la charge utile). */
function nv_sign_token(array $payload): string
{
    $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $sig = sodium_crypto_sign_detached($json, nv_signing_key()[0]);
    return base64_encode($json) . '.' . base64_encode($sig);
}

/* ---------- Géolocalisation (DB-IP Lite, sur le serveur) ---------- */

function nv_geo_path(): string
{
    return nv_data_dir() . '/dbip-city-lite.mmdb';
}

/**
 * Pays (code ISO) et ville déduits de l'adresse. L'adresse n'est ni
 * enregistrée ni transmise : elle ne sert qu'à cette recherche.
 * @return array{0: ?string, 1: ?string}
 */
function nv_geolocate(string $ip): array
{
    static $reader = false;
    if (preg_match('/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i', $ip, $m)) {
        $ip = $m[1];
    }
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
        return [null, null];
    }
    if ($reader === false) {
        try {
            $reader = is_file(nv_geo_path()) ? new NvMmdb(nv_geo_path()) : null;
        } catch (Throwable $e) {
            $reader = null;
        }
    }
    if ($reader === null) {
        return [null, null];
    }
    try {
        $r = $reader->get($ip);
    } catch (Throwable $e) {
        return [null, null];
    }
    $country = $r['country']['iso_code'] ?? null;
    $city = $r['city']['names']['fr'] ?? $r['city']['names']['en'] ?? null;
    return [
        is_string($country) ? substr($country, 0, 2) : null,
        is_string($city) ? mb_substr($city, 0, 80) : null,
    ];
}

/** Adresse de la connexion (derrière le cache de Hostinger si présent). */
function nv_client_ip(): string
{
    $xff = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
    if ($xff !== '') {
        $first = trim(explode(',', $xff)[0]);
        if (filter_var($first, FILTER_VALIDATE_IP)) {
            return $first;
        }
    }
    return (string) ($_SERVER['REMOTE_ADDR'] ?? '');
}

/**
 * Télécharge la base DB-IP « IP to City Lite » du mois (sinon du mois
 * précédent), la vérifie, puis remplace l'ancienne.
 */
function nv_geo_update(): string
{
    @set_time_limit(300);
    $tmpGz = nv_data_dir() . '/dbip.tmp.gz';
    $tmp = nv_data_dir() . '/dbip.tmp.mmdb';
    $errors = [];
    foreach ([0, 1] as $back) {
        $month = gmdate('Y-m', strtotime("first day of -$back month"));
        $url = "https://download.db-ip.com/free/dbip-city-lite-$month.mmdb.gz";
        $fh = fopen($tmpGz, 'wb');
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_FILE => $fh,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => 240,
            CURLOPT_FAILONERROR => true,
            CURLOPT_USERAGENT => 'NiderVoice-licences',
        ]);
        $ok = curl_exec($ch);
        $err = curl_error($ch);
        curl_close($ch);
        fclose($fh);
        if (!$ok) {
            $errors[] = "$month : $err";
            continue;
        }
        $in = gzopen($tmpGz, 'rb');
        $out = fopen($tmp, 'wb');
        while (!gzeof($in)) {
            fwrite($out, gzread($in, 1 << 20));
        }
        gzclose($in);
        fclose($out);
        @unlink($tmpGz);
        try {
            $r = new NvMmdb($tmp);
            $probe = $r->get('8.8.8.8');
            unset($r);
            if (!isset($probe['country']['iso_code'])) {
                throw new RuntimeException('contrôle de lecture négatif');
            }
        } catch (Throwable $e) {
            @unlink($tmp);
            $errors[] = "$month : " . $e->getMessage();
            continue;
        }
        rename($tmp, nv_geo_path());
        nv_meta_set('geo_month', $month);
        nv_meta_set('geo_updated_at', (string) time());
        return $month;
    }
    @unlink($tmpGz);
    throw new RuntimeException('Mise à jour impossible (' . implode(' ; ', $errors) . ')');
}

/* ---------- Effacement automatique ---------- */

/** Une fois par jour au plus : regroupe et efface selon les durées annoncées. */
function nv_purge(bool $force = false): void
{
    $db = nv_db();
    $today = gmdate('Y-m-d');
    if (!$force && nv_meta_get('purged_on') === $today) {
        return;
    }
    $limitDay = gmdate('Y-m-d', time() - NV_DETAIL_DAYS * 86400);
    $db->beginTransaction();
    try {
        // Détail ancien -> totaux anonymes par mois et par pays.
        $db->prepare(<<<SQL
INSERT INTO usage_monthly (month, country, model, lang, dictations, installations)
SELECT substr(u.day, 1, 7), COALESCE(i.country, '??'), u.model, u.lang,
       SUM(u.dictations), COUNT(DISTINCT u.install_id)
FROM usage_daily u JOIN installations i ON i.id = u.install_id
WHERE u.day < ?
GROUP BY substr(u.day, 1, 7), COALESCE(i.country, '??'), u.model, u.lang
ON CONFLICT(month, country, model, lang) DO UPDATE SET
  dictations = dictations + excluded.dictations,
  installations = MAX(installations, excluded.installations)
SQL)->execute([$limitDay]);
        $db->prepare('DELETE FROM usage_daily WHERE day < ?')->execute([$limitDay]);
        $db->prepare('DELETE FROM installations WHERE last_seen < ?')
            ->execute([time() - NV_INACTIVE_DAYS * 86400]);
        $db->prepare('DELETE FROM usage_monthly WHERE month < ?')
            ->execute([gmdate('Y-m', strtotime('-' . NV_MONTHLY_KEEP_MONTHS . ' months'))]);
        $db->prepare('DELETE FROM admin_codes WHERE expires_at < ?')->execute([time()]);
        $db->prepare('DELETE FROM admin_sessions WHERE expires_at < ?')->execute([time()]);
        $db->prepare('DELETE FROM admin_log WHERE at < ?')->execute([time() - 3 * 365 * 86400]);
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        throw $e;
    }
    nv_meta_set('purged_on', $today);
}
