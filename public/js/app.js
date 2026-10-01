/* ============================================================
   İzbutik — Frontend uygulama mantığı
   ============================================================ */
(() => {
  'use strict';

  const API = '/api';
  const FALLBACK_IMG =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="100%" height="100%" fill="#f3ebe2"/><text x="50%" y="50%" font-family="serif" font-size="42" fill="#c2607f" text-anchor="middle" dominant-baseline="middle">İzbutik</text></svg>`
    );

  const CART_ID_KEY = 'izbutik_medusa_cart_id';

  // ---- Durum ----
  const state = {
    products: [],
    categories: [],
    filter: { category: 'all', search: '', sort: 'featured' },
    cart: loadCart(),
    cartId: localStorage.getItem(CART_ID_KEY),
  };

  // ---- Yardımcılar ----
  const $ = (s, ctx = document) => ctx.querySelector(s);
  const $$ = (s, ctx = document) => [...ctx.querySelectorAll(s)];
  const fmt = (n) =>
    new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n)) + ' ₺';
  const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const imgErr = `this.onerror=null;this.src='${FALLBACK_IMG}'`;

  function loadCart() {
    try { return JSON.parse(localStorage.getItem('izbutik_cart')) || []; }
    catch { return []; }
  }
  function saveCart() { localStorage.setItem('izbutik_cart', JSON.stringify(state.cart)); }

  async function api(path, options = {}) {
    const request = { ...options };
    if (request.body && typeof request.body !== 'string') {
      request.headers = { 'Content-Type': 'application/json', ...(request.headers || {}) };
      request.body = JSON.stringify(request.body);
    }
    const res = await fetch(API + path, request);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || data.detail || 'İstek başarısız: ' + path);
      err.status = res.status;
      err.detail = data.detail || data.error || '';
      throw err;
    }
    return data;
  }

  // Backend/teknik hata mesajlarını kullanıcıya açık Türkçe metne çevir (BUG-4).
  function friendlyCartError(err) {
    const raw = String((err && (err.detail || err.message)) || '');
    if (/required inventory|not have the required|insufficient|out of stock/i.test(raw)) {
      return 'Seçtiğin beden için stokta yeterli adet yok.';
    }
    if (/cart id not found|not found/i.test(raw)) {
      return 'Sepetin güncellenemedi, lütfen tekrar dener misin?';
    }
    if (/variant_id/i.test(raw)) {
      return 'Lütfen bir beden seç.';
    }
    return 'Sepet işlemi tamamlanamadı, lütfen tekrar dene.';
  }

  // Bir hatanın "sepet artık geçersiz" anlamına gelip gelmediğini belirle (BUG-3).
  function isStaleCartError(err) {
    if (!err) return false;
    if (err.status === 404 || err.status === 409) return true;
    return /cart id not found|not found/i.test(String(err.detail || err.message || ''));
  }

  function syncCart(cart) {
    if (!cart) return;
    state.cartId = cart.id;
    localStorage.setItem(CART_ID_KEY, cart.id);
    state.cart = (cart.items || []).map((item) => ({
      key: item.id,
      line_id: item.id,
      variant_id: item.variant_id,
      slug: item.product_handle || null,
      id: item.product_id,
      name: item.product_title || item.title,
      price: Number(item.unit_price || 0),
      image: item.thumbnail || FALLBACK_IMG,
      size: item.variant_title || item.variant?.title || 'STD',
      quantity: Number(item.quantity || 1),
    }));
    saveCart();
    updateCartUI();
  }

  // ensureCart TEK-UÇUŞ (single-flight): state.cartId null iken eşzamanlı çağrılar
  // TEK bir POST /cart paylaşır; aksi halde hızlı çift tık birden çok sepet yaratır
  // ve eklemeler orphan olurdu (BUG-2 P0).
  let _cartCreatePromise = null;
  async function ensureCart(forceNew = false) {
    if (forceNew) {
      state.cartId = null;
      localStorage.removeItem(CART_ID_KEY);
      _cartCreatePromise = null;
    }
    if (state.cartId) return state.cartId;
    if (!_cartCreatePromise) {
      _cartCreatePromise = api('/cart', { method: 'POST', body: {} })
        .then((data) => { syncCart(data.cart); return state.cartId; })
        .finally(() => { _cartCreatePromise = null; });
    }
    return _cartCreatePromise;
  }

  // Tüm sepet mutasyonlarını SERİ kuyruğa al: aynı anda yalnız bir mutasyon çalışır,
  // böylece eşzamanlı ekleme/güncelleme/silme yarışmaz (BUG-2 sağlamlaştırma).
  let _cartOpChain = Promise.resolve();
  function queueCartOp(fn) {
    const run = _cartOpChain.then(fn, fn);
    // Kuyruğun bir hatada kırılmamasını sağla.
    _cartOpChain = run.then(() => {}, () => {});
    return run;
  }

  // ====================================================
  //  ÜRÜN KARTI
  // ====================================================
  function discount(p) {
    if (!p.old_price) return 0;
    return Math.round((1 - Number(p.price) / Number(p.old_price)) * 100);
  }

  function productCard(p) {
    const imgs = p.images && p.images.length ? p.images : [FALLBACK_IMG];
    const back = imgs[1] || imgs[0];
    const disc = discount(p);
    const badges = [];
    if (p.is_new) badges.push('<span class="badge badge--new">YENİ</span>');
    if (disc > 0) badges.push(`<span class="badge badge--sale">%${disc} İNDİRİM</span>`);
    if (p.stock > 0 && p.stock <= 5) badges.push(`<span class="badge badge--stock">Son ${p.stock} ürün</span>`);
    const fav = state.favs?.has(p.id) ? 'active' : '';
    return `
      <article class="product-card" data-id="${p.id}">
        <div class="product-card__media" data-quickview="${p.slug}">
          <div class="badges">${badges.join('')}</div>
          <button class="product-card__fav ${fav}" data-fav="${p.id}" aria-label="Favori">
            <svg viewBox="0 0 24 24"><path d="M12 21s-7-4.6-9.3-9C1 8.5 2.7 5 6.2 5c2 0 3.2 1.2 3.8 2.3C10.6 6.2 11.8 5 13.8 5 17.3 5 19 8.5 21.3 12 19 16.4 12 21 12 21z"/></svg>
          </button>
          <img class="front" src="${esc(imgs[0])}" alt="${esc(p.name)}" loading="lazy" onerror="${imgErr}" />
          <img class="back" src="${esc(back)}" alt="${esc(p.name)}" loading="lazy" onerror="${imgErr}" />
          <button class="product-card__add" data-add="${p.id}">Sepete Ekle</button>
        </div>
        <div class="product-card__body">
          <span class="product-card__cat">${esc(p.category_name || '')}</span>
          <h3 class="product-card__name"><a href="${productUrl(p.slug)}">${esc(p.name)}</a></h3>
          <div class="product-card__price">
            <span class="now">${fmt(p.price)}</span>
            ${p.old_price ? `<span class="old">${fmt(p.old_price)}</span>` : ''}
          </div>
        </div>
      </article>`;
  }

  // ====================================================
  //  RENDER: kategoriler, filtreler, ürünler
  // ====================================================
  function renderCategories() {
    const grid = $('#categoryGrid');
    grid.innerHTML = state.categories
      .map(
        (c) => `
      <a class="cat-card reveal" href="${categoryUrl(c.slug)}" data-cat="${c.slug}">
        <div class="cat-card__img" style="background-image:url('${esc(c.image_url)}')"></div>
        <div class="cat-card__body">
          <h3>${esc(c.name)}</h3>
          <span>${c.product_count} ürün</span>
          <div class="cat-card__cta">Keşfet →</div>
        </div>
      </a>`
      )
      .join('');
    observeReveal();
  }

  function renderNavDropdown() {
    const menu = $('#navCatMenu');
    if (!menu) return;
    menu.innerHTML = state.categories
      .map(
        (c) => `<a href="${categoryUrl(c.slug)}" data-nav-cat="${c.slug}">${esc(c.name)}<span>${c.product_count}</span></a>`
      )
      .join('');
  }

  function renderFilterPills() {
    const pills = $('#filterPills');
    const all = `<button class="pill ${state.filter.category === 'all' ? 'active' : ''}" data-pill="all">Tümü</button>`;
    pills.innerHTML =
      all +
      state.categories
        .map((c) => `<button class="pill ${state.filter.category === c.slug ? 'active' : ''}" data-pill="${c.slug}">${esc(c.name)}</button>`)
        .join('');
  }

  function applyFilters() {
    let list = [...state.products];
    const { category, search, sort } = state.filter;
    if (category !== 'all') list = list.filter((p) => p.category_slug === category);
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q) || (p.category_name || '').toLowerCase().includes(q));
    }
    const sorters = {
      price_asc: (a, b) => a.price - b.price,
      price_desc: (a, b) => b.price - a.price,
      newest: (a, b) => new Date(b.created_at) - new Date(a.created_at),
      featured: (a, b) => (b.is_featured - a.is_featured) || (a.id - b.id),
    };
    list.sort(sorters[sort] || sorters.featured);
    return list;
  }

  function renderProducts() {
    const grid = $('#productGrid');
    const list = applyFilters();
    $('#emptyState').hidden = list.length > 0;
    grid.innerHTML = list.map(productCard).join('');
  }

  function renderNewRail() {
    const rail = $('#newRail');
    const news = state.products.filter((p) => p.is_new).slice(0, 10);
    const list = news.length ? news : state.products.slice(0, 10);
    rail.innerHTML = list.map(productCard).join('');
  }

  // ====================================================
  //  SEPET
  // ====================================================
  function cartCount() { return state.cart.reduce((s, i) => s + i.quantity, 0); }
  function cartTotal() { return state.cart.reduce((s, i) => s + i.price * i.quantity, 0); }

  async function addToCart(productId, size = null, qty = 1, btn = null) {
    const p = state.products.find((x) => String(x.id) === String(productId));
    if (!p) return;
    const variants = p.variants || [];
    const inStock = (v) => Number(v?.inventory_quantity ?? 0) > 0;
    let variant;
    if (size) {
      // Kullanıcı bedeni açıkça seçti: o bedene sadık kal.
      variant = variants.find((item) => item.size === size);
    } else {
      // Kart hızlı ekleme: ilk bedeni körlemesine seçme (tükenmiş olabilir).
      // Stokta olan İLK varyantı tercih et; hiçbiri stokta değilse ilkine düş.
      variant = variants.find(inStock) || variants[0];
    }
    if (!variant) { toast('Bu ürün için satılabilir varyant bulunamadı.'); return false; }
    if (!variant.id) { toast('Lütfen bir beden seç.'); return false; }
    if (!inStock(variant)) { toast(`${p.name} için stokta beden kalmadı.`); return false; }

    // Buton kilidi (BUG-3a besleyen / BUG-2): istek uçarken tekrar tıklanamaz.
    const lock = beginBtnLoading(btn);
    try {
      const result = await queueCartOp(async () => {
        // Bir kez stale-cart kurtarma: 404/409'da yeni sepet oluşturup TEK sefer retry.
        for (let attempt = 0; attempt < 2; attempt++) {
          const cartId = await ensureCart(attempt === 1);
          try {
            const data = await api(`/cart/${cartId}/items`, {
              method: 'POST',
              body: { variant_id: variant.id, quantity: Math.max(1, Number(qty) || 1) },
            });
            syncCart(data.cart);
            return true;
          } catch (err) {
            if (attempt === 0 && isStaleCartError(err)) continue; // sepet geçersiz -> yenile ve bir kez dene
            throw err;
          }
        }
        return false;
      });
      if (result) {
        toast(`${p.name} sepete eklendi ✦`);
        bumpCart();
      }
      return result;
    } catch (err) {
      toast(friendlyCartError(err));
      return false;
    } finally {
      lock();
    }
  }

  // Buton loading/disabled durumu (BUG-3a). Geri döndürülebilir kilit fonksiyonu verir.
  function beginBtnLoading(btn) {
    if (!btn) return () => {};
    const prevDisabled = btn.disabled;
    const prevText = btn.textContent;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.classList.add('loading');
    return () => {
      btn.disabled = prevDisabled;
      btn.removeAttribute('aria-busy');
      btn.classList.remove('loading');
      if (btn.textContent !== prevText && prevText != null) btn.textContent = prevText;
    };
  }

  async function changeQty(key, delta, btn = null) {
    const item = state.cart.find((i) => i.key === key);
    if (!item || !state.cartId) return;
    const quantity = item.quantity + delta;
    if (quantity <= 0) return removeItem(key);

    const lock = beginBtnLoading(btn);
    try {
      await queueCartOp(async () => {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const data = await api(`/cart/${state.cartId}/items/${item.line_id}`, {
              method: 'POST',
              body: { quantity },
            });
            syncCart(data.cart);
            return;
          } catch (err) {
            // Satır güncelleme, sepet geçersizse yeniden oluşturulamaz (satır kaybolur);
            // kullanıcıya nazik Türkçe mesaj göster.
            throw err;
          }
        }
      });
    } catch (err) {
      toast(friendlyCartError(err));
    } finally {
      lock();
    }
  }
  async function removeItem(key, btn = null) {
    const item = state.cart.find((i) => i.key === key);
    if (!item || !state.cartId) return;
    const lock = beginBtnLoading(btn);
    try {
      await queueCartOp(async () => {
        const data = await api(`/cart/${state.cartId}/items/${item.line_id}`, {
          method: 'DELETE',
        });
        syncCart(data.cart);
      });
    } catch (err) {
      toast(friendlyCartError(err));
    } finally {
      lock();
    }
  }

  function updateCartUI() {
    const count = cartCount();
    const badge = $('#cartCount');
    badge.textContent = count;
    badge.classList.toggle('show', count > 0);

    const body = $('#cartBody');
    body.innerHTML = state.cart.length ? state.cart.map((i) => cartItemHtml(i)).join('') : cartEmptyHtml();
    $('#cartTotal').textContent = fmt(cartTotal());

    // Sepet / ödeme sayfası açıksa onları da güncel tut
    const r = currentRoute().name;
    if (r === 'cart') renderCartPage($('#pageView'));
    else if (r === 'checkout' && !state.lastOrder) {
      if (!state.cart.length) renderCheckoutPage($('#pageView'));
      else { const sum = $('#checkoutSummary'); if (sum) sum.innerHTML = checkoutSummaryHtml(); }
    }
  }

  function cartEmptyHtml() {
    return `<div class="cart__empty"><div class="big">🛍️</div><p>Sepetin henüz boş.</p><p style="font-size:.85rem">Beğendiğin parçaları keşfetmeye başla!</p></div>`;
  }

  function cartItemHtml(i, { page = false } = {}) {
    const link = i.slug ? productUrl(i.slug) : null;
    const name = link ? `<a href="${link}">${esc(i.name)}</a>` : esc(i.name);
    return `
        <div class="cart-item${page ? ' cart-item--page' : ''}">
          <div class="cart-item__media"><img class="cart-item__img" src="${esc(i.image)}" alt="${esc(i.name)}" onerror="${imgErr}" /></div>
          <div>
            <div class="cart-item__name">${page ? name : esc(i.name)}</div>
            <div class="cart-item__meta">Beden: ${esc(i.size)}${page ? ` · Birim: ${fmt(i.price)}` : ''}</div>
            <div class="qty">
              <button data-qty="${i.key}" data-delta="-1" aria-label="Azalt">−</button>
              <span>${i.quantity}</span>
              <button data-qty="${i.key}" data-delta="1" aria-label="Artır">+</button>
            </div>
            <div><button class="cart-item__remove" data-remove="${i.key}">Kaldır</button></div>
          </div>
          <div class="cart-item__price">${fmt(i.price * i.quantity)}</div>
        </div>`;
  }

  function bumpCart() {
    const btn = $('#cartToggle');
    btn.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }],
      { duration: 400, easing: 'ease' }
    );
  }

  function openCart() { $('#cart').classList.add('open'); $('#overlay').classList.add('show'); }
  function closeCart() { $('#cart').classList.remove('open'); $('#overlay').classList.remove('show'); }

  // ====================================================
  //  YÖNLENDİRME (gerçek sayfalar: /, /urun/:slug, /kategori/:slug)
  // ====================================================
  const BASE_TITLE = document.title;
  let homeScrollY = 0;
  function productUrl(slug) { return '/urun/' + encodeURIComponent(slug); }
  function categoryUrl(slug) { return '/kategori/' + encodeURIComponent(slug); }

  function currentRoute() {
    let path = location.pathname.replace(/\/+$/, '') || '/';
    try { path = decodeURIComponent(path); } catch { /* bozuk URL: olduğu gibi kullan */ }
    let m;
    if ((m = path.match(/^\/urun\/([^/]+)$/))) return { name: 'product', slug: m[1] };
    if ((m = path.match(/^\/kategori\/([^/]+)$/))) return { name: 'category', slug: m[1] };
    if (path === '/sepet') return { name: 'cart' };
    if (path === '/odeme') return { name: 'checkout' };
    if (path === '/' || path === '/index.html') return { name: 'home' };
    return { name: 'notfound' };
  }

  function navigate(url, { replace = false } = {}) {
    if (currentRoute().name === 'home') homeScrollY = window.scrollY;
    history[replace ? 'replaceState' : 'pushState']({}, '', url);
    route();
  }

  function scrollToHash() {
    const el = location.hash && document.getElementById(location.hash.slice(1));
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth' }));
    return Boolean(el);
  }

  let routeSeq = 0;
  async function route() {
    const seq = ++routeSeq;
    const r = currentRoute();
    const home = $('#homeView');
    const page = $('#pageView');
    closeCart();
    $('#navLinks')?.classList.remove('open');
    $('#navCatDropdown')?.classList.remove('open');
    if (r.name === 'home') {
      page.hidden = true;
      page.innerHTML = '';
      home.hidden = false;
      document.title = BASE_TITLE;
      if (!scrollToHash()) window.scrollTo({ top: homeScrollY, behavior: 'instant' });
      return;
    }
    home.hidden = true;
    page.hidden = false;
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (r.name !== 'checkout') state.lastOrder = null;
    if (r.name === 'product') await renderProductPage(r.slug, page, seq);
    else if (r.name === 'category') renderCategoryPage(r.slug, page);
    else if (r.name === 'cart') renderCartPage(page);
    else if (r.name === 'checkout') renderCheckoutPage(page);
    else renderNotFound(page);
    observeReveal();
  }

  function crumbs(items) {
    return `<nav class="crumbs" aria-label="Sayfa yolu"><a href="/">Ana Sayfa</a>${items
      .map((it) => `<span aria-hidden="true">/</span>${it.href ? `<a href="${it.href}">${esc(it.label)}</a>` : `<span aria-current="page">${esc(it.label)}</span>`}`)
      .join('')}</nav>`;
  }

  function renderNotFound(page) {
    document.title = 'Sayfa bulunamadı · İzbutik';
    page.innerHTML = `<section class="section page-section"><div class="container page-empty">
      <h1 class="section__title">Aradığın sayfa bulunamadı</h1>
      <p class="section__desc">Ürün kaldırılmış ya da adres hatalı olabilir.</p>
      <a class="btn btn--primary" href="/#urunler">Tüm Ürünlere Dön</a></div></section>`;
  }

  function renderCategoryPage(slug, page) {
    const cat = state.categories.find((c) => c.slug === slug);
    if (!cat) return renderNotFound(page);
    const list = state.products.filter((p) => p.category_slug === slug);
    document.title = `${cat.name} · İzbutik`;
    const pills = `<a class="pill" href="/#urunler">Tümü</a>` + state.categories
      .map((c) => `<a class="pill ${c.slug === slug ? 'active' : ''}" href="${categoryUrl(c.slug)}"${c.slug === slug ? ' aria-current="page"' : ''}>${esc(c.name)}</a>`)
      .join('');
    page.innerHTML = `<section class="section page-section"><div class="container">
      ${crumbs([{ label: cat.name }])}
      <div class="section__head">
        <p class="eyebrow">KATEGORİ</p>
        <h1 class="section__title">${esc(cat.name)}</h1>
        <p class="section__desc">${list.length} ürün</p>
      </div>
      <div class="toolbar"><div class="filter-pills">${pills}</div></div>
      ${list.length ? `<div class="product-grid">${list.map(productCard).join('')}</div>`
        : '<div class="empty"><p>Bu kategoride şu an ürün yok.</p></div>'}
    </div></section>`;
  }

  // ====================================================
  //  ÜRÜN DETAY SAYFASI
  // ====================================================
  async function renderProductPage(slug, page, seq) {
    let p = state.products.find((x) => x.slug === slug);
    if (!p) page.innerHTML = '<section class="section page-section"><div class="container"><div class="skeleton" style="height:420px"></div></div></section>';
    try { p = await api('/products/' + encodeURIComponent(slug)); } catch { /* listedeki veriyi kullan */ }
    if (seq !== routeSeq) return; // kullanıcı bu arada başka sayfaya geçti
    if (!p) return renderNotFound(page);
    const cat = state.categories.find((c) => c.slug === p.category_slug);
    const related = state.products.filter((x) => x.category_slug === p.category_slug && x.slug !== p.slug).slice(0, 4);
    document.title = `${p.name} · İzbutik`;
    page.innerHTML = `<section class="section page-section"><div class="container">
      ${crumbs([...(cat ? [{ label: cat.name, href: categoryUrl(cat.slug) }] : []), { label: p.name }])}
      <div id="pdRoot"></div>
      ${related.length ? `<div class="related"><h2 class="section__title related__title">Benzer Ürünler</h2>
        <div class="product-grid">${related.map(productCard).join('')}</div></div>` : ''}
    </div></section>`;
    renderProductDetail(p, $('#pdRoot', page));
  }

  function renderProductDetail(p, root) {
    const imgs = p.images && p.images.length ? p.images : [FALLBACK_IMG];
    const disc = discount(p);
    const dialog = root;
    dialog.innerHTML = `
      <div class="pd pd--page">
        <div class="pd__gallery">
          <div class="pd__main-frame"><img class="pd__main" id="pdMain" src="${esc(imgs[0])}" alt="${esc(p.name)}" onerror="${imgErr}" /></div>
          <div class="pd__thumbs">
            ${imgs.map((u, idx) => `<div class="pd__thumb ${idx === 0 ? 'active' : ''}" data-thumb="${esc(u)}"><img src="${esc(u)}" alt="" onerror="${imgErr}" /></div>`).join('')}
          </div>
        </div>
        <div class="pd__info">
          <div class="pd__cat">${esc(p.category_name || '')}</div>
          <h1 class="pd__name">${esc(p.name)}</h1>
          <div class="pd__price">
            <span class="now">${fmt(p.price)}</span>
            ${p.old_price ? `<span class="old">${fmt(p.old_price)}</span>` : ''}
            ${disc > 0 ? `<span class="save">%${disc} indirim</span>` : ''}
          </div>
          <p class="pd__desc">${esc(p.description || '')}</p>
          <div class="pd__label">Beden Seç</div>
          <div class="pd__sizes" id="pdSizes">
            ${(() => {
              const vmap = new Map((p.variants || []).map((v) => [v.size, Number(v.inventory_quantity ?? 0)]));
              const sizes = p.sizes && p.sizes.length ? p.sizes : ['STD'];
              const firstInStock = sizes.find((s) => (vmap.get(s) ?? 0) > 0);
              return sizes.map((s) => {
                const qty = vmap.get(s) ?? 0;
                const out = qty <= 0;
                const active = !out && s === firstInStock;
                return `<button class="size-opt ${active ? 'active' : ''}" data-size="${esc(s)}"${out ? ' disabled data-out="1"' : ''}>${esc(s)}</button>`;
              }).join('');
            })()}
          </div>
          <div class="pd__stock ${p.stock > 0 && p.stock <= 5 ? 'low' : ''}">${p.stock > 0 ? (p.stock <= 5 ? `⚡ Son ${p.stock} adet kaldı` : `✓ Stokta (${p.stock} adet)`) : 'Tükendi'}</div>
          <div class="pd__actions">
            <button class="btn btn--primary btn--block" id="pdAdd" data-id="${p.id}">Sepete Ekle</button>
          </div>
        </div>
      </div>`;

    // Galeri thumb geçişi
    $$('[data-thumb]', dialog).forEach((t) =>
      t.addEventListener('click', () => {
        $('#pdMain').src = t.dataset.thumb;
        $$('[data-thumb]', dialog).forEach((x) => x.classList.remove('active'));
        t.classList.add('active');
      })
    );
    // Beden seçimi — varsayılan: stokta olan ilk beden (aktif işaretli buton).
    const activeBtn = $('#pdSizes .size-opt.active', dialog);
    let chosen = activeBtn?.dataset.size || (p.sizes && p.sizes[0]) || 'STD';
    $$('#pdSizes .size-opt', dialog).forEach((b) =>
      b.addEventListener('click', () => {
        if (b.disabled || b.dataset.out === '1') return; // tükenmiş beden seçilemez
        $$('#pdSizes .size-opt', dialog).forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        chosen = b.dataset.size;
      })
    );
    $('#pdAdd', dialog).addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      // İstek settle olmadan modal kapatma / sepet açma (BUG-1). Buton loading (BUG-3a).
      const ok = await addToCart(p.id, chosen, 1, btn);
      if (ok) openCart();
      // Hata olursa sayfada kalınır; kullanıcı toast'taki Türkçe mesajı görür.
    });

  }

  // ====================================================
  //  SEPET SAYFASI (/sepet)
  // ====================================================
  function renderCartPage(page) {
    document.title = 'Sepetim · İzbutik';
    const count = cartCount();
    page.innerHTML = `<section class="section page-section"><div class="container">
      ${crumbs([{ label: 'Sepetim' }])}
      <div class="section__head">
        <h1 class="section__title">Sepetim</h1>
        <p class="section__desc">${count ? `${count} ürün` : 'Sepetin boş'}</p>
      </div>
      ${count ? `<div class="shop-layout">
        <div class="shop-layout__main">${state.cart.map((i) => cartItemHtml(i, { page: true })).join('')}</div>
        <aside class="shop-summary">
          <h2 class="shop-summary__title">Sipariş Özeti</h2>
          <div class="row"><span>Ürünler (${count})</span><span>${fmt(cartTotal())}</span></div>
          <div class="row"><span>Kargo</span><span>Siparişten sonra netleşir</span></div>
          <div class="row row--total"><span>Ürün toplamı</span><strong>${fmt(cartTotal())}</strong></div>
          <a class="btn btn--primary btn--block" href="/odeme">Siparişi Tamamla</a>
          <a class="btn btn--ghost btn--block" href="/#urunler">Alışverişe Devam Et</a>
        </aside>
      </div>` : `<div class="page-empty">${cartEmptyHtml()}<a class="btn btn--primary" href="/#urunler">Ürünleri Keşfet</a></div>`}
    </div></section>`;
  }

  // ====================================================
  //  ÖDEME / SİPARİŞ SAYFASI (/odeme)
  // ====================================================
  function checkoutSummaryHtml() {
    return `${state.cart.map((i) => `<div class="row"><span>${esc(i.name)} × ${i.quantity} (${esc(i.size)})</span><span>${fmt(i.price * i.quantity)}</span></div>`).join('')}
      <div class="row row--total"><span>Ürün toplamı</span><strong>${fmt(cartTotal())}</strong></div>
      <a class="shop-summary__edit" href="/sepet">Sepeti düzenle</a>`;
  }

  function renderCheckoutPage(page) {
    document.title = 'Siparişi Tamamla · İzbutik';
    const trail = crumbs([{ label: 'Sepetim', href: '/sepet' }, { label: 'Siparişi Tamamla' }]);
    if (state.lastOrder) {
      const o = state.lastOrder;
      page.innerHTML = `<section class="section page-section"><div class="container">${trail}
        <div class="success success--page">
          <div class="check">✓</div>
          <h1 class="section__title">Sipariş talebin alındı!</h1>
          <p>Talep No: <strong>#${esc(o.id)}</strong></p>
          <p>Ürün toplamı: <strong>${fmt(o.total)}</strong></p>
          <p style="margin-top:14px">Teşekkürler! Ödeme ve kargo detayları için @izbutik20 üzerinden en kısa sürede seninle iletişime geçeceğiz ✦</p>
          <a class="btn btn--primary" style="margin-top:22px" href="/#urunler">Alışverişe Devam Et</a>
        </div></div></section>`;
      return;
    }
    if (!state.cart.length) {
      page.innerHTML = `<section class="section page-section"><div class="container">${trail}
        <div class="page-empty">${cartEmptyHtml()}<a class="btn btn--primary" href="/#urunler">Ürünleri Keşfet</a></div></div></section>`;
      return;
    }
    page.innerHTML = `<section class="section page-section"><div class="container">
      ${trail}
      <div class="section__head">
        <h1 class="section__title">Siparişi Tamamla</h1>
        <p class="section__desc">Bilgilerini gir, sipariş talebini bize ulaştıralım.</p>
      </div>
      <div class="shop-layout">
        <form id="checkoutForm" class="checkout checkout--page shop-layout__main">
          <div class="field"><label for="coName">Ad Soyad *</label><input id="coName" name="name" required autocomplete="name" placeholder="Adın Soyadın" /></div>
          <div class="field--row">
            <div class="field"><label for="coEmail">E-posta *</label><input id="coEmail" type="email" name="email" required autocomplete="email" placeholder="ornek@mail.com" /></div>
            <div class="field"><label for="coPhone">Telefon</label><input id="coPhone" type="tel" name="phone" autocomplete="tel" placeholder="05XX XXX XX XX" /></div>
          </div>
          <div class="field"><label for="coAddress">Adres</label><textarea id="coAddress" name="address" rows="3" autocomplete="street-address" placeholder="Teslimat adresi"></textarea></div>
          <div class="field--row">
            <div class="field"><label for="coCity">Şehir</label><input id="coCity" name="city" autocomplete="address-level1" placeholder="İstanbul" /></div>
            <div class="field"><label for="coPostal">Posta Kodu</label><input id="coPostal" name="postal_code" inputmode="numeric" autocomplete="postal-code" placeholder="34000" /></div>
          </div>
          <p class="checkout__note">Ödeme ve kargo bu mağazada henüz manuel yürütülüyor. Formu gönderdiğinde sipariş talebin bize ulaşır; ödeme yöntemi ve kargo ücreti @izbutik20 üzerinden seninle netleştirilir. Bu adımda kart bilgisi alınmaz ve tahsilat yapılmaz.</p>
          <button type="submit" class="btn btn--primary btn--block" id="placeOrder">Sipariş Talebi Gönder · ${fmt(cartTotal())}</button>
        </form>
        <aside class="shop-summary">
          <h2 class="shop-summary__title">Sipariş Özeti</h2>
          <div id="checkoutSummary">${checkoutSummaryHtml()}</div>
        </aside>
      </div>
    </div></section>`;
    $('#checkoutForm', page).addEventListener('submit', submitOrder);
  }

  async function submitOrder(e) {
    e.preventDefault();
    const form = e.target;
    const btn = $('#placeOrder');
    const fd = new FormData(form);
    const payload = {
      cart_id: state.cartId,
      customer: {
        name: fd.get('name'), email: fd.get('email'),
        phone: fd.get('phone'), address: fd.get('address'),
        city: fd.get('city') || undefined, postal_code: fd.get('postal_code') || undefined,
      },
      items: state.cart.map((i) => ({ id: i.id, size: i.size, quantity: i.quantity })),
    };
    btn.disabled = true;
    btn.textContent = 'Sipariş talebi gönderiliyor...';
    try {
      const res = await fetch(API + '/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sipariş oluşturulamadı');
      // Başarı ekranı (aynı /odeme sayfasında)
      state.lastOrder = { id: data.id, total: data.total };
      state.cart = [];
      state.cartId = null;
      localStorage.removeItem(CART_ID_KEY);
      saveCart();
      updateCartUI();
      renderCheckoutPage($('#pageView'));
      window.scrollTo({ top: 0, behavior: 'instant' });
    } catch (err) {
      toast('Hata: ' + err.message);
      btn.disabled = false;
      btn.textContent = 'Tekrar Dene';
    }
  }

  // ====================================================
  //  MODAL & TOAST yardımcıları
  // ====================================================
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ====================================================
  //  SCROLL REVEAL & sayaç
  // ====================================================
  let revealObserver;
  function observeReveal() {
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(
        (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); revealObserver.unobserve(e.target); } }),
        { threshold: 0.12 }
      );
    }
    $$('.reveal:not(.in)').forEach((el) => revealObserver.observe(el));
  }

  function animateCounters() {
    $$('[data-count]').forEach((el) => {
      const target = parseFloat(el.dataset.count);
      const decimal = el.dataset.decimal ? Number(el.dataset.decimal) : 0;
      const dur = 1600;
      const start = performance.now();
      const step = (now) => {
        const prog = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - prog, 3);
        const val = target * eased;
        el.textContent = decimal ? val.toFixed(decimal) : Math.floor(val).toLocaleString('tr-TR');
        if (prog < 1) requestAnimationFrame(step);
        else el.textContent = decimal ? target.toFixed(decimal) : target.toLocaleString('tr-TR');
      };
      requestAnimationFrame(step);
    });
  }

  // ====================================================
  //  OLAYLAR
  // ====================================================
  function bindEvents() {
    // Global tıklama delegasyonu
    document.addEventListener('click', (e) => {
      const t = e.target;
      const add = t.closest('[data-add]');
      const quick = t.closest('[data-quickview]');
      const fav = t.closest('[data-fav]');
      const pill = t.closest('[data-pill]');
      const catCard = t.closest('[data-cat]');
      const qty = t.closest('[data-qty]');
      const rem = t.closest('[data-remove]');
      const navCat = t.closest('[data-nav-cat]');
      const dropdownToggle = t.closest('[data-dropdown-toggle]');

      if (add) { e.stopPropagation(); addToCart(add.dataset.add, null, 1, add); return; }
      if (fav) { e.stopPropagation(); fav.classList.toggle('active'); return; }
      if (quick && !add && !fav) { navigate(productUrl(quick.dataset.quickview)); return; }
      if (navCat) { e.preventDefault(); navigate(categoryUrl(navCat.dataset.navCat)); return; }
      if (dropdownToggle && window.matchMedia('(max-width: 680px)').matches) {
        e.preventDefault();
        $('#navCatDropdown').classList.toggle('open');
        return;
      }
      // Site içi bağlantılar: tam sayfa yenilemeden gerçek URL'ye geç (yeni sekme/⌘-tık korunur)
      const link = t.closest('a[href]');
      if (link && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && link.target !== '_blank') {
        const url = new URL(link.href, location.href);
        if (url.origin === location.origin && !url.pathname.startsWith('/api/')) {
          e.preventDefault();
          if (url.pathname === location.pathname && url.hash && currentRoute().name === 'home') {
            history.replaceState({}, '', url.pathname + url.hash);
            scrollToHash();
          } else {
            navigate(url.pathname + url.hash);
          }
          return;
        }
      }
      if (pill) { setCategory(pill.dataset.pill); return; }
      if (qty) { changeQty(qty.dataset.qty, Number(qty.dataset.delta), qty); return; }
      if (rem) { removeItem(rem.dataset.remove, rem); return; }
    });

    // Sepet
    $('#cartToggle').addEventListener('click', openCart);
    $('#cartClose').addEventListener('click', closeCart);
    $('#overlay').addEventListener('click', () => { closeCart(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCart(); });

    // Sıralama
    $('#sortSelect').addEventListener('change', (e) => { state.filter.sort = e.target.value; renderProducts(); });

    // Arama
    $('#searchToggle').addEventListener('click', () => { $('#searchbar').classList.toggle('open'); if ($('#searchbar').classList.contains('open')) $('#searchInput').focus(); });
    let searchTimer;
    $('#searchInput').addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.filter.search = e.target.value;
        if (currentRoute().name !== 'home') navigate('/#urunler');
        if (e.target.value.trim()) { state.filter.category = 'all'; renderFilterPills(); }
        renderProducts();
        if (e.target.value.trim()) document.getElementById('urunler').scrollIntoView({ behavior: 'smooth' });
      }, 250);
    });

    // Filtre temizle
    $('#clearFilters').addEventListener('click', () => { state.filter = { category: 'all', search: '', sort: 'featured' }; $('#searchInput').value = ''; renderFilterPills(); renderProducts(); });

    // Mobil menü
    $('#navToggle').addEventListener('click', () => $('#navLinks').classList.toggle('open'));
    $$('#navLinks a, [data-scroll]').forEach((a) => {
      if (a.hasAttribute('data-dropdown-toggle')) return; // dropdown açma/kapama kendi mantığında yönetilir
      a.addEventListener('click', () => { $('#navLinks').classList.remove('open'); $('#navCatDropdown').classList.remove('open'); });
    });

    // Tarayıcı geri/ileri
    window.addEventListener('popstate', route);

    // Navbar scroll
    const nav = $('#nav');
    window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 20), { passive: true });

    // Bülten formu kaldırıldı — sahte "abone oldun" bildirimi yerine
    // Instagram'a yönlendiren gerçek CTA kullanılıyor (bkz. index.html).
  }

  function setCategory(slug) {
    state.filter.category = slug;
    state.filter.search = '';
    $('#searchInput').value = '';
    renderFilterPills();
    renderProducts();
  }

  // ====================================================
  //  BAŞLAT
  // ====================================================
  let _initialized = false;
  async function init() {
    if (_initialized) return; // Çift DOMContentLoaded/çift init'e karşı koruma (UI state tutarlılığı).
    _initialized = true;
    $('#year').textContent = new Date().getFullYear();
    state.favs = new Set();
    bindEvents();
    updateCartUI();
    observeReveal();
    animateCounters();

    // Alt sayfa ile açıldıysa ana sayfayı veri gelene kadar gösterme (titreme olmasın)
    if (currentRoute().name !== 'home') $('#homeView').hidden = true;
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    // İskelet (skeleton) yükleme
    $('#productGrid').innerHTML = Array.from({ length: 8 }).map(() => '<div class="skeleton"></div>').join('');

    try {
      const [cats, prods] = await Promise.all([api('/categories'), api('/products?limit=100')]);
      state.categories = cats;
      state.products = prods;
      if (state.cartId) {
        try {
          const cartData = await api('/cart/' + encodeURIComponent(state.cartId));
          syncCart(cartData.cart);
        } catch {
          state.cartId = null;
          state.cart = [];
          localStorage.removeItem(CART_ID_KEY);
          saveCart();
          updateCartUI();
        }
      }
      renderCategories();
      renderNavDropdown();
      renderFilterPills();
      renderNewRail();
      renderProducts();
      observeReveal();
      route();
    } catch (err) {
      console.error(err);
      $('#homeView').hidden = false;
      $('#productGrid').innerHTML = `<div class="empty" style="grid-column:1/-1"><p>Ürünler yüklenemedi. Sunucu ve veritabanı çalışıyor mu?</p></div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
