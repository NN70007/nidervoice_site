// Interface de la page de dictée : déverrouillage, barre de dictée, insertion du texte au curseur,
// copier / effacer (avec annulation), fenêtres « commandes » et « réglages », mode nuit, moniteur réseau.
// Ne fait PAS : aucun accès réseau ici (tout passe par moteur.js) ; le texte n'est enregistré nulle part.
// Données : le texte de la feuille (dans la page seulement) ; préférences d'affichage (thème, taille) dans ce navigateur.
import * as moteur from "./moteur.js";
import { reseau } from "./reseau.js";
import * as retours from "./retours.js";

const $ = (id) => document.getElementById(id);
const feuille = $("text");
const csrf = $("app").dataset.csrf;
let pret = false; // modèle chargé
let arreter = null; // fonction d'arrêt pendant une dictée
let enCours = false; // démarrage ou arrêt en cours
let derniere = { valeur: null, pos: -1 }; // état de la feuille juste après la dernière insertion
let interne = false; // vrai pendant une insertion faite par la dictée
let modele = "";

/* ---------- Préférences d'affichage ---------- */

const lire = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, v); } catch { /* navigation privée */ } };

function appliquerTheme(choix) {
  const racine = document.documentElement;
  if (choix === "dark" || choix === "light") racine.dataset.theme = choix; else delete racine.dataset.theme;
  const nuit = choix ? choix === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  const b = $("theme");
  b.setAttribute("aria-pressed", String(nuit));
  b.title = nuit ? "Mode jour" : "Mode nuit";
  b.setAttribute("aria-label", b.title);
}
appliquerTheme(lire("nv-theme"));
$("theme").addEventListener("click", () => {
  const nuit = $("theme").getAttribute("aria-pressed") === "true";
  const choix = nuit ? "light" : "dark";
  ecrire("nv-theme", choix);
  appliquerTheme(choix);
});
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => appliquerTheme(lire("nv-theme")));

let taille = Number(lire("nv-taille")) || 18;
function appliquerTaille(t) {
  taille = Math.min(28, Math.max(14, t));
  feuille.style.setProperty("--taille", taille + "px");
  $("taille").textContent = taille + " px";
  ecrire("nv-taille", String(taille));
}
appliquerTaille(taille);
$("moins").addEventListener("click", () => appliquerTaille(taille - 2));
$("plus").addEventListener("click", () => appliquerTaille(taille + 2));

/* ---------- Fenêtres ---------- */

for (const [bouton, fenetre] of [["aideBtn", "aide"], ["reglagesBtn", "reglages"], ["reseau", "reseauFen"]]) {
  $(bouton).addEventListener("click", () => { if (fenetre === "reseauFen") remplirReseau(); $(fenetre).showModal(); });
}
for (const f of document.querySelectorAll("dialog")) {
  f.addEventListener("click", (e) => { if (e.target === f || e.target.closest("[data-fermer]")) f.close(); });
  f.addEventListener("close", () => feuille.focus());
}

let minuterieToast = 0;
function message(texte, annuler) {
  $("toastTx").textContent = texte;
  $("toastBtn").classList.toggle("cache", !annuler);
  $("toastBtn").onclick = () => { annuler(); $("toast").classList.add("cache"); };
  $("toast").classList.remove("cache");
  clearTimeout(minuterieToast);
  minuterieToast = setTimeout(() => $("toast").classList.add("cache"), annuler ? 8000 : 2500);
}

function erreur(texte) {
  $("errBox").textContent = texte;
  $("errBox").classList.remove("cache");
}

/* ---------- Insertion du texte au curseur ---------- */

/** Ajoute un morceau au texte qui précède, avec les espaces de la ponctuation française. */
function joindre(avant, ajout) {
  if (!ajout) return avant;
  if (/^[,.…)\]]/.test(ajout)) return avant.replace(/[ \t]+$/, "") + ajout;
  if (/^[ \t]/.test(ajout)) return avant === "" || /\s$/.test(avant) ? avant + ajout.replace(/^[ \t]+/, "") : avant + ajout;
  if (/^\n/.test(ajout)) return avant.replace(/[ \t]+$/, "") + ajout;
  return avant && !/\s$/.test(avant) ? avant + " " + ajout : avant + ajout;
}

/** Commande « effacer ça » : retire la dernière phrase du texte qui précède le curseur. */
function sansDernierePhrase(t) {
  const e = t.replace(/\s+$/, "");
  const k = e.slice(0, -1).search(/[.!?…\n][^.!?…\n]*$/);
  return k < 0 ? "" : e.slice(0, k + 1) + (e[k] === "\n" ? "" : " ");
}

