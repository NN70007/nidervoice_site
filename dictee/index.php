<?php
/**
 * Dictée NiderVoice en ligne : connexion par code e-mail, puis page de dictée.
 * La reconnaissance se fait entièrement dans le navigateur ; le serveur ne reçoit ni son ni texte.
 * Ne fait PAS : aucun enregistrement du texte, aucun traceur, aucune ressource venant d'un autre site.
 */
declare(strict_types=1);
const NV_APP = 'dictee';
require_once __DIR__ . '/lib/base.php';
require_once __DIR__ . '/../depot/cle.php'; // clé PUBLIQUE de CHX, pour chiffrer la fiche de retour

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

$commun = "style-src 'nonce-$nonce'; img-src 'self' data:; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
if ($s) {
    nv_headers("default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' blob: data:; media-src 'self' blob:; $commun");
} else {
    nv_headers("default-src 'none'; $commun");
}
$v = static fn(string $f): int => (int) (@filemtime(__DIR__ . '/app/' . $f) ?: 0);
$icone = static fn(string $d): string => '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' . $d . '</svg>';
?><!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Dictée — NiderVoice</title>
<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
<style nonce="<?= h($nonce) ?>">
@font-face{font-family:Inter;font-weight:400;font-display:swap;src:url(/assets/fonts/inter-latin-400-normal.woff2) format('woff2')}
@font-face{font-family:Inter;font-weight:500;font-display:swap;src:url(/assets/fonts/inter-latin-500-normal.woff2) format('woff2')}
@font-face{font-family:Inter;font-weight:600;font-display:swap;src:url(/assets/fonts/inter-latin-600-normal.woff2) format('woff2')}
@font-face{font-family:Display;font-weight:300;font-display:swap;src:url(/assets/fonts/source-serif-4-latin-300-normal.woff2) format('woff2')}
/* Jour : papier clair, encre bleu nuit du logo. Nuit : les couleurs de nidervoice.com. */
:root{--fond:#EEF1F5;--feuille:#FFFFFF;--barre:#FFFFFF;--encre:#17202B;--doux:#5A6777;--pale:#8995A4;--trait:#D9DFE7;--accent:#0C447C;--accent-tx:#FFFFFF;--lien:#1F5FA3;--rec:#C2362F;--ok:#2A8A5C;--alerte:#B26B00;--ombre:0 1px 2px rgba(23,32,43,.06),0 8px 24px rgba(23,32,43,.06);color-scheme:light}
:root[data-theme=dark]{--fond:#0A0E15;--feuille:#121A27;--barre:#121A27;--encre:#E9EEF4;--doux:#9AA6B6;--pale:#6B7787;--trait:rgba(255,255,255,.10);--accent:#378ADD;--accent-tx:#FFFFFF;--lien:#8CC0F2;--rec:#E0574F;--ok:#5CC08E;--alerte:#E5B567;--ombre:none;color-scheme:dark}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--fond:#0A0E15;--feuille:#121A27;--barre:#121A27;--encre:#E9EEF4;--doux:#9AA6B6;--pale:#6B7787;--trait:rgba(255,255,255,.10);--accent:#378ADD;--accent-tx:#FFFFFF;--lien:#8CC0F2;--rec:#E0574F;--ok:#5CC08E;--alerte:#E5B567;--ombre:none;color-scheme:dark}}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;display:flex;flex-direction:column;min-height:100vh;font:16px/1.55 Inter,system-ui,"Segoe UI",sans-serif;color:var(--encre);background:var(--fond);-webkit-font-smoothing:antialiased}
a{color:var(--lien);text-underline-offset:3px}
button,input{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--lien);outline-offset:2px;border-radius:6px}
.cache{display:none!important}
.lecteur{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}

/* En-tête */
.entete{display:flex;align-items:center;gap:14px;padding:14px clamp(16px,3vw,32px)}
.marque{display:flex;align-items:center;gap:12px;text-decoration:none;color:var(--encre)}
.marque img{height:24px;width:auto;display:block}
.logo-nuit{display:none!important}
:root[data-theme=dark] .logo-jour{display:none!important}:root[data-theme=dark] .logo-nuit{display:block!important}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]) .logo-jour{display:none!important}:root:not([data-theme=light]) .logo-nuit{display:block!important}}
.marque span{font-family:Display,Georgia,serif;font-weight:300;font-size:22px;letter-spacing:-.01em;padding-left:12px;border-left:1px solid var(--trait);line-height:1}
.outils{margin-left:auto;display:flex;gap:4px}
.icone{display:inline-grid;place-items:center;width:38px;height:38px;border-radius:10px;border:0;background:transparent;color:var(--doux);cursor:pointer}
.icone:hover{background:var(--feuille);color:var(--encre)}
.icone[aria-pressed=true] .lune,.icone[aria-pressed=false] .soleil{display:none}

