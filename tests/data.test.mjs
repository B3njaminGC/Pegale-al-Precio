// Revisa que data/products.json (lo que baja la app) tenga la forma que la app espera.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/products.json'), 'utf8'));
const MIN = 10000, MAX = 5000000;

test('el archivo de productos tiene lo básico', () => {
  assert.equal(doc.version, 1);
  assert.ok(Array.isArray(doc.items) && doc.items.length >= 20);
  assert.ok(!Number.isNaN(Date.parse(doc.updated)));
});

test('cada producto es válido y los ids no se repiten', () => {
  const seen = new Set();
  for (const it of doc.items) {
    assert.equal(typeof it.id, 'string', 'id');
    assert.ok(!seen.has(it.id), `id repetido ${it.id}`);
    seen.add(it.id);
    assert.ok(typeof it.n === 'string' && it.n.length > 0, `nombre de ${it.id}`);
    assert.ok(Array.isArray(it.s) && it.s.length > 0, `ficha de ${it.id}`);
    assert.ok(Number.isFinite(it.p) && it.p >= MIN && it.p <= MAX, `precio de ${it.id}: ${it.p}`);
    if (it.src === 'ml') {
      assert.match(it.img, /^https:\/\/([a-z0-9-]+\.)*mlstatic\.com\//, `foto de ${it.id}`);
      assert.match(it.link, /^https:\/\/([a-z0-9-]+\.)*mercadolibre\.com(\.ar)?\//, `link de ${it.id}`);
    }
  }
});

test('el plan de desafíos diarios usa productos que existen y no repite ninguno', () => {
  // Hoy (hora de Argentina) y los días que vienen tienen que tener sus productos en el archivo.
  // Los días pasados pueden haber perdido alguno si el producto se descartó después: ya no se juegan.
  const today = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const ids = new Set(doc.items.map(i => i.id));
  const used = new Map();
  for (const [day, list] of Object.entries(doc.daily || {})) {
    assert.match(day, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(list.length, 5, `cantidad el ${day}`);
    assert.equal(new Set(list).size, 5, `repetidos dentro del ${day}`);
    for (const id of list) {
      if (day >= today) assert.ok(ids.has(id), `${day}: no existe el producto ${id}`);
      assert.ok(!used.has(id), `${id} sale el ${used.get(id)} y el ${day}`);
      used.set(id, day);
    }
  }
});
