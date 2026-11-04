/* Page Accès : liste des personnes inscrites, droits (admin, actualités), journal. Réservée aux administrateurs
   (le serveur le vérifie de toute façon à chaque demande). */
(function () {
  "use strict";
  var E = window.Espace, esc = E.esc, $ = function (s) { return document.querySelector(s); };
  var S = E.exigerConnexion(); if (!S) return;
  if (!S.user.admin) { location.replace("./"); return; }
  var personnes = [], edition = null, supprArme = false;
  var ACTIONS = { connexion: "connexion", refus: "accès refusé", "acces.ajoute": "ajoute", "acces.modifie": "modifie", "acces.supprime": "supprime l'accès de",
    "acces.deconnecte": "déconnecte partout", publication: "publie", "publication.echec": "échec de publication", installation: "installation" };

  E.enTete({ actif: "acces" }); E.piedDePage();

  function moi(p) { var mes = S.user.emails || [S.user.email]; return p.emails.some(function (e) { return mes.indexOf(e) > -1; }); }
  function oui(b) { return b ? '<span class="oui" aria-label="oui">✓</span>' : '<span class="non" aria-label="non">—</span>'; }

  function afficher() {
    if (!personnes.length) { $("#liste").innerHTML = '<div class="avis">Personne n\'est inscrit.</div>'; return; }
    var lignes = personnes.slice().sort(function (a, b) { return a.nom.localeCompare(b.nom, "fr"); });
    $("#liste").innerHTML = '<div class="defile"><table class="liste"><thead><tr><th>Personne</th><th class="c">Admin</th><th class="c">Actualités</th><th></th></tr></thead><tbody>' +
      lignes.map(function (p) {
        return '<tr class="' + (p.actif ? "" : "inactif") + '"><td><div class="nom">' + esc(p.nom) + (moi(p) ? ' <span class="pastille">vous</span>' : "") + "</div>" +
          '<div class="secondaire">' + p.emails.map(esc).join("<br>") + "</div>" +
          (p.note ? '<div class="secondaire"><i>' + esc(p.note) + "</i></div>" : "") +
          (p.actif ? "" : '<div class="secondaire">Accès désactivé</div>') + "</td>" +
          '<td class="c">' + oui(p.admin) + '</td><td class="c">' + oui(p.actualites || p.admin) + "</td>" +
          '<td class="d"><button class="btn btn-discret btn-petit" type="button" data-cle="' + esc(p.cle) + '">Modifier</button></td></tr>';
      }).join("") + "</tbody></table></div>";
  }
  function afficherJournal(j) {
    $("#journal").innerHTML = j.length
      ? j.map(function (x) { return '<li><span class="quand">' + esc(E.quand(x.ts)) + "</span><span><b>" + esc(x.qui) + "</b> · " + esc(ACTIONS[x.action] || x.action) + (x.detail ? " — " + esc(x.detail) : "") + "</span></li>"; }).join("")
      : '<li><span class="quand">—</span><span>Rien pour l\'instant.</span></li>';
  }
  async function charger() {
    try { var out = await E.api("acces.lister"); personnes = out.personnes; afficher(); afficherJournal(out.journal); }
    catch (e) { $("#liste").innerHTML = '<div class="avis"><strong>Impossible de charger la liste.</strong>' + esc(e.message) + "</div>"; afficherJournal([]); }
  }

  var dlg = $("#dlg");
  function erreur(t) { $("#p-err").textContent = t; $("#p-err").hidden = !t; }
  function ouvrir(p) {
    edition = p || null; supprArme = false;
    $("#dlg-titre").textContent = p ? "Modifier l'accès" : "Ajouter une personne";
    $("#p-nom").value = p ? p.nom : ""; $("#p-email").value = p ? p.emails.join(", ") : "";
    $("#p-admin").checked = !!(p && p.admin); $("#p-actus").checked = !!(p && p.actualites);
    $("#p-actif").checked = p ? p.actif : true; $("#p-note").value = p ? p.note : "";
    var soi = !!(p && moi(p));
    $("#p-admin").disabled = soi; $("#p-actif").disabled = soi;
    $("#p-suppr").hidden = !p || soi; $("#p-suppr").textContent = "Supprimer";
    $("#p-deco").hidden = !p;
    erreur("");
    dlg.showModal(); $("#p-nom").focus();
  }
  $("#btn-ajouter").addEventListener("click", function () { ouvrir(null); });
  $("#liste").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-cle]"); if (!b) return;
    var p = personnes.filter(function (x) { return x.cle === b.dataset.cle; })[0]; if (p) ouvrir(p);
  });
  $("#p-annuler").addEventListener("click", function () { dlg.close(); });
  $("#p-deco").addEventListener("click", async function () {
    if (!edition) return;
    try {
      var out = await E.api("acces.deconnecter", { email: edition.cle });
      dlg.close();
      if (out.vous) { E.clearSession(); location.replace("./"); return; }
      E.toast(out.fermees ? out.fermees + " session(s) fermée(s) : la personne devra se reconnecter." : "Aucune session ouverte pour cette personne.");
      charger();
    } catch (err) { erreur(err.message); }
  });
  $("#p-suppr").addEventListener("click", async function () {
    if (!edition) return;
    if (!supprArme) { supprArme = true; this.textContent = "Cliquer à nouveau pour confirmer"; return; }
    var cle = edition.cle; dlg.close();
    try { await E.api("acces.supprimer", { email: cle }); E.toast("Accès supprimé"); } catch (err) { E.toast(err.message); }
    charger();
  });
  $("#f").addEventListener("submit", async function (e) {
    e.preventDefault();
    var p = { nom: $("#p-nom").value.trim(), email: $("#p-email").value.trim(), admin: $("#p-admin").checked, actualites: $("#p-actus").checked, actif: $("#p-actif").checked, note: $("#p-note").value.trim() };
    var ems = p.email.split(/[;,\s]+/).filter(Boolean);
    if (!p.nom || !ems.length || ems.some(function (x) { return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x); })) { erreur("Indiquez un nom et des adresses e-mail valides (séparées par une virgule)."); return; }
    try {
      await E.api("acces.enregistrer", { personne: p, emailOriginal: edition ? edition.cle : "" });
      dlg.close(); E.toast(edition ? "Accès mis à jour" : "Personne ajoutée"); charger();
    } catch (err) { erreur(err.message); }
  });
  charger();
})();
