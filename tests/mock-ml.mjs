// Servidor que imita las partes de la API de Mercado Libre que usa scripts/fetch-products.mjs:
// búsqueda en el catálogo de productos, ofertas de cada producto y la página de un ítem.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/catalog.json'), 'utf8'));

/**
 * opciones:
 *   requireAuth   exige Authorization: Bearer test-token
 *   denyAll       responde 403 a todo
 *   onlyNoise     lista de ids de catálogo cuya búsqueda devuelve solo accesorios y usados
 *   flaky         lista de ids cuya primera búsqueda responde 429
 *   noPictures    los productos no traen foto (ni en la búsqueda ni en su ficha)
 */
export function startMock(opts = {}) {
  const calls = { search: [], offers: [], items: [], token: 0, rejected: 0 };
  const flakySeen = new Set();
  const byQuery = new Map(catalog.items.map(e => [e.q, e]));
  const byId = new Map(catalog.items.map(e => [e.id, e]));
  let seq = 1000;

  const picture = pid => (opts.noPictures ? [] : [{ url: `http://http2.mlstatic.com/D_NQ_NP_${pid}-F.jpg` }]);

  const productsFor = entry => {
    const base = entry.must.join(' ');
    const out = [];
    if (!(opts.onlyNoise || []).includes(entry.id)) {
      out.push({ id: `MLAV-${entry.id}`, name: `${base} nuevo original garantia`, pictures: picture(`V${entry.id}`) });
    }
    // ruido que tiene que descartarse por el nombre
    out.push({ id: `MLAN-${entry.id}-1`, name: `funda para ${base}`, pictures: picture('N1') });
    out.push({ id: `MLAN-${entry.id}-2`, name: `${base} usado impecable`, pictures: picture('N2') });
    out.push({ id: `MLAN-${entry.id}-3`, name: `${base} reacondicionado`, pictures: picture('N3') });
    out.push({ id: `MLAN-${entry.id}-4`, name: 'otra cosa distinta sin relacion', pictures: picture('N4') });
    return out;
  };

  const offersFor = entry => {
    const offer = (price, extra = {}) => ({
      item_id: `MLA${seq++}`, site_id: 'MLA', price, currency_id: 'ARS', condition: 'new', ...extra,
    });
    const out = [];
    // 7 ofertas válidas con precios crecientes: la mediana es la cuarta
    for (let i = 0; i < 7; i++) out.push(offer(Math.round(entry.est * (0.8 + i * 0.07))));
    // ofertas que tienen que descartarse por precio, moneda o estado
    out.push(offer(Math.round(entry.lo / 10)));
    out.push(offer(Math.round(entry.hi * 3)));
    out.push(offer(500, { currency_id: 'USD' }));
    out.push(offer(entry.est, { condition: 'used' }));
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

    // la búsqueda abierta de Mercado Libre está cerrada a apps de terceros
    if (u.pathname === '/sites/MLA/search') return send(403, { message: 'forbidden', error: 'forbidden', status: 403 });

    if (u.pathname === '/products/search') {
      const q = u.searchParams.get('q');
      calls.search.push({ q, limit: u.searchParams.get('limit'), site: u.searchParams.get('site_id') });
      const entry = byQuery.get(q);
      if (!entry) return send(200, { results: [] });
      if ((opts.flaky || []).includes(entry.id) && !flakySeen.has(entry.id)) { flakySeen.add(entry.id); return send(429, { message: 'too many requests' }); }
      return send(200, { paging: { total: 5 }, results: productsFor(entry) });
    }

    let m = u.pathname.match(/^\/products\/(MLA[VN]-[^/]+)\/items$/);
    if (m) {
      calls.offers.push(m[1]);
      if (!m[1].startsWith('MLAV-')) return send(404, { message: 'No winners found', error: 'not_found', status: 404 });
      return send(200, { paging: { total: 11 }, results: offersFor(byId.get(m[1].slice(5))) });
    }

    m = u.pathname.match(/^\/products\/(MLA[VN]-[^/]+)$/);
    if (m) {
      if (opts.noPictures) return send(200, { id: m[1], pictures: [] });
      return send(200, { id: m[1], pictures: picture(m[1]) });
    }

    m = u.pathname.match(/^\/items\/(MLA\d+)$/);
    if (m) {
      calls.items.push(m[1]);
      return send(200, { id: m[1], permalink: `https://articulo.mercadolibre.com.ar/MLA-${m[1].slice(3)}-detalle-_JM` });
    }
    send(404, { message: 'no existe' });
  });

  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    resolve({ server, calls, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(r => server.close(r)) });
  }));
}
