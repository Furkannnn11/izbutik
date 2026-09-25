// TASK_e44d5515 / Adım 3 — Frontend (public/js/app.js) KIRMIZI testleri.
//
// Amaç: Adım 2'de KANITLANMIŞ frontend hataları (BUG-1, BUG-2, BUG-3) için
// ŞU AN başarısız olan (red) davranış testleri. Bu adımda app.js DÜZELTİLMEZ;
// testler beklenen DOĞRU davranışı kodlar ve mevcut kodun onu karşılamadığını
// gösterir. Adım 4'te app.js düzeltilince yeşile döner.
//
// Yöntem (Adım 2'nin kanıtlanmış harness'ı ile aynı, dependency-hafif):
//   - GERÇEK public/index.html + public/js/app.js jsdom içinde DEĞİŞTİRİLMEDEN yüklenir.
//   - window.fetch canlı BFF'ye (127.0.0.1:3001/api) köprülenir -> Medusa'ya kadar
//     gerçek zincir. Etkileşimler gerçek DOM click event'leriyle sürülür.
//   - İlk POST /cart'a yapay gecikme enjekte ederek ensureCart yarış penceresini
//     deterministik yaparız (BUG-2).
//
// ÖN KOŞUL: BFF 127.0.0.1:3001 ve Medusa 127.0.0.1:9000 çalışıyor olmalı
// (Adım 1'de başlatıldı). Servis yoksa testler before hook'unda net hata verir.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';

const WT = '/Users/furkanatmaca/workplace/.kirocrew-work/TASK_e44d5515';
const BFF = 'http://127.0.0.1:3001';
const CART_ID_KEY = 'izbutik_medusa_cart_id';

const html = fs.readFileSync(path.join(WT, 'public/index.html'), 'utf8');
const appjs = fs.readFileSync(path.join(WT, 'public/js/app.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test.before(async () => {
  const res = await fetch(BFF + '/api/health').catch(() => null);
  if (!res || !res.ok) {
    throw new Error(
      `Canlı BFF ${BFF} erişilemez. Adım 1 servisleri çalışıyor olmalı (npm start / storefront + medusa).`
    );
  }
});

// Her senaryo için taze DOM+app örneği kur (Adım 2 harness ile aynı polyfill seti).
async function boot({ seedCartId, slowFirstCartPost } = {}) {
  const netlog = [];
  const toasts = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});

  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: BFF + '/',
    virtualConsole: vc,
  });
  const { window } = dom;

  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  window.matchMedia = window.matchMedia || ((q) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }));
  window.requestAnimationFrame = window.requestAnimationFrame || ((cb) => setTimeout(() => cb(Date.now()), 0));
  window.cancelAnimationFrame = window.cancelAnimationFrame || ((id) => clearTimeout(id));
  window.scrollTo = window.scrollTo || (() => {});
  if (window.Element && !window.Element.prototype.scrollIntoView) window.Element.prototype.scrollIntoView = function () {};
  if (window.Element && !window.Element.prototype.animate) {
    window.Element.prototype.animate = function () { return { cancel() {}, finish() {}, onfinish: null, play() {}, pause() {} }; };
  }

  // jsdom (runScripts:'outside-only') window'una Fetch API sınıflarını Node global'lerinden
  // köprüle. FE-BUG3b senaryosu `new window.Response(...)` ile stale-404 enjekte eder;
  // jsdom bu constructor'ı sağlamadığından Node'un global'ini kullanırız.
  if (!window.Response && typeof Response !== 'undefined') window.Response = Response;
  if (!window.Headers && typeof Headers !== 'undefined') window.Headers = Headers;
  if (!window.Request && typeof Request !== 'undefined') window.Request = Request;

  if (seedCartId) window.localStorage.setItem(CART_ID_KEY, seedCartId);

  let firstCartPostSeen = false;
  window.fetch = async (input, init = {}) => {
    const url = String(input);
    const abs = url.startsWith('http') ? url : BFF + url;
    if (slowFirstCartPost && /\/cart$/.test(url) && (init.method || 'GET') === 'POST' && !firstCartPostSeen) {
      firstCartPostSeen = true;
      await sleep(slowFirstCartPost);
    }
    const t0 = Date.now();
    const res = await fetch(abs, init);
    const dt = Date.now() - t0;
    netlog.push({ url: url.replace(BFF, ''), method: init.method || 'GET', status: res.status, ms: dt, ok: res.ok });
    return res;
  };

  // toast'ları görünür değişiklik yapmadan yakala.
  const shimmed = appjs.replace(
    'function toast(',
    'function toast(_m){ try{ window.__captureToast(_m);}catch(e){} return __realToast(_m);} function __realToast('
  );
  window.__captureToast = (m) => toasts.push(m);
  window.eval(shimmed);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

  for (let i = 0; i < 60; i++) {
    if (window.document.querySelectorAll('#productGrid [data-add]').length) break;
    await sleep(100);
  }
  return { window, netlog, toasts };
}

