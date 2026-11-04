/* Espace d'administration — fonctions communes : session, appels au serveur, en-tête, pied de page, notifications. */
(function () {
  "use strict";
  var CFG = window.ESPACE_CONFIG || {};
  var CLE = "espace_session";

  /* Racine de l'espace (le dossier de ce script) : les liens marchent depuis /espace/ comme depuis /espace/admin/. */
  var SCRIPT = document.currentScript;
  var BASE = SCRIPT && SCRIPT.src ? new URL(".", SCRIPT.src).href : location.origin + "/espace/";
  function lien(p) { return new URL(p || "./", BASE).href; }
  function surPageConnexion() { var ici = location.href.split(/[?#]/)[0]; return ici === BASE || ici === BASE + "index.html"; }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function getSession() {
    try { var s = JSON.parse(localStorage.getItem(CLE) || "null"); if (s && s.token && s.expire > Date.now()) return s; } catch (e) { /* stockage indisponible */ }
    return null;
  }
  function setSession(s) { try { localStorage.setItem(CLE, JSON.stringify(s)); } catch (e) { /* ignoré */ } }
  function clearSession() { try { localStorage.removeItem(CLE); } catch (e) { /* ignoré */ } }

  /** Appel au serveur Apps Script. Rejette avec { message, code }. */
  async function api(action, data) {
    if (!CFG.API_URL) throw { message: "Le serveur n'est pas encore configuré (adresse API_URL manquante dans espace/config.js).", code: "config" };
    var corps = Object.assign({ action: action }, data || {});
    var s = getSession();
    if (s && !corps.token) corps.token = s.token;
    var res, out;
    try {
      // text/plain : requête « simple », sans pré-vérification CORS (Apps Script ne la gère pas)
      res = await fetch(CFG.API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(corps), redirect: "follow" });
    } catch (e) { throw { message: "Impossible de joindre le serveur. Vérifiez votre connexion internet.", code: "reseau" }; }
    try { out = await res.json(); } catch (e) { throw { message: "Réponse inattendue du serveur.", code: "serveur" }; }
    if (!out.ok) {
      if (out.code === "session") { clearSession(); if (!surPageConnexion()) location.href = lien("./?expire=1"); }
      throw { message: out.error || "Erreur.", code: out.code };
    }
    if (out.user && s) { s.user = out.user; setSession(s); }
    return out;
  }

  /** Renvoie la session, ou renvoie vers la page de connexion. */
  function exigerConnexion() {
    var s = getSession();
    if (!s && !surPageConnexion()) location.replace(lien("./"));
    return s;
  }
  async function deconnexion() {
    try { await api("auth.deconnexion"); } catch (e) { /* session déjà fermée */ }
    clearSession();
    location.href = lien("./");
  }

  /* Nom du site, lu une fois dans site.json (à la racine du site). */
  var siteP = null;
  function site() {
    if (!siteP) siteP = fetch(lien("../site.json"), { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; });
    return siteP;
  }

  function liens(u, actif) {
    var L = [{ k: "accueil", h: lien("./"), t: "Accueil" }];
    if (u && u.actualites) L.push({ k: "actualites", h: lien("admin/"), t: "Actualités" });
    if (u && u.admin) L.push({ k: "acces", h: lien("acces.html"), t: "Accès" });
    return L.map(function (l) { return '<a href="' + l.h + '"' + (l.k === actif ? ' class="actif" aria-current="page"' : "") + ">" + esc(l.t) + "</a>"; }).join("");
  }

  /** En-tête commun. opts.actif : clé de la page courante (accueil, actualites, acces). */
  function enTete(opts) {
    opts = opts || {};
    var s = getSession(), u = s && s.user;
    var el = document.getElementById("haut");
    el.innerHTML = '<header class="barre-haut"><div class="conteneur">' +
      '<a class="marque" href="' + lien("./") + '"><span class="monogramme" aria-hidden="true">·</span><span><span class="js-nom">Administration</span> <small>· administration</small></span></a>' +
      (u ? '<nav class="nav" aria-label="Navigation">' + liens(u, opts.actif) + "</nav>" +
        '<div class="utilisateur"><span>' + esc(u.nom) + '</span><button type="button" class="btn btn-discret btn-petit" id="btn-deconnexion">Se déconnecter</button></div>' : "") +
      "</div></header>";
    var b = document.getElementById("btn-deconnexion");
    if (b) b.addEventListener("click", deconnexion);
    site().then(function (x) {
      var nom = String(x.nom || "").trim();
      if (!nom) return;
      el.querySelector(".js-nom").textContent = nom;
      el.querySelector(".monogramme").textContent = nom.charAt(0).toUpperCase();
      if (!/·/.test(document.title)) document.title = document.title + " · " + nom;
    });
  }

  function piedDePage() {
    var el = document.getElementById("bas");
    if (!el) return;
    el.innerHTML = '<footer class="pied"><div class="conteneur"><span>Espace réservé · données privées</span><a href="' + lien("../") + '">← Site public</a></div></footer>';
  }

  function toast(msg) {
    var t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); t.setAttribute("aria-live", "polite"); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("visible");
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("visible"); }, 3000);
  }

  function quand(ts) {
    if (!ts) return "";
    var d = new Date(ts);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) + " " + String(d.getHours()).padStart(2, "0") + "h" + String(d.getMinutes()).padStart(2, "0");
  }

  window.Espace = { CFG: CFG, esc: esc, api: api, lien: lien, site: site, getSession: getSession, setSession: setSession, clearSession: clearSession,
    exigerConnexion: exigerConnexion, deconnexion: deconnexion, enTete: enTete, piedDePage: piedDePage, toast: toast, quand: quand };
})();
