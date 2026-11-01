// Prueba que Firebase esté bien configurado: sesión anónima, ranking del día, sala y reglas de seguridad.
const KEY = 'AIzaSyB3ONfDb3MfTKBsV3IDkuWPBcb1vJr6lAM';
const DB = 'https://pegale-al-precio-default-rtdb.firebaseio.com';
let fails = 0;
const ok = (c, msg) => { console.log((c ? 'OK   ' : 'FALLA ') + msg); if (!c) fails++; };

const su = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${KEY}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }),
});
const sj = await su.json();
ok(su.ok, `sesión anónima (${su.status}) ${su.ok ? '' : JSON.stringify(sj).slice(0, 200)}`);
if (!su.ok) process.exit(1);
const tok = sj.idToken, uid = sj.localId;
const call = async (m, p, body, q = '') => {
  const r = await fetch(`${DB}/${p}.json?auth=${tok}${q}`, { method: m, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: (await r.text()).slice(0, 200) };
};
const day = '2099-12-31', code = 'ZZZZ99';
let r = await call('PUT', `daily/${day}/${uid}`, { name: 'Prueba', score: 1234, t: Date.now() });
ok(r.status === 200, `guardar puntaje del día (${r.status}) ${r.body}`);
r = await call('PUT', `daily/${day}/${uid}`, { name: 'Prueba', score: 1500, t: Date.now() });
ok(r.status === 401, `una sola partida por día: el segundo intento se rechaza (${r.status})`);
r = await call('PUT', `daily/${day}/${uid}x`, { name: 'Otro', score: 10, t: 1 });
ok(r.status === 401, `no se puede escribir el puntaje de otro (${r.status})`);
r = await call('PUT', `daily/2099-12-30/${uid}`, { name: 'Trampa', score: 99999, t: 1 });
ok(r.status === 401, `puntaje imposible se rechaza (${r.status})`);
r = await call('GET', `daily/${day}`, undefined, '&orderBy=%22score%22&limitToLast=50');
ok(r.status === 200 && r.body.includes('Prueba'), `leer el ranking ordenado (${r.status}) ${r.status !== 200 ? r.body : ''}`);
r = await call('PUT', `rooms/${code}/meta`, { n: 1, t: Date.now(), owner: uid, items: [{ id: 'x', n: 'X', s: ['a'], p: 1000 }] });
ok(r.status === 200 || r.status === 401, `crear sala (${r.status}) ${r.body}`);
r = await call('PUT', `rooms/${code}/players/${uid}`, { name: 'Prueba', round: 0, done: false, t: Date.now() });
ok(r.status === 200, `entrar a la sala (${r.status}) ${r.body}`);
r = await call('GET', `rooms/${code}`);
ok(r.status === 200 && r.body.includes('Prueba'), `leer la sala (${r.status})`);
const anon = await fetch(`${DB}/daily/${day}.json`);
ok(anon.status === 401, `sin sesión no se puede leer nada (${anon.status})`);
console.log(fails ? `\n${fails} controles fallaron` : '\nTodo bien: Firebase está listo.');
process.exit(fails ? 1 : 0);
