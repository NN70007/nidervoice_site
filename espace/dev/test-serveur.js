/* Tests du serveur (espace/serveur/Code.gs) avec le simulateur, sans Google. Lancer : node espace/dev/test-serveur.js */
'use strict';
const assert = require('assert');
const { charger } = require('./gas-fake');

const CLIENT = 'client-test.apps.googleusercontent.com';
const ADMIN = 'jb@niedercorn.com';
// Adresses fictives, construites à l'exécution sur le domaine réservé example.com (aucune adresse réelle dans le dépôt).
const adr = (nom) => nom + '@' + 'example.com';
const futur = String(Math.floor(Date.now() / 1000) + 3600);
const jeton = (email, autres) => Object.assign({ aud: CLIENT, iss: 'https://accounts.google.com', email, email_verified: 'true', exp: futur }, autres || {});
const b64 = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64');
const JPEG = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]).toString('base64');
const PNG = Buffer.concat([Buffer.from([0x89]), Buffer.from('PNG\r\n\x1a\n'), Buffer.alloc(16)]).toString('base64');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(8)]).toString('base64');

let n = 0;
function ok(cond, msg) { assert.ok(cond, msg); n++; console.log('  ✓ ' + msg); }
function connecterParCode(srv, email) {
  delete srv.cache['otpn:' + email]; delete srv.cache['otpn:*'];
  srv.post({ action: 'auth.demanderCode', email });
  return srv.post({ action: 'auth.verifierCode', email, code: srv.lastCode(email) }).token;
}

const srv = charger({
  props: { GOOGLE_CLIENT_ID: CLIENT, SITE_NOM: 'Site de test' },
  googleTokens: {
    'tok-jb': jeton(ADMIN),
    'tok-autre-app': jeton(ADMIN, { aud: 'autre-client' }),
    'tok-inconnu': jeton(adr('pirate')),
    'tok-non-verifie': jeton(ADMIN, { email_verified: 'false' }),
    'tok-expire': jeton(ADMIN, { exp: '1000' }),
    'tok-faux-emetteur': jeton(ADMIN, { iss: 'https://pirate.example.com' })
  }
});

console.log('Installation');
srv.run('installer');
ok(srv.sheets.Acces && srv.sheets.Journal, 'onglets Acces et Journal créés');
ok(srv.sheets.Acces.data.length === 2 && srv.sheets.Acces.data[1][0] === ADMIN && srv.sheets.Acces.data[1][2] === 'oui', 'administrateur initial inscrit avec le droit admin');
srv.run('installer');
ok(srv.sheets.Acces.data.length === 2, 'relancer « installer » ne duplique rien');
ok(JSON.stringify(srv.get()) === JSON.stringify({ ok: true, version: srv.ctx.CONFIG.VERSION }), 'doGet renvoie { ok: true, version }');

console.log('Requêtes malformées');
ok(srv.post('pas du json').code === 'requete', 'requête illisible refusée');
ok(srv.post('[1,2]').code === 'requete', 'requête qui n\'est pas un objet refusée');
ok(srv.post({ action: 'inexistante', token: 'x' }).code === 'session', 'action inconnue sans session : refus de session d\'abord');

console.log('Connexion Google');
let r = srv.post({ action: 'auth.google', idToken: 'tok-jb' });
ok(r.ok && r.token && r.user.admin && r.user.actualites, 'jeton Google valide → session administrateur');
const tJB = r.token;
ok(srv.post({ action: 'moi', token: tJB }).user.nom === 'Jean-Baptiste Niedercorn', 'la session donne accès à « moi »');
ok(!srv.post({ action: 'auth.google', idToken: 'tok-autre-app' }).ok, 'jeton émis pour une autre application refusé');
ok(!srv.post({ action: 'auth.google', idToken: 'tok-non-verifie' }).ok, 'adresse Google non vérifiée refusée');
ok(!srv.post({ action: 'auth.google', idToken: 'tok-expire' }).ok, 'jeton Google expiré refusé');
ok(!srv.post({ action: 'auth.google', idToken: 'tok-faux-emetteur' }).ok, 'jeton d\'un autre émetteur refusé');
r = srv.post({ action: 'auth.google', idToken: 'tok-inconnu' });
ok(!r.ok && r.code === 'non_autorise', 'compte Google non inscrit refusé');
ok(!srv.post({ action: 'auth.google', idToken: 'forge' }).ok, 'jeton forgé refusé');
ok(Object.keys(srv.props).concat(Object.values(srv.props)).every((k) => !k.includes(tJB)), 'le jeton de session n\'est jamais stocké en clair');
{
  const sans = charger({ googleTokens: { g: jeton(ADMIN) } });
  sans.run('installer');
  ok(sans.post({ action: 'auth.google', idToken: 'g' }).code === 'config', 'sans GOOGLE_CLIENT_ID : connexion Google refusée proprement');
}

