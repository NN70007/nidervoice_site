# Socle de site statique

Base commune de nidervoice.com et nidervoice.com : un site public minimal et un espace d'administration pour publier des actualités, sans serveur à entretenir. Architecture inspirée de celle d'un site existant, réduite à l'essentiel.

- **Site public** — `index.html`, `styles.css`, `site.js`, `404.html`. Le nom et le domaine du site sont lus dans `site.json`. Tant que `actualites.json` est vide (`[]`), la page affiche « en construction » ; sinon les articles apparaissent, du plus récent au plus ancien.
- **Espace d'administration** — `espace/` : connexion (Google si `GOOGLE_CLIENT_ID` est renseigné, sinon code par e-mail), page **Accès** (droits *admin* et *actualités*) et **admin des actualités** (`espace/admin/`).
- **Serveur** — `espace/serveur/Code.gs`, script Google Apps Script rattaché à une feuille privée (onglets `Acces` et `Journal`). Il vérifie sessions et droits à chaque demande et publie dans GitHub avec un jeton rangé dans ses Propriétés. Le dépôt ne contient ni données ni clés.

Installation pas à pas : [INSTALLATION.md](INSTALLATION.md).

Tests : `node espace/dev/test-serveur.js` · site local : `node espace/dev/serveur-local.js 8787`.
