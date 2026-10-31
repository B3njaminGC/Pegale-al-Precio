// Servidor que imita las partes de la API de Mercado Libre que usa scripts/fetch-products.mjs.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/catalog.json'), 'utf8'));

/**
 * opciones:
 *   requireAuth   exige Authorization: Bearer test-token en search e items
 *   denyAll       responde 403 a todo
 *   onlyNoise     lista de ids de catálogo cuya búsqueda devuelve solo accesorios y usados
 *   flaky         lista de ids cuya primera búsqueda responde 429
 *   noItemPage    /items/:id responde 404 (para probar el plan B de la miniatura)
 */
export function startMock(opts = {}) {
  const calls = { search: [], items: [], token: 0, rejected: 0 };
  const flakySeen = new Set();
  const byQuery = new Map(catalog.items.map(e => [e.q, e]));
  let seq = 1000;

  const listing = (entry, price, title, extra = {}) => {
    const id = `MLA${seq++}`;
    return {
      id, title, price, currency_id: 'ARS', condition: 'new',
      permalink: `https://articulo.mercadolibre.com.ar/MLA-${id.slice(3)}-${entry.id}-_JM`,
      thumbnail: `http://http2.mlstatic.com/D_${id}-I.jpg`,
      secure_thumbnail: `https://http2.mlstatic.com/D_${id}-I.jpg`,
      ...extra,
    };
  };

  const resultsFor = entry => {
    const base = entry.must.join(' ');
    const mid = (entry.lo + entry.hi) / 2;
    const out = [];
    if (!(opts.onlyNoise || []).includes(entry.id)) {
      // 7 publicaciones válidas con precios crecientes: la mediana es la cuarta
      for (let i = 0; i < 7; i++) {
        const tag = ['alfa', 'beta', 'gama', 'delta', 'epsilon', 'zeta', 'eta'][i]; // palabras: un número podría chocar con los términos prohibidos
        out.push(listing(entry, Math.round(entry.est * (0.8 + i * 0.07)), `${base} nuevo original garantia ${tag}`));
      }
    }
    // ruido que tiene que descartarse
    out.push(listing(entry, Math.round(entry.lo / 10), `funda para ${base}`));
    out.push(listing(entry, entry.est, `${base} usado impecable`));
    out.push(listing(entry, entry.est, `${base} reacondicionado`));
    out.push(listing(entry, Math.round(entry.hi * 3), `${base} combo mayorista`));
    out.push(listing(entry, 500, `${base} nuevo`, { currency_id: 'USD' }));
    out.push(listing(entry, Math.round(mid), `otra cosa distinta sin relacion`));
    return out;
  };

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    const authed = (req.headers.authorization || '') === 'Bearer test-token';

    if (u.pathname === '/oauth/token' && req.method === 'POST') {
      calls.token++;
      let body = '';
      req.on('data', c => (body += c));
      req.on('end', () => {
        const p = new URLSearchParams(body);
        if (p.get('client_id') === 'id-ok' && p.get('client_secret') === 'secret-ok' && p.get('grant_type') === 'client_credentials') {
          send(200, { access_token: 'test-token', expires_in: 21600 });
        } else send(401, { message: 'invalid_client' });
      });
      return;
    }

    if (opts.denyAll || (opts.requireAuth && !authed)) { calls.rejected++; return send(403, { message: 'forbidden', error: 'forbidden', status: 403 }); }

    if (u.pathname === '/sites/MLA/search') {
      const q = u.searchParams.get('q');
      calls.search.push({ q, limit: u.searchParams.get('limit'), condition: u.searchParams.get('condition') });
      const entry = byQuery.get(q);
      if (!entry) return send(200, { results: [] });
      if ((opts.flaky || []).includes(entry.id) && !flakySeen.has(entry.id)) { flakySeen.add(entry.id); return send(429, { message: 'too many requests' }); }
      return send(200, { results: resultsFor(entry) });
    }

    const m = u.pathname.match(/^\/items\/(MLA\d+)$/);
    if (m) {
      calls.items.push(m[1]);
      if (opts.noItemPage) return send(404, { message: 'not found' });
      return send(200, {
        id: m[1], title: `detalle ${m[1]}`,
        permalink: `https://articulo.mercadolibre.com.ar/MLA-${m[1].slice(3)}-detalle-_JM`,
        pictures: [{ secure_url: `https://http2.mlstatic.com/D_NQ_NP_${m[1]}-F.webp` }],
      });
    }
    send(404, { message: 'no existe' });
  });

  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    resolve({ server, calls, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(r => server.close(r)) });
  }));
}