console.log('Sans session');
ok(srv.post({ action: 'acces.lister' }).code === 'session', 'aucune donnée sans session');
ok(srv.post({ action: 'acces.lister', token: 'n-importe-quoi' }).code === 'session', 'aucune donnée avec une session inventée');
ok(srv.post({ action: 'pub.github', token: { $ne: 1 }, methode: 'GET', chemin: 'actualites.json' }).code === 'session', 'jeton qui n\'est pas une chaîne refusé');

console.log('Gestion des accès');
const add = (p, orig) => srv.post({ action: 'acces.enregistrer', token: tJB, personne: p, emailOriginal: orig });
ok(add({ email: adr('Redac'), nom: 'Rita Rédaction', actualites: true }).ok, 'ajout d\'une rédactrice (actualités)');
ok(add({ email: adr('membre'), nom: '=HYPERLINK("x")', note: '+352 au téléphone' }).ok, 'ajout d\'une personne sans droit (saisies = et + neutralisées)');
ok(add({ email: adr('second') + ', ' + adr('second.bis'), nom: 'Second Admin', admin: true }).ok, 'ajout d\'un second administrateur avec deux adresses');
r = srv.post({ action: 'acces.lister', token: tJB });
ok(r.ok && r.personnes.length === 4 && r.journal.length > 0, 'liste des accès et journal');
ok(r.personnes.find((p) => p.cle === adr('membre')).nom === '=HYPERLINK("x")', 'les valeurs relues sont intactes');
ok(r.personnes.find((p) => p.cle === adr('redac')).actualites === true, 'adresse ramenée en minuscules, droit relu');
ok(!add({ email: ADMIN, nom: 'JB', admin: false }, ADMIN).ok, 'impossible de retirer ses propres droits d\'administration');
ok(!add({ email: ADMIN, nom: 'JB', admin: true, actif: false }, ADMIN).ok, 'impossible de désactiver son propre accès');
ok(!add({ email: adr('autre'), nom: 'JB', admin: true }, ADMIN).ok, 'impossible de retirer l\'adresse avec laquelle on est connecté');
ok(add({ email: ADMIN, nom: 'Jean-Baptiste N.', admin: true, note: 'renommé' }, ADMIN).ok, 'modifier sa propre fiche sans retirer ses droits');
ok(!srv.post({ action: 'acces.supprimer', token: tJB, email: ADMIN }).ok, 'impossible de supprimer son propre accès');
ok(add({ email: adr('redac'), nom: 'Doublon' }).code === 'donnees', 'une adresse ne peut appartenir qu\'à une seule personne');
ok(add({ email: 'pas-une-adresse', nom: 'X' }).code === 'donnees', 'adresse invalide refusée');
ok(add({ email: adr('x'), nom: 'X' }, adr('fantome')).code === 'introuvable', 'modification d\'une personne disparue refusée');

