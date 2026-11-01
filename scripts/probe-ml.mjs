// Diagnóstico: prueba qué partes de la API de Mercado Libre aceptan las credenciales de la app.
const API = 'https://api.mercadolibre.com';
const id = process.env.ML_CLIENT_ID, secret = process.env.ML_CLIENT_SECRET;
const tr = await fetch(`${API}/oauth/token`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
});
console.log('oauth/token ->', tr.status);
const token = (await tr.json()).access_token;
const H = { authorization: `Bearer ${token}`, accept: 'application/json' };
const tests = [
  '/sites/MLA/search?q=iphone%2017&limit=3',
  '/products/search?status=active&site_id=MLA&q=iphone%2017&limit=3',
  '/sites/MLA/domain_discovery/search?limit=3&q=iphone%2017',
  '/sites/MLA/category_predictor/predict?title=iphone%2017',
  '/categories/MLA1055',
  '/sites/MLA/categories',
  '/highlights/MLA/category/MLA1055',
  '/trends/MLA',
  '/items/MLA1234567890',
  '/items?ids=MLA1234567890,MLA1234567891',
  '/products/MLA19615230',
  '/products/MLA19615230/items',
];
for (const t of tests) {
  try {
    const r = await fetch(API + t, { headers: H });
    const body = (await r.text()).replace(/\s+/g, ' ').slice(0, 260);
    console.log(`\n${r.status}  ${t}\n   ${body}`);
  } catch (e) { console.log(`\nERR  ${t}  ${e.message}`); }
}