/* Zone de travail */
main{flex:1;width:100%;max-width:56rem;margin:0 auto;padding:0 clamp(12px,3vw,24px) 24px}
.flash{background:var(--feuille);border:1px solid var(--trait);border-left:3px solid var(--accent);border-radius:10px;padding:12px 16px;margin:8px 0 16px}
.flash.erreur{border-left-color:var(--rec)}
.carte{max-width:28rem;margin:8vh auto 0;background:var(--feuille);border:1px solid var(--trait);border-radius:16px;padding:28px;box-shadow:var(--ombre)}
.carte h1{font-family:Display,Georgia,serif;font-weight:300;font-size:28px;line-height:1.15;margin:0 0 6px;letter-spacing:-.015em}
.carte p{margin:0 0 18px;color:var(--doux);font-size:15px}
label{display:block;font-weight:500;font-size:14px;margin:0 0 6px}
input[type=email],input[type=text],input[type=password]{width:100%;padding:11px 13px;border:1px solid var(--trait);border-radius:10px;background:var(--fond);font-size:16px}
input:focus{border-color:var(--lien);outline:none}
.bouton{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 18px;border-radius:10px;border:1px solid var(--accent);background:var(--accent);color:var(--accent-tx);font-weight:500;cursor:pointer;white-space:nowrap}
.bouton.leger{background:transparent;color:var(--encre);border-color:var(--trait)}
.bouton.leger:hover{border-color:var(--pale)}
.bouton:disabled{opacity:.5;cursor:default}
.carte .bouton{width:100%;margin-top:16px}
progress{width:100%;height:6px;margin-top:16px;accent-color:var(--accent)}
.note{font-size:13.5px;color:var(--doux);margin-top:14px}

/* Barre de dictée */
.barre{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px;margin-bottom:10px;background:var(--barre);border:1px solid var(--trait);border-radius:14px;box-shadow:var(--ombre)}
#rec{min-width:9.5rem;padding:11px 20px;border-radius:999px}
#rec .point{width:10px;height:10px;border-radius:50%;background:currentColor}
#rec.on{background:var(--rec);border-color:var(--rec)}
#rec.on .point{border-radius:2px}
.etat{display:flex;align-items:center;gap:10px;min-width:0;flex:1}
#state{font-size:14.5px;color:var(--doux);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.niveau{display:flex;align-items:flex-end;gap:3px;height:20px;flex:none}
.niveau i{display:block;width:4px;height:4px;border-radius:2px;background:var(--trait);transition:height .08s linear,background .08s}
.niveau.on i{background:var(--rec)}
.actions{display:flex;gap:8px}
kbd{font:500 11.5px Inter,sans-serif;padding:1px 5px;border-radius:5px;border:1px solid var(--trait);color:var(--pale)}
.bouton kbd{border-color:currentColor;color:inherit;opacity:.65}
#apercu{min-height:1.5em;margin:0 6px 8px;font-size:14.5px;color:var(--pale);font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* Feuille */
#text{display:block;width:100%;min-height:max(20rem,calc(100vh - 17rem));padding:clamp(20px,4vw,44px) clamp(20px,5vw,56px);border:1px solid var(--trait);border-radius:14px;background:var(--feuille);color:var(--encre);font:400 var(--taille,18px)/1.7 Inter,system-ui,sans-serif;resize:vertical;box-shadow:var(--ombre)}
#text:focus{outline:none;border-color:var(--pale)}
#text::placeholder{color:var(--pale)}
#errBox{margin-top:12px}