console.log('Connexion par code');
const avant = srv.mails.length;
r = srv.post({ action: 'auth.demanderCode', email: adr('redac') });
ok(r.ok && srv.mails.length === avant + 1 && /Site de test/.test(srv.mails[srv.mails.length - 1].body), 'code envoyé à une adresse autorisée, au nom du site');
r = srv.post({ action: 'auth.demanderCode', email: adr('inconnu') });
ok(r.ok && srv.mails.length === avant + 1, 'adresse inconnue : même réponse, aucun e-mail envoyé');
ok(srv.post({ action: 'auth.demanderCode', email: 'nimporte' }).code === 'email', 'adresse mal formée refusée');
ok(!srv.post({ action: 'auth.verifierCode', email: adr('redac'), code: '000000' }).ok, 'mauvais code refusé');
const code = srv.lastCode(adr('redac'));
ok(Object.values(srv.cache).every((v) => !v.includes(code)), 'le code n\'est pas conservé en clair');
r = srv.post({ action: 'auth.verifierCode', email: adr('REDAC'), code });
ok(r.ok && r.user.actualites && !r.user.admin, 'bon code → session de rédactrice (sans droit admin)');
const tRedac = r.token;
ok(!srv.post({ action: 'auth.verifierCode', email: adr('redac'), code }).ok, 'un code ne sert qu\'une fois');
srv.post({ action: 'auth.demanderCode', email: adr('membre') });
for (let i = 0; i < 5; i++) srv.post({ action: 'auth.verifierCode', email: adr('membre'), code: '111111' });
ok(!srv.post({ action: 'auth.verifierCode', email: adr('membre'), code: srv.lastCode(adr('membre')) }).ok, 'code bloqué après 5 essais');
for (let i = 0; i < 6; i++) r = srv.post({ action: 'auth.demanderCode', email: adr('second') });
ok(!r.ok && r.code === 'limite', 'limite de demandes de code par heure');
const tMembre = connecterParCode(srv, adr('membre'));
const tSecond = connecterParCode(srv, adr('second.bis'));
ok(srv.post({ action: 'moi', token: tSecond }).user.nom === 'Second Admin', 'connexion avec la seconde adresse : même personne');

console.log('Droits vérifiés côté serveur');
ok(srv.post({ action: 'acces.lister', token: tRedac }).code === 'droits', 'une rédactrice ne voit pas les accès');
ok(srv.post({ action: 'acces.enregistrer', token: tRedac, personne: { email: adr('redac'), nom: 'R', admin: true }, emailOriginal: adr('redac') }).code === 'droits', 'une rédactrice ne peut pas se donner le droit admin');
ok(srv.post({ action: 'pub.github', token: tMembre, methode: 'GET', chemin: 'actualites.json' }).code === 'droits', 'une personne sans droit ne lit pas via le serveur de publication');
ok(srv.post({ action: 'moi', token: tMembre }).user.actualites === false, 'droits relus à chaque demande');

