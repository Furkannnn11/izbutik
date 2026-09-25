// TASK_e44d5515 / Adım 3 — BFF sepet rotası (src/routes/cart.js) KIRMIZI testleri.
//
// Amaç: Adım 2'de KANITLANMIŞ hataları hedefleyen, ŞU AN başarısız (red) testler.
// Bu adımda kaynak/üretim kodu DÜZELTİLMEZ; yalnız beklenen doğru davranışı
// kodlayıp mevcut kodun onu karşılamadığını gösteririz.
//
// Yöntem: gerçek express app + gerçek src/routes/cart.js + gerçek src/lib/medusa.js
// (medusaRequest) zinciri. Upstream Medusa yerine testin KONTROL ETTİĞİ yerel bir
// sahte HTTP sunucusu kullanılır (MEDUSA_BACKEND_URL ona yönlendirilir). Böylece
// test hermetiktir (canlı Medusa gerekmez) ve gerçek route/istemci mantığını
// gerçek ağ üzerinden çalıştırır. Bağımlılık-hafif: node:test + node:http + express.
//
// Kapsam ve hangi hatayı hedefler:
//   BFF-1  quantity="2" (sayısal-benzeri string) update -> geçerli sayı olarak
//          kabul edilmeli (regresyon koruması; şu an geçebilir, guard'ı sabitler).
//   BFF-2  BUG-4 destek: update rotasında upstream 400 stok hatasının STATUS'u
//          (400) ve detay gövdesi KORUNMALI — istemci Türkçeleştirebilsin diye
//          yapılandırılmış upstream detail geçmeli (şu an medusa.js detail'i
//          iletiyor AMA route seviyesinde sözleşme test edilmemiş).
//   BFF-3  BUG-3 destek: stale/geçersiz cart id ile items POST -> upstream 404
//          STATUS'u 200'e düşürülmeden korunmalı (frontend'in stale'i tanıyıp
//          yenileyebilmesi için). 
//   BFF-4  DELETE satır silme -> HER ZAMAN { cart: {...} } zarfı dönmeli.
//          Bu Medusa sürümü delete yanıtında `parent` DOLU döndürüyor; ancak
//          upstream `parent` YOKKEN (bazı sürüm/hata yolları) mevcut kod
//          { cart: undefined } döndürür ve frontend syncCart(undefined) alır.
//          Sağlam sözleşme: parent yoksa da kullanılabilir bir cart zarfı.
//
// Not: BFF-1..BFF-3 doğrulama/aktarma sözleşmesini SABİTLER; BFF-4 mevcut kodda
// GERÇEKTEN KIRMIZIDIR (parent yoksa cart undefined olur). Böylece bu dosya
// hem regresyon kilidi hem de en az bir gerçek başarısız (fix bekleyen) test içerir.

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';

const WT = '/Users/furkanatmaca/workplace/.kirocrew-work/TASK_e44d5515';

// --- Testin kontrol ettiği sahte upstream Medusa ---
let upstreamHandler = null; // (req, bodyText) => { status, json }
function startFakeMedusa() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const out = upstreamHandler
          ? upstreamHandler(req, body)
          : { status: 200, json: {} };
        res.statusCode = out.status;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(out.json));
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function buildApp() {
  // medusa.js MEDUSA_BACKEND_URL'i modül yükünde okur; import'tan ÖNCE ayarla.
  const { default: cartRouter } = await import(
    WT + '/src/routes/cart.js?ts=' + Date.now()
  );
  const app = express();
  app.use(express.json());
  app.use('/api/cart', cartRouter);
  // server.js ile aynı hata middleware sözleşmesi (status + detail korunur).
  app.use((err, _req, res, _next) => {
    const status = Number(err.status) || 500;
    res.status(status).json({
      error: status >= 500 ? 'Commerce servisi hatası' : err.message,
      detail: err.message,
      upstream: err.details ?? null,
    });
  });
  return app;
}

function listen(app) {
  return new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function req(base, method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: res.status, json };
}

