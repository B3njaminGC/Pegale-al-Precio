import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildFicha, validOffers, pickMedian, isCandidate, buildItem, famKey, cleanName, extendPlan, pickDaily, arDateKey, addDays, bannedName,
} from '../scripts/build-pool.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seeds = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/pool-seeds.json'), 'utf8'));

const attrs = [
  { id: 'BRAND', name: 'Marca', value_name: 'Samsung' },
  { id: 'MODEL', name: 'Modelo', value_name: 'A15' },
  { id: 'COLOR', name: 'Color', value_name: 'Negro' },
  { id: 'INTERNAL_MEMORY', name: 'Memoria interna', value_name: '128 GB' },
  { id: 'RAM', name: 'Memoria RAM', value_name: '4 GB' },
  { id: 'GTIN', name: 'GTIN', value_name: '1234567890123' },
  { id: 'IS_DUAL_SIM', name: 'Dual SIM', value_name: 'Sí' },
  { id: 'SCREEN_SIZE', name: 'Tamaño de la pantalla', value_name: '6.5 "' },
  { id: 'LONG', name: 'Algo', value_name: 'x'.repeat(40) },
];

test('las búsquedas semilla son válidas', () => {
  const all = Object.values(seeds).flat();
  assert.ok(all.length >= 300);
  assert.equal(new Set(all).size, all.length, 'sin búsquedas repetidas');
  assert.ok(Object.keys(seeds).length >= 20);
});

test('la ficha usa datos útiles y no revela marca/modelo/color', () => {
  const s = buildFicha(attrs);
  assert.deepEqual(s, ['Memoria interna: 128 GB', 'Memoria RAM: 4 GB', 'Tamaño de la pantalla: 6.5 "']);
  assert.deepEqual(buildFicha([attrs[0], attrs[1], attrs[2]]), []);
});

test('ofertas: solo nuevas, en pesos y sin valores extremos', () => {
  const o = (price, extra = {}) => ({ item_id: 'MLA' + price, price, currency_id: 'ARS', condition: 'new', ...extra });
  const list = [o(100000), o(110000), o(120000), o(130000), o(900000), o(5000), o(110000, { condition: 'used' }), o(110000, { currency_id: 'USD' })];
  const ok = validOffers(list);
  assert.deepEqual(ok.map(x => x.price).sort((a, b) => a - b), [100000, 110000, 120000, 130000]);
  assert.equal(pickMedian(ok).price, 110000);
});

test('candidatos: descarta accesorios, usados, sin marca o sin foto', () => {
  const base = {
    id: 'MLA1', name: 'Samsung Galaxy A15 128 Gb', domain_id: 'MLA-CELLPHONES', status: 'active',
    pictures: [{ url: 'http://http2.mlstatic.com/a.jpg' }], attributes: attrs,
  };
  assert.ok(isCandidate(base));
  assert.ok(!isCandidate({ ...base, name: 'Funda Samsung Galaxy A15' }));
  assert.ok(!isCandidate({ ...base, name: 'Samsung Galaxy A15 usado' }));
  assert.ok(!isCandidate({ ...base, domain_id: 'MLA-CELLPHONE_COVERS' }));
  assert.ok(!isCandidate({ ...base, pictures: [] }));
  assert.ok(!isCandidate({ ...base, pictures: [{ url: 'https://example.com/a.jpg' }] }));
  assert.ok(!isCandidate({ ...base, attributes: attrs.slice(1) }));
  assert.ok(bannedName('Kit de herramientas'));
});

test('buildItem arma el producto con link, foto https y precio real', () => {
  const prod = { id: 'MLA9', parent_id: 'MLA8', name: 'Samsung Galaxy A15 128 Gb Negro', pictures: [{ url: 'http://http2.mlstatic.com/a.jpg' }], attributes: attrs };
  const offers = [100000, 110000, 120000].map((p, i) => ({ item_id: `MLA${500 + i}`, price: p, currency_id: 'ARS', condition: 'new' }));
  const it = buildItem(prod, offers, 'Celulares', new Date('2026-11-02T00:00:00Z'));
  assert.equal(it.id, 'MLA9');
  assert.equal(it.p, 110000);
  assert.equal(it.img, 'https://http2.mlstatic.com/a.jpg');
  assert.equal(it.link, 'https://articulo.mercadolibre.com.ar/MLA-501');
  assert.equal(it.src, 'ml');
  assert.equal(it.ml.fam, 'MLA8');
  assert.equal(buildItem(prod, offers.slice(0, 2), 'Celulares'), null, 'muy pocas ofertas');
  assert.equal(buildItem({ ...prod, attributes: [attrs[0]] }, offers, 'Celulares'), null, 'sin ficha');
});

