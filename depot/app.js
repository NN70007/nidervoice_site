/**
 * Dépôt chiffré NiderVoice — chiffrement dans le navigateur, puis envoi des morceaux chiffrés.
 *
 * Pour chaque fichier :
 *  - une clé AES-256-GCM neuve, enveloppée (RSA-OAEP SHA-256) avec la clé PUBLIQUE de CHX ;
 *  - le contenu découpé en morceaux de CHUNK octets, chacun chiffré avec
 *      IV  = 8 octets aléatoires du fichier + n° du morceau (4 octets, gros-boutiste),
 *      AAD = "NVD1" + n° du morceau (4 octets) + 1 si dernier morceau, sinon 0
 *    (un morceau retiré, déplacé ou tronqué est donc détecté au déchiffrement) ;
 *  - un manifeste chiffré (chemin relatif, taille, date) avec IV = préfixe + 0xFFFFFFFF, AAD = "NVD1M",
 *    envoyé précédé des 8 octets du préfixe.
 * Le serveur ne voit ni le nom, ni le contenu, ni la clé. Ce script ne contacte que api.php (même site).
 * Format lu par C:\DicteeLab\depot\recuperer_depot.py : toute modification doit être faite des deux côtés.
 */
const CHUNK = 4 * 1024 * 1024;
const app = document.getElementById('app');
const csrf = app.dataset.csrf;
const enc = new TextEncoder();
const $ = (id) => document.getElementById(id);

const pubKey = crypto.subtle.importKey(
  'spki',
  Uint8Array.from(atob(app.dataset.pk), (c) => c.charCodeAt(0)),
  { name: 'RSA-OAEP', hash: 'SHA-256' },
  false,
  ['encrypt'],
);

const b64 = (buf) => {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};

function iv(prefix, n) {
  const v = new Uint8Array(12);
  v.set(prefix);
  new DataView(v.buffer).setUint32(8, n >>> 0);
  return v;
}

function aad(n, last) {
  const a = new Uint8Array(9);
  a.set(enc.encode('NVD1'));
  new DataView(a.buffer).setUint32(4, n);
  a[8] = last ? 1 : 0;
  return a;
}

async function api(action, params, body) {
  const q = new URLSearchParams({ a: action, ...params });
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch('api.php?' + q, { method: 'POST', headers: { 'X-CSRF': csrf }, body, credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (r.ok) return j;
      if (r.status < 500 || attempt >= 3) throw new Error(j.erreur || 'Erreur ' + r.status);
    } catch (e) {
      if (attempt >= 3 || e.message.startsWith('Session') || e.message.includes('séquence')) throw e;
    }
    await new Promise((res) => setTimeout(res, 1500 * attempt));
  }
}

async function sendFile(file, path, onBytes) {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const prefix = crypto.getRandomValues(new Uint8Array(8));
  const n = Math.max(1, Math.ceil(file.size / CHUNK));
  const { id } = await api('start', {});
  for (let i = 0; i < n; i++) {
    const plain = await file.slice(i * CHUNK, (i + 1) * CHUNK).arrayBuffer();
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv(prefix, i), additionalData: aad(i, i === n - 1) }, key, plain);
    await api('chunk', { id, i }, ct);
    onBytes(plain.byteLength);
  }
  const manifest = enc.encode(JSON.stringify({ p: path, s: file.size, t: file.lastModified }));
  const m = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv(prefix, 0xffffffff), additionalData: enc.encode('NVD1M') }, key, manifest);
  const raw = await crypto.subtle.exportKey('raw', key);
  const k = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, await pubKey, raw);
  await api('finish', { id }, JSON.stringify({ k: b64(k), m: b64(new Uint8Array([...prefix, ...new Uint8Array(m)])), n }));
}

/** Parcourt un dossier glissé (API d'entrées du navigateur) et renvoie [{file, path}]. */
async function walk(entry, base) {
  if (entry.isFile) {
    return [{ file: await new Promise((res, rej) => entry.file(res, rej)), path: base + entry.name }];
  }
  const reader = entry.createReader();
  const out = [];
  for (;;) {
    const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
    if (!batch.length) break;
    for (const e of batch) out.push(...(await walk(e, base + entry.name + '/')));
  }
  return out;
}

let busy = false;
async function sendAll(items) {
  if (busy || !items.length) return;
  busy = true;
  const total = items.reduce((t, it) => t + it.file.size, 0) || 1;
  let done = 0;
  let ok = 0;
  $('progressBox').classList.remove('hidden');
  for (const it of items) {
    const li = document.createElement('li');
    li.append(Object.assign(document.createElement('span'), { textContent: it.path }));
    const st = Object.assign(document.createElement('span'), { textContent: 'chiffrement…' });
    li.append(st);
    $('list').prepend(li);
    $('status').textContent = it.path;
    try {
      await sendFile(it.file, it.path, (b) => {
        done += b;
        $('bar').value = (100 * done) / total;
      });
      st.textContent = 'envoyé';
      li.className = 'ok';
      ok++;
    } catch (e) {
      st.textContent = e.message || 'échec';
      li.className = 'bad';
    }
  }
  $('status').textContent = `${ok} fichier(s) sur ${items.length} envoyé(s), chiffrés. Arrivée sur CHX dans 5 minutes environ.`;
  $('bar').value = 100;
  busy = false;
}

const fromInput = (input) => [...input.files].map((f) => ({ file: f, path: f.webkitRelativePath || f.name }));
$('pickFiles').onclick = () => $('files').click();
$('pickDir').onclick = () => $('dir').click();
$('files').onchange = (e) => sendAll(fromInput(e.target)).finally(() => (e.target.value = ''));
$('dir').onchange = (e) => sendAll(fromInput(e.target)).finally(() => (e.target.value = ''));

const zone = $('zone');
zone.ondragover = (e) => {
  e.preventDefault();
  zone.classList.add('over');
};
zone.ondragleave = () => zone.classList.remove('over');
zone.ondrop = async (e) => {
  e.preventDefault();
  zone.classList.remove('over');
  const entries = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  const items = [];
  for (const en of entries) items.push(...(await walk(en, '')));
  sendAll(items);
};
window.addEventListener('beforeunload', (e) => {
  if (busy) e.preventDefault();
});
