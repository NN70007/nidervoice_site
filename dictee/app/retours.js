// Fiche de retour : repère les mots dictés puis corrigés à la main (« écrit → voulu »), et les envoie
// seulement si l'utilisateur coche des paires et clique sur « Envoyer ».
// Ne fait PAS : aucun envoi automatique, aucun envoi de phrase (au plus 3 mots de chaque côté, sans
// chiffres) ; la liste est chiffrée dans le navigateur avec la clé publique de CHX avant de partir.
// Données : passages dictés de la feuille et paires repérées, en mémoire seulement (perdues à la fermeture).

const MOTS_MAX = 3;
const LONGUEUR_MAX = 40;
const PAIRES_MAX = 50;
const octets = new TextEncoder();

let passages = []; // { debut, fin, original, paires: [] } dans les coordonnees de la feuille
let valeur = ""; // dernier état connu de la feuille
const archivees = new Map(); // paires des passages effacés
const manuelles = new Map(); // mots ajoutés à la main
const envoyees = new Set(); // paires déjà envoyées : jamais reproposées
const cochees = new Set();

const cle = (p) => p.ecrit + "\u2192" + p.voulu;
const mots = (t) => t.match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu) || []; // « d'hépato » donne « d » et « hépato »

/** Paire acceptable ? Renvoie null si elle doit être écartée. */
export function filtrer(ecrit, voulu) {
  ecrit = ecrit.trim(); voulu = voulu.trim();
  const a = mots(ecrit), b = mots(voulu);
  if (!b.length || a.length > MOTS_MAX || b.length > MOTS_MAX) return null;
  if (/\d/.test(ecrit + voulu) || ecrit.length > LONGUEUR_MAX || voulu.length > LONGUEUR_MAX) return null;
  if (ecrit.toLowerCase() === voulu.toLowerCase()) return null;
  return { ecrit, voulu, nomPropre: b.some((m) => /^\p{Lu}/u.test(m)) };
}

/** Blocs remplacés entre deux listes de mots (plus longue sous-suite commune). */
function remplacements(a, b) {
  const n = a.length, m = b.length;
  if (n * m > 40000) return [];
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    L[i][j] = a[i].toLowerCase() === b[j].toLowerCase() ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const blocs = [];
  let i = 0, j = 0, x = [], y = [];
  const fermer = () => { if (x.length && y.length) blocs.push([x.join(" "), y.join(" ")]); x = []; y = []; };
  while (i < n || j < m) {
    if (i < n && j < m && a[i].toLowerCase() === b[j].toLowerCase()) { fermer(); i++; j++; }
    else if (j < m && (i === n || L[i][j + 1] >= L[i + 1][j])) y.push(b[j++]);
    else x.push(a[i++]);
  }
  fermer();
  return blocs;
}

function analyser(p) {
  p.paires = remplacements(mots(p.original), mots(valeur.slice(p.debut, p.fin)))
    .map(([e, v]) => filtrer(e, v)).filter(Boolean);
}

/** Un passage vient d'être dicté : feuille[debut, fin) contient texte. */
export function dicte(debut, fin, texte, nouvelleValeur) {
  modifie(nouvelleValeur, true);
  passages.push({ debut, fin, original: texte, paires: [] });
}

/** La feuille a changé (frappe, collage, effacement). interne = changement fait par la dictée. */
export function modifie(nouvelle, interne = false) {
  if (nouvelle === valeur) return;
  let p = 0;
  const lim = Math.min(nouvelle.length, valeur.length);
  while (p < lim && nouvelle[p] === valeur[p]) p++;
  let s = 0;
  while (s < lim - p && nouvelle[nouvelle.length - 1 - s] === valeur[valeur.length - 1 - s]) s++;
  const finAncien = valeur.length - s, delta = nouvelle.length - valeur.length;
  passages = passages.filter((g) => {
    if (finAncien > p && g.debut >= p && g.fin <= finAncien) { // passage entièrement retiré
      for (const x of g.paires) archivees.set(cle(x), x);
      return false;
    }
    if (g.fin < p || (interne && g.fin === p)) return true;
    if (g.debut > finAncien || (g.debut === finAncien && (finAncien > p || interne))) { g.debut += delta; g.fin += delta; return true; }
    if (interne) return false; // la dictée a réécrit ce passage (« effacer ça », sélection remplacée) : on cesse de le suivre
    g.debut = Math.min(g.debut, p);
    g.fin = Math.max(g.fin, finAncien) + delta;
    return true;
  });
  valeur = nouvelle;
}

