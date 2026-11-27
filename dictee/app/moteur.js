// Moteur de la dictée en ligne : verrou du modèle, chargement, micro, découpage aux pauses, reconnaissance.
// Accès réseau : seulement vers ce site (f.php pour le modèle chiffré et le verrou, cle.php pour changer
// de phrase secrète, medtext.wasm et rec-worklet.js au déverrouillage). Le son ne quitte jamais la mémoire.
// Ne fait PAS : aucun envoi de son ni de texte, aucune interprétation du contenu médical.
// Données : son du micro (mémoire, effacé après chaque passage), clé du modèle (mémoire, non exportée sauf
// pour être re-verrouillée par une nouvelle phrase dans le navigateur).
import * as ort from "./ort/ort.wasm.min.mjs";
import { ParakeetModel } from "./parakeet.min.js";

const CACHE = "nv-modele-p5b-v1"; // à changer à chaque nouveau modèle
const ANCIENS_CACHES = ["nv-modele-p5-v1", "nv-modele-p4-v1"];
const TAUX = 16000; // échantillons par seconde
const PERIODE_MS = 700; // fréquence du découpage
const SILENCE_S = 0.45; // pause qui termine un morceau
const MORCEAU_MIN_S = 2;
const MORCEAU_MAX_S = 14;

const octets = new TextEncoder();
const texte = new TextDecoder();
const deB64 = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
const enB64 = (u) => btoa(String.fromCharCode(...u));
const ici = (nom) => new URL(nom, import.meta.url).href;
const SESSION_EXPIREE = "Session expirée : rechargez la page pour vous reconnecter.";

ort.env.wasm.wasmPaths = ici("ort/");
ort.env.wasm.numThreads = self.crossOriginIsolated
  ? Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1))
  : 1;
ort.env.wasm.proxy = false;

let modele = null;
let cleModele = null;
let mise = null; // module medtext.wasm (mise en forme dictée), ou null

/* ---------- Verrou et modèle chiffré ---------- */

async function lireJson(nom) {
  const r = await fetch("f.php?n=" + nom, { cache: "no-store", credentials: "same-origin" });
  if (r.status === 403) throw new Error(SESSION_EXPIREE);
  if (!r.ok) throw new Error("Fichier " + nom + " indisponible (" + r.status + ").");
  return r.json();
}

async function cleDePhrase(phrase, sel, iterations, usages) {
  const base = await crypto.subtle.importKey("raw", octets.encode(phrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: sel, iterations },
    base, { name: "AES-GCM", length: 256 }, false, usages);
}

async function ouvrirVerrou(phrase, verrou) {
  const kek = await cleDePhrase(phrase, deB64(verrou.salt), verrou.iter, ["decrypt"]);
  let brute;
  try {
    brute = new Uint8Array(await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: deB64(verrou.iv), additionalData: octets.encode("nidervoice-cle") },
      kek, deB64(verrou.wrapped)));
  } catch {
    throw new Error("Phrase secrète incorrecte.");
  }
  const cle = await crypto.subtle.importKey("raw", brute, "AES-GCM", true, ["decrypt", "encrypt"]);
  brute.fill(0);
  return cle;
}

async function morceau(nom, cache) {
  const url = new URL("f.php?n=" + nom, location.href).href;
  let r = cache ? await cache.match(url) : null;
  if (!r) {
    r = await fetch(url, { credentials: "same-origin", cache: "no-store" });
    if (r.status === 403) throw new Error(SESSION_EXPIREE);
    if (!r.ok) throw new Error("Morceau " + nom + " indisponible (" + r.status + ").");
    if (cache) try { await cache.put(url, r.clone()); } catch { /* cache plein : on continue sans */ }
  }
  return new Uint8Array(await r.arrayBuffer());
}

async function chargerModele(manifeste, progres) {
  let cache = null;
  try {
    cache = await caches.open(CACHE);
    for (const ancien of ANCIENS_CACHES) caches.delete(ancien).catch(() => {});
  } catch { cache = null; }
  const total = manifeste.files.reduce((n, f) => n + f.chunks, 0);
  let faits = 0;
  const fichiers = {};
  for (let fi = 0; fi < manifeste.files.length; fi++) {
    const f = manifeste.files[fi];
    const donnees = new Uint8Array(f.size);
    const prefixe = deB64(f.prefix);
    for (let k = 0; k < f.chunks; k++) {
      const nom = "m" + fi + "_" + String(k).padStart(4, "0") + ".bin";
      const chiffre = await morceau(nom, cache);
      const iv = new Uint8Array(12);
      iv.set(prefixe, 0);
      new DataView(iv.buffer).setUint32(8, k, false);
      let clair;
      try {
        clair = new Uint8Array(await crypto.subtle.decrypt(
          { name: "AES-GCM", iv, additionalData: octets.encode(f.name + ":" + k) }, cleModele, chiffre));
      } catch {
        if (cache) await cache.delete(new URL("f.php?n=" + nom, location.href).href);
        throw new Error("Morceau " + nom + " abîmé : rechargez la page.");
      }
      donnees.set(clair, k * manifeste.chunk);
      progres(++faits, total, !!cache);
    }
    fichiers[f.name] = donnees;
  }
  progres(total, total, !!cache, "demarrage");
  const vocab = URL.createObjectURL(new Blob([fichiers["vocab.txt"]], { type: "text/plain" }));
  const m = await ParakeetModel.fromUrls({
    encoderUrl: fichiers["encoder-model.int8.onnx"],
    decoderUrl: fichiers["decoder_joint-model.int8.onnx"],
    tokenizerUrl: vocab,
    filenames: { encoder: "encoder-model.int8.onnx", decoder: "decoder_joint-model.int8.onnx" },
    preprocessorBackend: "js", backend: "wasm", cpuThreads: ort.env.wasm.numThreads,
  });
  URL.revokeObjectURL(vocab);
  return m;
}