const ls = (window, k) => window.localStorage.getItem(k);

// -------------------------------------------------------------------
// BUG-1 (P1): Ürün detayında addToCart await edilmiyor.
// DOĞRU davranış: "Sepete Ekle" tıklandığında ekleme isteği SETTLE OLMADAN
// modal kapanmamalı / sepet açılmamalı. Şu an handler senkron -> KIRMIZI.
test('FE-BUG1: ürün detayı "Sepete Ekle" isteği bitmeden modal kapanmaz / sepet açılmaz', async () => {
  const { window, netlog } = await boot();
  const quick = window.document.querySelector('#productGrid [data-quickview]');
  assert.ok(quick, 'en az bir ürün kartı render olmalı');
  quick.dispatchEvent(new window.Event('click', { bubbles: true }));

  let pdAdd = null;
  for (let i = 0; i < 40; i++) { pdAdd = window.document.querySelector('#pdAdd'); if (pdAdd) break; await sleep(50); }
  assert.ok(pdAdd, 'ürün detay modalı ve #pdAdd butonu açılmalı');

  const modal = window.document.querySelector('#productModal');
  const cart = window.document.querySelector('#cart');
  const nb = netlog.length;

  pdAdd.dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(0); // handler dönüşünün hemen ardından ölç

  const addSettled = netlog.slice(nb).some((n) => /\/items$/.test(n.url) && n.method === 'POST' && n.ok);
  const cartOpened = cart.classList.contains('open');
  const modalClosed = !modal.classList.contains('open');

  // DOĞRU sözleşme: istek settle olmadan UI değişmemeli.
  // Eğer istek daha bitmemişken sepet açıldıysa VEYA modal kapandıysa -> hata.
  assert.ok(
    addSettled || (!cartOpened && !modalClosed),
    'ekleme isteği settle olmadan sepet açıldı/modal kapandı (BUG-1: addToCart await edilmiyor)'
  );
  await sleep(1200); // pending istekleri drenaj
});

// -------------------------------------------------------------------
// BUG-2 (P0): ensureCart yarışı -> hızlı çift tık birden çok Medusa sepeti yaratıyor.
// DOĞRU davranış: tek çift-tık YALNIZ 1 adet POST /cart yapmalı.
test('FE-BUG2: hızlı çift tıklama yalnız TEK sepet oluşturur (ensureCart tek-uçuş)', async () => {
  const { window, netlog } = await boot({ slowFirstCartPost: 300 });
  window.localStorage.removeItem(CART_ID_KEY);
  const addBtn = window.document.querySelector('#productGrid [data-add]');
  assert.ok(addBtn, 'hızlı ekleme butonu olmalı');

  const nb = netlog.length;
  addBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  addBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(2000);

  const seg = netlog.slice(nb);
  const cartCreates = seg.filter((n) => /(^|\/)cart$/.test(n.url) && n.method === 'POST').length;
  const distinctCartIds = new Set(
    seg.map((n) => (n.url.match(/cart_[A-Z0-9]+/) || [])[0]).filter(Boolean)
  );

  assert.equal(
    cartCreates, 1,
    `hızlı çift tık ${cartCreates} POST /cart yaptı (beklenen 1). ensureCart kilitsiz -> ${distinctCartIds.size} ayrı sepet; eklemeler orphan olur (BUG-2 P0)`
  );
});

