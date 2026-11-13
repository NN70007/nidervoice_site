<?php
/**
 * Licences NiderVoice — espace d'administration.
 * Connexion par un code à usage unique envoyé par e-mail à l'une des
 * adresses autorisées (NV_ADMIN_EMAILS). Aucune page n'utilise de script.
 */
declare(strict_types=1);

require_once __DIR__ . '/lib/store.php';

const NV_COOKIE = 'nvlic';
$nonce = base64_encode(random_bytes(12));
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header("Content-Security-Policy: default-src 'none'; style-src 'nonce-$nonce'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Robots-Tag: noindex, nofollow');

date_default_timezone_set('Europe/Luxembourg');
$https = (($_SERVER['HTTPS'] ?? '') !== '' && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
$dev = getenv('NV_DEV') === '1';
if (!$https && !$dev) {
    header('Location: https://' . ($_SERVER['HTTP_HOST'] ?? 'nidervoice.com') . ($_SERVER['REQUEST_URI'] ?? '/licence/admin.php'), true, 301);
    exit;
}

function h(?string $s): string
{
    return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function nv_log(string $email, string $action, ?string $target = null): void
{
    nv_db()->prepare('INSERT INTO admin_log (at, email, action, target) VALUES (?, ?, ?, ?)')
        ->execute([time(), $email, $action, $target]);
}

function nv_set_cookie(string $value, int $expires): void
{
    global $https;
    setcookie(NV_COOKIE, $value, [
        'expires' => $expires,
        'path' => '/licence/',
        'secure' => $https,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}

function nv_current_session(): ?array
{
    $tok = $_COOKIE[NV_COOKIE] ?? '';
    if (!is_string($tok) || !preg_match('/^[0-9a-f]{64}$/', $tok)) {
        return null;
    }
    $st = nv_db()->prepare('SELECT email, csrf, expires_at FROM admin_sessions WHERE token_hash = ?');
    $st->execute([hash('sha256', $tok)]);
    $s = $st->fetch();
    if (!$s || (int) $s['expires_at'] < time()) {
        return null;
    }
    return $s;
}

function nv_send_code(string $email): void
{
    $db = nv_db();
    $now = time();
    // Une demande par minute et par adresse ; au plus 20 codes par heure en tout.
    $st = $db->prepare('SELECT expires_at FROM admin_codes WHERE email = ?');
    $st->execute([$email]);
    $prev = $st->fetchColumn();
    if ($prev !== false && (int) $prev - NV_CODE_MINUTES * 60 > $now - 60) {
        return;
    }
    $hour = gmdate('YmdH');
    $count = nv_meta_get('codes_' . $hour);
    if ((int) $count >= 20) {
        return;
    }
    nv_meta_set('codes_' . $hour, (string) ((int) $count + 1));
    $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $db->prepare('INSERT INTO admin_codes (email, code_hash, expires_at, attempts) VALUES (?, ?, ?, 0)
                  ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0')
        ->execute([$email, password_hash($code, PASSWORD_DEFAULT), $now + NV_CODE_MINUTES * 60]);
    $body = "Bonjour,\n\nVotre code d'accès à l'espace des licences NiderVoice : $code\n\n"
        . 'Il est valable ' . NV_CODE_MINUTES . " minutes et ne peut servir qu'une fois.\n"
        . "Si vous n'avez pas demandé ce code, ignorez ce message.\n\nNiderVoice\n";
    if (getenv('NV_DEV') === '1') {
        file_put_contents(nv_data_dir() . '/dernier_code.txt', "$email $code\n");
        return;
    }
    $headers = 'From: ' . NV_MAIL_FROM . "\r\n"
        . "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit";
    @mail($email, mb_encode_mimeheader('Code d\'accès — licences NiderVoice', 'UTF-8'), $body, $headers);
}

function nv_check_code(string $email, string $code): bool
{
    $db = nv_db();
    $st = $db->prepare('SELECT code_hash, expires_at, attempts FROM admin_codes WHERE email = ?');
    $st->execute([$email]);
    $r = $st->fetch();
    if (!$r || (int) $r['expires_at'] < time() || (int) $r['attempts'] >= 5) {
        return false;
    }
    $db->prepare('UPDATE admin_codes SET attempts = attempts + 1 WHERE email = ?')->execute([$email]);
    if (!password_verify($code, $r['code_hash'])) {
        return false;
    }
    $db->prepare('DELETE FROM admin_codes WHERE email = ?')->execute([$email]);
    return true;
}

$flash = '';
$step = 'email';
$pendingEmail = '';
$session = null;

try {
    $session = nv_current_session();
    $action = (string) ($_POST['action'] ?? '');
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if (!$session) {
            $email = strtolower(trim((string) ($_POST['email'] ?? '')));
            if ($action === 'send' && filter_var($email, FILTER_VALIDATE_EMAIL)) {
                if (in_array($email, NV_ADMIN_EMAILS, true)) {
                    nv_send_code($email);
                }
                $flash = "Si cette adresse est autorisée, un code vient d'y être envoyé. Pensez à regarder dans les indésirables.";
                $step = 'code';
                $pendingEmail = $email;
            } elseif ($action === 'verify') {
                $code = preg_replace('/\D/', '', (string) ($_POST['code'] ?? ''));
                if (in_array($email, NV_ADMIN_EMAILS, true) && strlen($code) === 6 && nv_check_code($email, $code)) {
                    $tok = bin2hex(random_bytes(32));
                    $exp = time() + NV_ADMIN_SESSION_HOURS * 3600;
                    nv_db()->prepare('INSERT INTO admin_sessions (token_hash, email, csrf, expires_at) VALUES (?, ?, ?, ?)')
                        ->execute([hash('sha256', $tok), $email, bin2hex(random_bytes(16)), $exp]);
                    nv_set_cookie($tok, $exp);
                    nv_log($email, 'connexion');
                    header('Location: admin.php', true, 303);
                    exit;
                }
                $flash = 'Code incorrect ou expiré.';
                $step = 'code';
                $pendingEmail = $email;
            }
        } else {
            if (!hash_equals($session['csrf'], (string) ($_POST['csrf'] ?? ''))) {
                http_response_code(400);
                exit('Demande refusée.');
            }
            $target = (string) ($_POST['id'] ?? '');
            if (($action === 'revoke' || $action === 'reactivate') && preg_match('/^[0-9a-f]{32}$/', $target)) {
                $new = $action === 'revoke' ? 'revoked' : 'active';
                $st = nv_db()->prepare('UPDATE installations SET status = ?, status_changed_at = ? WHERE id = ?');
                $st->execute([$new, time(), $target]);
                if ($st->rowCount() === 1) {
                    nv_log($session['email'], $action === 'revoke' ? 'désactivation' : 'réactivation', $target);
                    $flash = $action === 'revoke'
                        ? 'Installation désactivée : la dictée s\'arrêtera à sa prochaine vérification.'
                        : 'Installation réactivée : la dictée reprendra à sa prochaine vérification.';
                }
            } elseif ($action === 'note' && preg_match('/^[0-9a-f]{32}$/', $target)) {
                $note = mb_substr(trim((string) ($_POST['note'] ?? '')), 0, 120);
                nv_db()->prepare('UPDATE installations SET note = ? WHERE id = ?')->execute([$note === '' ? null : $note, $target]);
                $flash = 'Note enregistrée.';
            } elseif ($action === 'geo') {
                $month = nv_geo_update();
                nv_log($session['email'], 'mise à jour géolocalisation', $month);
                $flash = "Base de géolocalisation mise à jour ($month).";
            } elseif ($action === 'logout') {
                nv_db()->prepare('DELETE FROM admin_sessions WHERE token_hash = ?')
                    ->execute([hash('sha256', (string) $_COOKIE[NV_COOKIE])]);
                nv_set_cookie('', time() - 3600);
                header('Location: admin.php', true, 303);
                exit;
            }
        }
    }
    nv_purge();
} catch (Throwable $e) {
    error_log('NiderVoice licences (admin) : ' . $e->getMessage());
    $flash = 'Erreur : ' . $e->getMessage();
}

function nv_date(?int $t, bool $time = true): string
{
    return $t ? date($time ? 'd/m/Y H:i' : 'd/m/Y', $t) : '—';
}

function nv_country(?string $code): string
{
    if (!$code) {
        return '—';
    }
    if (class_exists('Locale')) {
        $n = Locale::getDisplayRegion('-' . $code, 'fr');
        if ($n && $n !== $code) {
            return $n;
        }
    }
    return $code;
}
?><!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Licences NiderVoice</title>
<style nonce="<?= h($nonce) ?>">
:root { --navy:#0C447C; --blue:#378ADD; --ink:#1b2430; --mute:#5b6675; --line:#dde3ea; --bg:#f6f8fb; --red:#b3261e; --green:#1D9E75; }
* { box-sizing:border-box; }
body { margin:0; font:15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color:var(--ink); background:var(--bg); }
header { background:var(--navy); color:#fff; padding:14px 24px; display:flex; align-items:center; justify-content:space-between; gap:16px; }
header h1 { font-size:17px; font-weight:600; margin:0; }
header form { margin:0; }
main { max-width:1200px; margin:0 auto; padding:24px; }
.card { background:#fff; border:1px solid var(--line); border-radius:10px; padding:20px; margin-bottom:20px; }
.narrow { max-width:420px; margin:48px auto; }
h2 { font-size:16px; margin:0 0 12px; }
label { display:block; font-weight:600; margin:0 0 6px; }
input[type=email], input[type=text] { width:100%; padding:9px 11px; border:1px solid var(--line); border-radius:6px; font:inherit; }
button { font:inherit; padding:8px 14px; border-radius:6px; border:1px solid var(--navy); background:var(--navy); color:#fff; cursor:pointer; }
button.secondary { background:#fff; color:var(--navy); }
button.danger { background:#fff; color:var(--red); border-color:var(--red); }
button:focus-visible, input:focus-visible { outline:2px solid var(--blue); outline-offset:2px; }
.flash { background:#eaf3fc; border:1px solid #b9d6f3; padding:10px 14px; border-radius:6px; margin-bottom:16px; }
.stats { display:flex; flex-wrap:wrap; gap:28px; }
.stats div b { display:block; font-size:22px; color:var(--navy); }
.stats div span { color:var(--mute); font-size:13px; }
table { width:100%; border-collapse:collapse; font-size:13.5px; }
th, td { text-align:left; padding:8px 6px; border-bottom:1px solid var(--line); vertical-align:top; }
th { color:var(--mute); font-weight:600; white-space:nowrap; }
td.num { text-align:right; font-variant-numeric:tabular-nums; }
.tag { display:inline-block; padding:1px 8px; border-radius:10px; font-size:12px; font-weight:600; }
.tag.on { background:#e3f5ee; color:var(--green); }
.tag.off { background:#fbe9e7; color:var(--red); }
code { font-size:12.5px; }
.inline { display:inline; }
.note input { width:150px; padding:4px 6px; font-size:12.5px; }
.mute { color:var(--mute); font-size:13px; }
.scroll { overflow-x:auto; }
</style>
</head>
<body>
<header>
  <h1>NiderVoice · Licences</h1>
  <?php if ($session): ?>
  <form method="post"><input type="hidden" name="csrf" value="<?= h($session['csrf']) ?>"><input type="hidden" name="action" value="logout">
    <button class="secondary" type="submit"><?= h($session['email']) ?> · Se déconnecter</button></form>
  <?php endif; ?>
</header>
<main>
<?php if (!$session): ?>
  <div class="card narrow">
    <?php if ($flash): ?><div class="flash"><?= h($flash) ?></div><?php endif; ?>
    <?php if ($step === 'email'): ?>
      <h2>Connexion</h2>
      <form method="post">
        <input type="hidden" name="action" value="send">
        <label for="email">Adresse e-mail</label>
        <input id="email" type="email" name="email" required autocomplete="email" autofocus>
        <p class="mute">Un code à usage unique vous sera envoyé si cette adresse est autorisée.</p>
        <button type="submit">Recevoir un code</button>
      </form>
    <?php else: ?>
      <h2>Code reçu par e-mail</h2>
      <form method="post">
        <input type="hidden" name="action" value="verify">
        <input type="hidden" name="email" value="<?= h($pendingEmail) ?>">
        <label for="code">Code à 6 chiffres</label>
        <input id="code" type="text" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" required autofocus>
        <p class="mute">Valable <?= NV_CODE_MINUTES ?> minutes.</p>
        <button type="submit">Se connecter</button>
      </form>
      <p class="mute"><a href="admin.php">Utiliser une autre adresse</a></p>
    <?php endif; ?>
  </div>
<?php else:
    $db = nv_db();
    $rows = $db->query(<<<SQL
SELECT i.*,
  (SELECT COALESCE(SUM(u.dictations), 0) FROM usage_daily u WHERE u.install_id = i.id AND u.day >= date('now', '-30 day')) AS d30,
  (SELECT GROUP_CONCAT(DISTINCT u.model) FROM usage_daily u WHERE u.install_id = i.id AND u.day >= date('now', '-30 day')) AS models,
  (SELECT GROUP_CONCAT(DISTINCT u.lang) FROM usage_daily u WHERE u.install_id = i.id AND u.day >= date('now', '-30 day')) AS langs
FROM installations i ORDER BY i.last_seen DESC
SQL)->fetchAll();
    $total = count($rows);
    $active = count(array_filter($rows, fn ($r) => $r['status'] === 'active'));
    $recent = count(array_filter($rows, fn ($r) => (int) $r['last_seen'] > time() - 7 * 86400));
    $consent = count(array_filter($rows, fn ($r) => (int) $r['stats_consent'] === 1));
    $d30 = array_sum(array_map(fn ($r) => (int) $r['d30'], $rows));
    $csrf = $session['csrf'];
    $geoMonth = nv_meta_get('geo_month');
    $monthly = $db->query('SELECT * FROM usage_monthly ORDER BY month DESC, dictations DESC LIMIT 60')->fetchAll();
    $log = $db->query('SELECT * FROM admin_log ORDER BY at DESC LIMIT 15')->fetchAll();
?>
  <?php if ($flash): ?><div class="flash"><?= h($flash) ?></div><?php endif; ?>
  <div class="card stats">
    <div><b><?= $total ?></b><span>installations</span></div>
    <div><b><?= $active ?></b><span>actives</span></div>
    <div><b><?= $total - $active ?></b><span>désactivées</span></div>
    <div><b><?= $recent ?></b><span>vues ces 7 jours</span></div>
    <div><b><?= $consent ?></b><span>statistiques autorisées</span></div>
    <div><b><?= $d30 ?></b><span>dictées sur 30 jours</span></div>
  </div>

  <div class="card">
    <h2>Installations</h2>
    <p class="mute">Pays, ville et dictées n'apparaissent que si l'utilisateur a autorisé les statistiques. La désactivation prend effet à la prochaine vérification du logiciel (au plus tard sous 24 h s'il est connecté).</p>
    <div class="scroll"><table>
      <tr><th>Installation</th><th>État</th><th>Activée le</th><th>Dernière vérif.</th><th>Version</th><th>Pays</th><th>Ville</th><th>Dictées 30 j</th><th>Modèles</th><th>Langues</th><th>Note</th><th></th></tr>
      <?php foreach ($rows as $r): ?>
      <tr>
        <td><code title="<?= h($r['id']) ?>"><?= h(substr($r['id'], 0, 8)) ?></code></td>
        <td><?= $r['status'] === 'active' ? '<span class="tag on">Active</span>' : '<span class="tag off">Désactivée</span>' ?></td>
        <td><?= h(nv_date((int) $r['created_at'], false)) ?></td>
        <td><?= h(nv_date((int) $r['last_seen'])) ?></td>
        <td><?= h($r['app_version']) ?></td>
        <td><?= h((int) $r['stats_consent'] ? nv_country($r['country']) : 'non autorisé') ?></td>
        <td><?= h($r['city'] ?? '—') ?></td>
        <td class="num"><?= (int) $r['stats_consent'] ? (int) $r['d30'] : '—' ?></td>
        <td><?= h($r['models'] ? str_replace(',', ', ', $r['models']) : '—') ?></td>
        <td><?= h($r['langs'] ? str_replace(',', ', ', $r['langs']) : '—') ?></td>
        <td class="note"><form method="post" class="inline"><input type="hidden" name="csrf" value="<?= h($csrf) ?>"><input type="hidden" name="action" value="note"><input type="hidden" name="id" value="<?= h($r['id']) ?>"><input type="text" name="note" value="<?= h($r['note']) ?>" maxlength="120" aria-label="Note"> <button class="secondary" type="submit">OK</button></form></td>
        <td><form method="post" class="inline"><input type="hidden" name="csrf" value="<?= h($csrf) ?>"><input type="hidden" name="id" value="<?= h($r['id']) ?>">
          <?php if ($r['status'] === 'active'): ?><input type="hidden" name="action" value="revoke"><button class="danger" type="submit">Désactiver</button>
          <?php else: ?><input type="hidden" name="action" value="reactivate"><button class="secondary" type="submit">Réactiver</button><?php endif; ?>
        </form></td>
      </tr>
      <?php endforeach; ?>
      <?php if (!$rows): ?><tr><td colspan="12" class="mute">Aucune installation pour l'instant.</td></tr><?php endif; ?>
    </table></div>
  </div>

  <?php if ($monthly): ?>
  <div class="card">
    <h2>Totaux anonymes par mois (au-delà de 13 mois)</h2>
    <div class="scroll"><table>
      <tr><th>Mois</th><th>Pays</th><th>Modèle</th><th>Langue</th><th>Dictées</th><th>Installations</th></tr>
      <?php foreach ($monthly as $m): ?>
      <tr><td><?= h($m['month']) ?></td><td><?= h(nv_country($m['country'] === '??' ? null : $m['country'])) ?></td><td><?= h($m['model']) ?></td><td><?= h($m['lang']) ?></td><td class="num"><?= (int) $m['dictations'] ?></td><td class="num"><?= (int) $m['installations'] ?></td></tr>
      <?php endforeach; ?>
    </table></div>
  </div>
  <?php endif; ?>

  <div class="card">
    <h2>Géolocalisation</h2>
    <p class="mute">Base installée sur ce serveur : <?= h($geoMonth ?: 'aucune') ?>. Aucune adresse de connexion n'est enregistrée ; elle sert seulement à retrouver le pays et la ville. À mettre à jour une fois par mois.</p>
    <form method="post"><input type="hidden" name="csrf" value="<?= h($csrf) ?>"><input type="hidden" name="action" value="geo">
      <button class="secondary" type="submit">Mettre à jour la base (environ 1 minute)</button></form>
    <p class="mute">Géolocalisation : <a href="https://db-ip.com" rel="noopener">IP Geolocation by DB-IP</a>, licence CC BY 4.0.</p>
  </div>

  <div class="card">
    <h2>Conservation</h2>
    <p class="mute">Détail par jour : 13 mois, puis totaux anonymes par mois et par pays (5 ans). Installation effacée 12 mois après sa dernière vérification. Statistiques retirées par l'utilisateur : son historique est effacé à la vérification suivante. Effacement automatique chaque jour.</p>
  </div>

  <div class="card">
    <h2>Journal des actions</h2>
    <table>
      <tr><th>Date</th><th>Par</th><th>Action</th><th>Installation</th></tr>
      <?php foreach ($log as $l): ?>
      <tr><td><?= h(nv_date((int) $l['at'])) ?></td><td><?= h($l['email']) ?></td><td><?= h($l['action']) ?></td><td><code><?= h($l['target'] ? substr($l['target'], 0, 8) : '') ?></code></td></tr>
      <?php endforeach; ?>
    </table>
  </div>
<?php endif; ?>
</main>
</body>
</html>
