#!/usr/bin/env node
/*
 * Amplía data/products.json con miles de productos reales de Mercado Libre Argentina,
 * y arma el plan de desafíos diarios (los mismos 5 productos para todos, sin repetir nunca).
 *
 *   node scripts/build-pool.mjs
 *
 * Cada corrida:
 *   1. refresca el precio de los productos más viejos del pool,
 *   2. descubre productos nuevos buscando palabras de scripts/pool-seeds.json (sigue desde donde quedó la vez anterior),
 *   3. completa el plan de los próximos días en `daily`, sin repetir productos de días anteriores.
 *
 * Variables de entorno (todas opcionales):
 *   ML_CLIENT_ID, ML_CLIENT_SECRET   credenciales de la app
 *   ML_API_BASE                      para pruebas
 *   PRODUCTS_OUT                     archivo de salida (por defecto data/products.json)
 *   POOL_SKIP_FILE                   ids sin ofertas (por defecto data/pool-skip.json)
 *   POOL_NEW_MAX     productos nuevos por corrida (500)    POOL_REFRESH_MAX  precios a refrescar por corrida (300)
 *   POOL_MAX         tope del pool (4000)                   POOL_PER_QUERY    nuevos por búsqueda (10)
 *   POOL_MINUTES     presupuesto de tiempo (40)             POOL_DAILY_DAYS   días de plan por adelantado (14)
 *   POOL_STALE_DAYS  antigüedad para refrescar (6)          DELAY_MS          pausa entre pedidos (120)
 *   POOL_CONCURRENCY consultas de ofertas en paralelo (6)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = (process.env.ML_API_BASE || 'https://api.mercadolibre.com').replace(/\/$/, '');
const SITE = 'MLA';
const OUT = process.env.PRODUCTS_OUT || path.join(ROOT, 'data/products.json');
const SKIP_FILE = process.env.POOL_SKIP_FILE || path.join(path.dirname(OUT), 'pool-skip.json');
const num = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? Number(process.env[k]) : d);
const DELAY = num('DELAY_MS', 120);
const CONC = num('POOL_CONCURRENCY', 6);
const NEW_MAX = num('POOL_NEW_MAX', 500);
const REFRESH_MAX = num('POOL_REFRESH_MAX', 300);
const POOL_MAX = num('POOL_MAX', 4000);
const PER_QUERY = num('POOL_PER_QUERY', 10);
const MINUTES = num('POOL_MINUTES', 40);
const DAILY_DAYS = num('POOL_DAILY_DAYS', 14);
const STALE_DAYS = num('POOL_STALE_DAYS', 6);
const MIN_PRICE = 10000, MAX_PRICE = 5000000;
const MIN_OFFERS = 3;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const https = u => (u ? String(u).replace(/^http:\/\//, 'https://') : u);

/* ---------- utilidades puras (se prueban aparte) ---------- */
export function tokens(text) {
  return String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean);
}

const BANNED_WORDS = new Set([
  // accesorios y repuestos
  'funda', 'fundas', 'case', 'cases', 'protector', 'protectores', 'templado', 'vidrio', 'film', 'lamina', 'correa', 'malla',
  'skin', 'carcasa', 'repuesto', 'repuestos', 'cargador', 'cable', 'adaptador', 'soporte', 'base', 'tapa', 'pantalla-repuesto',
  'filtro', 'filtros', 'bateria-repuesto', 'pieza', 'piezas', 'mica', 'cubierta', 'estuche', 'bolsa', 'sticker', 'calcomania',
  // usados y falsificaciones
  'usado', 'usada', 'reacondicionado', 'reacondicionada', 'replica', 'imitacion', 'simil', 'outlet', 'combo', 'lote', 'pack',
  'kit', 'mayorista', 'oferta', 'liquidacion', 'ejemplo', 'reparacion', 'servicio',
]);
const BANNED_DOMAIN = /ACCESSOR|PARTS|SPARE|CASE|COVER|PROTECTOR|REPLACEMENT|FILTER|CABLE|CHARGER|BOOK|SERVICE|CARD|SIM|LICENSE|SOFTWARE/i;

