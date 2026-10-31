import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const core = createRequire(import.meta.url)('../docs/core.js');

test('escala logarítmica: ida y vuelta y límites', () => {
  assert.equal(core.toPos(core.MIN), 0);
  assert.ok(Math.abs(core.toPos(core.MAX) - 1) < 1e-12);
  assert.equal(core.fromPos(0), core.MIN);
  assert.equal(core.fromPos(1), core.MAX);
  assert.equal(core.fromPos(-3), core.MIN);
  assert.equal(core.fromPos(7), core.MAX);
  for (const v of [10000, 20000, 100000, 350000, 800000, 1000000, 2500000, 5000000]) {
    assert.equal(core.fromPos(core.toPos(v)), v, `ida y vuelta de ${v}`);
  }
  assert.equal(core.toPos(1), 0, 'por debajo del mínimo se recorta');
  assert.equal(core.toPos(1e9), 1, 'por encima del máximo se recorta');
});

test('puntaje: exacto, cerca, lejos y simetría en escala logarítmica', () => {
  const real = 1900000;
  assert.deepEqual(core.roundScore(real, real), { base: 1000, bonus: 200, rel: 0 });
  assert.equal(core.roundScore(real * 1.03, real).bonus, 200, 'justo en 3%');
  assert.equal(core.roundScore(real * 1.031, real).bonus, 0, 'pasando 3%');
  const b10 = core.roundScore(real * 1.1, real).base;
  assert.ok(b10 > 790 && b10 < 830, `+10% da ~810, dio ${b10}`);
  assert.ok(core.roundScore(real * 2, real).base < 250);
  assert.ok(Math.abs(core.roundScore(real * 2, real).base - core.roundScore(real / 2, real).base) <= 1);
  assert.equal(core.verdictOf({ base: 1000, bonus: 200 }), 'Exacto');
  assert.equal(core.verdictOf({ base: 700, bonus: 0 }), 'Cerca');
  assert.equal(core.verdictOf({ base: 100, bonus: 0 }), 'Muy lejos');
  assert.equal(core.tier(700), 'good'); assert.equal(core.tier(699), 'mid'); assert.equal(core.tier(349), 'bad');
});

test('partida: racha, multiplicador, tope y guardado para retomar', () => {
  const items = Array.from({ length: 8 }, (_, i) => ({ id: 'p' + i, p: 100000 + i * 1000 }));
  const g = core.createGame({ mode: 'solo', items });
  const pts = [];
  while (!g.done()) pts.push(g.guess(g.current().p).pts);
  assert.equal(pts[0], 1200);
  assert.equal(pts[1], 1320);              // racha 1: ×1,1
  assert.equal(pts[5], 1800);              // tope de racha: ×1,5
  assert.equal(pts[7], 1800);
  assert.ok(Math.max(...pts) <= core.MAX_ROUND_POINTS);
  assert.equal(g.state.streak, 8);

  const g2 = core.createGame({ mode: 'solo', items });
  g2.guess(items[0].p * 4);                // muy lejos: no suma racha
  assert.equal(g2.state.streak, 0);
  g2.guess(items[1].p);
  assert.equal(g2.state.streak, 1);
  g2.guess(items[2].p * 4);                // cortar la racha la reinicia
  assert.equal(g2.state.streak, 0);

  const saved = JSON.parse(JSON.stringify(g2.snapshot()));
  const g3 = core.createGame({ mode: 'solo', items, saved });
  assert.equal(g3.state.round, 3);
  assert.equal(g3.state.total, g2.state.total);
  assert.equal(g3.guess(items[3].p).pts, 1200, 'la racha guardada se respeta');
});

test('fechas de Argentina: el día cambia a las 00:00 de UTC-3, sin importar la zona del celular', () => {
  assert.equal(core.arDateKey(new Date('2026-10-30T02:59:59Z')), '2026-10-29');
  assert.equal(core.arDateKey(new Date('2026-10-30T03:00:00Z')), '2026-10-30');
  assert.equal(core.arDateKey(new Date('2026-01-01T02:00:00Z')), '2025-12-31', 'cruza el año');
  assert.equal(core.weekStartKey('2026-10-29'), '2026-10-26');    // jueves -> lunes
  assert.equal(core.weekStartKey('2026-10-26'), '2026-10-26');    // el lunes es su propio inicio
  assert.equal(core.weekStartKey('2026-11-01'), '2026-10-26');    // domingo
  assert.equal(core.weekStartKey('2026-03-01'), '2026-02-23');    // cruce de mes
  assert.equal(core.prettyDate('2026-10-29'), '29 oct');
});

test('lote del día: igual para todos, distinto cada día, sin repetidos y sin depender del orden', () => {
  const products = Array.from({ length: 45 }, (_, i) => ({ id: 'prod-' + String(i).padStart(2, '0'), p: 50000 }));
  const a = core.dailyItems(products, '2026-10-29').map(p => p.id);
  const b = core.dailyItems(products.slice().reverse(), '2026-10-29').map(p => p.id);
  const c = core.dailyItems(products, '2026-10-30').map(p => p.id);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.equal(new Set(a).size, 5);
  assert.equal(core.dailyItems(products.slice(0, 3), '2026-10-29').length, 3, 'con pocos productos no inventa');
});

test('formato, apodos y códigos de sala', () => {
  assert.equal(core.money(1900000), '$ 1.900.000');
  assert.equal(core.money(35000), '$ 35.000');
  assert.equal(core.money(999), '$ 999');
  assert.equal(core.parseMoney('$ 1.250.000'), 1250000);
  assert.equal(core.parseMoney(''), 0);
  assert.equal(core.sanitizeName('  Beni   <b>G</b>  '), 'Beni bG/b');
  assert.equal(core.sanitizeName('x'.repeat(40)).length, 14);
  assert.equal(core.sanitizeName(null), '');
  const code = core.newRoomCode(core.mulberry32(7));
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/, 'sin 0, O, 1 ni I');
  assert.equal(core.normalizeCode(' ab-c d3ef9 '), 'ABCD3E');
  assert.ok(Math.abs(core.avgError([110, 90], [{ p: 100 }, { p: 100 }]) - 0.1) < 1e-9);
  assert.equal(core.avgError([], []), null);
});

test('productos mal formados se descartan', () => {
  const good = { id: 'a', n: 'A', s: ['x'], p: 50000 };
  const list = [good, null, { id: 'b' }, { ...good, id: 'c', p: 5 }, { ...good, id: 'd', p: 9e9 }, { ...good, id: 'e', s: [] }, { ...good, id: 'f', p: '50000' }];
  assert.deepEqual(core.validProducts(list).map(p => p.id), ['a']);
  assert.deepEqual(core.validProducts(undefined), []);
});
