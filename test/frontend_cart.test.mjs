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

// Aktif proje kökü (eski görev worktree'si değil)
const WT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
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
// BUG-1 (P1): Ürün detayında addToCart await edilmeli.
// Ürün artık gerçek sayfada (/urun/:slug) açılıyor; "Sepete Ekle" isteği
// SETTLE OLMADAN sepet çekmecesi açılmamalı.
test('FE-BUG1: ürün sayfası açılır ve "Sepete Ekle" isteği bitmeden sepet açılmaz', async () => {
  const { window, netlog } = await boot();
  const quick = window.document.querySelector('#productGrid [data-quickview]');
  assert.ok(quick, 'en az bir ürün kartı render olmalı');
  const slug = quick.dataset.quickview;
  quick.dispatchEvent(new window.Event('click', { bubbles: true }));

  let pdAdd = null;
  for (let i = 0; i < 40; i++) { pdAdd = window.document.querySelector('#pageView #pdAdd'); if (pdAdd) break; await sleep(50); }
  assert.ok(pdAdd, 'ürün sayfası ve #pdAdd butonu açılmalı');
  assert.equal(window.location.pathname, '/urun/' + encodeURIComponent(slug), 'URL ürün sayfasına geçmeli');
  assert.equal(window.document.querySelector('#homeView').hidden, true, 'ana sayfa gizlenmeli');

  const cart = window.document.querySelector('#cart');
  const nb = netlog.length;
  pdAdd.dispatchEvent(new window.Event('click', { bubbles: true }));
  await sleep(0); // handler dönüşünün hemen ardından ölç

  const addSettled = netlog.slice(nb).some((n) => /\/items$/.test(n.url) && n.method === 'POST' && n.ok);
  assert.ok(addSettled || !cart.classList.contains('open'),
    'ekleme isteği settle olmadan sepet açıldı (BUG-1: addToCart await edilmiyor)');
  await sleep(1200); // pending istekleri drenaj
});