async function chargerMiseEnForme() {
  try {
    const r = await fetch(ici("medtext.wasm"), { credentials: "same-origin" });
    const { instance } = await WebAssembly.instantiate(await r.arrayBuffer(), {});
    mise = instance.exports;
  } catch { mise = null; }
}

/** Déverrouille le modèle avec la phrase secrète, puis le charge. Renvoie les informations à afficher. */
export async function deverrouiller(phrase, progres) {
  const [manifeste, verrou] = await Promise.all([lireJson("manifest.json"), lireJson("cle.json")]);
  cleModele = await ouvrirVerrou(phrase, verrou);
  modele = await chargerModele(manifeste, progres);
  await chargerMiseEnForme();
  await micro.preparer();
  return {
    modele: manifeste.modele,
    coeurs: ort.env.wasm.numThreads,
    reduit: !self.crossOriginIsolated,
    miseEnForme: !!mise,
  };
}

/** Re-verrouille la clé du modèle avec une nouvelle phrase (dans le navigateur) et envoie ce verrou. */
export async function changerPhrase(nouvelle, csrf) {
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iter = 600000;
  const kek = await cleDePhrase(nouvelle, sel, iter, ["encrypt"]);
  const brute = new Uint8Array(await crypto.subtle.exportKey("raw", cleModele));
  const enveloppe = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: octets.encode("nidervoice-cle") }, kek, brute));
  brute.fill(0);
  const verrou = { version: 1, kdf: "PBKDF2-SHA256", iter, salt: enB64(sel), iv: enB64(iv), wrapped: enB64(enveloppe) };
  const r = await fetch("cle.php", {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-CSRF": csrf },
    body: JSON.stringify(verrou),
  });
  return r.ok ? null : r.status;
}

/* ---------- Mise en forme dictée (commandes « point », « à la ligne »…) ---------- */

/** Contexte de la mise en forme d'après le texte qui précède : 0 début, 1 milieu de phrase, 2 après un point. */
export function contexte(avant) {
  const t = avant.replace(/[ \t]+$/, "");
  return t === "" || /\n$/.test(t) ? 0 : /[.!?…]$/.test(t) ? 2 : 1;
}

export function reinitialiser(avant) {
  if (mise) mise.nv_reset(contexte(avant));
}

/** Applique les commandes dictées. final = false pour un simple aperçu (ne change pas l'état). */
export function mettreEnForme(brut, final) {
  if (!mise || !brut) return { text: brut || "", actions: [] };
  const b = octets.encode(brut);
  const p = mise.nv_alloc(b.length);
  new Uint8Array(mise.memory.buffer, p, b.length).set(b);
  mise.nv_process(p, b.length, final ? 1 : 0);
  mise.nv_free(p, b.length);
  return JSON.parse(texte.decode(new Uint8Array(mise.memory.buffer, mise.nv_out_ptr(), mise.nv_out_len()).slice()));
}

function motCourant(mot) {
  if (!mise) return true;
  const b = octets.encode(mot.toLowerCase());
  const p = mise.nv_alloc(b.length);
  new Uint8Array(mise.memory.buffer, p, b.length).set(b);
  const r = mise.nv_is_common(p, b.length);
  mise.nv_free(p, b.length);
  return r === 1;
}

const minusculeSiCourant = (m) => (/^\p{Lu}\p{Ll}+$/u.test(m) && motCourant(m) ? m.toLowerCase() : m);

