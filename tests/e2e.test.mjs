// Prueba el juego completo en un navegador con tamaño de celular, con Firebase y Mercado Libre simulados.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { startFirebase } from './mock-firebase.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { createNet } = require('../docs/net.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs');
const SHOTS = process.env.SHOTS_DIR || '';
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/catalog.json'), 'utf8'));
const FIX = ['phone', 'headphones', 'appliance', 'shoe'];

// productos de prueba con foto y link de Mercado Libre
const PRODUCTS = {
  version: 1, updated: new Date().toISOString(), site: 'MLA', source: 'api.mercadolibre.com',
  items: catalog.items.map((e, i) => ({
    id: e.id, n: e.n, c: e.c, s: e.s, p: e.est, src: 'ml',
    img: `https://http2.mlstatic.com/D_test_${i}-F.jpg`, link: `https://articulo.mercadolibre.com.ar/MLA-${1000 + i}-${e.id}-_JM`,
  })),
};
const byName = new Map(PRODUCTS.items.map(p => [p.n, p]));

let web, base, fb, browser;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

before(async () => {
  web = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); let f = path.join(DOCS, u.pathname === '/' ? 'index.html' : u.pathname);
    if (!f.startsWith(DOCS) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => web.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${web.address().port}`;
  fb = await startFirebase();
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); await fb?.close(); web?.close(); });

async function openPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: opts.width || 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const requests = [], errors = [];
  ctx.on('request', r => requests.push(r.url()));
  const config = { siteUrl: base + '/', productsUrl: '', firebase: opts.noFirebase ? {} : fb.cfg };
  await ctx.route('**/config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.PAP_CONFIG=' + JSON.stringify(config) }));
  await ctx.route('**/products.json', r => opts.productsFail ? r.abort() : r.fulfill({ json: opts.products || PRODUCTS }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.route('https://http2.mlstatic.com/**', r => {
    const n = Number((r.request().url().match(/D_test_(\d+)/) || [])[1] || 0);
    r.fulfill({ path: path.join(ROOT, 'tests/fixtures', FIX[n % FIX.length] + '.jpg'), contentType: 'image/jpeg' });
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|ERR_BLOCKED/.test(m.text())) errors.push(m.text()); });
  await page.goto(base + (opts.hash || '/'));
  return { ctx, page, requests, errors };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }); };
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

// Juega todos los productos; `factor` decide cuánto se aleja del precio real.
async function playAll(page, factor = 1, onRound) {
  for (let guard = 0; guard < 12; guard++) {
    await page.waitForSelector('#p-guess:not([hidden])');
    const name = await page.textContent('#p-name');
    const real = byName.get(name).p;
    await page.fill('#amt', String(Math.round(real * factor)));
    await page.click('#lock');
    await page.waitForSelector('#p-reveal:not([hidden])');
    if (onRound) await onRound(name, real);
    const last = (await page.textContent('#r-next')).includes('resultado');
    await page.click('#r-next');
    if (last) return;
  }
  throw new Error('la partida no terminó');
}
const visible = (page, id) => page.locator('#' + id).isVisible();

test('inicio: lote con fotos, sin errores y sin desbordes en 390 y 360 px', async () => {
  for (const width of [390, 360]) {
    const { ctx, page, errors } = await openPage({ width });
    await page.waitForSelector('#h-sheet .plate img');
    assert.equal(await page.locator('#h-sheet .plate').count(), 3);
    assert.equal(await page.locator('#h-sheet .plate.noimg').count(), 0);
    assert.equal(await overflow(page), 0, `desborde horizontal en ${width}px`);
    assert.match(await page.textContent('#h-fine'), /Precios de publicaciones reales de Mercado Libre Argentina/);
    if (width === 390) await shot(page, '1-inicio');
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('partida rápida: foto, revelado con link a la publicación, resultado y récord', async () => {
  const { ctx, page, errors, requests } = await openPage();
  await page.click('#h-quick');
  await page.waitForSelector('#p-plate img');
  assert.equal(await page.locator('#p-specs li').count(), 3);
  const firstName = await page.textContent('#p-name');
  await shot(page, '2-juego');
  assert.equal(await overflow(page), 0);

  await playAll(page, 1.1, async (name, real) => {
    await page.waitForFunction(r => document.getElementById('r-real').textContent === '$ ' + String(r).replace(/\B(?=(\d{3})+(?!\d))/g, '.'), real);
    const href = await page.getAttribute('#r-link', 'href');
    assert.equal(href, byName.get(name).link, 'el botón lleva a la publicación');
    assert.match(await page.textContent('#r-link'), /Ver publicación/);
    assert.equal(await page.textContent('#r-src'), 'Precio en Mercado Libre');
    if (name === firstName) { await shot(page, '3-revelado'); assert.equal(await overflow(page), 0); }
  });
  assert.ok(await visible(page, 's-end'));
  assert.equal(await page.locator('#e-recap li').count(), 8);
  assert.match(await page.textContent('#e-note'), /Primer récord guardado/);
  assert.match(await page.textContent('#e-rank'), /Ojo clínico|Tasador|Buen ojo/);
  assert.equal(await page.locator('#e-board').isHidden(), true, 'la partida rápida no va al ranking');
  await shot(page, '4-resultado');
  assert.equal(await overflow(page), 0);
  await page.click('#e-share');
  assert.deepEqual(errors, []);
  assert.ok(requests.every(u => !/evil\./.test(u)));
  await ctx.close();
});

test('desafío del día: entra al ranking con apodo y la segunda partida es de práctica', async () => {
  const { ctx, page, errors } = await openPage();
  await page.click('#h-daily');
  await playAll(page, 1.02);                       // 2% de error: todo "Exacto"
  assert.ok(await visible(page, 's-end'));
  await page.waitForSelector('#b-name');
  await page.click('[data-act=submit]');
  assert.match(await page.textContent('#toast'), /apodo/, 'pide el apodo');
  await page.fill('#b-name', 'Ana');
  await page.click('[data-act=submit]');
  await page.waitForFunction(() => /puesto 1/.test(document.getElementById('e-board').textContent));
  await shot(page, '5-resultado-desafio');

  await page.click('#e-home');
  assert.match(await page.textContent('#h-daily-meta'), /Hoy hiciste/);
  await page.click('#h-daily');
  await playAll(page, 3);
  assert.match(await page.textContent('#e-note'), /práctica/);
  assert.equal(await page.locator('#e-board').isHidden(), true);

  await page.click('#e-home');
  await page.click('#h-rank');
  await page.waitForSelector('#rk-table .row');
  assert.equal(await page.locator('#rk-table .row').count(), 1);
  assert.match(await page.textContent('#rk-table'), /Ana \(vos\)/);
  await shot(page, '6-ranking');
  await page.click('.tab[data-kind=weekly]');
  await page.waitForFunction(() => /1 desafíos/.test(document.getElementById('rk-table').textContent));
  assert.equal(await overflow(page), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('el ranking suma jugadores de distintos celulares y ordena por puntos', async () => {
  const a = await openPage(), b = await openPage();
  for (const [p, name, factor] of [[a.page, 'Lucía', 1.02], [b.page, 'Marcos', 1.6]]) {
    await p.click('#h-daily'); await playAll(p, factor);
    await p.waitForSelector('#b-name'); await p.fill('#b-name', name); await p.click('[data-act=submit]');
    await p.waitForFunction(() => /puesto \d/.test(document.getElementById('e-board').textContent));
  }
  assert.match(await b.page.textContent('#e-board'), /puesto 2|puesto 3/);
  await a.page.click('#e-home'); await a.page.click('#h-rank');
  await a.page.waitForFunction(() => document.querySelectorAll('#rk-table .row').length >= 3);
  const names = await a.page.locator('#rk-table .who b').allTextContents();
  // el ranking del día es compartido con otros tests: alcanza con que ambos estén y Lucía quede arriba
  assert.ok(names.includes('Lucía (vos)') && names.includes('Marcos'), names.join(', '));
  assert.ok(names.indexOf('Lucía (vos)') < names.indexOf('Marcos'), 'más puntos, más arriba');
  await a.ctx.close(); await b.ctx.close();
});

test('sala online: crear, invitar por link, jugar a distinta hora y ver la tabla', async () => {
  const A = await openPage();
  await A.page.click('#h-rooms');
  await A.page.fill('#rs-name', 'Ana');
  await A.page.click('.chip[data-n="5"]');
  await shot(A.page, '7-salas');
  await A.page.click('#rs-create');
  await A.page.waitForFunction(() => /^[A-Z0-9]{6}$/.test(document.getElementById('rm-code').textContent));
  const code = await A.page.textContent('#rm-code');
  assert.match(await A.page.textContent('#rm-cta'), /Jugar mis 5 productos/);
  assert.match(await A.page.textContent('#rm-table'), /Todavía no empezó/);

  // Beto abre el link de invitación en otro celular
  const B = await openPage({ hash: `/#sala=${code}` });
  await B.page.waitForSelector('#s-rooms:not([hidden])');
  assert.equal(await B.page.inputValue('#rs-code'), code);
  assert.match(await B.page.textContent('#rs-err'), new RegExp(`sala ${code}`));
  await B.page.click('#rs-join');
  assert.match(await B.page.textContent('#rs-err'), /apodo/);
  await B.page.fill('#rs-name', 'Beto');
  await B.page.click('#rs-join');
  await B.page.waitForSelector('#s-room:not([hidden])');
  await B.page.waitForFunction(() => document.querySelectorAll('#rm-table > li').length === 2);

  // Beto juega primero y se equivoca por bastante
  await B.page.click('[data-act=play]');
  await playAll(B.page, 1.5);
  await B.page.waitForSelector('#s-room:not([hidden])');
  await B.page.waitForFunction(() => /1 de 2 terminaron/.test(document.getElementById('rm-count').textContent));
  assert.equal(await B.page.locator('#rm-cta [data-act]').count(), 0, 'ya jugó: no vuelve a ofrecer jugar');

  // Ana ve que Beto terminó, pero ella todavía no
  await A.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await A.page.waitForFunction(() => /1 de 2 terminaron/.test(document.getElementById('rm-count').textContent));
  assert.match(await A.page.textContent('#rm-table > li:first-child'), /Beto/);
  assert.match(await A.page.textContent('#rm-table'), /en juego/);

  // Ana juega y cierra con casi todo exacto: pasa al primer lugar
  await A.page.click('[data-act=play]');
  await playAll(A.page, 1.02);
  await A.page.waitForFunction(() => /2 de 2 terminaron/.test(document.getElementById('rm-count').textContent));
  const rows = await A.page.locator('#rm-table > li .who b').allTextContents();
  assert.deepEqual(rows, ['Ana (vos)', 'Beto']);
  const pts = await A.page.locator('#rm-table .pts').allTextContents();
  assert.ok(Number(pts[0].replace(/\./g, '')) > Number(pts[1].replace(/\./g, '')));
  await A.page.click('#rm-table > li:first-child summary');
  assert.equal(await A.page.locator('#rm-table > li:first-child .det div').count(), 6, 'encabezado + 5 productos');
  await shot(A.page, '8-sala-tabla');
  assert.equal(await overflow(A.page), 0);

  // Beto ve el mismo orden desde su celular
  await B.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await B.page.waitForFunction(() => /2 de 2 terminaron/.test(document.getElementById('rm-count').textContent));
  assert.deepEqual(await B.page.locator('#rm-table > li .who b').allTextContents(), ['Ana', 'Beto (vos)']);
  assert.deepEqual(A.errors, []); assert.deepEqual(B.errors, []);
  await A.ctx.close(); await B.ctx.close();
});