// Gerçek sayfalar: kategori URL'si, geri tuşu ve doğrudan ürün linki
test('ROUTE: kategori sayfası açılır ve geri tuşu ana sayfaya döner', async () => {
  const { window } = await boot();
  const catLink = window.document.querySelector('#categoryGrid a.cat-card');
  assert.ok(catLink, 'kategori kartı link olmalı');
  catLink.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  await sleep(50);
  assert.match(window.location.pathname, /^\/kategori\//, 'URL kategori sayfasına geçmeli');
  assert.ok(window.document.querySelector('#pageView h1'), 'kategori başlığı olmalı');
  assert.ok(window.document.querySelectorAll('#pageView .product-card').length > 0, 'kategori ürünleri listelenmeli');

  window.history.back();
  for (let i = 0; i < 40 && window.location.pathname !== '/'; i++) await sleep(25);
  await sleep(50);
  assert.equal(window.location.pathname, '/', 'geri tuşu ana sayfaya dönmeli');
  assert.equal(window.document.querySelector('#homeView').hidden, false, 'ana sayfa görünmeli');
});

// -------------------------------------------------------------------
// Sepet (/sepet) ve sipariş (/odeme) ayrı sayfalar
test('ROUTE: ürün eklenince /sepet sayfası satırı gösterir, /odeme formu açılır', async () => {
  const { window } = await boot();
  const addBtn = window.document.querySelector('#productGrid [data-add]');
  addBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  for (let i = 0; i < 60 && !window.document.querySelector('#cartBody .cart-item'); i++) await sleep(50);
  assert.ok(window.document.querySelector('#cartBody .cart-item'), 'çekmecede ürün olmalı');

  const goCart = window.document.querySelector('#cartPageBtn');
  goCart.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  await sleep(50);
  assert.equal(window.location.pathname, '/sepet');
  assert.equal(window.document.title, 'Sepetim · İzbutik');
  assert.ok(window.document.querySelectorAll('#pageView .cart-item--page').length >= 1, 'sepet sayfasında satır olmalı');
  assert.equal(window.document.querySelector('#cart').classList.contains('open'), false, 'çekmece kapanmalı');

  const toCheckout = window.document.querySelector('#pageView a[href="/odeme"]');
  toCheckout.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  await sleep(50);
  assert.equal(window.location.pathname, '/odeme');
  assert.ok(window.document.querySelector('#pageView #checkoutForm input[name="email"]'), 'sipariş formu olmalı');
  assert.ok(window.document.querySelector('#checkoutSummary .row--total'), 'sipariş özeti olmalı');

  // Satırı kaldırınca ödeme sayfası boş-sepet durumuna geçer (sipariş oluşturulmaz)
  const key = window.document.querySelector('#cartBody [data-remove]').dataset.remove;
  window.document.querySelector(`#cartBody [data-remove="${key}"]`).dispatchEvent(new window.Event('click', { bubbles: true }));
  for (let i = 0; i < 60 && window.document.querySelector('#checkoutForm'); i++) await sleep(50);
  assert.equal(window.document.querySelector('#checkoutForm'), null, 'boş sepette form gösterilmemeli');

  window.history.back();
  for (let i = 0; i < 40 && window.location.pathname !== '/sepet'; i++) await sleep(25);
  assert.equal(window.location.pathname, '/sepet', 'geri tuşu sepete dönmeli');
});

// -------------------------------------------------------------------
// Ödeme sayfası kargo seçimi ve ürün sayfası paylaş düğmesi
test('CHECKOUT: kargo seçenekleri listelenir, seçim toplamı günceller', async () => {
  const { window } = await boot();
  const addBtn = window.document.querySelector('#productGrid [data-add]');
  addBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  for (let i = 0; i < 60 && !window.document.querySelector('#cartBody .cart-item'); i++) await sleep(50);
  window.history.pushState({}, '', '/odeme');
  window.dispatchEvent(new window.PopStateEvent('popstate'));
  let radios = [];
  for (let i = 0; i < 80; i++) {
    radios = [...window.document.querySelectorAll('#shipOpts input[name="shipping_option"]')];
    if (radios.length) break;
    await sleep(50);
  }
  assert.ok(radios.length >= 2, 'en az iki kargo seçeneği listelenmeli');
  assert.equal(radios.filter((r) => r.checked).length, 1, 'varsayılan olarak tek seçenek seçili olmalı');
  const btn = window.document.querySelector('#placeOrder');
  assert.equal(btn.disabled, false, 'kargo yüklenince gönder düğmesi aktif olmalı');
  const before = btn.textContent;

  const other = radios.find((r) => !r.checked);
  other.checked = true;
  other.dispatchEvent(new window.Event('change', { bubbles: true }));
  await sleep(20);
  const after = window.document.querySelector('#placeOrder').textContent;
  assert.notEqual(after, before, 'farklı kargo seçilince toplam değişmeli');
  assert.match(window.document.querySelector('#checkoutSummary').textContent, /Kargo/, 'özette kargo satırı olmalı');
  assert.ok(window.document.querySelector('#shipOpts input:checked').value === other.value, 'seçim korunmalı');
});

test('SHARE: ürün sayfasında paylaş düğmesi linki kopyalar (Web Share yoksa)', async () => {
  const { window, toasts } = await boot();
  let copied = null;
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: async (t) => { copied = t; } }, configurable: true });
  const quick = window.document.querySelector('#productGrid [data-quickview]');
  const slug = quick.dataset.quickview;
  quick.dispatchEvent(new window.Event('click', { bubbles: true }));
  let share = null;
  for (let i = 0; i < 40 && !(share = window.document.querySelector('#pageView #pdShare')); i++) await sleep(50);
  assert.ok(share, 'paylaş düğmesi olmalı');
  const wa = window.document.querySelector('#pdShareWa');
  assert.match(wa.href, /^https:\/\/wa\.me\/\?text=/, 'WhatsApp linki olmalı');
  share.dispatchEvent(new window.Event('click', { bubbles: true }));
  for (let i = 0; i < 20 && !copied; i++) await sleep(25);
  await sleep(10); // kopyalama sonrası toast
  assert.equal(copied, BFF + '/urun/' + encodeURIComponent(slug), 'ürünün tam linki kopyalanmalı');
  assert.ok(toasts.some((t) => /kopyalandı/.test(t)), 'kullanıcıya bildirim gösterilmeli');
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
