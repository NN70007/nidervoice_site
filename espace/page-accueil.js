/* Page de connexion et d'accueil de l'espace (script externe, compatible avec la politique de sécurité du contenu). */
(function () {
  "use strict";
  var E = window.Espace, $ = function (s) { return document.querySelector(s); };
  var emailEnCours = "";

  function msg(id, texte) {
    ["#msg-erreur", "#msg-info"].forEach(function (k) { $(k).hidden = true; });
    if (texte) { $(id).textContent = texte; $(id).hidden = false; }
  }

  function afficherConnexion() {
    E.enTete(); E.piedDePage();
    $("#connexion").hidden = false; $("#accueil").hidden = true;
    if (/expire=1/.test(location.search)) msg("#msg-erreur", "Votre session a expiré. Merci de vous reconnecter.");
    if (!E.CFG.API_URL) msg("#msg-erreur", "Le serveur n'est pas encore configuré : l'adresse API_URL manque dans espace/config.js.");
    if (E.CFG.GOOGLE_CLIENT_ID) chargerGoogle();
  }

  /* Bouton Google : chargé seulement si un identifiant est renseigné dans config.js. */
  function chargerGoogle() {
    $("#bloc-google").hidden = false;
    var s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onload = function () {
      google.accounts.id.initialize({ client_id: E.CFG.GOOGLE_CLIENT_ID, callback: surGoogle, auto_select: false, ux_mode: "popup" });
      google.accounts.id.renderButton($("#g-btn"), { type: "standard", theme: "outline", size: "large", text: "signin_with", shape: "rectangular", logo_alignment: "left", locale: "fr", width: 300 });
    };
    s.onerror = function () { $("#bloc-google").hidden = true; };
    document.head.appendChild(s);
  }
  async function surGoogle(r) {
    msg();
    try { connecte(await E.api("auth.google", { idToken: r.credential })); }
    catch (e) { msg("#msg-erreur", e.message); }
  }
  function connecte(out) {
    E.setSession({ token: out.token, expire: out.expire, user: out.user });
    history.replaceState(null, "", "./");
    afficherAccueil();
  }

  $("#f-email").addEventListener("submit", async function (ev) {
    ev.preventDefault(); msg();
    var email = $("#in-email").value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg("#msg-erreur", "Saisissez une adresse e-mail valide."); return; }
    var b = $("#btn-code"); b.disabled = true; b.textContent = "Envoi…";
    try {
      var out = await E.api("auth.demanderCode", { email: email });
      emailEnCours = email; $("#f-email").hidden = true; $("#f-code").hidden = false; $("#bloc-google").hidden = true;
      msg("#msg-info", out.message); $("#in-code").focus();
    } catch (e) { msg("#msg-erreur", e.message); }
    finally { b.disabled = false; b.textContent = "Recevoir un code"; }
  });
  $("#f-code").addEventListener("submit", async function (ev) {
    ev.preventDefault(); msg();
    var code = $("#in-code").value.replace(/\D/g, "");
    if (code.length !== 6) { msg("#msg-erreur", "Le code comporte 6 chiffres."); return; }
    var b = $("#btn-verif"); b.disabled = true;
    try { connecte(await E.api("auth.verifierCode", { email: emailEnCours, code: code })); }
    catch (e) { msg("#msg-erreur", e.message); }
    finally { b.disabled = false; }
  });
  $("#btn-retour").addEventListener("click", function () {
    $("#f-code").hidden = true; $("#f-email").hidden = false; $("#in-code").value = ""; msg();
    if (E.CFG.GOOGLE_CLIENT_ID) $("#bloc-google").hidden = false;
  });

  function afficherAccueil() {
    var u = E.getSession().user;
    E.enTete({ actif: "accueil" }); E.piedDePage();
    $("#connexion").hidden = true; $("#accueil").hidden = false;
    document.title = "Administration";
    $("#bonjour").textContent = "Bonjour, " + String(u.nom || "").split(" ")[0] + ".";
    var T = [];
    if (u.actualites) T.push({ h: "admin/", t: "Actualités", p: "Rédiger, modifier et publier les articles du site." });
    if (u.admin) T.push({ h: "acces.html", t: "Accès", p: "Inscrire une personne et choisir ses droits (administration, actualités)." });
    $("#tuiles").innerHTML = T.length
      ? T.map(function (x) { return '<a class="carte tuile" href="' + x.h + '"><h2>' + E.esc(x.t) + "</h2><p>" + E.esc(x.p) + '</p><span class="aller">Ouvrir →</span></a>'; }).join("")
      : '<div class="carte avis"><strong>Aucun droit ne vous est encore ouvert.</strong>L\'administrateur du site peut vous les attribuer.</div>';
    // Droits rafraîchis en arrière-plan (un droit retiré est appliqué tout de suite)
    E.api("moi").then(function (out) {
      var s2 = E.getSession();
      if (s2 && JSON.stringify(s2.user) !== JSON.stringify(out.user)) { s2.user = out.user; E.setSession(s2); afficherAccueil(); }
    }).catch(function () { /* session expirée : api() renvoie vers la connexion */ });
  }

  if (E.getSession()) afficherAccueil(); else afficherConnexion();
})();