test('sala: si se cierra el juego a mitad de camino, se retoma donde quedó', async () => {
  const net = createNet(fb.cfg, { storage: { getItem: () => null, setItem() {} } });
  const items = PRODUCTS.items.slice(0, 4);
  const { code } = await net.createRoom(items, 'Host');
  const { ctx, page } = await openPage({ hash: `/#sala=${code}` });
  await page.fill('#rs-name', 'Caro'); await page.click('#rs-join');
  await page.waitForSelector('[data-act=play]'); await page.click('[data-act=play]');
  for (let i = 0; i < 2; i++) {
    const real = byName.get(await page.textContent('#p-name')).p;
    await page.fill('#amt', String(real)); await page.click('#lock'); await page.waitForSelector('#p-reveal:not([hidden])'); await page.click('#r-next');
  }
  assert.match(await page.textContent('#p-lot'), /Producto 3 de 4/);
  await page.reload();
  await page.waitForSelector('#s-home:not([hidden])');
  await page.click('#h-rooms'); await page.fill('#rs-code', code); await page.click('#rs-join');
  await page.waitForSelector('[data-act=play]');
  assert.match(await page.textContent('#rm-cta'), /Seguir jugando · producto 3 de 4/);
  assert.match(await page.textContent('#rm-table'), /va por el producto 3 de 4/);
  await ctx.close();
});