export function bannedName(name) {
  return tokens(name).some(t => BANNED_WORDS.has(t));
}

// Clave para no meter 20 colores/variantes del mismo producto: marca + primeras palabras del nombre.
const UNITS = new Set(['gb', 'tb', 'mb', 'ram', 'hz', 'mah', 'mp', 'pulgadas', 'w', 'l', 'kg', 'g', 'ml', 'cm', 'mm', 'lts', 'litros', 'wifi']);
const COLORS = new Set(['negro', 'negra', 'blanco', 'blanca', 'azul', 'rojo', 'roja', 'verde', 'gris', 'rosa', 'rosado', 'dorado', 'plateado', 'violeta', 'celeste', 'amarillo', 'naranja', 'marron', 'beige', 'plata', 'titanio', 'lavanda', 'morado', 'black', 'white', 'blue', 'red', 'green', 'gray', 'grey', 'silver', 'gold', 'pink', 'navy']);
// Clave para no meter 20 colores/variantes del mismo producto: primeras palabras del nombre sin colores ni capacidades.
export function famKey(name) {
  const tk = tokens(name).filter(t => t.length > 1);
  const out = [];
  for (let i = 0; i < tk.length; i++) {
    const t = tk[i];
    if (COLORS.has(t) || UNITS.has(t)) continue;
    if (/^\d+$/.test(t) && UNITS.has(tk[i + 1])) continue;
    if (/^\d+(gb|tb|mb|hz|mah|mp|w|l|kg|g|ml|cm|mm|lts)$/.test(t)) continue;
    out.push(t);
  }
  return out.slice(0, 5).join(' ');
}

export function cleanName(name) {
  let n = String(name).replace(/\s+/g, ' ').trim();
  if (n.length > 70) {
    n = n.slice(0, 70);
    const sp = n.lastIndexOf(' ');
    if (sp > 40) n = n.slice(0, sp);
  }
  return n.replace(/[\s,;:\-–]+$/, '');
}

const PREFERRED = [
  'INTERNAL_MEMORY', 'RAM', 'SCREEN_SIZE', 'DISPLAY_SIZE', 'CAPACITY', 'POWER', 'POTENCY', 'MAIN_COLOR_NOT', 'MATERIAL',
  'PROCESSOR_MODEL', 'PROCESSOR_BRAND', 'STORAGE_CAPACITY', 'BATTERY_CAPACITY', 'RESOLUTION', 'TV_SCREEN_RESOLUTION',
  'WITH_BLUETOOTH', 'WITH_WI_FI', 'WIRELESS', 'CONNECTIVITY', 'GENDER', 'SIZE', 'AGE_GROUP', 'VOLUME', 'WEIGHT',
  'INCLUDES_BATTERY', 'TYPE', 'MAIN_FEATURE', 'NUMBER_OF_SPEEDS', 'SPEED', 'FREQUENCY', 'ENERGY_EFFICIENCY',
];
const DENIED = /^(BRAND|MODEL|LINE|GTIN|EAN|SELLER_SKU|ALPHANUMERIC_MODEL|MPN|PART_NUMBER|COLOR|MAIN_COLOR|ITEM_CONDITION|PACKAGE_|.*_ID$|IS_|HAS_|IS$|.*SKU.*|.*CODE.*|.*WARRANTY.*|.*ORIGIN.*|.*COUNTRY.*|.*MANUFACTURER.*|VERSION|GRID_.*|.*_FORMAT$|FAMILY|VARIATION.*|.*DIMENSION.*|ITEMS_PER_PACK|UNITS_PER_PACK|PRODUCT_.*|ITEM_.*|OWN_.*|COMMERCIAL_.*|ALLOWS_.*)/i;