/** Garde seulement les mots : la ponctuation vient des commandes dictées, pas du modèle. */
function sansPonctuationDuModele(t) {
  let e = t.replace(/(\d)([,.])(?=\d)/g, (_, chiffre, sep) => chiffre + (sep === "," ? "\u0001" : "\u0002"));
  e = e.replace(/[.!?…]+\s*([\p{L}'’-]+)/gu, (_, mot) => " " + minusculeSiCourant(mot));
  e = e.replace(/[.,;:!?…]+/g, " ");
  e = e.replace(/^\s*([\p{L}'’-]+)/u, (_, mot) => minusculeSiCourant(mot));
  return e.replace(/\u0001/g, ",").replace(/\u0002/g, ".").replace(/\s+/g, " ").trim();
}

async function reconnaitre(son) {
  if (son.length < TAUX * 0.3) return "";
  const r = son.length > TAUX * 25
    ? await modele.transcribeLongAudio(son, TAUX, {})
    : await modele.transcribe(son, TAUX, { enableProfiling: false });
  return sansPonctuationDuModele((r.utterance_text || r.text || "").trim());
}

/* ---------- Micro et découpage aux pauses ---------- */

const rms = (a, de, a2) => {
  let s = 0;
  for (let i = de; i < a2; i++) s += a[i] * a[i];
  return Math.sqrt(s / Math.max(1, a2 - de));
};

function reechantillonner(a, de, vers) {
  const sortie = new Float32Array(Math.floor(a.length * vers / de));
  const pas = de / vers;
  for (let i = 0; i < sortie.length; i++) {
    const x = i * pas, k = Math.floor(x), f = x - k;
    sortie[i] = (a[k] || 0) * (1 - f) + (a[k + 1] || 0) * f;
  }
  return sortie;
}

const micro = {
  ctx: null,
  /** Prépare le traitement du son une seule fois : aucune requête au démarrage de chaque dictée. */
  async preparer() {
    if (this.ctx) return;
    this.ctx = new AudioContext({ sampleRate: TAUX });
    await this.ctx.audioWorklet.addModule(ici("rec-worklet.js"));
    await this.ctx.suspend();
  },
};

/** Fin du morceau en cours (indice), ou -1 s'il continue. */
function finDeMorceau(d) {
  const duree = (d.len - d.debut) / TAUX;
  if (duree < MORCEAU_MIN_S) return -1;
  const bloc = Math.round(0.05 * TAUX);
  const blocsSilence = Math.round(SILENCE_S / 0.05);
  let calmes = 0, fin = -1;
  for (let i = d.debut + Math.round(MORCEAU_MIN_S * TAUX); i + bloc <= d.len; i += bloc) {
    if (rms(d.son, i, i + bloc) < Math.max(d.bruit * 2.5, 0.006)) {
      if (++calmes >= blocsSilence) fin = i + bloc;
    } else calmes = 0;
  }
  if (fin < 0 && duree > MORCEAU_MAX_S) fin = d.len;
  return fin;
}

/**
 * Démarre une dictée. Rappels : morceau(texteBrut) à chaque pause, apercu(texteBrut) pendant la parole,
 * niveau(0..1) pour le témoin du micro, erreur(message).
 */
export async function demarrer(rappels) {
  const flux = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true },
  });
  const ctx = micro.ctx;
  const source = ctx.createMediaStreamSource(flux);
  const noeud = new AudioWorkletNode(ctx, "nv-capture");
  const d = { flux, source, noeud, son: new Float32Array(TAUX * 60), len: 0, debut: 0, bruit: 0.004, occupe: false, fin: false };
  noeud.port.onmessage = (ev) => {
    let a = ev.data;
    if (ctx.sampleRate !== TAUX) a = reechantillonner(a, ctx.sampleRate, TAUX);
    if (d.len + a.length > d.son.length) {
      const plus = new Float32Array(d.son.length * 2);
      plus.set(d.son.subarray(0, d.len));
      d.son = plus;
    }
    d.son.set(a, d.len);
    d.len += a.length;
    rappels.niveau(Math.min(1, rms(a, 0, a.length) * 8));
  };
  source.connect(noeud);
  await ctx.resume();

  async function tour() {
    if (d.occupe || d.fin) return;
    d.occupe = true;
    try {
      if (d.len > TAUX) d.bruit = Math.min(d.bruit * 1.02, Math.max(5e-4, rms(d.son, d.len - TAUX * 0.2, d.len)));
      const fin = finDeMorceau(d);
      if (fin > 0) {
        const brut = await reconnaitre(d.son.slice(d.debut, fin));
        d.son.fill(0, d.debut, fin);
        d.debut = fin;
        rappels.morceau(brut);
      } else if ((d.len - d.debut) / TAUX >= 0.6) {
        rappels.apercu(await reconnaitre(d.son.slice(d.debut, d.len)));
      }
    } catch (e) {
      rappels.erreur("Erreur de transcription : " + e.message);
    } finally {
      d.occupe = false;
    }
  }
  d.minuterie = setInterval(tour, PERIODE_MS);

  /** Arrête le micro, termine le dernier morceau. Renvoie la durée dictée en secondes. */
  return async function arreter() {
    d.fin = true;
    clearInterval(d.minuterie);
    noeud.port.onmessage = null;
    noeud.disconnect();
    source.disconnect();
    flux.getTracks().forEach((p) => p.stop());
    await ctx.suspend();
    while (d.occupe) await new Promise((ok) => setTimeout(ok, 50));
    rappels.morceau(await reconnaitre(d.son.slice(d.debut, d.len)));
    d.son.fill(0);
    rappels.niveau(0);
    return d.len / TAUX;
  };
}
