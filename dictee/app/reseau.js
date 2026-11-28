// Moniteur réseau : lit le journal que le navigateur tient lui-même des échanges de la page
// (Resource Timing), les tentatives bloquées par la règle de sécurité (événements securitypolicyviolation)
// et l'état de la connexion. Affiche ces mesures telles quelles.
// Ne fait PAS : aucun envoi, aucune mémorisation ; il ne voit que ce que le navigateur enregistre.

const echanges = []; // { t: ms depuis l'ouverture, hote, chemin, nature, recu }
const bloques = []; // { t, adresse, regle }
const dictees = []; // [debut, fin] en ms depuis l'ouverture ; fin = Infinity pendant la dictée
let rafraichir = () => {};

function nature(url, type) {
  const intranet = url.pathname.includes("/modele/"); // version intranet : modèle servi comme fichiers ordinaires
  const n = intranet ? url.pathname.split("/").pop() : url.searchParams.get("n") || "";
  if (url.pathname.endsWith("/f.php") || intranet) {
    if (/^m\d_\d{4}\.bin$/.test(n)) return "Modèle chiffré (morceaux)";
    if (n === "cle.json") return "Verrou du modèle";
    if (n === "manifest.json") return "Liste des fichiers du modèle";
  }
  if (url.pathname.endsWith("/cle.php")) return "Nouveau verrou (changement de phrase)";
  if (url.pathname.endsWith("/retour.php")) return "Mots corrigés (chiffrés)";
  if (type === "navigation") return "Page";
  if (/\.woff2$/.test(url.pathname)) return "Police de caractères";
  if (/\.svg$/.test(url.pathname)) return "Logo";
  if (/\.css$/.test(url.pathname)) return "Mise en page";
  if (/\.wasm$/.test(url.pathname)) return "Moteur de calcul";
  if (/\.m?js$/.test(url.pathname)) return "Code de la page";
  return "Autre";
}

function noter(e) {
  let url;
  try { url = new URL(e.name); } catch { return; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  echanges.push({
    t: e.startTime, hote: url.host, chemin: url.pathname,
    nature: nature(url, e.entryType === "navigation" ? "navigation" : e.initiatorType),
    recu: e.transferSize || 0,
  });
}

const pendantDictee = (t) => dictees.some(([d, f]) => t >= d && t <= f);
const octets = (n) => n < 1024 ? n + " o" : n < 1048576 ? (n / 1024).toFixed(0) + " ko" : (n / 1048576).toFixed(1).replace(".", ",") + " Mo";
const heure = (t) => new Date(performance.timeOrigin + t).toLocaleTimeString("fr-FR");
function depuis(t) {
  const s = Math.round((performance.now() - t) / 1000);
  return s < 60 ? "à l'instant" : s < 3600 ? "il y a " + Math.round(s / 60) + " min" : "il y a " + Math.round(s / 3600) + " h";
}
const pluriel = (n, mot) => n + " " + mot + (n > 1 ? "s" : "");

export const reseau = {
  /** Commence la surveillance : à appeler dès le chargement du code de la page. */
  demarrer(miseAJour) {
    rafraichir = miseAJour;
    try { performance.setResourceTimingBufferSize(10000); } catch { /* ancien navigateur */ }
    for (const e of performance.getEntriesByType("navigation")) noter(e);
    new PerformanceObserver((liste) => { liste.getEntries().forEach(noter); rafraichir(); })
      .observe({ type: "resource", buffered: true });
    document.addEventListener("securitypolicyviolation", (e) => {
      bloques.push({ t: performance.now(), adresse: e.blockedURI || "(inconnue)", regle: e.effectiveDirective });
      rafraichir();
    });
    addEventListener("online", () => rafraichir());
    addEventListener("offline", () => rafraichir());
    setInterval(() => rafraichir(), 15000);
  },
  debutDictee() { dictees.push([performance.now(), Infinity]); rafraichir(); },
  finDictee() { const d = dictees[dictees.length - 1]; if (d && d[1] === Infinity) d[1] = performance.now(); rafraichir(); },

  /** Les chiffres à afficher. */
  etat() {
    const hotes = [...new Set(echanges.map((e) => e.hote))];
    const dernier = echanges.reduce((m, e) => Math.max(m, e.t), -1);
    return {
      total: echanges.length,
      pendantDictee: echanges.filter((e) => pendantDictee(e.t)).length,
      bloques: bloques.length,
      hotes,
      autresHotes: hotes.filter((h) => h !== location.host),
      recu: echanges.reduce((n, e) => n + e.recu, 0),
      dernier: dernier < 0 ? null : depuis(dernier),
      horsLigne: !navigator.onLine,
      dictees: dictees.length,
    };
  },

  /** Lignes du tableau détaillé, regroupées par contenu et adresse. */
  lignes() {
    const g = new Map();
    for (const e of echanges) {
      const cle = e.nature + "|" + e.hote + e.chemin;
      const l = g.get(cle) || { nature: e.nature, adresse: (e.hote === location.host ? "" : e.hote) + e.chemin, nombre: 0, recu: 0, dernier: 0, pendant: 0 };
      l.nombre++; l.recu += e.recu; l.dernier = Math.max(l.dernier, e.t); if (pendantDictee(e.t)) l.pendant++;
      g.set(cle, l);
    }
    const sortie = [...g.values()].sort((a, b) => a.dernier - b.dernier)
      .map((l) => ({ ...l, recuTx: octets(l.recu), heure: heure(l.dernier) }));
    for (const b of bloques) sortie.push({ nature: "Bloqué (" + b.regle + ")", adresse: b.adresse, nombre: 1, recuTx: "0 o", heure: heure(b.t), bloque: true });
    return sortie;
  },
  octets,
  pluriel,
};