// Hasta 3 datos de la ficha tomados de los atributos del producto. Hacen falta al menos 2.
export function buildFicha(attrs, max = 3) {
  const seen = new Set();
  const ok = [];
  for (const a of attrs || []) {
    if (!a || !a.id || !a.name || !a.value_name) continue;
    if (DENIED.test(a.id)) continue;
    const name = String(a.name).trim(), value = String(a.value_name).trim();
    if (!name || !value || value.length > 30 || name.length > 28) continue;
    if (/^(modelo|marca|l[ií]nea|nombre|c[oó]digo|versi[oó]n|referencia)\b/i.test(name)) continue; // revelan el producto
    if (/[$]|^\s*(no|n\/a|ninguno|sin especificar)\s*$/i.test(value)) continue;
    if (seen.has(a.id) || seen.has(name.toLowerCase())) continue;
    seen.add(a.id); seen.add(name.toLowerCase());
    ok.push({ id: a.id, line: `${name}: ${value}` });
  }
  const pref = id => { const i = PREFERRED.indexOf(id); return i < 0 ? 999 : i; };
  ok.sort((a, b) => pref(a.id) - pref(b.id));
  return ok.slice(0, max).map(x => x.line);
}

export function brandOf(attrs) {
  const a = (attrs || []).find(x => x && x.id === 'BRAND');
  const v = a && a.value_name ? String(a.value_name).trim() : '';
  return v && !/^(gen[eé]rica?|sin marca|otra|otros?)$/i.test(v) ? v : '';
}

// Ofertas nuevas, en pesos, dentro del rango del juego. Se descartan las que se alejan mucho de la mediana.
export function validOffers(list) {
  const base = (list || []).filter(o =>
    (!o.condition || o.condition === 'new') && (!o.currency_id || o.currency_id === 'ARS') &&
    Number.isFinite(o.price) && o.price >= MIN_PRICE && o.price <= MAX_PRICE && o.item_id);
  if (!base.length) return [];
  const sorted = base.map(o => o.price).sort((a, b) => a - b);
  const med = sorted[Math.floor((sorted.length - 1) / 2)];
  return base.filter(o => o.price >= med * 0.6 && o.price <= med * 1.6);
}

export function pickMedian(offers) {
  const s = [...offers].sort((a, b) => a.price - b.price);
  return s[Math.floor((s.length - 1) / 2)];
}

const pictureOf = p => {
  const pic = (p && p.pictures || [])[0];
  const u = https(pic && (pic.secure_url || pic.url));
  return u && /^https:\/\/([a-z0-9-]+\.)*mlstatic\.com\//i.test(u) ? u : null;
};

// ¿Sirve este producto del catálogo como candidato? (antes de pedir sus ofertas)
export function isCandidate(prod) {
  if (!prod || !prod.id || !prod.name) return false;
  if (prod.status && prod.status !== 'active') return false;
  if (!pictureOf(prod)) return false;
  if (!brandOf(prod.attributes)) return false;
  if (BANNED_DOMAIN.test(String(prod.domain_id || ''))) return false;
  if (bannedName(prod.name)) return false;
  if (tokens(prod.name).length < 3) return false;
  return true;
}

export function buildItem(prod, offers, category, now = new Date()) {
  const ok = validOffers(offers);
  if (ok.length < MIN_OFFERS) return null;
  const chosen = pickMedian(ok);
  const s = buildFicha(prod.attributes);
  if (s.length < 2) return null;
  const digits = String(chosen.item_id).replace(/\D/g, '');
  return {
    id: prod.id, n: cleanName(prod.name), c: category, s,
    p: Math.round(chosen.price), img: pictureOf(prod),
    link: `https://articulo.mercadolibre.com.ar/MLA-${digits}`,
    src: 'ml', ml: { id: chosen.item_id, title: prod.name, pid: prod.id, fam: prod.parent_id || prod.id },
    t: now.toISOString(),
  };
}