console.log('Publication (API GitHub)');
ok(srv.post({ action: 'pub.github', token: tRedac, methode: 'GET', chemin: 'actualites.json' }).code === 'config', 'sans GITHUB_TOKEN ni GITHUB_REPO : refus propre');
srv.props.GITHUB_TOKEN = 'jeton-de-test';
ok(srv.post({ action: 'pub.github', token: tRedac, methode: 'GET', chemin: 'actualites.json' }).code === 'config', 'sans GITHUB_REPO : refus propre');
srv.props.GITHUB_REPO = 'compte/depot invalide';
ok(srv.post({ action: 'pub.github', token: tRedac, methode: 'GET', chemin: 'actualites.json' }).code === 'config', 'GITHUB_REPO mal formé refusé');
srv.props.GITHUB_REPO = 'NN70007/socle_test';
let x = srv.post({ action: 'pub.github', token: tRedac, methode: 'GET', chemin: 'actualites.json' });
ok(x.ok && x.status === 200 && Array.isArray(JSON.parse(Buffer.from(x.data.content, 'base64').toString())) && x.data.sha, 'lecture de actualites.json via le serveur');
const article = { id: 'premier-article', titre: 'Premier article', date: '2026-11-04', texte: 'Bonjour.\n\nDeuxième paragraphe.', image: 'assets/photo-1.jpg' };
x = srv.post({ action: 'pub.github', token: tRedac, methode: 'PUT', chemin: 'actualites.json', corps: { message: 'Admin : nouvel article', content: b64([article]), sha: x.data.sha } });
ok(x.ok && x.status < 300 && srv.github.length === 1 && /par Rita Rédaction/.test(srv.github[0].message) && srv.github[0].auth === 'Bearer jeton-de-test', 'publication signée du nom de la personne, jeton côté serveur');
ok(srv.post({ action: 'pub.github', token: tRedac, methode: 'GET', chemin: 'actualites.json' }).data.sha === x.data.sha, 'le sha renvoyé correspond au fichier publié');
const put = (chemin, content, t) => srv.post({ action: 'pub.github', token: t || tRedac, methode: 'PUT', chemin, corps: { content } });
ok(put('assets/photo-1.jpg', JPEG).ok, 'envoi d\'une image JPEG');
ok(put('assets/photo-2.png', PNG).ok && put('assets/photo-3.webp', WEBP).ok, 'envoi d\'images PNG et WebP');
ok(put('assets/faux.jpg', b64('<script>alert(1)</script>    ')).code === 'donnees', 'fichier qui n\'est pas une image refusé malgré son extension');
ok(put('assets/x.svg', b64('<svg/>')).code === 'droits', 'SVG refusé (pourrait contenir du code)');
ok(put('assets/doc.pdf', JPEG).code === 'droits', 'autres types de fichiers refusés');
ok(put('index.html', b64('<h1>piraté</h1>')).code === 'droits', 'impossible de modifier une page du site');
ok(put('espace/config.js', b64('x')).code === 'droits', 'impossible de modifier la configuration');
ok(put('assets/../index.html', JPEG).code === 'droits', 'chemins détournés refusés');
ok(put('assets/sous/dossier.jpg', JPEG).code === 'droits', 'sous-dossiers de assets/ refusés');
ok(put('actualites.json', b64('pas du json')).code === 'donnees', 'JSON invalide refusé avant publication');
ok(put('actualites.json', b64({ articles: [] })).code === 'donnees', 'format autre qu\'une liste refusé');
ok(put('actualites.json', b64([Object.assign({}, article, { image: 'javascript:alert(1)' })])).code === 'donnees', 'image hors de assets/ refusée');
ok(put('actualites.json', b64([Object.assign({}, article, { html: '<script>' })])).code === 'donnees', 'champ inconnu refusé');
ok(put('actualites.json', b64([article, article])).code === 'donnees', 'identifiants en double refusés');
ok(put('actualites.json', b64([Object.assign({}, article, { date: '4 novembre' })])).code === 'donnees', 'date mal formée refusée');
ok(put('actualites.json', b64([Object.assign({}, article, { titre: '  ' })])).code === 'donnees', 'titre vide refusé');
ok(put('actualites.json', b64([])).ok, 'liste vide acceptée (tous les articles supprimés)');
ok(srv.post({ action: 'pub.github', token: tRedac, methode: 'DELETE', chemin: 'actualites.json' }).code === 'droits', 'suppression de fichier refusée');
ok(put('actualites.json', b64([]), tMembre).code === 'droits', 'publication refusée sans droit actualités');
ok(put('actualites.json', b64([article]), tSecond).ok, 'un administrateur publie aussi');
ok(JSON.stringify(srv.post({ action: 'moi', token: tRedac })).indexOf('jeton-de-test') < 0 && JSON.stringify(srv.post({ action: 'pub.github', token: tRedac, methode: 'GET', chemin: 'actualites.json' })).indexOf('jeton-de-test') < 0, 'le jeton GitHub n\'est jamais renvoyé au navigateur');
ok(srv.sheets.Journal.data.some((l) => l[2] === 'publication'), 'publications inscrites au journal');