/** Remplace feuille[de, a) par texte, en gardant l'annulation du navigateur (Ctrl+Z) quand c'est possible. */
function remplacer(de, a, texte) {
  let fait = false;
  if (document.activeElement === feuille) {
    feuille.setSelectionRange(de, a);
    fait = texte ? document.execCommand("insertText", false, texte) : de === a || document.execCommand("delete");
  }
  if (!fait) feuille.setRangeText(texte, de, a, "end");
}

function inserer(brut) {
  const valeur = feuille.value;
  const debut = feuille.selectionStart, fin = feuille.selectionEnd;
  let avant = valeur.slice(0, debut);
  const apres = valeur.slice(fin);
  // Curseur déplacé ou texte modifié depuis la dernière insertion : la mise en forme repart du texte réel.
  if (!(valeur === derniere.valeur && debut === fin && debut === derniere.pos)) moteur.reinitialiser(avant);
  const r = moteur.mettreEnForme(brut, true);
  if (!r.text && !(r.actions || []).length) return;
  for (const a of r.actions || []) if (a === "delete_last_sentence") avant = sansDernierePhrase(avant);
  let nouveau = joindre(avant, r.text);
  if (nouveau !== avant && apres && /^[\p{L}\p{N}(«]/u.test(apres) && !/\s$/.test(nouveau)) nouveau += " ";
  if (nouveau !== valeur.slice(0, debut) || fin > debut) {
    let k = 0;
    const lim = Math.min(debut, nouveau.length);
    while (k < lim && nouveau[k] === valeur[k]) k++;
    interne = true;
    try { remplacer(k, fin, nouveau.slice(k)); } finally { interne = false; }
    retours.dicte(k, nouveau.length, nouveau.slice(k), feuille.value);
  }
  derniere = { valeur: feuille.value, pos: feuille.selectionEnd };
}

/* ---------- Dictée ---------- */

const barres = [...$("niveau").children];
let niveauVise = 0, niveauImage = 0;
function afficherNiveau(n) {
  niveauVise = n;
  if (niveauImage) return;
  niveauImage = requestAnimationFrame(() => {
    niveauImage = 0;
    barres.forEach((b, i) => { b.style.height = Math.max(4, Math.min(20, 4 + niveauVise * 22 * (1 - Math.abs(i - 2) * 0.22))) + "px"; });
  });
}

function etat(texte) { $("state").textContent = texte; }

async function basculer() {
  if (!pret || enCours) return;
  enCours = true;
  $("errBox").classList.add("cache");
  if (!arreter) {
    reseau.debutDictee();
    try {
      moteur.reinitialiser(feuille.value.slice(0, feuille.selectionStart));
      derniere = { valeur: feuille.value, pos: feuille.selectionStart === feuille.selectionEnd ? feuille.selectionStart : -1 };
      arreter = await moteur.demarrer({
        morceau: (brut) => { $("apercu").textContent = ""; inserer(brut); },
        apercu: (brut) => { const t = moteur.mettreEnForme(brut, false).text.trim(); $("apercu").textContent = t ? "… " + t : ""; },
        niveau: afficherNiveau,
        erreur,
      });
      $("rec").classList.add("on");
      $("niveau").classList.add("on");
      $("recTx").textContent = "Arrêter";
      etat("À l'écoute · le texte s'écrit au curseur");
    } catch (e) {
      reseau.finDictee();
      erreur("Micro inaccessible : " + e.message);
    } finally {
      enCours = false;
      feuille.focus();
    }
    return;
  }
  const f = arreter;
  arreter = null;
  $("rec").classList.remove("on");
  $("niveau").classList.remove("on");
  $("recTx").textContent = "Dicter";
  $("rec").disabled = true;
  etat("Fin de la transcription…");
  try {
    const t0 = performance.now();
    const duree = await f();
    etat("Prêt · " + Math.round(duree) + " s dictées, terminé " + ((performance.now() - t0) / 1000).toFixed(1).replace(".", ",") + " s après l'arrêt");
  } catch (e) {
    erreur("Erreur de transcription : " + e.message);
    etat("Erreur");
  } finally {
    reseau.finDictee();
    $("apercu").textContent = "";
    $("rec").disabled = false;
    enCours = false;
    feuille.focus();
  }
}

async function copier() {
  if (!feuille.value) return message("La feuille est vide.");
  try { await navigator.clipboard.writeText(feuille.value); } catch {
    feuille.focus(); feuille.select(); document.execCommand("copy");
  }
  message("Texte copié.");
}

function effacer() {
  const ancien = feuille.value;
  if (!ancien) return;
  feuille.focus();
  feuille.select();
  if (!document.execCommand("delete")) feuille.value = "";
  retours.modifie(feuille.value);
  message("Texte effacé.", () => {
    feuille.value = ancien + feuille.value;
    retours.modifie(feuille.value);
    feuille.focus();
    feuille.setSelectionRange(ancien.length, ancien.length);
  });
}

$("rec").addEventListener("click", basculer);
$("copy").addEventListener("click", copier);
$("clear").addEventListener("click", effacer);
document.addEventListener("keydown", (e) => {
  if (e.key === "F2" && pret) { e.preventDefault(); basculer(); }
  if (e.key === "F4" && pret) { e.preventDefault(); copier(); }
});
addEventListener("beforeunload", (e) => { if (feuille.value.trim()) e.preventDefault(); });

/* ---------- Déverrouillage et phrase secrète ---------- */

$("unlock").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  $("unlockBtn").disabled = true;
  $("errBox").classList.add("cache");
  $("loadBox").classList.remove("cache");
  $("loadMsg").textContent = "Vérification de la phrase…";
  try {
    const phrase = $("phrase").value;
    $("phrase").value = "";
    const info = await moteur.deverrouiller(phrase, (faits, total, cache, phase) => {
      $("loadBar").value = Math.round(100 * faits / total);
      $("loadMsg").textContent = phase === "demarrage" ? "Démarrage du moteur…"
        : "Préparation du modèle : " + faits + " / " + total + (cache ? "" : " (sans cache)");
    });
    pret = true;
    modele = info.modele;
    $("unlock").classList.add("cache");
    $("work").classList.remove("cache");
    $("tech").textContent = "Moteur : processeur, " + reseau.pluriel(info.coeurs, "cœur") + (info.reduit ? " (mode réduit)" : "")
      + ". Modèle : " + info.modele + ". Commandes vocales : " + (info.miseEnForme ? "actives." : "indisponibles.");
    majReseau();
    feuille.focus();
  } catch (e) {
    erreur(e.message);
    $("loadBox").classList.add("cache");
  } finally {
    $("unlockBtn").disabled = false;
  }
});