test('nombres y familias', () => {
  assert.equal(famKey('Samsung Galaxy A15 128 Gb Negro'), famKey('Samsung Galaxy A15 256 Gb Azul'));
  assert.notEqual(famKey('Apple iPhone 15 128 Gb'), famKey('Apple iPhone 16 128 Gb'));
  assert.notEqual(famKey('Samsung Galaxy A15 128 Gb'), famKey('Samsung Galaxy A16 128 Gb'));
  const long = cleanName('Zapatillas Nike Air Max Excee Hombre Running Urbanas Deportivas Livianas Blancas Con Cordones');
  assert.ok(long.length <= 70 && !long.endsWith(' '));
});

const mk = n => Array.from({ length: n }, (_, i) => ({ id: `P${i}`, n: `Prod ${i}`, c: `Cat${i % 9}`, s: ['a', 'b'], p: 20000 + i, img: 'https://x/mlstatic.jpg', link: 'https://l', src: 'ml' }));

test('el plan diario: 5 productos, categorías distintas y sin repetir entre días', () => {
  const items = mk(200);
  const today = '2026-11-02';
  const plan = extendPlan({}, items, today, 14);
  const keys = Object.keys(plan).sort();
  assert.equal(keys.length, 14);
  assert.equal(keys[0], today);
  const seen = new Set();
  for (const k of keys) {
    assert.equal(plan[k].length, 5);
    assert.equal(new Set(plan[k]).size, 5);
    const cats = new Set(plan[k].map(id => items.find(i => i.id === id).c));
    assert.equal(cats.size, 5, 'categorías distintas');
    for (const id of plan[k]) { assert.ok(!seen.has(id), `repetido ${id}`); seen.add(id); }
  }
  // es determinista y no cambia lo ya planeado
  assert.deepEqual(extendPlan(plan, items, today, 14), plan);
  // al día siguiente solo se agrega un día nuevo, sin repetir
  const next = extendPlan(plan, items, addDays(today, 1), 14);
  assert.equal(Object.keys(next).length, 15);
  for (const k of keys) assert.deepEqual(next[k], plan[k]);
  const fresh = next[addDays(today, 14)];
  assert.ok(fresh.every(id => !seen.has(id)));
});

test('si un producto planeado a futuro desaparece, ese día se rearma; los pasados no', () => {
  const items = mk(100);
  const plan = extendPlan({}, items, '2026-11-02', 5);
  const gone = plan['2026-11-04'][0];
  const left = items.filter(i => i.id !== gone);
  const p2 = extendPlan(plan, left, '2026-11-02', 5);
  assert.ok(!p2['2026-11-04'].includes(gone));
  assert.deepEqual(p2['2026-11-03'], plan['2026-11-03']);
  const p3 = extendPlan(plan, left, '2026-11-05', 5);
  assert.deepEqual(p3['2026-11-04'], plan['2026-11-04'], 'un día pasado queda como estaba');
});

test('fecha argentina', () => {
  assert.equal(arDateKey(new Date('2026-11-02T02:59:00Z')), '2026-11-01');
  assert.equal(arDateKey(new Date('2026-11-02T03:00:00Z')), '2026-11-02');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(pickDaily(mk(3), new Set(), 'x').length, 3);
});

