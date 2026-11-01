#!/usr/bin/env node
/*
 * Arma data/products.json con publicaciones reales de Mercado Libre Argentina.
 *
 *   node scripts/fetch-products.mjs          consulta la API y actualiza el archivo
 *   node scripts/fetch-products.mjs --seed   arma el archivo con los precios estimados del catálogo (sin red)
 *
 * Variables de entorno (todas opcionales):
 *   ML_CLIENT_ID, ML_CLIENT_SECRET   credenciales de la app en developers.mercadolibre.com.ar
 *   ML_API_BASE                      para pruebas (por defecto https://api.mercadolibre.com)
 *   PRODUCTS_OUT                     archivo de salida (por defecto data/products.json)
 *   DELAY_MS                         pausa entre pedidos (por defecto 250)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = (process.env.ML_API_BASE || 'https://api.mercadolibre.com').replace(/\/$/, '');
const SITE = 'MLA';
const OUT = process.env.PRODUCTS_OUT || path.join(ROOT, 'data/products.json');
const DELAY = Number(process.env.DELAY_MS ?? 250);
const MIN_CANDIDATES = 3;
const SEED = process.argv.includes('--seed');

const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/catalog.json'), 'utf8'));

/* ---------- utilidades ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function tokens(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean);
}

export function expandNot(list) {
  const out = [];
  for (const t of list || []) {
    if (t.startsWith('@')) out.push(...(catalog.groups[t.slice(1)] || []));
    else out.push(t);
  }
  return out;
}

export function passes(entry, listing) {
  const tk = tokens(listing.title);
  if (!entry.must.every(m => tk.some(t => t.startsWith(m)))) return false;
  if (expandNot(entry.not).some(n => tk.includes(n))) return false;
  if (listing.currency_id && listing.currency_id !== 'ARS') return false;
  return Number.isFinite(listing.price) && listing.price >= entry.lo && listing.price <= entry.hi;
}

export function pickMedian(candidates) {
  const sorted = [...candidates].sort((a, b) => a.price - b.price);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

const https = u => (u ? String(u).replace(/^http:\/\//, 'https://') : u);

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
  const url = API + pathAndQuery;
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await sleep(DELAY + 1000 * 2 ** (attempt - 1));
    try {
      const res = await fetch(url, {
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

/* ---------- salida ---------- */
function loadPrevious() {
  try {
    const j = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    return new Map((j.items || []).map(i => [i.id, i]));
  } catch { return new Map(); }
}

function estimated(entry) {
  return { id: entry.id, n: entry.n, c: entry.c, s: entry.s, p: entry.est, src: 'estimado' };
}

