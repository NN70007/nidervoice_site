#!/usr/bin/env python3
"""Régénère les 12 PDF des kits de sécurité (DPO, RSSI, informatique × fr, en, es, de)
à partir des pages du site, comme à l'origine : impression Chromium, A4, feuille de style d'impression.

Usage (depuis la racine du dépôt) :  python3 espace/dev/kits-pdf.py [dossier de sortie]
Sans dossier de sortie, les fichiers de securite/docs/ sont remplacés.
Le numéro de version de l'en-tête est lu dans la page (« Version 1.1 · … »).
Dépendance : playwright (pip install playwright ; playwright install chromium)."""
import asyncio, functools, http.server, os, re, sys, threading
from playwright.async_api import async_playwright

RACINE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SORTIE = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(RACINE, 'securite', 'docs')
KITS = {  # page -> (nom de fichier, libellé de l'en-tête et titre du PDF par langue)
    'dpo': ('dpo', dict(fr='kit DPO', en='DPO kit', es='kit DPO', de='DPO-Kit')),
    'rssi': ('rssi', dict(fr='kit RSSI', en='CISO kit', es='kit CISO', de='CISO-Kit')),
    'informatique': ('informatique', dict(fr='kit IT', en='IT kit', es='kit IT', de='IT-Kit')),
}
TITRE = dict(fr='Kit %s — NiderVoice', en='%s kit — NiderVoice', es='Kit %s — NiderVoice', de='%s-Kit — NiderVoice')
NOM = dict(dpo=dict(fr='DPO', en='DPO', es='DPO', de='DPO'), rssi=dict(fr='RSSI', en='CISO', es='CISO', de='CISO'),
           informatique=dict(fr='informatique', en='IT', es='de informática', de='IT'))
VERSION = dict(fr='version', en='version', es='versión', de='Version')
STYLE = 'font-family:Helvetica,Arial,sans-serif;font-size:7px;color:#5B6672;width:100%;padding:0 15mm;'

async def main():
    class Muet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Muet, directory=RACINE))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = 'http://127.0.0.1:%d' % srv.server_address[1]
    os.makedirs(SORTIE, exist_ok=True)
    async with async_playwright() as p:
        nav = await p.chromium.launch()
        for page_, (fichier, lib) in KITS.items():
            for lang in ('fr', 'en', 'es', 'de'):
                ctx = await nav.new_context(viewport={'width': 1280, 'height': 900})
                await ctx.add_init_script("try{localStorage.setItem('nv-lang','%s')}catch(e){}" % lang)
                pg = await ctx.new_page()
                await pg.goto('%s/securite/%s/' % (base, page_), wait_until='networkidle')
                assert await pg.evaluate('document.documentElement.lang') == lang, 'langue non appliquée : ' + lang
                meta = await pg.evaluate("[...document.querySelectorAll('.docmeta span[data-%s]')].map(e=>e.textContent)[0]||''" % lang)
                v = re.search(r'(\d+\.\d+)', meta); assert v, 'version introuvable dans ' + page_
                await pg.evaluate('t=>{document.title=t}', TITRE[lang] % NOM[page_][lang])
                await pg.emulate_media(media='print')
                await pg.evaluate('document.fonts.ready')
                entete = 'NiderVoice — %s — %s %s' % (lib[lang], VERSION[lang], v.group(1))
                await pg.pdf(path=os.path.join(SORTIE, 'nidervoice-kit-%s-%s.pdf' % (fichier, lang)), format='A4', print_background=False,
                             display_header_footer=True, margin={'top': '16mm', 'bottom': '16mm', 'left': '15mm', 'right': '15mm'},
                             header_template='<div style="%s">%s</div>' % (STYLE, entete),
                             footer_template='<div style="%sdisplay:flex;justify-content:space-between"><span>nidervoice.com</span><span><span class="pageNumber"></span>/<span class="totalPages"></span></span></div>' % STYLE)
                await ctx.close(); print('ok', fichier, lang, entete)
        await nav.close()
    srv.shutdown()
asyncio.run(main())