$("changeForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const p1 = $("p1").value, p2 = $("p2").value;
  if (p1 !== p2) { $("changeMsg").textContent = "Les deux phrases ne sont pas identiques."; return; }
  if (p1.length < 20) { $("changeMsg").textContent = "Au moins 20 caractères."; return; }
  if (moteur.intranet) { // pas d'envoi : le nouveau verrou est téléchargé, à déposer sur le serveur à la place de modele/cle.json
    const lien = document.createElement("a");
    lien.href = URL.createObjectURL(new Blob([await moteur.nouveauVerrou(p1)], { type: "application/json" }));
    lien.download = "cle.json";
    lien.click();
    setTimeout(() => URL.revokeObjectURL(lien.href), 1000);
    $("changeMsg").textContent = "Nouveau verrou téléchargé : à remplacer dans modele/cle.json sur le serveur.";
    $("p1").value = ""; $("p2").value = "";
    return;
  }
  try {
    const echec = await moteur.changerPhrase(p1, csrf);
    $("changeMsg").textContent = echec ? "Échec de l'enregistrement (" + echec + ")." : "Nouvelle phrase enregistrée. L'ancienne ne fonctionne plus.";
    if (!echec) { $("p1").value = ""; $("p2").value = ""; }
  } catch (e) {
    $("changeMsg").textContent = e.message;
  }
});

/* ---------- Fiche de retour : mots corrigés à la main ---------- */

let attente = 0;
feuille.addEventListener("input", () => {
  if (interne) return;
  retours.modifie(feuille.value);
  clearTimeout(attente);
  attente = setTimeout(majFiche, 1500);
});

function majFiche() {
  if (moteur.intranet) return; // version intranet : aucun envoi, pas de fiche
  const n = retours.actualiser();
  $("fiche").classList.toggle("cache", n === 0);
  $("ficheTx").textContent = reseau.pluriel(n, "mot") + " à apprendre";
  if ($("ficheFen").open) remplirFiche();
}

function remplirFiche() {
  const paires = retours.liste();
  $("ficheVide").classList.toggle("cache", paires.length > 0);
  $("ficheListe").replaceChildren(...paires.map((x) => {
    const li = document.createElement("li");
    const lab = document.createElement("label");
    const c = document.createElement("input");
    c.type = "checkbox";
    c.checked = x.coche;
    c.addEventListener("change", () => { retours.cocher(x.cle, c.checked); majEnvoi(); });
    const t = document.createElement("span");
    const e = document.createElement(x.ecrit ? "s" : "i");
    e.textContent = x.ecrit || "ajouté";
    const v = document.createElement("b");
    v.textContent = x.voulu;
    t.append(e, " → ", v);
    lab.append(c, t);
    if (x.nomPropre) {
      const a = document.createElement("small");
      a.textContent = "Majuscule : seulement un nom de maladie, de signe ou de classification, jamais une personne.";
      lab.append(a);
    }
    const r = document.createElement("button");
    r.type = "button";
    r.className = "icone petit";
    r.textContent = "×";
    r.title = "Retirer de la liste";
    r.setAttribute("aria-label", r.title);
    r.addEventListener("click", () => { retours.retirer(x.cle); majFiche(); remplirFiche(); });
    li.append(lab, r);
    return li;
  }));
  majEnvoi();
}