function write(items) {
  const doc = {
    version: 1,
    updated: new Date().toISOString(),
    site: SITE,
    source: SEED ? 'estimado' : 'api.mercadolibre.com',
    items,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n');
}

/* ---------- búsqueda de un producto ---------- */
// La búsqueda abierta (/sites/MLA/search) está cerrada a apps de terceros. Se usa el catálogo de productos:
// /products/search encuentra los productos, /products/{id}/items trae las ofertas con su precio en pesos.
const pictureOf = p => {
  const pic = (p && p.pictures || [])[0];
  return https(pic && (pic.secure_url || pic.url)) || null;
};

async function resolve(entry) {
  const qs = new URLSearchParams({ status: 'active', site_id: SITE, q: entry.q, limit: '20' });
  const search = await getJson(`/products/search?${qs}`);
  const results = search.results || [];
  // el nombre del producto tiene que tener las palabras pedidas y ninguna prohibida
  const prods = results.filter(r => passes(entry, { title: r.name || '', price: entry.est, currency_id: 'ARS' })).slice(0, 3);

  const offers = [];
  let rawOffers = 0;
  for (const p of prods) {
    await sleep(DELAY);
    let list;
    try {
      list = (await getJson(`/products/${p.id}/items?limit=50`)).results || [];
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 400)) continue; // producto sin ofertas
      throw e;
    }
    rawOffers += list.length;
    for (const o of list) {
      if (o.condition && o.condition !== 'new') continue;
      if (!passes(entry, { title: p.name, price: o.price, currency_id: o.currency_id })) continue;
      offers.push({ ...o, product: p });
    }
  }
  if (offers.length < MIN_CANDIDATES) {
    const names = results.slice(0, 6).map(r => String(r.name || '').slice(0, 45)).join(' / ');
    const precios = prods.length && !rawOffers ? ', sin ofertas' : '';
    throw new Error(`solo ${offers.length} publicaciones sirven de ${results.length} productos encontrados (${prods.length} con nombre válido, ${rawOffers} ofertas${precios}). Primeros: ${names}`);
  }
  const chosen = pickMedian(offers);

  let img = pictureOf(chosen.product);
  if (!img) {
    try { await sleep(DELAY); img = pictureOf(await getJson(`/products/${chosen.product.id}`)); } catch { /* sin foto */ }
  }
  let link = `https://articulo.mercadolibre.com.ar/MLA-${String(chosen.item_id).replace(/\D/g, '')}`;
  try {
    await sleep(DELAY);
    const d = await getJson(`/items/${chosen.item_id}?attributes=id,permalink`);
    if (d.permalink) link = d.permalink;
  } catch { /* queda el link armado con el número de la publicación */ }

  return {
    item: {
      id: entry.id, n: entry.n, c: entry.c, s: entry.s,
      p: Math.round(chosen.price), link: https(link), img: img || undefined,
      ml: { id: chosen.item_id, title: chosen.product.name }, src: 'ml', t: new Date().toISOString(),
    },
    found: results.length,
    used: offers.length,
  };
}

/* ---------- principal ---------- */
async function main() {
  if (SEED) {
    write(catalog.items.map(estimated));
    console.log(`Archivo base escrito con ${catalog.items.length} productos estimados: ${OUT}`);
    return;
  }

  token = await getToken().catch(e => { console.warn('No se pudo obtener el token:', e.message); return null; });
  console.log(token ? 'Consultando con token de la app.' : 'Consultando sin credenciales.');

  const prev = loadPrevious();
  const items = [], rows = [], failures = [];
  let fresh = 0;

  for (const entry of catalog.items) {
    try {
      const r = await resolve(entry);
      items.push(r.item);
      fresh++;
      rows.push(`| ${entry.n} | $ ${r.item.p.toLocaleString('es-AR')} | ${r.item.img ? 'sí' : 'no'} | ${r.used}/${r.found} | [${r.item.ml.title.slice(0, 60).replace(/\|/g, '/')}](${r.item.link}) |`);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403) && fresh === 0 && items.length === 0) {
        console.error(`\nMercado Libre rechazó la consulta (${e.status}). Si no cargaste credenciales, hacelo (ver README).\n${e.message}`);
        process.exit(1);
      }
      failures.push(`${entry.n}: ${e.message}`);
      const old = prev.get(entry.id);
      items.push(old ? { ...old, n: entry.n, c: entry.c, s: entry.s } : estimated(entry));
      rows.push(`| ${entry.n} | ${old ? `$ ${old.p.toLocaleString('es-AR')} (anterior)` : 'estimado'} | ${old?.img ? 'sí' : 'no'} | - | sin cambios |`);
    }
    await sleep(DELAY);
  }

  if (fresh === 0) {
    console.error('No se pudo actualizar ningún producto. No se modifica el archivo.\n' + failures.join('\n'));
    process.exit(1);
  }

  write(items);

  const summary = [
    `## Productos actualizados: ${fresh} de ${catalog.items.length}`,
    '',
    '| Producto | Precio | Foto | Ofertas válidas / productos | Publicación elegida |',
    '|---|---|---|---|---|',
    ...rows,
    '',
    failures.length ? '### No se pudieron actualizar\n\n' + failures.map(f => `- ${f}`).join('\n') : '',
  ].join('\n');
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