// -------------------------------------------------------------------
// BUG-3 besleyen: ekleme isteği uçarken buton disabled/loading olmalı.
test('FE-BUG3a: ekleme isteği sürerken "Sepete Ekle" butonu disabled olur', async () => {
  const { window } = await boot({ slowFirstCartPost: 250 });
  window.localStorage.removeItem(CART_ID_KEY);
  const addBtn = window.document.querySelector('#productGrid [data-add]');
  addBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(30); // istek hâlâ uçuyor (gecikme 250ms)
  const disabledDuring = addBtn.disabled || addBtn.getAttribute('aria-busy') === 'true' || addBtn.classList.contains('loading');
  await sleep(1500);
  assert.ok(
    disabledDuring,
    'istek uçarken buton disabled/loading olmalı; şu an değil (tekrar tık yarışı besleniyor, BUG-2/BUG-3)'
  );
});

// -------------------------------------------------------------------
// BUG-3 (P2): runtime'da geçersizleşen cart id yenilenmiyor.
// DOĞRU davranış: state.cartId set + upstream 404 -> yeni sepet oluştur, isteği
// bir kez retry et, ekleme başarıyla tamamlansın; ham "Cart id not found" toast'ı DÜŞMESİN.
test('FE-BUG3b: runtime stale cart id ekleme sırasında otomatik yenilenir ve retry başarılı olur', async () => {
  // Önce gerçek bir sepet kur ki state.cartId dolsun, sonra onu geçersiz kılalım.
  const stale = 'cart_00000000000000000000000000';
  const { window, netlog, toasts } = await boot();
  window.localStorage.removeItem(CART_ID_KEY);

  // İlk ekleme -> gerçek sepet oluşur (state.cartId dolar).
  const addBtn = window.document.querySelector('#productGrid [data-add]');
  addBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(1500);
  const realCartId = ls(window, CART_ID_KEY);
  assert.ok(realCartId && realCartId.startsWith('cart_'), 'ilk ekleme gerçek sepet oluşturmalı');

  // Şimdi cart id'yi RUNTIME'da geçersiz kıl (sepet tamamlandı/silindi senaryosu):
  // fetch köprüsünü, bu sepete giden items POST'una upstream 404 döndürecek şekilde
  // sarmalayarak stale durumu deterministik simüle et. app.js buna nasıl tepki verecek?
  const originalFetch = window.fetch;
  let injected404Once = false;
  window.fetch = async (input, init = {}) => {
    const url = String(input);
    if (!injected404Once && /\/items$/.test(url) && (init.method || 'GET') === 'POST') {
      injected404Once = true;
      netlog.push({ url: url.replace(BFF, ''), method: 'POST', status: 404, ms: 0, ok: false, injected: true });
      // 404 gövdesini gerçek Medusa hata şekliyle döndür.
      return new window.Response(
        JSON.stringify({ error: 'Cart id not found', detail: 'Cart id not found' }),
        { status: 404, headers: { 'content-type': 'application/json' } }
      );
    }
    return originalFetch(input, init);
  };

  const toastBefore = toasts.length;
  const nb = netlog.length;
  // Tekrar ekle: ilk items POST 404 (stale), doğru kod yeni sepet açıp retry etmeli.
  addBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(2500);

  const seg = netlog.slice(nb);
  const createdNewCart = seg.some((n) => /(^|\/)cart$/.test(n.url) && n.method === 'POST');
  const retriedItemsOk = seg.some((n) => /\/items$/.test(n.url) && n.method === 'POST' && n.ok);
  const newToasts = toasts.slice(toastBefore);
  const rawErrorToast = newToasts.some((m) => /not found|Sepet hatası|Cart id/i.test(m));

  assert.ok(
    createdNewCart && retriedItemsOk,
    'stale 404 sonrası yeni sepet oluşturulup ekleme retry edilmeli (BUG-3: runtime yenileme yok)'
  );
  assert.ok(
    !rawErrorToast,
    'stale kurtarma sırasında ham teknik hata toast\'ı gösterilmemeli (BUG-3)'
  );
});