/* ---- corrida completa contra un servidor simulado ---- */
function startPoolMock() {
  const calls = { search: [], offers: [] };
  let seq = 9000;
  const brand = [{ id: 'BRAND', name: 'Marca', value_name: 'Acme' }];
  const prods = q => {
    const out = [];
    for (let i = 0; i < 14; i++) {
      const id = `MLA${q.replace(/\W/g, '').slice(0, 6)}${i}`;
      out.push({
        id, parent_id: `PAR${id}`, domain_id: 'MLA-THINGS', status: 'active',
        name: i === 3 ? `Funda para ${q} ${i}` : `Acme ${q} modelo${i} ${i}`,
        pictures: i === 5 ? [] : [{ url: `http://http2.mlstatic.com/${id}.jpg` }],
        attributes: [...brand, { id: 'POWER', name: 'Potencia', value_name: `${100 + i} W` }, { id: 'MATERIAL', name: 'Material', value_name: 'Acero' }, { id: 'CAPACITY', name: 'Capacidad', value_name: `${i + 1} L` }],
      });
    }
    return out;
  };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const send = (c, b) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); };
    if (u.pathname === '/products/search') {
      calls.search.push(u.searchParams.get('q'));
      const off = Number(u.searchParams.get('offset') || 0);
      return send(200, { results: off ? [] : prods(u.searchParams.get('q')) });
    }
    const m = u.pathname.match(/^\/products\/([^/]+)\/items$/);
    if (m) {
      calls.offers.push(m[1]);
      if (m[1].endsWith('7')) return send(404, { message: 'No winners' });
      const o = p => ({ item_id: `MLA${seq++}`, price: p, currency_id: 'ARS', condition: 'new' });
      return send(200, { results: [o(50000), o(52000), o(55000), o(58000)] });
    }
    send(404, {});
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ calls, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(x => server.close(x)) })));
}

function runPool(env) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts/build-pool.mjs')], { env: { PATH: process.env.PATH, DELAY_MS: '0', ...env } });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => (stdout += d));
    child.stderr.on('data', d => (stderr += d));
    child.on('close', status => resolve({ status, stdout, stderr }));
  });
}

test('corrida completa: suma productos nuevos, arma el plan, continúa donde quedó y no repite', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pool-'));
  const out = path.join(dir, 'products.json');
  const curated = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/products.json'), 'utf8'));
  const base = { ...curated, items: curated.items.filter(i => i.src === 'ml') };
  delete base.daily; delete base.pool;
  fs.writeFileSync(out, JSON.stringify(base));
  const env = { PRODUCTS_OUT: out, POOL_SKIP_FILE: path.join(dir, 'skip.json'), POOL_NEW_MAX: '60', POOL_PER_QUERY: '8' };
  const m = await startPoolMock();
  try {
  const r1 = await runPool({ ...env, ML_API_BASE: m.url });
  assert.equal(r1.status, 0, r1.stderr + r1.stdout);
  const d1 = JSON.parse(fs.readFileSync(out, 'utf8'));
  const added1 = d1.items.length - base.items.length;
  assert.equal(added1, 60);
  assert.ok(d1.items.slice(base.items.length).every(i => i.src === 'ml' && i.img.startsWith('https://') && i.s.length >= 2 && i.p === 52000 && i.c));
  assert.ok(!d1.items.some(i => /funda/i.test(i.n)));
  assert.equal(new Set(d1.items.map(i => i.id)).size, d1.items.length, 'sin ids repetidos');
  assert.ok(Object.keys(d1.daily).length >= 14);
  const cursor1 = d1.pool.cursor;
  assert.ok(cursor1 > 0);

  const r2 = await runPool({ ...env, ML_API_BASE: m.url });
  assert.equal(r2.status, 0, r2.stderr + r2.stdout);
  const d2 = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(d2.items.length - d1.items.length, 60);
  assert.ok(d2.pool.cursor > cursor1, 'sigue con las búsquedas siguientes');
  assert.deepEqual(d2.daily, d1.daily, 'el plan ya armado no cambia');
  assert.equal(new Set(d2.items.map(i => i.id)).size, d2.items.length);
  const skip = JSON.parse(fs.readFileSync(path.join(dir, 'skip.json'), 'utf8')).ids;
  assert.ok(skip.length > 0, 'recuerda los productos sin ofertas');
  } finally { await m.close(); }
});
