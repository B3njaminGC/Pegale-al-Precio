// Diagnóstico: prueba el catálogo de productos de Mercado Libre con las credenciales de la app.
const API = 'https://api.mercadolibre.com';
const id = process.env.ML_CLIENT_ID, secret = process.env.ML_CLIENT_SECRET;
const tr = await fetch(`${API}/oauth/token`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
});
const token = (await tr.json()).access_token;
const H = { authorization: `Bearer ${token}`, accept: 'application/json' };
async function get(p, n = 900) {
  const r = await fetch(API + p, { headers: H });
  const t = await r.text();
  console.log(`\n${r.status}  ${p}\n   ${t.replace(/\s+/g, ' ').slice(0, n)}`);
  try { return JSON.parse(t); } catch { return null; }
}
const s = await get('/products/search?status=active&site_id=MLA&q=iphone%2017%20256gb&limit=5', 1800);
for (const r of (s && s.results || []).slice(0, 2)) {
  await get(`/products/${r.id}`, 2500);
  await get(`/products/${r.id}/items?limit=3`, 900);
  await get(`/products/${r.id}/items`, 900);
  await get(`/sites/MLA/search?product_id=${r.id}&limit=3`, 400);
}
