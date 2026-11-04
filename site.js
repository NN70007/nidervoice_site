/* Socle — script du site public : lit site.json (nom, domaine, langue) puis actualites.json.
   Aucun innerHTML avec du contenu : tout est inséré comme texte. */
(function () {
  "use strict";
  var script = document.currentScript;
  var BASE = script && script.src ? new URL(".", script.src).href : location.origin + "/";
  var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  var IMAGE_RE = /^assets\/[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.(jpe?g|png|webp|gif)$/i;

  function lireJson(fichier) {
    return fetch(new URL(fichier, BASE).href, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(fichier + " : " + r.status);
      return r.json();
    });
  }
  function el(tag, cls, texte) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texte != null) e.textContent = texte;
    return e;
  }
  function dateLisible(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    return m ? Number(m[3]) + " " + MOIS[Number(m[2]) - 1] + " " + m[1] : "";
  }

  function appliquerSite(site) {
    var nom = String(site.nom || "").trim() || "Site en construction";
    var domaine = String(site.domaine || "").trim();
    if (site.langue) document.documentElement.lang = String(site.langue);
    document.querySelectorAll('[data-site="nom"]').forEach(function (x) { x.textContent = nom; });
    document.querySelectorAll('[data-site="domaine"]').forEach(function (x) { x.textContent = domaine; });
    document.querySelectorAll('[data-site="initiale"]').forEach(function (x) { x.textContent = nom.charAt(0).toUpperCase(); });
    var gabarit = document.documentElement.getAttribute("data-titre"); // ex. « {nom} — en construction »
    if (gabarit) document.title = gabarit.replace("{nom}", nom);
  }

  function article(a) {
    var art = el("article", "article");
    if (a.image && IMAGE_RE.test(a.image)) {
      var img = el("img");
      img.src = new URL(a.image, BASE).href; img.alt = ""; img.loading = "lazy"; img.decoding = "async";
      art.appendChild(img);
    }
    var corps = el("div", "corps");
    var t = el("time", "", dateLisible(a.date)); t.dateTime = a.date;
    corps.appendChild(t);
    corps.appendChild(el("h2", "", a.titre));
    String(a.texte || "").split(/\n\s*\n/).forEach(function (para) {
      if (!para.trim()) return;
      var p = el("p");
      para.trim().split("\n").forEach(function (ligne, i) { if (i) p.appendChild(document.createElement("br")); p.appendChild(document.createTextNode(ligne)); });
      corps.appendChild(p);
    });
    art.appendChild(corps);
    return art;
  }

  function afficherActualites(liste) {
    var zone = document.getElementById("actualites");
    if (!zone) return;
    liste = (Array.isArray(liste) ? liste : []).filter(function (a) { return a && typeof a.titre === "string" && /^\d{4}-\d{2}-\d{2}$/.test(a.date || ""); });
    if (!liste.length) return; // aucun article : la page « en construction » reste seule
    liste.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    var conteneur = zone.querySelector(".articles");
    liste.forEach(function (a) { conteneur.appendChild(article(a)); });
    zone.hidden = false;
  }

  var annee = document.querySelector("[data-annee]");
  if (annee) annee.textContent = String(new Date().getFullYear());
  lireJson("site.json").then(appliquerSite).catch(function () { appliquerSite({}); });
  if (document.getElementById("actualites")) lireJson("actualites.json").then(afficherActualites).catch(function () { /* pas d'actualités */ });
})();
