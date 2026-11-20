<?php
/**
 * Dépôt chiffré NiderVoice — connexion par code e-mail, puis page d'envoi de fichiers et de dossiers.
 * Le chiffrement se fait dans le navigateur (app.js) avec la clé publique de CHX : le serveur ne reçoit que du chiffré.
 */
declare(strict_types=1);
const NV_APP = 'depot';
require_once __DIR__ . '/../dictee/lib/base.php';
require_once __DIR__ . '/cle.php';

if (!nv_https() && !nv_dev()) {
    header('Location: https://' . ($_SERVER['HTTP_HOST'] ?? 'nidervoice.com') . '/depot/', true, 301);
    exit;
}
$nonce = base64_encode(random_bytes(12));
header('Content-Type: text/html; charset=utf-8');
$flash = '';
$step = 'email';
$pending = '';
$s = null;
try {
    [$s, $flash, $step, $pending] = nv_login_flow();
} catch (Throwable $e) {
    error_log('Dépôt NiderVoice : ' . $e->getMessage());
    $flash = 'Erreur du serveur. Réessayez dans un instant.';
}
$scripts = $s ? "script-src 'self'; connect-src 'self'; " : '';
nv_headers("default-src 'none'; {$scripts}style-src 'nonce-$nonce'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
$v = @filemtime(__DIR__ . '/app.js') ?: 0;
?><!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dépôt NiderVoice</title>
<style nonce="<?= h($nonce) ?>">
:root{--ink:#1b2430;--muted:#5d6b7a;--line:#d5dde5;--bg:#f3f6f8;--card:#fff;--acc:#0f5e7a;--ok:#1f7a4d;--bad:#b3261e;--flash:#eef6f9;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--ink:#e3e8ed;--muted:#9ba8b5;--line:#2f3b47;--bg:#10151b;--card:#19212a;--acc:#1f6f8c;--ok:#4caf7d;--bad:#e06a62;--flash:#15303b;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;font:16px/1.5 "Segoe UI",system-ui,sans-serif;color:var(--ink);background:var(--bg)}
header{padding:.7rem 1.2rem;background:var(--card);border-bottom:1px solid var(--line)}
header small{color:var(--muted);margin-left:.6rem}
main{max-width:46rem;margin:1.2rem auto;padding:0 1rem}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:1.2rem 1.4rem;margin-bottom:1rem}
label{display:block;font-weight:600;margin:.4rem 0 .3rem}
input[type=email],input[type=text]{width:100%;max-width:26rem;padding:.55rem .7rem;font:inherit;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink)}
button{font:inherit;padding:.55rem 1rem;border-radius:6px;border:1px solid var(--acc);background:var(--acc);color:#fff;cursor:pointer}
button.sec{background:var(--card);color:var(--ink);border-color:var(--line)}
button:disabled{opacity:.45;cursor:default}
button:focus-visible,input:focus-visible{outline:3px solid #8cc3d6;outline-offset:1px}
.row{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;margin:.7rem 0}
.muted{color:var(--muted);font-size:.92rem}
.flash{background:var(--flash);border-left:4px solid var(--acc);padding:.6rem .9rem;margin-bottom:1rem}
#zone{border:2px dashed var(--line);border-radius:8px;padding:2rem 1rem;text-align:center}
#zone.over{border-color:var(--acc);background:var(--flash)}
#list{list-style:none;padding:0;margin:.8rem 0 0}
#list li{display:flex;justify-content:space-between;gap:1rem;padding:.35rem 0;border-bottom:1px solid var(--line);font-size:.95rem;word-break:break-all}
#list li span:last-child{white-space:nowrap;color:var(--muted)}
#list li.ok span:last-child{color:var(--ok)}
#list li.bad span:last-child{color:var(--bad)}
progress{width:100%;height:.8rem}
.center{justify-content:center}
.hidden{display:none}
code{font-size:.8rem;word-break:break-all}
</style>
<?php if ($s): ?><script type="module" src="app.js?v=<?= (int) $v ?>"></script><?php endif; ?>
</head>
<body>
<header><b>Dépôt NiderVoice</b><small>Chiffré dans ce navigateur, déchiffré seulement sur CHX</small></header>
<main>
<?php if ($flash !== ''): ?><div class="flash"><?= h($flash) ?></div><?php endif; ?>
<?php if (!$s && $step === 'email'): ?>
<div class="card"><form method="post">
  <input type="hidden" name="action" value="send">
  <label for="email">Votre adresse e-mail</label>
  <input type="email" id="email" name="email" required autocomplete="email">
  <div class="row"><button type="submit">Recevoir un code</button></div>
</form></div>
<?php elseif (!$s): ?>
<div class="card"><form method="post">
  <input type="hidden" name="action" value="verify">
  <input type="hidden" name="email" value="<?= h($pending) ?>">
  <label for="code">Code reçu par e-mail</label>
  <input type="text" id="code" name="code" inputmode="numeric" pattern="[0-9 ]{6,7}" maxlength="7" required autocomplete="one-time-code">
  <div class="row"><button type="submit">Se connecter</button></div>
</form></div>
<?php else: ?>
<div id="app" data-csrf="<?= h($s['csrf']) ?>" data-pk="<?= h(NV_DEPOT_PK) ?>">
  <div class="card">
    <div id="zone">
      <p>Glissez ici des fichiers ou des dossiers</p>
      <div class="row center">
        <button type="button" id="pickFiles">Choisir des fichiers</button>
        <button type="button" id="pickDir" class="sec">Choisir un dossier</button>
      </div>
      <input type="file" id="files" multiple class="hidden">
      <input type="file" id="dir" webkitdirectory multiple class="hidden">
    </div>
    <div id="progressBox" class="hidden"><p id="status"></p><progress id="bar" max="100" value="0"></progress></div>
    <ul id="list"></ul>
  </div>
  <p class="muted">Les fichiers arrivent dans <b>SynologyDriveCHX\Dropbox</b> en 5 minutes environ, avec leur arborescence. Le serveur ne garde qu'une copie chiffrée, effacée dès que CHX l'a récupérée et vérifiée. Sur CHX, chaque fichier passe par l'antivirus avant d'être rangé ; un fichier suspect reste en quarantaine, chiffré. Les dossiers vides ne sont pas transmis.</p>
  <p class="muted">Empreinte de la clé de CHX : <code><?= h(NV_DEPOT_PK_SHA256) ?></code></p>
</div>
<form method="post" class="row">
  <input type="hidden" name="action" value="logout">
  <input type="hidden" name="csrf" value="<?= h($s['csrf']) ?>">
  <button type="submit" class="sec">Se déconnecter</button>
</form>
<?php endif; ?>
</main>
</body>
</html>
