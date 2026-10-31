import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { startFirebase } from './mock-firebase.mjs';
const { createNet } = createRequire(import.meta.url)('../docs/net.js');

const memory = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), m }; };
const ITEMS = [1, 2, 3].map(i => ({ id: 'p' + i, n: 'Producto ' + i, c: 'Cat', s: ['a', 'b', 'c'], p: 100000 * i, img: 'https://x/' + i + '.jpg', link: 'https://l/' + i, extra: 'no se sube' }));

async function setup(extra = {}) {
  const fb = await startFirebase();
  const storage = memory();
  const net = createNet(fb.cfg, { storage, ...extra });
  return { fb, storage, net, other: () => createNet(fb.cfg, { storage: memory() }) };
}

test('sin configuración queda apagado y avisa', async () => {
  const net = createNet({}, { storage: memory() });
  assert.equal(net.enabled(), false);
  await assert.rejects(net.ensureAuth(), { code: 'disabled' });
  assert.equal(createNet({ apiKey: 'k' }, { storage: memory() }).enabled(), false, 'falta databaseURL');
});

test('inicia sesión anónima una vez y la reutiliza al reabrir el juego', async () => {
  const { fb, net, storage } = await setup();
  const uid = await net.ensureAuth();
  await net.ensureAuth();
  assert.equal(fb.stats.signUp, 1, 'no vuelve a registrarse');
  const again = createNet(fb.cfg, { storage });                    // el juego se cierra y se abre
  assert.equal(again.uid(), uid, 'recuerda quién es antes de conectarse');
  assert.equal(await again.ensureAuth(), uid);
  assert.equal(fb.stats.signUp, 1);
  assert.equal(fb.stats.refresh, 1, 'renovó el token con el guardado');
  await fb.close();
});

test('una sesión guardada que ya no vale se reemplaza por una nueva', async () => {
  const fb = await startFirebase();
  const storage = memory();
  storage.setItem('pap.fb', JSON.stringify({ uid: 'viejo', refreshToken: 'ref-inexistente' }));
  const net = createNet(fb.cfg, { storage });
  const uid = await net.ensureAuth();
  assert.notEqual(uid, 'viejo');
  assert.equal(fb.stats.signUp, 1);
  await fb.close();
});

test('si el token vence, renueva y reintenta una sola vez', async () => {
  const { fb, net } = await setup();
  await net.ensureAuth();
  await net.db.put('rooms/ABCDEF/players/' + net.uid(), { name: 'Ana', round: 0, done: false });
  fb.expireAllTokens();                                            // el servidor ya no reconoce el token
  const v = await net.db.get('rooms/ABCDEF/players/' + net.uid());
  assert.equal(v.name, 'Ana');
  assert.equal(fb.stats.refresh, 1);
  await fb.close();
});

test('crea una sala: código válido, productos sin campos de más y el creador adentro', async () => {
  const { fb, net } = await setup();
  const { code } = await net.createRoom(ITEMS, 'Beni');
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
  const room = await net.getRoom(code);
  assert.equal(room.meta.n, 3);
  assert.equal(room.meta.owner, net.uid());
  assert.equal(room.items.length, 3);
  assert.deepEqual(room.items[1], { id: 'p2', n: 'Producto 2', c: 'Cat', s: ['a', 'b', 'c'], p: 200000, img: 'https://x/2.jpg', link: 'https://l/2' });
  assert.equal(room.players.length, 1);
  assert.equal(room.players[0].name, 'Beni');
  assert.equal(room.players[0].done, false);
  await fb.close();
});

