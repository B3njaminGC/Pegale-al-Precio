import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startMock } from './mock-ml.mjs';
import { tokens, passes, pickMedian, expandNot } from '../scripts/fetch-products.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/catalog.json'), 'utf8'));
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pap-')), 'products.json');

// Asíncrono a propósito: el servidor simulado corre en este mismo proceso y tiene que poder responder.
function run(args, env) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts/fetch-products.mjs'), ...args], {
      env: { PATH: process.env.PATH, DELAY_MS: '0', ...env },
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => (stdout += d));
    child.stderr.on('data', d => (stderr += d));
    child.on('close', status => resolve({ status, stdout, stderr }));
  });
}

test('el catálogo es coherente', () => {
  const ids = new Set(), qs = new Set();
  for (const e of catalog.items) {
    assert.ok(!ids.has(e.id), `id repetido ${e.id}`); ids.add(e.id);
    assert.ok(!qs.has(e.q), `búsqueda repetida ${e.q}`); qs.add(e.q);
    assert.equal(e.s.length, 3, e.id);
    assert.ok(e.must.length >= 1, e.id);
    assert.ok(e.lo < e.est && e.est < e.hi, `${e.id}: est fuera del rango [lo, hi]`);
    assert.ok(e.lo >= 10000 && e.hi <= 5000000, `${e.id}: fuera de la escala del juego`);
    for (const t of e.not) if (t.startsWith('@')) assert.ok(catalog.groups[t.slice(1)], `grupo desconocido ${t}`);
    // las palabras que se piden no pueden estar también prohibidas
    const banned = new Set(expandNot(e.not));
    for (const m of e.must) assert.ok(!banned.has(m), `${e.id}: '${m}' está en must y en not`);
  }
  assert.equal(catalog.items.length, 45);
});

test('filtros de título y precio', () => {
  const iphone = catalog.items.find(i => i.id === 'iphone-17');
  const ok = { title: 'Apple iPhone 17 256 GB Negro', price: 1900000, currency_id: 'ARS' };
  assert.ok(passes(iphone, ok));
  assert.ok(!passes(iphone, { ...ok, title: 'Apple iPhone 17 Pro 256 GB' }), 'excluye Pro');
  assert.ok(!passes(iphone, { ...ok, title: 'Funda iPhone 17 256gb silicona' }), 'excluye fundas');
  assert.ok(!passes(iphone, { ...ok, title: 'iPhone 17 256GB Reacondicionado' }), 'excluye reacondicionados');
  assert.ok(!passes(iphone, { ...ok, price: 150000 }), 'precio muy bajo');
  assert.ok(!passes(iphone, { ...ok, currency_id: 'USD' }), 'solo pesos');
  assert.ok(passes(iphone, { ...ok, title: 'iPhone 17 256gb' }), '256gb cuenta como 256');
  assert.deepEqual(tokens('Café Ñandú 3.5%'), ['cafe', 'nandu', '3', '5']);
  assert.equal(pickMedian([{ price: 5 }, { price: 1 }, { price: 3 }]).price, 3);
  assert.equal(pickMedian([{ price: 4 }, { price: 1 }, { price: 3 }, { price: 2 }]).price, 2);
});

test('actualiza los 45 productos con precio mediano, foto y link', async () => {
  const mock = await startMock();
  const out = tmp();
  const r = await run([], { ML_API_BASE: mock.url, PRODUCTS_OUT: out });
  await mock.close();
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const doc = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(doc.items.length, 45);
  assert.ok(doc.items.every(i => i.src === 'ml'));
  assert.ok(doc.items.every(i => i.img && i.img.startsWith('https://http2.mlstatic.com/')), 'todas con foto https de mlstatic');
  assert.ok(doc.items.every(i => i.link.includes('mercadolibre.com.ar')));
  assert.ok(doc.items.every(i => i.ml.id.startsWith('MLA')));
  for (const e of catalog.items) {
    const it = doc.items.find(i => i.id === e.id);
    assert.equal(it.p, Math.round(e.est * (0.8 + 3 * 0.07)), `mediana de ${e.id}`);
    assert.deepEqual(it.s, e.s);
  }
  assert.equal(mock.calls.search.length, 45);
  assert.ok(mock.calls.search.every(c => c.limit === '30' && c.site === 'MLA'));
});

