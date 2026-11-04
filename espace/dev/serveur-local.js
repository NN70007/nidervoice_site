/**
 * Serveur local de développement : sert le site et simule le script Google (Code.gs) en mémoire.
 * Lancer : node espace/dev/serveur-local.js [port]     puis ouvrir http://localhost:8787/espace/
 * - Les codes de connexion « envoyés par e-mail » sont lisibles sur http://localhost:8787/__mails
 * - Les publications vont dans un faux dépôt en mémoire (rien n'est écrit sur le disque) ; elles sont servies comme le vrai site.
 * - La politique de sécurité de espace/.htaccess est appliquée, pour repérer toute ressource bloquée.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { charger } = require('./gas-fake');

function demarrer(port, opts) {
  opts = opts || {};
  const racine = path.join(__dirname, '..', '..');
  const srv = charger({ props: Object.assign({ SITE_NOM: 'Site local', GITHUB_TOKEN: 'jeton-local', GITHUB_REPO: 'local/site' }, opts.props || {}), googleTokens: opts.googleTokens });
  srv.run('installer');
  const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.txt': 'text/plain; charset=utf-8' };
  const ht = fs.readFileSync(path.join(racine, 'espace', '.htaccess'), 'utf8');
  const csp = (ht.match(/Content-Security-Policy "([^"]+)"/) || [])[1];

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (csp && url.pathname.startsWith('/espace/')) res.setHeader('Content-Security-Policy', csp);
    if (req.method === 'POST' && url.pathname === '/api') {
      let corps = '';
      req.on('data', (c) => (corps += c));
      req.on('end', () => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(srv.ctx.doPost({ postData: { contents: corps } }).content); });
      return;
    }
    if (url.pathname === '/__mails') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(srv.mails.map((m) => ({ to: m.to, subject: m.subject }))));
      return;
    }
    if (url.pathname === '/espace/config.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end('window.ESPACE_CONFIG={API_URL:"/api",GOOGLE_CLIENT_ID:' + JSON.stringify(opts.googleClientId || '') + '};');
      return;
    }
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const publie = srv.depot[p.replace(/^\//, '')];
    if (publie) {
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
      res.end(Buffer.from(publie.content, 'base64'));
      return;
    }
    const fichier = path.join(racine, p);
    if (!fichier.startsWith(racine) || !fs.existsSync(fichier) || fs.statSync(fichier).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(path.join(racine, '404.html')).pipe(res);
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(fichier)] || 'application/octet-stream' });
    fs.createReadStream(fichier).pipe(res);
  });
  return new Promise((ok) => server.listen(port, () => ok({ server, srv })));
}

if (require.main === module) {
  const port = Number(process.argv[2] || 8787);
  demarrer(port).then(() => console.log('Site local : http://localhost:' + port + '/   ·   espace : http://localhost:' + port + '/espace/   ·   codes : /__mails'));
}
module.exports = { demarrer };
