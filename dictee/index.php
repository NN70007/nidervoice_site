<?php
/** Dictée NiderVoice en ligne — connexion par code e-mail, puis page de dictée (tout se fait dans le navigateur). */
declare(strict_types=1);
const NV_APP = 'dictee';
require_once __DIR__ . '/lib/base.php';

if (!nv_https() && !nv_dev()) {
    header('Location: https://' . ($_SERVER['HTTP_HOST'] ?? 'nidervoice.com') . '/dictee/', true, 301);
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
    error_log('Dictée NiderVoice : ' . $e->getMessage());
    $flash = 'Erreur du serveur. Réessayez dans un instant.';
}

if ($s) {
    nv_headers("default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' blob: data:; style-src 'nonce-$nonce'; img-src 'self' data:; media-src 'self' blob:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
} else {
    nv_headers("default-src 'none'; style-src 'nonce-$nonce'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
}
$v = @filemtime(__DIR__ . '/app/app.js') ?: 0;
?><!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dictée NiderVoice</title>
<style nonce="<?= h($nonce) ?>">
:root{--ink:#1b2430;--muted:#5d6b7a;--line:#d5dde5;--bg:#f3f6f8;--card:#fff;--acc:#0f5e7a;--acc2:#0b4a60;--acc-soft:#0f5e7a;--rec:#b3261e;--ok:#1f7a4d;--flash:#eef6f9;--errbg:#fbeeee;color-scheme:light}
:root[data-theme=dark]{--ink:#e3e8ed;--muted:#9ba8b5;--line:#2f3b47;--bg:#10151b;--card:#19212a;--acc:#1f6f8c;--acc2:#185a72;--acc-soft:#7cc3dc;--rec:#c4413a;--ok:#4caf7d;--flash:#15303b;--errbg:#3a1c1c;color-scheme:dark}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--ink:#e3e8ed;--muted:#9ba8b5;--line:#2f3b47;--bg:#10151b;--card:#19212a;--acc:#1f6f8c;--acc2:#185a72;--acc-soft:#7cc3dc;--rec:#c4413a;--ok:#4caf7d;--flash:#15303b;--errbg:#3a1c1c;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;font:16px/1.5 "Segoe UI",system-ui,sans-serif;color:var(--ink);background:var(--bg)}
header{display:flex;align-items:center;justify-content:space-between;padding:.7rem 1.2rem;background:var(--card);border-bottom:1px solid var(--line)}
header b{font-size:1.05rem;letter-spacing:.01em}
header small{color:var(--muted)}
main{max-width:58rem;margin:1.2rem auto;padding:0 1rem}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:1.2rem 1.4rem;margin-bottom:1rem}
label{display:block;font-weight:600;margin:.4rem 0 .3rem}
input[type=email],input[type=text],input[type=password]{width:100%;max-width:26rem;padding:.55rem .7rem;font:inherit;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink)}
button{font:inherit;padding:.55rem 1rem;border-radius:6px;border:1px solid var(--acc);background:var(--acc);color:#fff;cursor:pointer}
button.sec{background:var(--card);color:var(--acc-soft);border-color:var(--acc-soft)}
#theme{padding:.3rem .7rem;font-size:.9rem}
button:disabled{opacity:.45;cursor:default}
button:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid #8cc3d6;outline-offset:1px}
#rec{font-size:1.15rem;padding:.8rem 1.6rem;min-width:12rem}
#rec.on{background:var(--rec);border-color:var(--rec)}
textarea{width:100%;min-height:22rem;padding:.8rem;font:17px/1.55 "Segoe UI",system-ui,sans-serif;border:1px solid var(--line);border-radius:6px;resize:vertical;background:var(--card);color:var(--ink)}
.row{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;margin:.7rem 0}
.muted{color:var(--muted);font-size:.92rem}
.flash{background:var(--flash);border-left:4px solid var(--acc);padding:.6rem .9rem;margin-bottom:1rem}
.err{background:var(--errbg);border-left-color:var(--rec)}
progress{width:100%;height:.8rem}
#state{font-weight:600}
.hidden{display:none}
details summary{cursor:pointer;color:var(--acc-soft)}
</style>
<?php if ($s): ?>
<script type="module" src="app/app.js?v=<?= (int) $v ?>"></script>
<?php endif; ?>
</head>
<body>
<header><b>Dictée NiderVoice</b><small>Reconnaissance dans ce navigateur — rien n'est envoyé<?php if ($s): ?> <button type="button" id="theme" class="sec" aria-pressed="false">Mode nuit</button><?php endif; ?></small></header>
<main>
<?php if ($flash !== ''): ?><div class="flash"><?= h($flash) ?></div><?php endif; ?>
<?php if (!$s && $step === 'email'): ?>
<div class="card">
  <form method="post">
    <input type="hidden" name="action" value="send">
    <label for="email">Votre adresse e-mail</label>
    <input type="email" id="email" name="email" required autocomplete="email">
    <div class="row"><button type="submit">Recevoir un code</button></div>
  </form>
</div>
<?php elseif (!$s): ?>
<div class="card">
  <form method="post">
    <input type="hidden" name="action" value="verify">
    <input type="hidden" name="email" value="<?= h($pending) ?>">
    <label for="code">Code reçu par e-mail</label>
    <input type="text" id="code" name="code" inputmode="numeric" pattern="[0-9 ]{6,7}" maxlength="7" required autocomplete="one-time-code">
    <div class="row"><button type="submit">Se connecter</button></div>
  </form>
</div>
<?php else: ?>
<div id="app" data-csrf="<?= h($s['csrf']) ?>">
  <div class="card" id="unlock">
    <form id="unlockForm">
      <label for="phrase">Phrase secrète du modèle</label>
      <input type="password" id="phrase" autocomplete="current-password" required>
      <div class="row"><button type="submit" id="unlockBtn">Déverrouiller</button></div>
    </form>
    <p class="muted">La phrase reste dans ce navigateur. Elle déchiffre le modèle en mémoire ; elle n'est jamais envoyée.</p>
    <div id="loadBox" class="hidden"><p id="loadMsg"></p><progress id="loadBar" max="100" value="0"></progress></div>
  </div>
  <div class="card hidden" id="work">
    <div class="row">
      <button id="rec" type="button">Dicter</button>
      <span id="state">Prêt</span>
    </div>
    <p class="muted">Raccourci : touche F2 pour démarrer ou arrêter. Commandes : « point », « virgule », « deux points », « à la ligne », « point à la ligne », « nouveau paragraphe », « ouvrez / fermez la parenthèse », « effacer ça ».</p>
    <textarea id="text" spellcheck="false" aria-label="Texte dicté"></textarea>
    <div class="row">
      <button id="copy" type="button">Copier le texte</button>
      <button id="clear" type="button" class="sec">Effacer</button>
      <span id="copied" class="muted"></span>
    </div>
  </div>
  <div class="card hidden" id="more">
    <details>
      <summary>Changer ma phrase secrète</summary>
      <form id="changeForm">
        <label for="p1">Nouvelle phrase (au moins 20 caractères)</label>
        <input type="password" id="p1" minlength="20" required autocomplete="new-password">
        <label for="p2">Répéter la nouvelle phrase</label>
        <input type="password" id="p2" minlength="20" required autocomplete="new-password">
        <div class="row"><button type="submit">Enregistrer la nouvelle phrase</button><span id="changeMsg" class="muted"></span></div>
      </form>
    </details>
    <p class="muted" id="tech"></p>
  </div>
  <div class="card hidden" id="errBox"></div>
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