/* ---------- plan de desafíos diarios ---------- */
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function arDateKey(now = new Date()) {
  return new Date(now.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}
export function addDays(key, n) {
  const d = new Date(key + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Elige 5 productos para `key`: de ids que no salieron antes, de categorías distintas, con foto.
export function pickDaily(items, used, key, count = 5) {
  const live = items.filter(i => i.src === 'ml' && i.img && i.link);
  let fresh = live.filter(i => !used.has(i.id));
  if (fresh.length < count) fresh = live; // se agotó el pool: se vuelve a empezar
  const rng = mulberry32(hashStr('plan-' + key));
  const pool = [...fresh];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const out = [], cats = new Set();
  for (const it of pool) {
    if (out.length >= count) break;
    if (cats.has(it.c)) continue;
    cats.add(it.c); out.push(it);
  }
  for (const it of pool) { // si hay menos categorías que lugares
    if (out.length >= count) break;
    if (!out.includes(it)) out.push(it);
  }
  return out.map(i => i.id);
}

// Mantiene el plan existente y agrega los días que falten hasta `days` días desde hoy.
export function extendPlan(plan, items, today, days) {
  const next = { ...(plan || {}) };
  const ids = new Set(items.map(i => i.id));
  const used = new Set();
  for (const k of Object.keys(next)) for (const id of next[k]) used.add(id);
  for (let i = 0; i < days; i++) {
    const key = addDays(today, i);
    // un día futuro con productos que ya no existen se rearma; el de hoy y los pasados no se tocan
    if (next[key] && (key <= today || next[key].every(id => ids.has(id)))) continue;
    const picked = pickDaily(items, used, key);
    if (picked.length < 5) continue;
    next[key] = picked;
    for (const id of picked) used.add(id);
  }
  // se guardan como máximo 400 días
  const keys = Object.keys(next).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 400))) delete next[k];
  return next;
}

/* ---------- API ---------- */
class ApiError extends Error {
  constructor(status, url, body) {
    super(`HTTP ${status} en ${url}${body ? ': ' + String(body).slice(0, 160) : ''}`);
    this.status = status;
  }
}

let token = null;
async function getToken() {
  const id = process.env.ML_CLIENT_ID, secret = process.env.ML_CLIENT_SECRET;
  if (!id || !secret) return null;
  const res = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
  });
  if (!res.ok) throw new ApiError(res.status, '/oauth/token', await res.text());
  return (await res.json()).access_token;
}

async function getJson(pathAndQuery) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await sleep(DELAY + 1000 * 2 ** (attempt - 1));
    try {
      const res = await fetch(API + pathAndQuery, {
        headers: { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      });
      if (res.ok) return await res.json();
      const body = await res.text();
      lastErr = new ApiError(res.status, pathAndQuery, body);
      if (res.status === 429 || res.status >= 500) continue;
      throw lastErr;
    } catch (e) {
      if (e instanceof ApiError && e.status < 500 && e.status !== 429) throw e;
      lastErr = e;
    }
  }
  throw lastErr;
}

// Ofertas de un producto; null si no tiene (404/400).
async function offersOf(pid) {
  try {
    await sleep(DELAY);
    return (await getJson(`/products/${pid}/items?limit=50`)).results || [];
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) return null;
    throw e;
  }
}

/* ---------- principal ---------- */
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