function majEnvoi() {
  const n = retours.liste().filter((x) => x.coche).length;
  $("ficheEnvoyer").disabled = n === 0 || !!arreter;
  $("ficheEnvoyer").textContent = n ? "Envoyer " + reseau.pluriel(n, "mot") + " coché" + (n > 1 ? "s" : "") : "Cochez les mots à envoyer";
}

if (!moteur.intranet) { // version intranet : pas de fiche de retour
  $("fiche").addEventListener("click", () => { majFiche(); remplirFiche(); $("ficheMsg").textContent = ""; $("ficheFen").showModal(); });
  $("ficheOuvrir").addEventListener("click", () => { $("reglages").close(); majFiche(); remplirFiche(); $("ficheMsg").textContent = ""; $("ficheFen").showModal(); });
  $("ficheAjout").addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (retours.ajouter($("ajEcrit").value, $("ajVoulu").value)) {
      $("ajEcrit").value = ""; $("ajVoulu").value = ""; $("ficheMsg").textContent = "";
      majFiche(); remplirFiche();
    } else {
      $("ficheMsg").textContent = "Refusé : 1 à 3 mots, 40 caractères au plus, sans chiffres.";
    }
  });
  $("ficheEnvoyer").addEventListener("click", async () => {
    $("ficheEnvoyer").disabled = true;
    try {
      const n = await retours.envoyer(csrf, $("app").dataset.pk, modele);
      $("ficheMsg").textContent = reseau.pluriel(n, "mot") + " envoyé" + (n > 1 ? "s" : "") + ", chiffré" + (n > 1 ? "s" : "") + " pour le PC d'entraînement.";
    } catch (e) {
      $("ficheMsg").textContent = e.message;
    }
    majFiche();
    remplirFiche();
  });
}

/* ---------- Moniteur réseau ---------- */

function majReseau() {
  const e = reseau.etat();
  const b = $("reseau");
  b.classList.remove("cache");
  b.classList.toggle("alerte", e.bloques > 0 || e.autresHotes.length > 0);
  let t;
  if (e.horsLigne) t = "Hors connexion · " + (pret ? "la dictée continue de fonctionner" : "le modèle ne peut pas être chargé");
  else if (e.dictees > 0) t = "Réseau : " + reseau.pluriel(e.pendantDictee, "échange") + " pendant la dictée";
  else t = "Réseau : " + reseau.pluriel(e.total, "échange") + (e.autresHotes.length ? ", avec " + e.hotes.length + " sites" : e.total > 1 ? ", tous avec " + location.host : ", avec " + location.host);
  if (!e.horsLigne && e.dernier) t += " · dernier " + e.dernier;
  if (e.bloques) t += " · " + reseau.pluriel(e.bloques, "tentative") + " bloquée" + (e.bloques > 1 ? "s" : "");
  $("reseauTx").textContent = t;
  if ($("reseauFen").open) remplirReseau();
}

function remplirReseau() {
  const e = reseau.etat();
  $("rDictee").textContent = e.dictees ? String(e.pendantDictee) : "—";
  $("rTotal").textContent = String(e.total);
  $("rBloques").textContent = String(e.bloques);
  $("rResume").textContent = (e.dictees ? reseau.pluriel(e.dictees, "dictée") + " depuis l'ouverture. " : "Aucune dictée pour l'instant. ")
    + "Sites contactés : " + (e.hotes.join(", ") || "aucun") + ". Reçu au total : " + reseau.octets(e.recu)
    + " (une partie peut venir du cache du navigateur)." + (e.horsLigne ? " Le navigateur est hors connexion." : "");
  const corps = $("rListe");
  corps.replaceChildren(...reseau.lignes().map((l) => {
    const tr = document.createElement("tr");
    for (const [v, n] of [[l.nature], [l.adresse], [String(l.nombre), 1], [l.recuTx, 1], [l.heure, 1]]) {
      const td = document.createElement("td");
      td.textContent = v;
      if (n) td.className = "n";
      tr.append(td);
    }
    return tr;
  }));
}

reseau.demarrer(majReseau);
majReseau();