console.log('Déconnecter partout, retrait d\'accès');
const tRedac2 = connecterParCode(srv, adr('redac'));
r = srv.post({ action: 'acces.deconnecter', token: tJB, email: adr('redac') });
ok(r.ok && r.fermees === 2 && !r.vous, 'toutes les sessions de la personne sont fermées');
ok(srv.post({ action: 'moi', token: tRedac }).code === 'session' && srv.post({ action: 'moi', token: tRedac2 }).code === 'session', 'ses appareils sont déconnectés');
ok(srv.post({ action: 'moi', token: tJB }).ok, 'les autres sessions restent ouvertes');
ok(srv.post({ action: 'acces.deconnecter', token: tMembre, email: adr('redac') }).code === 'droits', 'réservé aux administrateurs');
const tRedac3 = connecterParCode(srv, adr('redac'));
ok(srv.post({ action: 'moi', token: tRedac3 }).ok, 'la personne peut se reconnecter (droits inchangés)');
ok(add({ email: adr('redac'), nom: 'Rita Rédaction', actualites: true, actif: false }, adr('redac')).ok && srv.post({ action: 'moi', token: tRedac3 }).code === 'session', 'désactiver un accès coupe la session');
ok(srv.post({ action: 'acces.supprimer', token: tJB, email: adr('membre') }).ok && srv.post({ action: 'moi', token: tMembre }).code === 'session', 'supprimer un accès coupe la session');
ok(!Object.keys(srv.props).some((k) => k.startsWith('s:') && JSON.parse(srv.props[k]).email === adr('membre')), 'les sessions d\'un accès supprimé sont effacées');
ok(srv.post({ action: 'auth.deconnexion', token: tSecond }).ok && srv.post({ action: 'moi', token: tSecond }).code === 'session', 'déconnexion');

console.log('Entretien des sessions');
srv.props['s:vieille'] = JSON.stringify({ email: ADMIN, exp: Date.now() - 1000 });
srv.props['s:abimee'] = 'pas du json';
ok(/2 session/.test(srv.run('nettoyerSessions')) && !('s:vieille' in srv.props) && srv.post({ action: 'moi', token: tJB }).ok, 'nettoyerSessions retire les sessions expirées ou abîmées, garde les autres');
ok('GITHUB_TOKEN' in srv.props && 'GOOGLE_CLIENT_ID' in srv.props, 'nettoyerSessions ne touche pas aux autres propriétés');

console.log('Sauvegarde quotidienne');
{
  const sv = charger({ props: { SITE_NOM: 'Site de test', GITHUB_TOKEN: 'cle-secrete' } });
  sv.run('installer');
  let m = sv.run('sauvegarderEspace');
  const fichiers = () => Object.values(sv.drive.fichiers).filter((f) => !f.isTrashed() && /^Site de test - Base - /.test(f.getName()));
  ok(/enregistrée/.test(m) && fichiers().length === 1 && sv.props.SAUV_DOSSIER_ID && sv.props.SAUV_DERNIERE, 'copie Excel du jour créée dans le dossier des sauvegardes');
  ok(sv.drive.dossiers[sv.props.SAUV_DOSSIER_ID].getName() === 'Sauvegardes – Site de test', 'dossier nommé d\'après le site');
  sv.run('sauvegarderEspace');
  ok(fichiers().length === 1, 'une seule copie par jour');
  sv.drive.maintenant = Date.now() - 40 * 86400000;
  const dossier = sv.drive.dossiers[sv.props.SAUV_DOSSIER_ID];
  const vieux = dossier.createFile(sv.ctx.Utilities.newBlob([1], 'x', 'Site de test - Base - 2020-01-01.xlsx'));
  const autre = dossier.createFile(sv.ctx.Utilities.newBlob([1], 'x', 'Note personnelle.txt'));
  delete sv.drive.maintenant;
  m = sv.run('sauvegarderEspace');
  ok(vieux.isTrashed() && !autre.isTrashed() && /1 ancienne/.test(m), 'copies de plus de 30 jours retirées, autres fichiers intacts');
  ok(!Object.values(sv.drive.fichiers).some((f) => /cle-secrete/.test(f.getBlob().getDataAsString())), 'aucune clé dans la sauvegarde');
}

console.log('Script autonome (hors feuille)');
{
  const auto = charger({ autonome: true });
  ok(/Installation terminée/.test(auto.run('installer')) && auto.props.SHEET_ID === 'fake', 'installer crée et mémorise la feuille si le script n\'est pas rattaché');
  ok(auto.sheets.Acces.data.length === 2, 'onglets créés dans la feuille mémorisée');
}

console.log('\n' + n + ' vérifications réussies.');