async function main() {
  const started = Date.now();
  const overTime = () => Date.now() - started > MINUTES * 60 * 1000;
  const doc = readJson(OUT, null);
  if (!doc || !Array.isArray(doc.items)) { console.error(`No hay ${OUT}. Corré primero fetch-products.mjs`); process.exit(1); }
  const seeds = readJson(path.join(ROOT, 'scripts/pool-seeds.json'), {});
  const catalog = readJson(path.join(ROOT, 'scripts/catalog.json'), { items: [] });
  const curated = new Set(catalog.items.map(i => i.id));
  const skipDoc = readJson(SKIP_FILE, { ids: [] });
  const skip = new Set(skipDoc.ids || []);

  token = await getToken().catch(e => { console.warn('No se pudo obtener el token:', e.message); return null; });
  console.log(token ? 'Consultando con token de la app.' : 'Consultando sin credenciales.');

  const now = new Date();
  const today = arDateKey(now);
  const items = doc.items;
  const byId = new Map(items.map(i => [i.id, i]));
  const stats = { refreshed: 0, refreshFailed: 0, dropped: 0, added: 0, queries: 0, candidates: 0, noOffers: 0, rejected: 0, errors: 0 };
  const perCat = {};

  /* 1. refrescar los precios más viejos del pool */
  const staleBefore = now.getTime() - STALE_DAYS * 86400000;
  const stale = items
    .filter(i => !curated.has(i.id) && i.ml && i.ml.pid && (Date.parse(i.t || 0) || 0) < staleBefore)
    .sort((a, b) => (Date.parse(a.t || 0) || 0) - (Date.parse(b.t || 0) || 0))
    .slice(0, REFRESH_MAX);
  let auth403 = 0;
  for (const it of stale) {
    if (overTime()) break;
    try {
      const offers = await offersOf(it.ml.pid);
      const ok = offers && validOffers(offers);
      if (ok && ok.length >= MIN_OFFERS) {
        const chosen = pickMedian(ok);
        it.p = Math.round(chosen.price);
        it.link = `https://articulo.mercadolibre.com.ar/MLA-${String(chosen.item_id).replace(/\D/g, '')}`;
        it.ml.id = chosen.item_id;
        it.t = now.toISOString();
        delete it.x;
        stats.refreshed++;
      } else {
        it.x = (it.x || 0) + 1; // sin ofertas suficientes: tras 3 intentos se descarta
        stats.refreshFailed++;
      }
    } catch (e) {
      stats.errors++;
      if (e instanceof ApiError && (e.status === 401 || e.status === 403) && ++auth403 >= 3) {
        console.error('Mercado Libre rechazó las consultas:', e.message);
        process.exit(1);
      }
    }
  }
  const protectedIds = new Set();
  for (const [k, ids] of Object.entries(doc.daily || {})) if (k >= today) ids.forEach(id => protectedIds.add(id));
  let kept = items.filter(i => {
    if ((i.x || 0) >= 3 && !curated.has(i.id) && !protectedIds.has(i.id)) { stats.dropped++; return false; }
    return true;
  });

  /* 2. descubrir productos nuevos */
  const families = new Set(), names = new Set();
  for (const i of kept) {
    names.add(famKey(i.n));
    if (i.ml && i.ml.fam) families.add(i.ml.fam);
  }
  const queries = [];
  const cats = Object.keys(seeds);
  const maxLen = Math.max(0, ...cats.map(c => seeds[c].length));
  for (let k = 0; k < maxLen; k++) for (const c of cats) if (seeds[c][k]) queries.push({ c, q: seeds[c][k] });
  const cursor = Number(doc.pool && doc.pool.cursor) || 0;
  let qi = 0, pageLimit = 50;

  while (queries.length && stats.added < NEW_MAX && kept.length < POOL_MAX && qi < queries.length && !overTime()) {
    const idx = cursor + qi;
    const { c, q } = queries[idx % queries.length];
    const cycle = Math.floor(idx / queries.length);
    qi++;
    stats.queries++;
    let found = [];
    try {
      // cada vuelta completa a la lista de búsquedas mira resultados más profundos
      const offset = (cycle % 4) * 100;
      for (let page = 0; page < 2 && found.length < PER_QUERY * 3; page++) {
        await sleep(DELAY);
        const qs = new URLSearchParams({ status: 'active', site_id: SITE, q, limit: String(pageLimit), offset: String(offset + page * pageLimit) });
        let res;
        try { res = await getJson(`/products/search?${qs}`); } catch (e) {
          if (e instanceof ApiError && e.status === 400 && pageLimit > 30) { pageLimit = 30; page--; continue; }
          throw e;
        }
        found.push(...(res.results || []));
        if ((res.results || []).length < pageLimit) break;
      }
    } catch (e) {
      stats.errors++;
      if (e instanceof ApiError && (e.status === 401 || e.status === 403) && !kept.some(i => i.ml)) {
        console.error('Mercado Libre rechazó las consultas:', e.message);
        process.exit(1);
      }
      continue;
    }

    const cands = [];
    for (const prod of found) {
      if (byId.has(prod.id) || skip.has(prod.id)) continue;
      if (!isCandidate(prod)) { stats.rejected++; continue; }
      if (families.has(prod.parent_id || prod.id) || names.has(famKey(prod.name))) { stats.rejected++; continue; }
      cands.push(prod);
    }
    // Casi todos los productos del catálogo no tienen ofertas: se consultan de a varios a la vez.
    let taken = 0;
    for (let k = 0; k < cands.length && k < PER_QUERY * 5; k += CONC) {
      if (taken >= PER_QUERY || stats.added >= NEW_MAX || kept.length >= POOL_MAX || overTime()) break;
      const res = await Promise.all(cands.slice(k, k + CONC).map(async prod => {
        try { return { prod, offers: await offersOf(prod.id) }; } catch { return { prod, error: true }; }
      }));
      for (const { prod, offers, error } of res) {
        stats.candidates++;
        if (error) { stats.errors++; continue; }
        if (!offers) { skip.add(prod.id); stats.noOffers++; continue; }
        const fam = prod.parent_id || prod.id, nk = famKey(prod.name);
        if (families.has(fam) || names.has(nk)) { stats.rejected++; continue; }
        if (taken >= PER_QUERY || stats.added >= NEW_MAX) continue;
        const item = buildItem(prod, offers, c, now);
        if (!item) { skip.add(prod.id); stats.rejected++; continue; }
        kept.push(item);
        byId.set(item.id, item);
        families.add(fam); names.add(nk);
        stats.added++; taken++;
        perCat[c] = (perCat[c] || 0) + 1;
      }
    }
  }

  /* 3. tope del pool: se descartan los más viejos que no sean del catálogo ni estén en el plan */
  if (kept.length > POOL_MAX) {
    const removable = kept.filter(i => !curated.has(i.id) && !protectedIds.has(i.id))
      .sort((a, b) => (Date.parse(a.t || 0) || 0) - (Date.parse(b.t || 0) || 0));
    const drop = new Set(removable.slice(0, kept.length - POOL_MAX).map(i => i.id));
    stats.dropped += drop.size;
    kept = kept.filter(i => !drop.has(i.id));
  }

  /* 4. plan de los próximos días */
  const plan = extendPlan(doc.daily, kept, today, DAILY_DAYS);

  const skipIds = [...skip].slice(-20000);
  fs.writeFileSync(SKIP_FILE, JSON.stringify({ ids: skipIds }) + '\n');
  const out = {
    ...doc,
    updated: now.toISOString(),
    daily: plan,
    pool: { cursor: cursor + qi, queries: queries.length, size: kept.length },
    items: kept,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out) + '\n');

  const live = kept.filter(i => i.src === 'ml');
  const catCount = {};
  for (const i of live) catCount[i.c] = (catCount[i.c] || 0) + 1;
  const summary = [
    `## Pool de productos: ${kept.length} (${live.length} reales de Mercado Libre)`,
    '',
    `- Nuevos en esta corrida: **${stats.added}** (${stats.queries} búsquedas, ${stats.candidates} candidatos, ${stats.noOffers} sin ofertas, ${stats.rejected} descartados)`,
    `- Precios refrescados: ${stats.refreshed} · sin ofertas suficientes: ${stats.refreshFailed} · eliminados: ${stats.dropped} · errores de red: ${stats.errors}`,
    `- Búsquedas: posición ${out.pool.cursor} de ${queries.length} por vuelta · tiempo: ${Math.round((Date.now() - started) / 60000)} min${overTime() ? ' (se cortó por el límite de tiempo)' : ''}`,
    `- Plan diario: ${Object.keys(plan).filter(k => k >= today).length} días por adelantado (hoy: ${(plan[today] || []).map(id => byId.get(id)?.n).join(' · ')})`,
    '',
    '| Categoría | Productos |',
    '|---|---|',
    ...Object.entries(catCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`),
  ].join('\n');
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