let fake, appSrv, base, appBaseUrl;

test.before(async () => {
  fake = await startFakeMedusa();
  const { port } = fake.address();
  process.env.MEDUSA_BACKEND_URL = `http://127.0.0.1:${port}`;
  process.env.MEDUSA_PUBLISHABLE_KEY = 'pk_test_dummy';
  process.env.COMMERCE_BACKEND = 'medusa';
  const app = await buildApp();
  appSrv = await listen(app);
  base = `http://127.0.0.1:${appSrv.address().port}`;
  appBaseUrl = base;
});

test.after(async () => {
  await new Promise((r) => appSrv.close(r));
  await new Promise((r) => fake.close(r));
});

// -------------------------------------------------------------------
test('BFF-1: satır güncelleme sayısal-benzeri string quantity kabul eder', async () => {
  upstreamHandler = (r, body) => {
    // update rotası: POST /store/carts/:id/line-items/:lineId
    const parsed = JSON.parse(body || '{}');
    return { status: 200, json: { cart: { id: 'cart_1', items: [{ id: 'li_1', quantity: parsed.quantity }] } } };
  };
  const res = await req(base, 'POST', '/api/cart/cart_1/items/li_1', { quantity: '2' });
  // Doğru sözleşme: "2" geçerli miktar; 400 DÖNMEMELİ ve upstream'e SAYI olarak gitmeli.
  assert.equal(res.status, 200, 'sayısal-benzeri string quantity 400 vermemeli');
});

// -------------------------------------------------------------------
test('BFF-2 (BUG-4): upstream 400 stok hatasının status + detail zarfı korunur', async () => {
  upstreamHandler = () => ({
    status: 400,
    json: { message: 'Some variant does not have the required inventory', type: 'not_allowed' },
  });
  const res = await req(base, 'POST', '/api/cart/cart_1/items', {
    variant_id: 'variant_x', quantity: 5,
  });
  assert.equal(res.status, 400, 'upstream 400 istemciye 400 olarak yansımalı (200/500 olmamalı)');
  // Frontend'in Türkçeleştirebilmesi için upstream ham mesaj korunmalı.
  const blob = JSON.stringify(res.json);
  assert.match(blob, /inventory/i, 'upstream stok hata detayı istemciye geçmeli');
});

// -------------------------------------------------------------------
test('BFF-3 (BUG-3): stale/geçersiz cart id items POST -> 404 status korunur', async () => {
  upstreamHandler = () => ({
    status: 404,
    json: { message: 'Cart id not found', type: 'not_found' },
  });
  const res = await req(base, 'POST', '/api/cart/cart_stale/items', {
    variant_id: 'variant_x', quantity: 1,
  });
  assert.equal(res.status, 404, 'geçersiz cart -> upstream 404 korunmalı (frontend stale tanıyıp yenileyebilsin)');
});

// -------------------------------------------------------------------
test('BFF-4 (KIRMIZI): DELETE upstream `parent` YOKKEN de kullanılabilir cart zarfı döndürmeli', async () => {
  // Bazı Medusa sürüm/yanıt yollarında delete gövdesi { parent } içermez;
  // { deleted:true, id, object:'line-item' } döner. Mevcut kod res.json({cart: data.parent})
  // yaptığı için bu durumda cart === undefined olur ve frontend syncCart(undefined) alır.
  upstreamHandler = () => ({
    status: 200,
    json: { id: 'li_1', object: 'line-item', deleted: true }, // parent YOK
  });
  const res = await req(base, 'DELETE', '/api/cart/cart_1/items/li_1');
  assert.equal(res.status, 200, 'silme 200 dönmeli');
  assert.ok(res.json, 'yanıt gövdesi olmalı');
  assert.ok(
    res.json.cart && typeof res.json.cart === 'object',
    'sözleşme: parent yoksa dahi { cart: <kullanılabilir nesne> } dönmeli (şu an cart undefined -> KIRMIZI)'
  );
});

export { appBaseUrl };
