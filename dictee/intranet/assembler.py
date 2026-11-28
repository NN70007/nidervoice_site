# Assemble le paquet « NiderVoice Dictée — version intranet » : page (construire_page.py), code de la page (dictee/app),
# logos et polices, modèle chiffré (dossier modele/ avec manifest.json, morceaux et cle.json), exemples de configuration
# du serveur (IIS, nginx) et notice. Écrit aussi SHA256SUMS.txt.
# Usage : python3 assembler.py <site> <page intranet> <modèle chiffré> <sortie>
# Ne fait PAS : aucun accès réseau ; ne chiffre rien (le modèle arrive déjà chiffré) ; n'inclut ni PHP ni fiche de retour.
import hashlib, os, shutil, sys

SITE, PAGE, MODELE, SORTIE = sys.argv[1:5]
ICI = os.path.dirname(os.path.abspath(__file__))
APP = ["page.js", "moteur.js", "reseau.js", "retours.js", "parakeet.min.js", "medtext.wasm", "rec-worklet.js", "LICENSE-parakeet.js.txt"]
ASSETS = ["nidervoice-logo.svg", "nidervoice-logo-sombre.svg", "favicon.svg"]
POLICES = ["inter-latin-400-normal.woff2", "inter-latin-500-normal.woff2", "inter-latin-600-normal.woff2", "source-serif-4-latin-300-normal.woff2"]

assert not os.path.exists(SORTIE), "le dossier de sortie existe déjà"
os.makedirs(os.path.join(SORTIE, "app"))
for f in ("index.html", "dictee.css"):
    shutil.copy2(os.path.join(PAGE, f), SORTIE)
for f in APP:
    shutil.copy2(os.path.join(SITE, "dictee", "app", f), os.path.join(SORTIE, "app"))
shutil.copytree(os.path.join(SITE, "dictee", "app", "ort"), os.path.join(SORTIE, "app", "ort"))
os.makedirs(os.path.join(SORTIE, "assets", "fonts"))
for f in ASSETS:
    shutil.copy2(os.path.join(SITE, "assets", f), os.path.join(SORTIE, "assets"))
for f in POLICES:
    shutil.copy2(os.path.join(SITE, "assets", "fonts", f), os.path.join(SORTIE, "assets", "fonts"))
assert os.path.exists(os.path.join(MODELE, "manifest.json")) and os.path.exists(os.path.join(MODELE, "cle.json")), "modèle incomplet"
shutil.copytree(MODELE, os.path.join(SORTIE, "modele"))
for f in ("web.config", "nginx-exemple.conf", "LISEZMOI.txt"):
    shutil.copy2(os.path.join(ICI, f), SORTIE)
with open(os.path.join(SORTIE, "SHA256SUMS.txt"), "w", encoding="utf-8") as o:
    for racine, _, fichiers in sorted(os.walk(SORTIE)):
        for f in sorted(fichiers):
            if f == "SHA256SUMS.txt":
                continue
            p = os.path.join(racine, f)
            h = hashlib.sha256()
            with open(p, "rb") as fh:
                for bloc in iter(lambda: fh.read(1 << 20), b""):
                    h.update(bloc)
            o.write(f"{h.hexdigest()}  {os.path.relpath(p, SORTIE).replace(os.sep, '/')}\n")
print("paquet intranet assemblé :", SORTIE)
