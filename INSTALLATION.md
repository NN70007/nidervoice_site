# Installation — une fois par site (environ 20 minutes)

Ce socle sert tel quel à plusieurs sites (nidervoice.com, nidervoice.com…). Ce qui change d'un site à l'autre :

| Où | nidervoice.com | nidervoice.com |
|---|---|---|
| `site.json` (dépôt) | `{"nom":"NiderVoice","domaine":"nidervoice.com","langue":"fr"}` | `{"nom":"NiderVoice","domaine":"nidervoice.com","langue":"fr"}` |
| Dépôt GitHub | `NN70007/nidervoice_site` | `NN70007/nidervoice_site` |
| Feuille Google | « NiderVoice – Base (privée) » | « NiderVoice – Base (privée) » |
| `espace/config.js` | URL /exec du script de NiderVoice | URL /exec du script de NiderVoice |

Chaque site a **sa propre feuille et son propre script** : les accès de l'un ne donnent rien sur l'autre.

L'espace d'administration se compose de trois pièces :

| Pièce | Où | Contient des données ? |
|---|---|---|
| Les pages (`espace/…`) | dépôt GitHub du site | **Non** : uniquement l'habillage |
| Le script serveur (`espace/serveur/Code.gs`) | Google Apps Script, compte jb@niedercorn.com | **Non** (ni données ni clés) |
| La feuille Google Sheets | Drive de jb@niedercorn.com, **partagée avec personne** | **Oui**, uniquement ici |

Personne ne lit la feuille directement. Les pages demandent tout au script, qui vérifie l'identité de la personne (connexion Google vérifiée auprès de Google, ou code reçu par e-mail) et ses droits (onglet `Acces`) avant chaque réponse. Les clés (jeton GitHub) restent dans les Propriétés du script, jamais dans le dépôt ni dans le navigateur.

---

## 1. Préparer le compte Google

1. Ouvrir une session Google avec **jb@niedercorn.com**.
2. Vérifier que la **validation en deux étapes** est activée (myaccount.google.com → Sécurité). C'est ce compte qui protège tout le reste.

## 2. Créer la feuille

1. Sur drive.google.com : **Nouveau → Google Sheets**, nommer la feuille **« NiderVoice – Base (privée) »** (adapter le nom du site).
2. **Ne la partager avec personne.**

## 3. Coller le script

1. Dans la feuille : **Extensions → Apps Script**.
2. Effacer le contenu de `Code.gs` et coller tout le contenu de [`espace/serveur/Code.gs`](espace/serveur/Code.gs).
3. ⚙️ **Paramètres du projet** :
   - cocher **Afficher le fichier manifeste « appsscript.json »**, puis, dans l'éditeur, remplacer son contenu par [`espace/serveur/appsscript.json`](espace/serveur/appsscript.json) ;
   - fuseau horaire : **(GMT+01:00) Europe/Luxembourg** (déjà réglé par le manifeste).
4. 💾 **Enregistrer**.

`ADMINS_INITIAUX` (en haut de `Code.gs`) vaut `['jb@niedercorn.com']` : c'est l'adresse qui reçoit tous les droits au départ.

## 4. Propriétés du script

⚙️ **Paramètres du projet → Propriétés du script → Ajouter une propriété du script** :

| Propriété | Valeur | Obligatoire |
|---|---|---|
| `SITE_NOM` | `NiderVoice` (nom affiché dans les e-mails et les sauvegardes) | conseillé |
| `GITHUB_REPO` | `NN70007/nidervoice_site` | pour publier |
| `GITHUB_TOKEN` | le jeton créé à l'étape 8 | pour publier |
| `GOOGLE_CLIENT_ID` | l'identifiant créé à l'étape 9 | non (bouton Google) |

**Enregistrer les propriétés du script.** On peut compléter `GITHUB_TOKEN` et `GOOGLE_CLIENT_ID` plus tard : elles sont lues à chaque demande, sans redéploiement.

## 5. Lancer l'installation