test('si el código ya existe genera otro', async () => {
  const seq = [0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
  let i = 0;
  const { fb, net } = await setup({ random: () => seq[i++ % seq.length] });
  const a = await net.createRoom(ITEMS, 'Ana');
  assert.equal(a.code, 'AAAAAA');
  i = 0;                                                            // el azar repite el mismo código
  const net2 = createNet(fb.cfg, { storage: memory(), random: () => seq[i++ % seq.length] });
  const b = await net2.createRoom(ITEMS, 'Beto');
  assert.notEqual(b.code, a.code);
  assert.equal(b.code.length, 6);
  await fb.close();
});

test('entrar a una sala: código inexistente, jugador nuevo y regreso sin perder el avance', async () => {
  const { fb, net, other } = await setup();
  const { code } = await net.createRoom(ITEMS, 'Ana');
  const beto = other();
  await assert.rejects(beto.joinRoom('ZZZZZZ', 'Beto'), { code: 'notfound' });

  const room = await beto.joinRoom(code, 'Beto');
  assert.equal(room.items.length, 3);
  await beto.pushProgress(code, { round: 2 });
  await beto.joinRoom(code, 'Beto otra vez');                       // vuelve a abrir el link
  const after = await net.getRoom(code);
  const b = after.players.find(p => p.uid === beto.uid());
  assert.equal(b.name, 'Beto', 'no se pisa el nombre');
  assert.equal(b.round, 2, 'no se pisa el avance');
  assert.equal(after.players.length, 2);
  await fb.close();
});

test('cada jugador guarda sus resultados y nadie puede escribir en el lugar de otro', async () => {
  const { fb, net, other } = await setup();
  const { code } = await net.createRoom(ITEMS, 'Ana');
  const beto = other();
  await beto.joinRoom(code, 'Beto');
  await net.pushProgress(code, { round: 3, done: true, score: 2500, picks: [90000, 210000, 280000] });
  const room = await net.getRoom(code);
  const ana = room.players.find(p => p.uid === net.uid());
  assert.equal(ana.score, 2500);
  assert.deepEqual(ana.picks, [90000, 210000, 280000], 'los arreglos vuelven como arreglos');
  assert.equal(room.players.find(p => p.uid === beto.uid()).done, false);
  await assert.rejects(beto.db.put(`rooms/${code}/players/${net.uid()}`, { name: 'x', score: 99999 }), { code: 'denied' });
  await assert.rejects(beto.db.put(`rooms/${code}/meta`, { n: 1, owner: beto.uid(), t: 1, items: [] }), { code: 'denied' }, 'no se pisa la sala');
  await fb.close();
});

test('ranking del día: la primera partida cuenta y la segunda no', async () => {
  const { fb, net, other } = await setup();
  assert.deepEqual(await net.submitDaily('2026-10-29', 'Ana', 5200), { status: 'ok' });
  assert.deepEqual(await net.submitDaily('2026-10-29', 'Ana', 8800), { status: 'exists' });
  const beto = other(), caro = other();
  await beto.submitDaily('2026-10-29', 'Beto', 6100);
  await caro.submitDaily('2026-10-29', 'Caro', 4000);
  await net.submitDaily('2026-10-28', 'Ana', 9000);                 // otro día, no mezcla

  const { rows, me } = await net.top('daily', '2026-10-29', 50);
  assert.deepEqual(rows.map(r => [r.name, r.score]), [['Beto', 6100], ['Ana', 5200], ['Caro', 4000]]);
  assert.equal(me, net.uid());
  assert.equal(rows.find(r => r.uid === me).name, 'Ana');
  const top2 = await net.top('daily', '2026-10-29', 2);
  assert.deepEqual(top2.rows.map(r => r.name), ['Beto', 'Ana'], 'limitToLast se respeta');
  assert.deepEqual((await net.top('daily', '2030-01-01', 50)).rows, [], 'día sin jugadores');
  await fb.close();
});

test('ranking semanal: suma los días de la semana de cada jugador', async () => {
  const { fb, net, other } = await setup();
  assert.equal(await net.submitWeekly('2026-10-26', '2026-10-26', 'Ana', 5000), 5000);
  assert.equal(await net.submitWeekly('2026-10-26', '2026-10-27', 'Ana', 3000), 8000);
  assert.equal(await net.submitWeekly('2026-10-26', '2026-10-27', 'Ana', 3000), 8000, 'repetir el mismo día no suma dos veces');
  const beto = other();
  await beto.submitWeekly('2026-10-26', '2026-10-28', 'Beto', 8500);
  const { rows } = await net.top('weekly', '2026-10-26', 50);
  assert.deepEqual(rows.map(r => [r.name, r.score]), [['Beto', 8500], ['Ana', 8000]]);
  await fb.close();
});

test('sin conexión devuelve un error claro', async () => {
  const net = createNet({ apiKey: 'k', databaseURL: 'http://127.0.0.1:1', identityUrl: 'http://127.0.0.1:1/x', tokenUrl: 'http://127.0.0.1:1/y' }, { storage: memory() });
  await assert.rejects(net.getRoom('ABCDEF'), { code: 'offline' });
});
