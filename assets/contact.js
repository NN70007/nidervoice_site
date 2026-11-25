/* Formulaire de contact : prépare un e-mail dans la messagerie du visiteur.
   Aucun envoi par le site, aucun appel réseau, rien de conservé. */
(function () {
  "use strict";
  var LANGS = ["fr", "en", "es", "de"];
  var M = {
    req: { fr: "Champs à compléter : ", en: "Fields to complete: ", es: "Campos por completar: ", de: "Auszufüllende Felder: " },
    mail: { fr: "L'adresse e-mail semble incorrecte.", en: "The e-mail address looks incorrect.", es: "La dirección de correo parece incorrecta.", de: "Die E-Mail-Adresse scheint nicht korrekt zu sein." },
    ok: { fr: "Le message est prêt dans la messagerie de l'appareil. Il reste à l'envoyer.", en: "The message is ready in the device's mail application. It only remains to send it.", es: "El mensaje está listo en la aplicación de correo del dispositivo. Solo queda enviarlo.", de: "Die Nachricht steht im E-Mail-Programm des Geräts bereit. Sie muss nur noch gesendet werden." },
    copie: { fr: "Message copié. Il peut être collé dans un e-mail adressé à ", en: "Message copied. It can be pasted into an e-mail addressed to ", es: "Mensaje copiado. Puede pegarse en un correo dirigido a ", de: "Nachricht kopiert. Sie kann in eine E-Mail an folgende Adresse eingefügt werden: " },
    nocopie: { fr: "Copie impossible sur cet appareil. Adresse : ", en: "Copying is not possible on this device. Address: ", es: "No es posible copiar en este dispositivo. Dirección: ", de: "Kopieren ist auf diesem Gerät nicht möglich. Adresse: " }
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
    return { a: form.getAttribute("data-to"), sujet: sujet, corps: lignes.join("\n") + "\n\n" + (v.message || "") + "\n" };
  }
  function dire(form, texte, erreur) {
    var s = form.querySelector(".cf-status"); if (!s) return;
    s.textContent = texte; s.className = "cf-status" + (erreur ? " cf-erreur" : "");
  }
  function copier(texte) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(texte);
    return new Promise(function (ok, non) {
      try {
        var t = document.createElement("textarea"); t.value = texte; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0";
        document.body.appendChild(t); t.select(); var fait = document.execCommand("copy"); document.body.removeChild(t); fait ? ok() : non();
      } catch (e) { non(e); }
    });
  }
  function brancher(form) {
    traduire(form);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var m = composer(form); if (m.erreur) { dire(form, m.erreur, true); return; }
      var corps = m.corps; if (corps.length > 1500) corps = corps.slice(0, 1500) + "…";   // limite prudente des adresses mailto
      window.location.href = "mailto:" + m.a + "?subject=" + encodeURIComponent(m.sujet) + "&body=" + encodeURIComponent(corps);
      dire(form, M.ok[langue()], false);
    });
    var b = form.querySelector("[data-cf-copier]");
    if (b) b.addEventListener("click", function () {
      var m = composer(form); if (m.erreur) { dire(form, m.erreur, true); return; }
      copier(m.sujet + "\n\n" + m.corps).then(function () { dire(form, M.copie[langue()] + m.a + ".", false); },
        function () { dire(form, M.nocopie[langue()] + m.a + ".", true); });
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