test('si un producto falla conserva el dato anterior y sigue con el resto', async () => {
  const out = tmp();
  const m1 = await startMock();
  assert.equal((await run([], { ML_API_BASE: m1.url, PRODUCTS_OUT: out })).status, 0);
  await m1.close();
  const before = JSON.parse(fs.readFileSync(out, 'utf8')).items.find(i => i.id === 'casio-f91w');

  const m2 = await startMock({ onlyNoise: ['casio-f91w', 'kindle-paperwhite'] });
  const r = await run([], { ML_API_BASE: m2.url, PRODUCTS_OUT: out });
  await m2.close();
  assert.equal(r.status, 0, r.stderr);
  const doc = JSON.parse(fs.readFileSync(out, 'utf8'));
  const casio = doc.items.find(i => i.id === 'casio-f91w');
  assert.equal(casio.p, before.p);
  assert.equal(casio.img, before.img);
  assert.equal(casio.ml.id, before.ml.id, 'sigue la publicación anterior');
  assert.match(r.stdout, /No se pudieron actualizar/);
  assert.match(r.stdout, /Casio F-91W: solo 0 publicaciones/);
});

test('sin datos previos, el producto que falla queda con precio estimado y sin foto', async () => {
  const out = tmp();
  const m = await startMock({ onlyNoise: ['ukelele-soprano'] });
  const r = await run([], { ML_API_BASE: m.url, PRODUCTS_OUT: out });
  await m.close();
  assert.equal(r.status, 0, r.stderr);
  const u = JSON.parse(fs.readFileSync(out, 'utf8')).items.find(i => i.id === 'ukelele-soprano');
  assert.equal(u.src, 'estimado');
  assert.equal(u.p, 70000);
  assert.equal(u.img, undefined);
});

test('reintenta cuando Mercado Libre responde 429', async () => {
  const out = tmp();
  const m = await startMock({ flaky: ['jbl-flip-6'] });
  const r = await run([], { ML_API_BASE: m.url, PRODUCTS_OUT: out });
  const jbl = m.calls.search.filter(c => c.q === 'parlante jbl flip 6').length;
  await m.close();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(jbl, 2, 'una búsqueda fallida y un reintento');
  assert.equal(JSON.parse(fs.readFileSync(out, 'utf8')).items.find(i => i.id === 'jbl-flip-6').src, 'ml');
});

test('403 en todo: sale con error y no toca el archivo', async () => {
  const out = tmp();
  fs.writeFileSync(out, '{"intacto":true}');
  const m = await startMock({ denyAll: true });
  const r = await run([], { ML_API_BASE: m.url, PRODUCTS_OUT: out });
  await m.close();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /rechazó la consulta \(403\)/);
  assert.equal(fs.readFileSync(out, 'utf8'), '{"intacto":true}');
  assert.equal(m.calls.search.length, 0, 'no insiste con cada producto');
});

test('con credenciales pide el token y lo usa', async () => {
  const out = tmp();
  const m = await startMock({ requireAuth: true });
  const sin = await run([], { ML_API_BASE: m.url, PRODUCTS_OUT: out });
  assert.equal(sin.status, 1, 'sin credenciales lo rechazan');
  const con = await run([], { ML_API_BASE: m.url, PRODUCTS_OUT: out, ML_CLIENT_ID: 'id-ok', ML_CLIENT_SECRET: 'secret-ok' });
  await m.close();
  assert.equal(con.status, 0, con.stderr + con.stdout);
  assert.equal(m.calls.token, 1);
  assert.equal(JSON.parse(fs.readFileSync(out, 'utf8')).items.length, 45);
});

test('si el producto no trae foto lo actualiza igual, sin foto', async () => {
  const out = tmp();
  const m = await startMock({ noPictures: true });
  const r = await run([], { ML_API_BASE: m.url, PRODUCTS_OUT: out });
  await m.close();
  assert.equal(r.status, 0, r.stderr);
  const doc = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.ok(doc.items.every(i => i.src === 'ml' && i.img === undefined));
});

test('--seed arma el archivo base sin red', async () => {
  const out = tmp();
  const r = await run(['--seed'], { PRODUCTS_OUT: out, ML_API_BASE: 'http://127.0.0.1:1' });
  assert.equal(r.status, 0, r.stderr);
  const doc = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(doc.items.length, 45);
  assert.equal(doc.source, 'estimado');
  assert.ok(doc.items.every(i => i.src === 'estimado' && i.p >= 10000 && !i.img));
});
