# Fabrique la page de la version intranet (index.html + dictee.css) à partir de la page en ligne, pour que les deux
# restent identiques : même code (dictee/app), même apparence. Différences : pas de connexion par e-mail ni de PHP,
# modèle lu dans le dossier modele/ du serveur de l'établissement, aucun envoi (ni fiche de retour, ni changement de
# phrase côté serveur : le nouveau verrou est téléchargé), aucun lien vers Internet.
# Usage : serveur de développement lancé (NV_DEV=1 php -S 127.0.0.1:8088 -t <site>), puis
#   python3 construire_page.py http://127.0.0.1:8088/dictee/ <fichier du dernier code> <dossier de sortie>
# Ne fait PAS : aucun accès à Internet (seulement le serveur local de développement).
import asyncio, re, sys, os
from playwright.async_api import async_playwright

URL, CODE, SORTIE = sys.argv[1], sys.argv[2], sys.argv[3]


async def page_connectee():
    async with async_playwright() as p:
        br = await p.chromium.launch()
        pg = await (await br.new_context()).new_page()
        await pg.goto(URL)
        await pg.fill("#email", "jb@niedercorn.com")
        await pg.click("button[type=submit]")
        await pg.wait_for_selector("#code")
        await pg.fill("#code", open(CODE).read().split()[1])
        await pg.click("button[type=submit]")
        await pg.wait_for_selector("#phrase")
        r = await pg.request.get(URL)  # HTML brut renvoyé par le serveur (pas l'état modifié par les scripts)
        html = await r.text()
        await br.close()
        return html


def enlever(html, motif, n=1):
    nouveau, k = re.subn(motif, "", html, flags=re.S)
    assert k == n, (motif, k)
    return nouveau


def transformer(html):
    css = re.search(r'<style nonce="[^"]*">(.*?)</style>', html, re.S).group(1)
    css = css.replace("url(/assets/", "url(assets/")
    html = re.sub(r'<style nonce="[^"]*">.*?</style>', '<link rel="stylesheet" href="dictee.css">', html, flags=re.S)
    html = html.replace('<html lang="fr">', '<html lang="fr" data-modele="modele/">', 1)
    html = re.sub(r'src="app/page\.js\?v=\d+"', 'src="app/page.js"', html)
    html = re.sub(r' data-csrf="[^"]*" data-pk="[^"]*"', "", html)
    html = html.replace('href="/assets/', 'href="assets/').replace('src="/assets/', 'src="assets/')
    html = html.replace('<a class="marque" href="/" title="nidervoice.com">', '<a class="marque" href="./">')
    html = html.replace('<a href="/" title="nidervoice.com">', '<a href="./">')
    html = enlever(html, r'<form method="post"><input type="hidden" name="action" value="logout">.*?</form>')
    html = enlever(html, r'<p>Un mot mal reconnu \?.*?</p>\s*<hr class="sep">')
    html = enlever(html, r'<dialog id="ficheFen".*?</dialog>\s*')
    html = enlever(html, r'<button type="button" id="fiche".*?</button>\s*')
    html = html.replace('<p><a href="/mentions-legales/">Mentions légales</a> · <a href="/confidentialite/">Confidentialité</a> · © 2026 NiderLabs</p>',
                        '<p>Version intranet · aucune connexion vers Internet · © 2026 NiderLabs</p>')
    assert "nidervoice.com" not in html.replace("nidervoice-logo", ""), "lien vers Internet restant"
    assert 'href="/' not in html and 'src="/' not in html, "adresse absolue restante"
    tete = ('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\' \'wasm-unsafe-eval\'; '
            'worker-src \'self\' blob:; connect-src \'self\' blob: data:; media-src \'self\' blob:; style-src \'self\'; '
            'img-src \'self\' data:; font-src \'self\'; form-action \'none\'; base-uri \'none\'">\n')
    html = html.replace('<meta name="color-scheme"', tete + '<meta name="color-scheme"', 1)
    return html, css


html, css = transformer(asyncio.run(page_connectee()))
os.makedirs(SORTIE, exist_ok=True)
open(os.path.join(SORTIE, "index.html"), "w", encoding="utf-8").write(html)
open(os.path.join(SORTIE, "dictee.css"), "w", encoding="utf-8").write(css)
print("page intranet écrite :", len(html), "+", len(css), "octets")
