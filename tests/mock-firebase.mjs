// Imita lo que usa docs/net.js: registro anónimo, renovación de token y Realtime Database por REST.
// Emula a mano las reglas más importantes (dueño del nodo y una sola partida por día). Las reglas reales
// están en database.rules.json y se prueban en la consola de Firebase.
import http from 'node:http';

const toFb = v => Array.isArray(v) ? Object.fromEntries(v.map((x, i) => [String(i), toFb(x)])) : (v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFb(x)])) : v);
const fromFb = v => {
  if (!v || typeof v !== 'object') return v;
  const keys = Object.keys(v);
  const out = Object.fromEntries(keys.map(k => [k, fromFb(v[k])]));
  if (keys.length && keys.every((k, i) => String(i) === k)) return keys.map(k => out[k]);   // Firebase devuelve arreglos si las claves son 0..n
  return out;
};

export function startFirebase(opts = {}) {
  const KEY = opts.apiKey || 'test-key';
  const data = {};
  const tokens = new Map();            // idToken -> uid
  const refreshTokens = new Map();     // refreshToken -> uid
  const stats = { signUp: 0, refresh: 0, reads: 0, writes: 0, denied: 0 };
  let n = 0;

  const getAt = parts => parts.reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), data);
  const setAt = (parts, value) => {
    let o = data;
    for (const k of parts.slice(0, -1)) { if (typeof o[k] !== 'object' || o[k] === null) o[k] = {}; o = o[k]; }
    if (value === null) delete o[parts[parts.length - 1]]; else o[parts[parts.length - 1]] = value;
  };
  const mint = uid => {
    const t = `tok-${++n}-${uid}`; tokens.set(t, uid); return t;
  };

  const allowed = (method, parts, uid, body) => {
    if (method === 'GET') return true;
    const [root, a, b, c] = parts;
    if (root === 'daily') return parts.length === 3 && b === uid && getAt(parts) === undefined && body && body.score <= 9000;
    if (root === 'weekly') return parts.length === 3 && b === uid;
    if (root === 'rooms' && b === 'meta') return parts.length === 3 && getAt(parts) === undefined && body.owner === uid;
    if (root === 'rooms' && b === 'players') return parts.length === 4 && c === uid;
    return false;
  };

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,PUT,PATCH,POST,DELETE,OPTIONS', 'access-control-allow-headers': 'content-type' };
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json', ...cors }); res.end(JSON.stringify(body)); };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }   // el navegador pregunta antes de escribir
    let raw = '';
    req.on('data', c => (raw += c));
    req.on('end', () => {
      if (u.pathname === '/identity') {
        if (u.searchParams.get('key') !== KEY) return send(400, { error: { message: 'API key not valid' } });
        stats.signUp++;
        const uid = `uid${++n}`;
        const refreshToken = `ref-${uid}`; refreshTokens.set(refreshToken, uid);
        return send(200, { idToken: mint(uid), refreshToken, localId: uid, expiresIn: '3600' });
      }
      if (u.pathname === '/token') {
        stats.refresh++;
        const p = new URLSearchParams(raw);
        const uid = refreshTokens.get(p.get('refresh_token'));
        if (!uid) return send(400, { error: { message: 'INVALID_REFRESH_TOKEN' } });
        return send(200, { id_token: mint(uid), refresh_token: p.get('refresh_token'), user_id: uid, expires_in: '3600' });
      }

      const m = u.pathname.match(/^\/(.+)\.json$/);
      if (!m) return send(404, { error: 'not found' });
      const uid = tokens.get(u.searchParams.get('auth'));
      if (!uid) { stats.denied++; return send(401, { error: 'Auth token is expired' }); }
      const parts = decodeURIComponent(m[1]).split('/');
      const body = raw ? JSON.parse(raw) : undefined;

      if (req.method === 'GET') {
        stats.reads++;
        let v = getAt(parts);
        const ob = u.searchParams.get('orderBy'), lim = Number(u.searchParams.get('limitToLast'));
        if (ob && v && typeof v === 'object') {
          const field = JSON.parse(ob);
          const entries = Object.entries(v).sort((a, b) => (a[1][field] ?? 0) - (b[1][field] ?? 0));
          v = Object.fromEntries(lim ? entries.slice(-lim) : entries);
        }
        return send(200, v === undefined ? null : fromFb(v));
      }
      if (!allowed(req.method, parts, uid, body)) { stats.denied++; return send(401, { error: 'Permission denied' }); }
      stats.writes++;
      if (req.method === 'PUT') setAt(parts, toFb(body));
      else if (req.method === 'PATCH') { const cur = getAt(parts) || {}; setAt(parts, { ...cur, ...toFb(body) }); }
      else if (req.method === 'DELETE') setAt(parts, null);
      return send(200, body ?? null);
    });
  });

  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    resolve({
      server, data, stats, base,
      cfg: { apiKey: KEY, databaseURL: base, identityUrl: `${base}/identity`, tokenUrl: `${base}/token` },
      expireAllTokens: () => tokens.clear(),
      close: () => new Promise(r => { server.closeAllConnections?.(); server.close(r); }),
    });
  }));
}