test('seguridad: una sala con links o fotos ajenos a Mercado Libre no los usa', async () => {
  const net = createNet(fb.cfg, { storage: { getItem: () => null, setItem() {} } });
  const evil = { id: 'x', n: 'Producto trampa', c: 'Test', s: ['a', 'b', 'c'], p: 100000, img: 'https://evil.example/pixel.jpg', link: 'https://evil.example/phishing' };
  const { code } = await net.createRoom([evil, { ...evil, id: 'y', n: 'Otro <b>trampa</b>', link: 'javascript:alert(1)', img: 'http://http2.mlstatic.com/inseguro.jpg' }], '<img src=x onerror=alert(1)>');
  const { ctx, page, requests, errors } = await openPage({ hash: `/#sala=${code}` });
  await page.fill('#rs-name', 'Dani'); await page.click('#rs-join');
  await page.waitForSelector('#rm-table > li:not(.empty)');
  assert.match(await page.textContent('#rm-table'), /<img src=x onerror=alert\(1\)>/, 'el apodo del anfitrión se muestra como texto');
  assert.equal(await page.locator('#rm-table img').count(), 0);
  await page.click('[data-act=play]');
  await page.fill('#amt', '100000'); await page.click('#lock');
  await page.waitForSelector('#p-reveal:not([hidden])');
  assert.match(await page.getAttribute('#r-link', 'href'), /^https:\/\/listado\.mercadolibre\.com\.ar\/producto-trampa$/);
  assert.match(await page.textContent('#r-link'), /Buscar en Mercado Libre/);
  assert.equal(await page.locator('#p-plate.noimg').count(), 1, 'foto ajena descartada');
  assert.ok(requests.every(u => !u.includes('evil.example')), 'no se pidió nada a un sitio ajeno');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('sin foto muestra la placa de reserva; sin Firebase las funciones online avisan', async () => {
  const noPhotos = { ...PRODUCTS, source: 'estimado', items: PRODUCTS.items.map(({ img, link, ...p }) => ({ ...p, src: 'estimado' })) };
  const { ctx, page, errors } = await openPage({ products: noPhotos, noFirebase: true });
  await page.waitForSelector('#h-sheet .plate');
  assert.equal(await page.locator('#h-sheet .plate.noimg').count(), 3);
  assert.match(await page.textContent('#h-fine'), /Precios de referencia estimados/);
  await shot(page, '9-sin-fotos');
  await page.click('#h-quick');
  assert.ok(await page.locator('#p-plate.noimg .ph').isVisible());
  await page.fill('#amt', '50000'); await page.click('#lock');
  await page.waitForSelector('#p-reveal:not([hidden])');
  assert.equal(await page.textContent('#r-src'), 'Precio de referencia');
  assert.match(await page.getAttribute('#r-link', 'href'), /^https:\/\/listado\.mercadolibre\.com\.ar\//);
  await page.click('#p-quit'); await page.click('#p-quit');
  await page.click('#h-rooms');
  assert.ok(await page.locator('#rs-off').isVisible());
  assert.equal(await page.locator('#rs-create').isDisabled(), true);
  await page.click('#rs-back'); await page.click('#h-rank');
  assert.match(await page.textContent('#rk-table'), /todavía no está activado/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('sin red al abrir usa los productos guardados; sin nada avisa', async () => {
  const first = await openPage();
  await first.page.waitForSelector('#h-sheet .plate');
  const stored = await first.page.evaluate(() => localStorage.getItem('pap.products'));
  assert.ok(stored);
  await first.ctx.close();

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.route('**/products.json', r => r.abort());
  await ctx.route('**/config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.PAP_CONFIG={firebase:{}}' }));
  await ctx.route(/fonts\./, r => r.abort());
  await ctx.addInitScript(s => { if (!localStorage.getItem('pap.products') && s) localStorage.setItem('pap.products', s); }, stored);
  const page = await ctx.newPage();
  await page.goto(base + '/');
  await page.waitForSelector('#h-sheet .plate');
  assert.equal(await page.locator('#h-error').isHidden(), true);
  await ctx.close();

  const empty = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await empty.route('**/products.json', r => r.abort());
  await empty.route('**/config.js', r => r.fulfill({ contentType: 'application/javascript', body: 'window.PAP_CONFIG={firebase:{}}' }));
  await empty.route(/fonts\./, r => r.abort());
  const p2 = await empty.newPage(); await p2.goto(base + '/');
  await p2.waitForSelector('#h-error:not([hidden])');
  assert.match(await p2.textContent('#h-error'), /No se pudieron cargar los productos/);
  assert.equal(await p2.locator('#h-quick').isDisabled(), true);
  await empty.close();
});

test('botón Atrás de Android: vuelve paso a paso y desde el inicio sale', async () => {
  const { ctx, page } = await openPage();
  await page.evaluate(() => { window.__back = () => window.PAP.back(); });
  assert.equal(await page.evaluate(() => window.__back()), false, 'en el inicio no hay a dónde volver: sale de la app');
  await page.click('#h-rooms');
  assert.equal(await page.evaluate(() => window.__back()), true);
  assert.ok(await visible(page, 's-home'));
  await page.click('#h-quick');
  await page.evaluate(() => window.__back());
  assert.equal(await page.textContent('#p-quit'), 'Tocá de nuevo');
  await page.evaluate(() => window.__back());
  assert.ok(await visible(page, 's-home'));
  await ctx.close();
});