1. Dans la liste des fonctions (en haut), choisir **`installer`** → **Exécuter**.
2. Google demande des autorisations : **Examiner les autorisations** → choisir jb@niedercorn.com.
   L'écran « Google n'a pas validé cette application » est normal pour un script personnel → **Paramètres avancés** → **Accéder à … (non sécurisé)** → **Autoriser**.
   Autorisations demandées : gérer cette feuille, envoyer des e-mails en votre nom (codes de connexion, alerte de sauvegarde), se connecter à un service externe (vérification Google, API GitHub), gérer des fichiers Drive (dossier de sauvegardes).
3. Revenir à la feuille : les onglets **`Acces`** et **`Journal`** sont créés, jb@niedercorn.com est inscrit avec le droit Admin.

`installer` peut être relancé sans risque (rien n'est dupliqué).

## 6. Déployer en application Web

1. **Déployer → Nouveau déploiement**.
2. ⚙️ Type : **Application Web**. Description : `Espace d'administration`.
3. Exécuter en tant que : **Moi (jb@niedercorn.com)**.
4. Qui a accès : **Tout le monde**.
   (Indispensable pour la connexion par code e-mail. L'adresse est joignable, mais elle ne renvoie **rien** sans session valide.)
5. **Déployer**, puis copier l'**URL de l'application Web** (elle se termine par `/exec`).
   Contrôle : ouvrir cette URL dans le navigateur doit afficher `{"ok":true,"version":"…"}`.

## 7. Brancher les pages

Dans [`espace/config.js`](espace/config.js), coller l'URL dans `API_URL: ''`, puis publier le site (commit sur `main`).

## 8. Jeton GitHub (publication des actualités)

Sur github.com, connecté au compte propriétaire du dépôt :

1. Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → **Generate new token**.
   - Nom : `NiderVoice espace admin` · Expiration : 1 an (noter la date de renouvellement)
   - Repository access : **Only select repositories** → `NN70007/nidervoice_site` (**ce dépôt seulement**)
   - Permissions → Repository permissions → **Contents : Read and write** (rien d'autre)
2. **Generate token**, copier le jeton (`github_pat_…`) dans la propriété `GITHUB_TOKEN` (étape 4). Ne le coller nulle part ailleurs.

Le serveur n'accepte d'écrire que `actualites.json` (liste d'articles dont le format est vérifié) et des images JPEG, PNG, GIF ou WebP dans `assets/` (signature du fichier contrôlée, 6 Mo au plus). Chaque publication est signée du nom de la personne dans l'historique GitHub et inscrite au journal.

## 9. Connexion Google (facultatif)

Sans cette étape, la connexion se fait par **code e-mail**, ce qui suffit.

1. console.cloud.google.com (compte jb@niedercorn.com) → créer un projet (ex. `NiderVoice`).
2. API et services → **Écran de consentement OAuth** : type Externe, nom de l'application, adresse d'assistance jb@niedercorn.com.
3. API et services → Identifiants → **Créer des identifiants → ID client OAuth** → Application Web.
   **Origines JavaScript autorisées** : `https://nidervoice.com` (et `https://www.nidervoice.com` si utilisé).
4. Copier l'identifiant (`….apps.googleusercontent.com`) :
   - dans `espace/config.js`, ligne `GOOGLE_CLIENT_ID` (le bouton Google apparaît alors sur la page de connexion) ;
   - dans la propriété du script `GOOGLE_CLIENT_ID` (le serveur refuse tout jeton émis pour une autre application).

## 10. Premier essai

1. Ouvrir **https://nidervoice.com/espace/**.
2. Se connecter (code e-mail envoyé à jb@niedercorn.com, ou Google).
3. Tuile **Accès** : inscrire les autres personnes et cocher leurs droits (**Admin** : tout ; **Actualités** : rédiger et publier).
4. Tuile **Actualités** : publier un premier article. Il apparaît sur la page d'accueil dès que le site est redéployé depuis GitHub.

## 11. Déclencheurs (sauvegarde et entretien)

Dans Apps Script : ⏰ **Déclencheurs → Ajouter un déclencheur** :

- **`sauvegarderEspace`** — déclencheur temporel, **tous les jours, entre 2 h et 3 h**. Copie Excel de la feuille dans le dossier Drive « Sauvegardes – NiderVoice », 30 jours conservés ; e-mail au propriétaire en cas d'échec. Les propriétés du script (clés, sessions) ne sont jamais sauvegardées.
- **`nettoyerSessions`** (facultatif) — tous les jours, la nuit. Le nettoyage se fait déjà à chaque connexion.

## 12. Publication automatique du script avec clasp (facultatif)

Sans cette étape, on met à jour le script à la main (voir « Entretien »). Avec elle, toute modification de `espace/serveur/` poussée sur `main` est testée puis publiée par GitHub Actions ([`.github/workflows/serveur-apps-script.yml`](.github/workflows/serveur-apps-script.yml)), sans changer l'URL `/exec`.

1. Activer l'API Apps Script : script.google.com/home/usersettings → **API Google Apps Script : activée**.
2. Sur un ordinateur : `npm install --global @google/clasp`, puis `clasp login` avec jb@niedercorn.com. Le fichier `~/.clasprc.json` est créé.
3. Dans le dépôt GitHub : Settings → Secrets and variables → Actions :
   - **Secret** `CLASPRC_JSON` = contenu complet de `~/.clasprc.json` ;
   - **Variable** `SCRIPT_ID` = Apps Script → ⚙️ Paramètres du projet → **ID du script** ;
   - **Variable** `DEPLOYMENT_ID` = Déployer → Gérer les déploiements → **ID de déploiement** (la partie de l'URL entre `/s/` et `/exec`).

Tant que ces trois éléments ne sont pas tous présents, la procédure lance seulement les tests ; la publication est ignorée sans échec.
Pour tout couper : myaccount.google.com → Sécurité → Applications tierces → retirer « clasp ».

---

## Entretien

- **Modifier le script à la main** : coller le nouveau `Code.gs`, enregistrer, puis **Déployer → Gérer les déploiements → ✏️ → Version : Nouvelle version → Déployer** (l'URL ne change pas). Avec clasp (étape 12), ne plus modifier le code dans l'éditeur : il serait écrasé à la publication suivante.
- **Revenir en arrière** (avec clasp) : GitHub → Actions → « Serveur Apps Script » → Run workflow, avec le numéro d'une ancienne version.
- **Retirer un accès** : page Accès → Modifier → Supprimer (ou décocher « Accès actif »). Effet immédiat, même pour une personne déjà connectée.
- **Déconnecter quelqu'un partout** (appareil perdu, doute) : page Accès → Modifier → « Déconnecter partout ». Ses droits ne changent pas.
- **Renouveler le jeton GitHub** avant son expiration : créer le nouveau, remplacer la propriété `GITHUB_TOKEN`, révoquer l'ancien.
- **En-têtes de sécurité** : `espace/.htaccess` limite ce que les pages de l'espace peuvent charger. En cas de problème, supprimer ce fichier rétablit les en-têtes du site public.

## Pour les développeurs

Tests sans Google (simulateur en mémoire, aucune donnée réelle) :

```bash
node espace/dev/test-serveur.js         # connexion, sessions, codes, droits, publication, sauvegarde
node espace/dev/serveur-local.js 8787   # site local : http://localhost:8787/  et  /espace/
                                        # codes de connexion « envoyés » : http://localhost:8787/__mails
```

Le serveur local répond aux appels de l'espace avec `Code.gs` simulé ; les publications vont dans un dépôt en mémoire (rien n'est écrit sur le disque) et sont servies comme sur le vrai site.

## Limites connues

- Les codes de connexion partent du compte jb@niedercorn.com et sont soumis au quota d'envoi quotidien de Google (largement suffisant pour des codes, pas pour des envois groupés).
- Un article publié apparaît sur le site après le redéploiement du dépôt (selon l'hébergeur, de quelques secondes à quelques minutes).
- Les images des articles supprimés restent dans `assets/` (le serveur n'a pas le droit d'effacer des fichiers).
- L'API GitHub ne renvoie pas le contenu des fichiers de plus de 1 Mo : `actualites.json` doit rester en dessous (plusieurs centaines d'articles).
- `.htaccess` ne s'applique que sur un hébergement Apache (Hostinger, par exemple), pas sur GitHub Pages.
