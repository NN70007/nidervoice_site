/* Admin des actualités : liste, création, modification, suppression des articles de actualites.json.
   Tout passe par le serveur (action pub.github) : aucune clé dans le navigateur, droits vérifiés côté serveur.
   Format d'un article : { id, titre, date (AAAA-MM-JJ), texte, image (facultative, assets/…) }. */
(function () {
  "use strict";
  var E = window.Espace, esc = E.esc, $ = function (s) { return document.querySelector(s); };
  var FICHIER = "actualites.json", IMAGE_LARGEUR_MAX = 1600;
  var articles = [], edition = null, imageNouvelle = null, imageRetiree = false, supprArme = false;

  var S = E.exigerConnexion(); if (!S) return;
  E.enTete({ actif: "actualites" }); E.piedDePage();
  if (!S.user.actualites) { sansDroit("Votre accès ne comprend pas la publication des actualités."); return; }

  function sansDroit(t) { $("#sans-droit-texte").textContent = t; $("#sans-droit").hidden = false; $("#vue-liste").hidden = true; $("#vue-edition").hidden = true; }

  /* ---------- Base64 UTF-8 ---------- */
  function versBase64(texte) {
    var octets = new TextEncoder().encode(texte), bin = "";
    for (var i = 0; i < octets.length; i += 0x8000) bin += String.fromCharCode.apply(null, octets.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function depuisBase64(b64) {
    var bin = atob(String(b64 || "").replace(/\s/g, "")), octets = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8").decode(octets);
  }

  /* ---------- Échanges avec le serveur ---------- */
  async function lireFichier() {
    var out = await E.api("pub.github", { methode: "GET", chemin: FICHIER });
    if (out.status === 404) return { liste: [], sha: "" };
    if (out.status !== 200) throw { message: "Lecture impossible (GitHub " + out.status + (out.data.message ? " : " + out.data.message : "") + ")." };
    var liste = JSON.parse(depuisBase64(out.data.content));
    return { liste: Array.isArray(liste) ? liste : [], sha: out.data.sha };
  }
  async function ecrire(chemin, contenuB64, message, sha) {
    var out = await E.api("pub.github", { methode: "PUT", chemin: chemin, corps: { content: contenuB64, message: message, sha: sha || undefined } });
    if (out.status === 409 || out.status === 422) throw { message: "Le fichier a été modifié entre-temps (ou existe déjà). Rechargez la page et recommencez." };
    if (out.status >= 300) throw { message: "Publication refusée par GitHub (" + out.status + (out.data.message ? " : " + out.data.message : "") + ")." };
    return out.data;
  }
  /** Relit le fichier juste avant d'écrire (pour ne pas écraser une publication faite entre-temps), applique la modification, publie. */
  async function publier(modifier, message) {
    var f = await lireFichier();
    var liste = modifier(f.liste.slice());
    liste.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    await ecrire(FICHIER, versBase64(JSON.stringify(liste, null, 2) + "\n"), message, f.sha);
    articles = liste;
  }

  /* ---------- Liste ---------- */
  function dateLisible(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : iso; }
  function afficherListe() {
    $("#vue-liste").hidden = false; $("#vue-edition").hidden = true;
    $("#compte").textContent = articles.length ? articles.length + " article" + (articles.length > 1 ? "s" : "") : "Articles";
    if (!articles.length) { $("#liste").innerHTML = '<div class="avis"><strong>Aucun article pour l\'instant.</strong>Le site affiche la page « en construction » tant qu\'aucun article n\'est publié.</div>'; return; }
    $("#liste").innerHTML = '<div class="defile"><table class="liste"><thead><tr><th class="col-vignette"></th><th>Article</th><th></th></tr></thead><tbody>' +
      articles.map(function (a) {
        var img = a.image ? '<img class="vignette" alt="" loading="lazy" src="' + esc(E.lien("../" + a.image)) + '">' : '<span class="vignette"></span>';
        return "<tr><td>" + img + '</td><td><div class="nom">' + esc(a.titre) + '</div><div class="secondaire">' + esc(dateLisible(a.date)) + "</div></td>" +
          '<td class="d"><button class="btn btn-discret btn-petit" type="button" data-id="' + esc(a.id) + '">Modifier</button></td></tr>';
      }).join("") + "</tbody></table></div>";
  }
  async function charger() {
    $("#liste-err").hidden = true;
    try { articles = (await lireFichier()).liste; afficherListe(); }
    catch (e) {
      $("#vue-liste").hidden = false;
      $("#liste").innerHTML = '<div class="avis"><strong>Impossible de charger les articles.</strong>' + esc(e.message) + "</div>";
    }
  }

  /* ---------- Rédaction ---------- */
  function aujourdhui() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function erreur(t) { $("#a-err").textContent = t || ""; $("#a-err").hidden = !t; }
  function apercu(src) { $("#apercu").hidden = !src; if (src) $("#apercu-img").src = src; }
  function ouvrir(a) {
    edition = a || null; imageNouvelle = null; imageRetiree = false; supprArme = false;
    $("#titre-edition").textContent = a ? "Modifier l'article" : "Nouvel article";
    $("#a-titre").value = a ? a.titre : ""; $("#a-date").value = a ? a.date : aujourdhui(); $("#a-texte").value = a ? a.texte : "";
    $("#a-image").value = ""; apercu(a && a.image ? E.lien("../" + a.image) : "");
    $("#btn-supprimer").hidden = !a; $("#btn-supprimer").textContent = "Supprimer l'article";
    erreur("");
    $("#vue-liste").hidden = true; $("#vue-edition").hidden = false;
    window.scrollTo(0, 0); $("#a-titre").focus();
  }
  function fermer() { afficherListe(); }

  function lireImage(fichier) {
    return new Promise(function (ok, ko) {
      if (!/^image\/(jpeg|png|webp)$/.test(fichier.type)) { ko({ message: "Choisissez une image JPEG, PNG ou WebP." }); return; }
      var lecteur = new FileReader();
      lecteur.onerror = function () { ko({ message: "Image illisible." }); };
      lecteur.onload = function () {
        var img = new Image();
        img.onerror = function () { ko({ message: "Image illisible." }); };
        img.onload = function () {
          var k = Math.min(1, IMAGE_LARGEUR_MAX / img.naturalWidth), c = document.createElement("canvas");
          c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
          var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
          ok(c.toDataURL("image/jpeg", 0.85));
        };
        img.src = lecteur.result;
      };
      lecteur.readAsDataURL(fichier);
    });
  }
  $("#a-image").addEventListener("change", async function () {
    erreur("");
    var f = this.files && this.files[0]; if (!f) return;
    try { imageNouvelle = await lireImage(f); imageRetiree = false; apercu(imageNouvelle); }
    catch (e) { imageNouvelle = null; this.value = ""; erreur(e.message); }
  });
  $("#btn-sans-image").addEventListener("click", function () { imageNouvelle = null; imageRetiree = true; $("#a-image").value = ""; apercu(""); });

  function identifiant(titre, date, pris) {
    var base = String(titre).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "") || "article";
    var id = base + "-" + date.replace(/-/g, ""), n = 2;
    while (pris.indexOf(id) > -1) id = base + "-" + date.replace(/-/g, "") + "-" + n++;
    return id;
  }

  $("#f-article").addEventListener("submit", async function (ev) {
    ev.preventDefault(); erreur("");
    var titre = $("#a-titre").value.trim(), date = $("#a-date").value, texte = $("#a-texte").value.replace(/\r\n/g, "\n").trim();
    if (!titre) { erreur("Indiquez un titre."); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { erreur("Indiquez une date."); return; }
    var b = $("#btn-publier"); b.disabled = true; b.textContent = "Publication…";
    try {
      var id = edition ? edition.id : identifiant(titre, date, articles.map(function (a) { return a.id; }));
      var image = edition && edition.image && !imageRetiree ? edition.image : "";
      if (imageNouvelle) {
        var stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
        image = "assets/" + id.slice(0, 80) + "-" + stamp + ".jpg";
        await ecrire(image, imageNouvelle.split(",")[1], "Image de l'article « " + titre.slice(0, 80) + " »");
      }
      var art = { id: id, titre: titre, date: date, texte: texte };
      if (image) art.image = image;
      await publier(function (liste) {
        var i = liste.findIndex(function (a) { return a.id === id; });
        if (i > -1) liste[i] = art; else liste.push(art);
        return liste;
      }, (edition ? "Actualités : modification « " : "Actualités : nouvel article « ") + titre.slice(0, 80) + " »");
      E.toast(edition ? "Article mis à jour" : "Article publié");
      fermer();
    } catch (e) { erreur(e.message || "Erreur."); }
    finally { b.disabled = false; b.textContent = "Publier"; }
  });

  $("#btn-supprimer").addEventListener("click", async function () {
    if (!edition) return;
    if (!supprArme) { supprArme = true; this.textContent = "Cliquer à nouveau pour confirmer"; return; }
    var id = edition.id, titre = edition.titre;
    this.disabled = true;
    try {
      await publier(function (liste) { return liste.filter(function (a) { return a.id !== id; }); }, "Actualités : suppression « " + titre.slice(0, 80) + " »");
      E.toast("Article supprimé"); fermer();
    } catch (e) { erreur(e.message || "Erreur."); }
    finally { this.disabled = false; }
  });

  $("#btn-nouveau").addEventListener("click", function () { ouvrir(null); });
  $("#btn-annuler").addEventListener("click", fermer);
  $("#btn-retour").addEventListener("click", fermer);
  $("#liste").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-id]"); if (!b) return;
    var a = articles.filter(function (x) { return x.id === b.dataset.id; })[0]; if (a) ouvrir(a);
  });

  // Droits à jour depuis le serveur : un accès retiré est appliqué immédiatement
  E.api("moi").then(function (out) { if (!out.user.actualites) sansDroit("Votre accès à la publication a été retiré."); }).catch(function () { /* géré par api() */ });
  charger();
})();
