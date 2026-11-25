/* Formulaire de contact : envoie le message au serveur du site (une ligne dans une feuille privée
   et un e-mail au destinataire). Si l'envoi échoue, propose de préparer un e-mail à la place.
   Aucun cookie, aucun traceur, aucune ressource tierce chargée. */
(function () {
  "use strict";
  var LANGS = ["fr", "en", "es", "de"];
  var M = {
    req: { fr: "Champs à compléter : ", en: "Fields to complete: ", es: "Campos por completar: ", de: "Auszufüllende Felder: " },
    mail: { fr: "L'adresse e-mail semble incorrecte.", en: "The e-mail address looks incorrect.", es: "La dirección de correo parece incorrecta.", de: "Die E-Mail-Adresse scheint nicht korrekt zu sein." },
    envoi: { fr: "Envoi en cours…", en: "Sending…", es: "Enviando…", de: "Wird gesendet…" },
    ok: { fr: "Message envoyé. La réponse sera adressée à ", en: "Message sent. The reply will be addressed to ", es: "Mensaje enviado. La respuesta se enviará a ", de: "Nachricht gesendet. Die Antwort geht an " },
    echec: { fr: "L'envoi n'a pas abouti. Le message peut être envoyé par e-mail à ", en: "Sending did not succeed. The message can be sent by e-mail to ", es: "El envío no se ha completado. El mensaje puede enviarse por correo a ", de: "Das Senden ist nicht gelungen. Die Nachricht kann per E-Mail gesendet werden an " },
    limite: { fr: "Trop de messages reçus en peu de temps. Écrire directement à ", en: "Too many messages received in a short time. Please write directly to ", es: "Demasiados mensajes recibidos en poco tiempo. Escriba directamente a ", de: "Zu viele Nachrichten in kurzer Zeit. Bitte direkt schreiben an " }
  };
  function langue() { var l = document.documentElement.lang || "en"; return LANGS.indexOf(l) < 0 ? "en" : l; }
  function propre(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }
  function libelle(form, champ) {
    var lab = form.querySelector('label[for="' + champ.id + '"]');
    if (!lab) return champ.getAttribute("data-cf");
    var s = lab.querySelector("[data-" + langue() + "]") || lab;
    return propre(s.textContent).replace(/\s*\*$/, "");
  }
  function traduire(form) {
    var l = langue();
    Array.prototype.forEach.call(form.querySelectorAll("[data-t-en]"), function (el) {
      var v = el.getAttribute("data-t-" + l) || el.getAttribute("data-t-en");
      if (el.tagName === "OPTION") el.textContent = v; else el.setAttribute("placeholder", v);
    });
  }
  function valeur(champ) {
    if (champ.tagName === "SELECT") { var o = champ.options[champ.selectedIndex]; return o && o.value ? propre(o.textContent) : ""; }
    return champ.tagName === "TEXTAREA" ? String(champ.value || "").replace(/\r/g, "").trim() : propre(champ.value);
  }
  function composer(form) {
    var champs = form.querySelectorAll("[data-cf]"), manque = [], v = {}, lignes = [], i, c, x;
    for (i = 0; i < champs.length; i++) {
      c = champs[i]; x = valeur(c); v[c.getAttribute("data-cf")] = x;
      c.removeAttribute("aria-invalid");
      if (c.hasAttribute("data-req") && !x) { manque.push(libelle(form, c)); c.setAttribute("aria-invalid", "true"); }
      else if (x && c.getAttribute("data-cf") !== "message") lignes.push(libelle(form, c) + " : " + x);
    }
    if (manque.length) return { erreur: M.req[langue()] + manque.join(", ") + "." };
    if (v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) return { erreur: M.mail[langue()] };
    var sujet = (form.getAttribute("data-sujet") || location.hostname) + (v.objet ? " – " + v.objet : "") + (v.nom ? " – " + v.nom : "");
    return { a: form.getAttribute("data-u") + "@" + form.getAttribute("data-d"), valeurs: v, sujet: sujet, corps: lignes.join("\n") + "\n\n" + (v.message || "") + "\n" };
  }
  function dire(form, texte, erreur) {
    var s = form.querySelector(".cf-status"); if (!s) return;
    s.textContent = texte; s.className = "cf-status" + (erreur ? " cf-erreur" : "");
  }
  function repli(form, montrer) { var b = form.querySelector("[data-cf-mailto]"); if (b) b.hidden = !montrer; }
  function envoyer(form, m) {
    var api = form.getAttribute("data-api"), piege = form.querySelector("[data-cf-piege]");
    var charge = { action: "contact", page: location.pathname, langue: langue(), site: piege ? piege.value : "" }, k;
    for (k in m.valeurs) if (Object.prototype.hasOwnProperty.call(m.valeurs, k)) charge[k] = m.valeurs[k];
    var ctl = window.AbortController ? new AbortController() : null, fin = ctl ? setTimeout(function () { ctl.abort(); }, 25000) : 0;
    return fetch(api, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(charge), redirect: "follow", credentials: "omit", referrerPolicy: "no-referrer", signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (j) { clearTimeout(fin); return j; }, function (e) { clearTimeout(fin); throw e; });
  }
  function brancher(form) {
    traduire(form);
    var bouton = form.querySelector('button[type="submit"]'), occupe = false;
    form.addEventListener("submit", function (e) {
      e.preventDefault(); if (occupe) return;
      var m = composer(form); if (m.erreur) { dire(form, m.erreur, true); return; }
      occupe = true; if (bouton) bouton.disabled = true; repli(form, false); dire(form, M.envoi[langue()], false);
      envoyer(form, m).then(function (j) {
        if (j && j.ok) { var adr = m.valeurs.email; form.reset(); traduire(form); dire(form, M.ok[langue()] + adr + ".", false); }
        else if (j && j.code === "limite") { dire(form, M.limite[langue()] + m.a + ".", true); repli(form, true); }
        else { dire(form, M.echec[langue()] + m.a + ".", true); repli(form, true); }
      }, function () { dire(form, M.echec[langue()] + m.a + ".", true); repli(form, true); })
        .then(function () { occupe = false; if (bouton) bouton.disabled = false; });
    });
    var b = form.querySelector("[data-cf-mailto]");
    if (b) b.addEventListener("click", function () {
      var m = composer(form); if (m.erreur) { dire(form, m.erreur, true); return; }
      var corps = m.corps; if (corps.length > 1500) corps = corps.slice(0, 1500) + "…";   // limite prudente des adresses mailto
      window.location.href = "mailto:" + m.a + "?subject=" + encodeURIComponent(m.sujet) + "&body=" + encodeURIComponent(corps);
    });
  }
  function demarrer() {
    var forms = document.querySelectorAll("form[data-contact]"); if (!forms.length) return;
    Array.prototype.forEach.call(forms, brancher);
    if (window.MutationObserver) new MutationObserver(function () { Array.prototype.forEach.call(forms, traduire); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    // Tuiles « objet de la demande » : choisissent l'objet dans le formulaire au lieu d'ouvrir un e-mail vide
    Array.prototype.forEach.call(document.querySelectorAll("[data-cf-objet]"), function (t) {
      t.addEventListener("click", function (e) {
        var f = forms[0], s = f.querySelector('select[data-cf="objet"]'); if (!s) return;
        e.preventDefault(); s.value = t.getAttribute("data-cf-objet");
        f.scrollIntoView({ behavior: "smooth", block: "center" });
        var p = f.querySelector("[data-cf]"); if (p) setTimeout(function () { try { p.focus({ preventScroll: true }); } catch (x) { p.focus(); } }, 350);
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer); else demarrer();
})();