/* Fenêtres */
dialog{width:min(34rem,calc(100vw - 32px));max-height:calc(100vh - 48px);padding:0;border:1px solid var(--trait);border-radius:16px;background:var(--feuille);color:var(--encre);box-shadow:0 20px 60px rgba(0,0,0,.25)}
dialog.large{width:min(46rem,calc(100vw - 32px))}
dialog::backdrop{background:rgba(5,8,13,.45)}
.fen-tete{display:flex;align-items:center;justify-content:space-between;padding:18px 22px 6px}
.fen-tete h2{margin:0;font-family:Display,Georgia,serif;font-weight:300;font-size:24px;letter-spacing:-.01em}
.fen-corps{padding:6px 22px 22px}
.fen-corps h3{font-size:14px;font-weight:600;margin:18px 0 8px}
.fen-corps p{margin:0 0 10px;font-size:14.5px;color:var(--doux)}
.cmd{display:grid;grid-template-columns:auto 1fr;gap:8px 18px;margin:8px 0 0;font-size:15px}
.cmd dt{font-weight:500}.cmd dd{margin:0;color:var(--doux)}
.ligne{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.ligne output{min-width:3.5em;text-align:center;font-variant-numeric:tabular-nums}
details summary{cursor:pointer;font-size:14.5px;font-weight:500;color:var(--lien)}
details form{margin-top:12px;display:grid;gap:10px}
.sep{border:0;border-top:1px solid var(--trait);margin:18px 0}
table{width:100%;border-collapse:collapse;font-size:13.5px;font-variant-numeric:tabular-nums}
th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--trait);vertical-align:top}
th{font-weight:500;color:var(--doux)}
td:first-child{white-space:nowrap}td:nth-child(2){word-break:break-all;color:var(--doux)}
td.n{text-align:right;white-space:nowrap}
.chiffres{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:6px 0 16px}
.chiffres div{border:1px solid var(--trait);border-radius:12px;padding:10px 12px}
.chiffres b{display:block;font-size:22px;font-weight:500;font-variant-numeric:tabular-nums}
.chiffres span{font-size:12.5px;color:var(--doux)}

.lien{border:0;background:none;padding:0;color:var(--lien);text-decoration:underline;text-underline-offset:3px;cursor:pointer;font-size:inherit}
.attention{border-left:3px solid var(--alerte);padding:6px 0 6px 12px;color:var(--encre)!important}
.fiche{list-style:none;margin:10px 0 14px;padding:0;max-height:16rem;overflow:auto}
.fiche li{display:flex;align-items:flex-start;gap:8px;padding:8px 2px;border-bottom:1px solid var(--trait)}
.fiche label{flex:1;display:grid;grid-template-columns:auto 1fr;gap:2px 10px;align-items:center;font-weight:400;font-size:15px;margin:0;cursor:pointer}
.fiche s,.fiche i{color:var(--pale)}.fiche small{grid-column:2;color:var(--alerte);font-size:12.5px}
.fiche input{width:17px;height:17px;accent-color:var(--accent)}
.icone.petit{width:28px;height:28px;font-size:18px}
.ajout input{flex:1;min-width:10rem}
.envoi{margin:14px 0 6px}

/* Message temporaire */
#toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);display:flex;align-items:center;gap:14px;padding:10px 12px 10px 18px;border-radius:12px;background:var(--encre);color:var(--fond);font-size:14.5px;box-shadow:0 10px 30px rgba(0,0,0,.25);z-index:20}
#toast button{border:0;background:transparent;color:inherit;font-weight:600;text-decoration:underline;cursor:pointer;padding:4px 6px}