/** Met à jour les paires (à appeler quand l'utilisateur a fini de taper). Renvoie leur nombre. */
export function actualiser() {
  passages.forEach(analyser);
  return liste().length;
}

export function liste() {
  const toutes = new Map([...archivees, ...manuelles]);
  for (const g of passages) for (const x of g.paires) toutes.set(cle(x), x);
  return [...toutes.values()].filter((x) => !envoyees.has(cle(x))).slice(0, PAIRES_MAX)
    .map((x) => ({ ...x, cle: cle(x), coche: cochees.has(cle(x)) }));
}

export function cocher(k, oui) { if (oui) cochees.add(k); else cochees.delete(k); }
export function retirer(k) { envoyees.add(k); cochees.delete(k); }
export function ajouter(ecrit, voulu) {
  const x = filtrer(ecrit, voulu);
  if (x) manuelles.set(cle(x), x);
  return !!x;
}

/** Chiffre les paires cochées avec la clé publique de CHX et les envoie. Renvoie le nombre envoyé. */
export async function envoyer(csrf, clePublique, modele) {
  const choix = liste().filter((x) => x.coche);
  if (!choix.length) return 0;
  const maintenant = new Date();
  const d2 = (n) => String(n).padStart(2, "0");
  const horo = maintenant.getFullYear() + "-" + d2(maintenant.getMonth() + 1) + "-" + d2(maintenant.getDate())
    + "-" + d2(maintenant.getHours()) + d2(maintenant.getMinutes()) + d2(maintenant.getSeconds()); // heure locale
  const contenu = octets.encode(JSON.stringify({
    version: 1, date: maintenant.toISOString(), modele,
    paires: choix.map((x) => ({ ecrit: x.ecrit, voulu: x.voulu })),
  }, null, 1));
  const pub = await crypto.subtle.importKey("spki", Uint8Array.from(atob(clePublique), (c) => c.charCodeAt(0)),
    { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  const cleFichier = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const prefixe = crypto.getRandomValues(new Uint8Array(8));
  const iv = (n) => { const v = new Uint8Array(12); v.set(prefixe); new DataView(v.buffer).setUint32(8, n >>> 0); return v; };
  const aad = new Uint8Array(9);
  aad.set(octets.encode("NVD1"));
  aad[8] = 1; // morceau 0, dernier
  // Même format que le dépôt chiffré (depot/app.js), lu par C:\DicteeLab\depot\recuperer_depot.py.
  const morceau = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv(0), additionalData: aad }, cleFichier, contenu);
  const manifeste = octets.encode(JSON.stringify({ p: "Retours-dictee/retour-" + horo + ".json", s: contenu.length, t: maintenant.getTime() }));
  const m = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv(0xffffffff), additionalData: octets.encode("NVD1M") }, cleFichier, manifeste);
  const k = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, pub, await crypto.subtle.exportKey("raw", cleFichier));
  const b64 = (u) => btoa(String.fromCharCode(...new Uint8Array(u)));
  const r = await fetch("retour.php", {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-CSRF": csrf },
    body: JSON.stringify({ k: b64(k), m: b64(new Uint8Array([...prefixe, ...new Uint8Array(m)])), c: b64(morceau) }),
  });
  if (!r.ok) throw new Error(r.status === 429 ? "Trop d'envois aujourd'hui." : "Échec de l'envoi (" + r.status + ").");
  for (const x of choix) retirer(x.cle);
  return choix.length;
}