/* Pied de page */
.pied{border-top:1px solid var(--trait);padding:14px clamp(16px,3vw,32px);display:flex;align-items:center;gap:10px 22px;flex-wrap:wrap;font-size:13px;color:var(--pale)}
.pied img{height:18px;width:auto;display:block}
.pied p{margin:0}
.pied-tx{display:flex;flex-direction:column;gap:2px;line-height:1.45}
.pied a{color:var(--doux);text-decoration:none}.pied a:hover{text-decoration:underline}
.pastille{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--trait);border-radius:999px;background:transparent;padding:4px 12px 4px 9px;font-size:13px;color:var(--doux);cursor:pointer}
.pastille svg{width:15px;height:15px}
.temoins{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}
#reseau{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--trait);border-radius:999px;background:transparent;padding:5px 12px;font-size:13px;color:var(--doux);cursor:pointer}
#reseau:hover{border-color:var(--pale);color:var(--encre)}
#reseau .temoin{width:8px;height:8px;border-radius:50%;background:var(--ok)}
#reseau.alerte .temoin{background:var(--alerte)}
@media (max-width:640px){.marque span{display:none}kbd{display:none}.etat{order:3;flex-basis:100%;padding:0 4px}.actions{margin-left:auto}#reseau{text-align:left}.temoins{margin-left:0}#rec{min-width:0}#reseau{margin-left:0}.chiffres{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){.niveau i{transition:none}}
</style>
<?php if ($s): ?>
<script type="module" src="app/page.js?v=<?= $v('page.js') + $v('moteur.js') + $v('reseau.js') + $v('retours.js') ?>"></script>
<?php endif; ?>
</head>
<body>
<header class="entete">
  <a class="marque" href="/" title="nidervoice.com"><img class="logo-jour" src="/assets/nidervoice-logo.svg" width="125" height="24" alt="NiderVoice"><img class="logo-nuit" src="/assets/nidervoice-logo-sombre.svg" width="125" height="24" alt="NiderVoice"><span>Dictée</span></a>
<?php if ($s): ?>
  <div class="outils">
    <button type="button" class="icone" id="aideBtn" title="Commandes vocales" aria-label="Commandes vocales"><?= $icone('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.7"/><path d="M12 17.2h.01"/>') ?></button>
    <button type="button" class="icone" id="theme" title="Mode nuit" aria-label="Mode nuit" aria-pressed="false"><span class="lune"><?= $icone('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>') ?></span><span class="soleil"><?= $icone('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>') ?></span></button>
    <button type="button" class="icone" id="reglagesBtn" title="Réglages" aria-label="Réglages"><?= $icone('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>') ?></button>
  </div>
<?php endif; ?>
</header>
<main>
<?php if ($flash !== ''): ?><div class="flash"><?= h($flash) ?></div><?php endif; ?>
<?php if (!$s && $step === 'email'): ?>
  <form method="post" class="carte">
    <h1>Dictée en ligne</h1>
    <p>La reconnaissance se fait dans ce navigateur : ni le son ni le texte ne sont envoyés.</p>
    <input type="hidden" name="action" value="send">
    <label for="email">Adresse e-mail</label>
    <input type="email" id="email" name="email" required autocomplete="email">
    <button type="submit" class="bouton">Recevoir un code</button>
  </form>
<?php elseif (!$s): ?>
  <form method="post" class="carte">
    <h1>Code reçu</h1>
    <p>Saisissez le code à six chiffres envoyé à <?= h($pending) ?>.</p>
    <input type="hidden" name="action" value="verify">
    <input type="hidden" name="email" value="<?= h($pending) ?>">
    <label for="code">Code</label>
    <input type="text" id="code" name="code" inputmode="numeric" pattern="[0-9 ]{6,7}" maxlength="7" required autocomplete="one-time-code">
    <button type="submit" class="bouton">Se connecter</button>
  </form>
<?php else: ?>
<div id="app" data-csrf="<?= h($s['csrf']) ?>" data-pk="<?= h(NV_DEPOT_PK) ?>">
  <form id="unlock" class="carte">
    <h1>Déverrouiller le modèle</h1>
    <p>La phrase secrète reste dans ce navigateur : elle déchiffre le modèle en mémoire et n'est jamais envoyée.</p>
    <label for="phrase">Phrase secrète</label>
    <input type="password" id="phrase" autocomplete="current-password" required>
    <button type="submit" id="unlockBtn" class="bouton">Déverrouiller</button>
    <div id="loadBox" class="cache"><progress id="loadBar" max="100" value="0"></progress><p class="note" id="loadMsg"></p></div>
  </form>

  <section id="work" class="cache" aria-label="Dictée">
    <div class="barre">
      <button id="rec" type="button" class="bouton"><span class="point"></span><span id="recTx">Dicter</span> <kbd>F2</kbd></button>
      <div class="etat"><div class="niveau" id="niveau" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><span id="state" role="status">Prêt</span></div>
      <div class="actions">
        <button id="copy" type="button" class="bouton leger">Copier <kbd>F4</kbd></button>
        <button id="clear" type="button" class="bouton leger">Effacer</button>
      </div>
    </div>
    <p id="apercu" aria-hidden="true"></p>
    <textarea id="text" spellcheck="false" aria-label="Texte dicté" placeholder="Cliquez où le texte doit aller, puis dictez. Vous pouvez déplacer le curseur pendant la dictée."></textarea>
  </section>
  <div id="errBox" class="flash erreur cache" role="alert"></div>
</div>

<dialog id="aide">
  <div class="fen-tete"><h2>Commandes vocales</h2><button type="button" class="icone" data-fermer aria-label="Fermer"><?= $icone('<path d="M6 6l12 12M18 6L6 18"/>') ?></button></div>
  <div class="fen-corps">
    <p>Dites la ponctuation : le texte s'écrit à l'endroit du curseur, à chaque pause.</p>
    <dl class="cmd">
      <dt>« point »</dt><dd>.</dd>
      <dt>« virgule »</dt><dd>,</dd>
      <dt>« deux points »</dt><dd>:</dd>
      <dt>« point-virgule »</dt><dd>;</dd>
      <dt>« point d'interrogation »</dt><dd>?</dd>
      <dt>« point d'exclamation »</dt><dd>!</dd>
      <dt>« ouvrez / fermez la parenthèse »</dt><dd>( )</dd>
      <dt>« à la ligne »</dt><dd>nouvelle ligne</dd>
      <dt>« point à la ligne »</dt><dd>point, puis nouvelle ligne</dd>
      <dt>« nouveau paragraphe »</dt><dd>ligne vide</dd>
      <dt>« effacer ça »</dt><dd>retire la dernière phrase</dd>
    </dl>
    <h3>Clavier</h3>
    <dl class="cmd"><dt><kbd>F2</kbd></dt><dd>démarrer ou arrêter la dictée</dd><dt><kbd>F4</kbd></dt><dd>copier tout le texte</dd></dl>
    <h3>Le texte n'est pas enregistré</h3>
    <p>Copiez-le avant de fermer la page : il n'existe que dans ce navigateur.</p>
  </div>
</dialog>

<dialog id="reglages">
  <div class="fen-tete"><h2>Réglages</h2><button type="button" class="icone" data-fermer aria-label="Fermer"><?= $icone('<path d="M6 6l12 12M18 6L6 18"/>') ?></button></div>
  <div class="fen-corps">
    <h3>Taille du texte</h3>
    <div class="ligne"><button type="button" class="bouton leger" id="moins" aria-label="Texte plus petit">A−</button><output id="taille">18 px</output><button type="button" class="bouton leger" id="plus" aria-label="Texte plus grand">A+</button></div>
    <hr class="sep">
    <details>
      <summary>Changer ma phrase secrète</summary>
      <form id="changeForm">
        <div><label for="p1">Nouvelle phrase (au moins 20 caractères)</label><input type="password" id="p1" minlength="20" required autocomplete="new-password"></div>
        <div><label for="p2">Répéter la nouvelle phrase</label><input type="password" id="p2" minlength="20" required autocomplete="new-password"></div>
        <div class="ligne"><button type="submit" class="bouton">Enregistrer</button><span id="changeMsg" class="note"></span></div>
      </form>
    </details>
    <hr class="sep">
    <p>Un mot mal reconnu ? Corrigez-le dans la feuille : il apparaît dans la <button type="button" class="lien" id="ficheOuvrir">fiche des mots à apprendre</button>.</p>
    <hr class="sep">
    <p id="tech"></p>
    <form method="post"><input type="hidden" name="action" value="logout"><input type="hidden" name="csrf" value="<?= h($s['csrf']) ?>"><button type="submit" class="bouton leger">Se déconnecter</button></form>
  </div>
</dialog>

<dialog id="reseauFen" class="large">
  <div class="fen-tete"><h2>Échanges réseau de cette page</h2><button type="button" class="icone" data-fermer aria-label="Fermer"><?= $icone('<path d="M6 6l12 12M18 6L6 18"/>') ?></button></div>
  <div class="fen-corps">
    <div class="chiffres">
      <div><b id="rDictee">0</b><span>échanges pendant la dictée</span></div>
      <div><b id="rTotal">0</b><span>échanges depuis l'ouverture</span></div>
      <div><b id="rBloques">0</b><span>tentatives bloquées</span></div>
    </div>
    <p id="rResume"></p>
    <table><thead><tr><th>Contenu</th><th>Adresse</th><th class="n">Nombre</th><th class="n">Reçu</th><th class="n">Dernier</th></tr></thead><tbody id="rListe"></tbody></table>
    <h3>D'où viennent ces chiffres</h3>
    <p>Le navigateur tient lui-même le journal des échanges de la page ; ce tableau le lit. Une règle de sécurité de la page interdit toute connexion vers un autre site que celui-ci : le navigateur bloque la tentative et la compte ici.</p>
    <p>Pour un contrôle indépendant de la page : ouvrez l'outil « Réseau » du navigateur (touche F12), ou coupez Internet une fois le modèle chargé : la dictée continue de fonctionner.</p>
  </div>
</dialog>
<dialog id="ficheFen" class="large">
  <div class="fen-tete"><h2>Mots à apprendre</h2><button type="button" class="icone" data-fermer aria-label="Fermer"><?= $icone('<path d="M6 6l12 12M18 6L6 18"/>') ?></button></div>
  <div class="fen-corps">
    <p>Les mots dictés que vous avez corrigés à la main. Ils servent à un réentraînement ciblé du modèle. Rien n'est envoyé sans votre clic.</p>
    <p class="attention">Cochez seulement des termes médicaux ou techniques. Jamais un nom de patient, une date, ni une phrase du compte rendu.</p>
    <p id="ficheVide" class="note">Aucune correction pour l'instant. Corrigez un mot dans un passage dicté, ou ajoutez-le ci-dessous.</p>
    <ul id="ficheListe" class="fiche"></ul>
    <form id="ficheAjout" class="ligne ajout">
      <input type="text" id="ajEcrit" maxlength="40" placeholder="Écrit par erreur (facultatif)" aria-label="Écrit par erreur" autocomplete="off">
      <input type="text" id="ajVoulu" maxlength="40" placeholder="Mot attendu" aria-label="Mot attendu" required autocomplete="off">
      <button type="submit" class="bouton leger">Ajouter</button>
    </form>
    <div class="ligne envoi"><button type="button" id="ficheEnvoyer" class="bouton" disabled>Cochez les mots à envoyer</button><span id="ficheMsg" class="note"></span></div>
    <p class="note">Au plus 3 mots de chaque côté, sans chiffres. La liste est chiffrée dans ce navigateur et ne peut être lue que sur le PC d'entraînement ; l'envoi apparaît dans le moniteur réseau.</p>
  </div>
</dialog>
<div id="toast" class="cache" role="status"><span id="toastTx"></span><button type="button" id="toastBtn">Annuler</button></div>
<?php endif; ?>
</main>
<footer class="pied">
  <a href="/" title="nidervoice.com"><img class="logo-jour" src="/assets/nidervoice-logo.svg" width="94" height="18" alt="NiderVoice"><img class="logo-nuit" src="/assets/nidervoice-logo-sombre.svg" width="94" height="18" alt="NiderVoice"></a>
  <div class="pied-tx"><p>Outil de saisie de texte par la voix · Aucune information à visée diagnostique ou thérapeutique</p>
  <p><a href="/mentions-legales/">Mentions légales</a> · <a href="/confidentialite/">Confidentialité</a> · © 2026 NiderLabs</p></div>
<?php if ($s): ?>
  <div class="temoins">
  <button type="button" id="fiche" class="pastille cache" aria-haspopup="dialog"><?= $icone('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>') ?><span id="ficheTx"></span></button>
  <button type="button" id="reseau" class="cache" aria-haspopup="dialog"><span class="temoin"></span><span id="reseauTx"></span></button>
  </div>
<?php endif; ?>
</footer>
</body>
</html>
