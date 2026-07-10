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

  // ---- Durum ----
  const state = {
    products: [],
    categories: [],
    filter: { category: 'all', search: '', sort: 'featured' },
    cart: loadCart(),
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

  async function api(path) {
    const res = await fetch(API + path);
    if (!res.ok) throw new Error('İstek başarısız: ' + path);
    return res.json();
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
          <h3 class="product-card__name" data-quickview="${p.slug}">${esc(p.name)}</h3>
          <div class="product-card__rating">${'★'.repeat(Math.round(p.rating))}<span style="color:var(--ink-soft)"> ${Number(p.rating).toFixed(1)}</span></div>
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
      <div class="cat-card reveal" data-cat="${c.slug}">
        <div class="cat-card__img" style="background-image:url('${esc(c.image_url)}')"></div>
        <div class="cat-card__body">
          <h3>${esc(c.name)}</h3>
          <span>${c.product_count} ürün</span>
          <div class="cat-card__cta">Keşfet →</div>
        </div>
      </div>`
      )
      .join('');
    observeReveal();
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
      rating: (a, b) => b.rating - a.rating,
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

  function addToCart(productId, size = null, qty = 1) {
    const p = state.products.find((x) => x.id === Number(productId));
    if (!p) return;
    const sz = size || (p.sizes && p.sizes[0]) || 'STD';
    const key = `${p.id}-${sz}`;
    const existing = state.cart.find((i) => i.key === key);
    if (existing) existing.quantity += qty;
    else
      state.cart.push({
        key, id: p.id, name: p.name, price: Number(p.price),
        image: (p.images && p.images[0]) || FALLBACK_IMG, size: sz, quantity: qty,
      });
    saveCart();
    updateCartUI();
    toast(`${p.name} sepete eklendi ✦`);
    bumpCart();
  }

  function changeQty(key, delta) {
    const item = state.cart.find((i) => i.key === key);
    if (!item) return;
    item.quantity += delta;
    if (item.quantity <= 0) state.cart = state.cart.filter((i) => i.key !== key);
    saveCart();
    updateCartUI();
  }
  function removeItem(key) {
    state.cart = state.cart.filter((i) => i.key !== key);
    saveCart();
    updateCartUI();
  }

  function updateCartUI() {
    const count = cartCount();
    const badge = $('#cartCount');
    badge.textContent = count;
    badge.classList.toggle('show', count > 0);

    const body = $('#cartBody');
    if (!state.cart.length) {
      body.innerHTML = `<div class="cart__empty"><div class="big">🛍️</div><p>Sepetin henüz boş.</p><p style="font-size:.85rem">Beğendiğin parçaları keşfetmeye başla!</p></div>`;
    } else {
      body.innerHTML = state.cart
        .map(
          (i) => `
        <div class="cart-item">
          <img class="cart-item__img" src="${esc(i.image)}" alt="${esc(i.name)}" onerror="${imgErr}" />
          <div>
            <div class="cart-item__name">${esc(i.name)}</div>
            <div class="cart-item__meta">Beden: ${esc(i.size)}</div>
            <div class="qty">
              <button data-qty="${i.key}" data-delta="-1">−</button>
              <span>${i.quantity}</span>
              <button data-qty="${i.key}" data-delta="1">+</button>
            </div>
            <div><button class="cart-item__remove" data-remove="${i.key}">Kaldır</button></div>
          </div>
          <div class="cart-item__price">${fmt(i.price * i.quantity)}</div>
        </div>`
        )
        .join('');
    }
    $('#cartTotal').textContent = fmt(cartTotal());
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
  //  ÜRÜN DETAY MODAL
  // ====================================================
  async function openProduct(slug) {
    let p = state.products.find((x) => x.slug === slug);
    try { p = await api('/products/' + slug); } catch { /* listedeki veriyi kullan */ }
    if (!p) return;
    const imgs = p.images && p.images.length ? p.images : [FALLBACK_IMG];
    const disc = discount(p);
    const dialog = $('#modalDialog');
    dialog.innerHTML = `
      <button class="modal__close" data-close-modal>✕</button>
      <div class="pd">
        <div class="pd__gallery">
          <img class="pd__main" id="pdMain" src="${esc(imgs[0])}" alt="${esc(p.name)}" onerror="${imgErr}" />
          <div class="pd__thumbs">
            ${imgs.map((u, idx) => `<img src="${esc(u)}" class="${idx === 0 ? 'active' : ''}" data-thumb="${esc(u)}" onerror="${imgErr}" />`).join('')}
          </div>
        </div>
        <div class="pd__info">
          <div class="pd__cat">${esc(p.category_name || '')}</div>
          <h2 class="pd__name">${esc(p.name)}</h2>
          <div class="pd__rating">${'★'.repeat(Math.round(p.rating))} <span style="color:var(--ink-soft)">${Number(p.rating).toFixed(1)} / 5</span></div>
          <div class="pd__price">
            <span class="now">${fmt(p.price)}</span>
            ${p.old_price ? `<span class="old">${fmt(p.old_price)}</span>` : ''}
            ${disc > 0 ? `<span class="save">%${disc} indirim</span>` : ''}
          </div>
          <p class="pd__desc">${esc(p.description || '')}</p>
          <div class="pd__label">Beden Seç</div>
          <div class="pd__sizes" id="pdSizes">
            ${(p.sizes || ['STD']).map((s, idx) => `<button class="size-opt ${idx === 0 ? 'active' : ''}" data-size="${esc(s)}">${esc(s)}</button>`).join('')}
          </div>
          <div class="pd__stock">${p.stock > 0 ? `✓ Stokta (${p.stock} adet)` : 'Tükendi'}</div>
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
    // Beden seçimi
    let chosen = (p.sizes && p.sizes[0]) || 'STD';
    $$('#pdSizes .size-opt', dialog).forEach((b) =>
      b.addEventListener('click', () => {
        $$('#pdSizes .size-opt', dialog).forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        chosen = b.dataset.size;
      })
    );
    $('#pdAdd', dialog).addEventListener('click', () => {
      addToCart(p.id, chosen, 1);
      closeModal('#productModal');
      openCart();
    });

    openModal('#productModal');
  }

  // ====================================================
  //  CHECKOUT
  // ====================================================
  function openCheckout() {
    if (!state.cart.length) { toast('Sepetin boş 🛍️'); return; }
    const dialog = $('#checkoutDialog');
    dialog.innerHTML = `
      <button class="modal__close" data-close-modal>✕</button>
      <div class="checkout">
        <h3>Siparişi Tamamla</h3>
        <p class="sub">Bilgilerini gir, siparişini hemen oluşturalım.</p>
        <form id="checkoutForm">
          <div class="field"><label>Ad Soyad *</label><input name="name" required placeholder="Adın Soyadın" /></div>
          <div class="field--row">
            <div class="field"><label>E-posta *</label><input type="email" name="email" required placeholder="ornek@mail.com" /></div>
            <div class="field"><label>Telefon</label><input name="phone" placeholder="05XX XXX XX XX" /></div>
          </div>
          <div class="field"><label>Adres</label><textarea name="address" rows="2" placeholder="Teslimat adresi"></textarea></div>
          <div class="checkout__summary">
            ${state.cart.map((i) => `<div class="row"><span>${esc(i.name)} × ${i.quantity} (${esc(i.size)})</span><span>${fmt(i.price * i.quantity)}</span></div>`).join('')}
            <div class="row" style="border-top:1px solid var(--line);margin-top:6px;padding-top:8px"><span>Toplam</span><strong>${fmt(cartTotal())}</strong></div>
          </div>
          <button type="submit" class="btn btn--primary btn--block" id="placeOrder">Siparişi Onayla · ${fmt(cartTotal())}</button>
        </form>
      </div>`;

    $('#checkoutForm', dialog).addEventListener('submit', submitOrder);
    closeCart();
    openModal('#checkoutModal');
  }

  async function submitOrder(e) {
    e.preventDefault();
    const form = e.target;
    const btn = $('#placeOrder');
    const fd = new FormData(form);
    const payload = {
      customer: {
        name: fd.get('name'), email: fd.get('email'),
        phone: fd.get('phone'), address: fd.get('address'),
      },
      items: state.cart.map((i) => ({ id: i.id, size: i.size, quantity: i.quantity })),
    };
    btn.disabled = true;
    btn.textContent = 'Sipariş oluşturuluyor...';
    try {
      const res = await fetch(API + '/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sipariş oluşturulamadı');
      // Başarı ekranı
      $('#checkoutDialog').innerHTML = `
        <div class="success">
          <div class="check">✓</div>
          <h3>Siparişin alındı!</h3>
          <p>Sipariş No: <strong>#${data.id}</strong></p>
          <p>Toplam: <strong>${fmt(data.total)}</strong></p>
          <p style="margin-top:14px">Teşekkürler! En kısa sürede seninle iletişime geçeceğiz ✦</p>
          <button class="btn btn--primary" style="margin-top:22px" data-close-modal>Alışverişe Devam Et</button>
        </div>`;
      state.cart = [];
      saveCart();
      updateCartUI();
    } catch (err) {
      toast('Hata: ' + err.message);
      btn.disabled = false;
      btn.textContent = 'Tekrar Dene';
    }
  }

  // ====================================================
  //  MODAL & TOAST yardımcıları
  // ====================================================
  function openModal(sel) { $(sel).classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closeModal(sel) { $(sel).classList.remove('open'); document.body.style.overflow = ''; }
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

      if (add) { e.stopPropagation(); addToCart(add.dataset.add); return; }
      if (fav) { e.stopPropagation(); fav.classList.toggle('active'); return; }
      if (quick && !add && !fav) { openProduct(quick.dataset.quickview); return; }
      if (pill) { setCategory(pill.dataset.pill); return; }
      if (catCard) { setCategory(catCard.dataset.cat); $('#urunler').scrollIntoView({ behavior: 'smooth' }); return; }
      if (qty) { changeQty(qty.dataset.qty, Number(qty.dataset.delta)); return; }
      if (rem) { removeItem(rem.dataset.remove); return; }
      if (t.closest('[data-close-modal]')) { closeModal('#productModal'); closeModal('#checkoutModal'); return; }
    });

    // Sepet
    $('#cartToggle').addEventListener('click', openCart);
    $('#cartClose').addEventListener('click', closeCart);
    $('#overlay').addEventListener('click', () => { closeCart(); });
    $('#checkoutBtn').addEventListener('click', openCheckout);

    // Modal backdrop
    $$('.modal__backdrop').forEach((b) => b.addEventListener('click', () => { closeModal('#productModal'); closeModal('#checkoutModal'); }));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal('#productModal'); closeModal('#checkoutModal'); closeCart(); } });

    // Sıralama
    $('#sortSelect').addEventListener('change', (e) => { state.filter.sort = e.target.value; renderProducts(); });

    // Arama
    $('#searchToggle').addEventListener('click', () => { $('#searchbar').classList.toggle('open'); if ($('#searchbar').classList.contains('open')) $('#searchInput').focus(); });
    let searchTimer;
    $('#searchInput').addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.filter.search = e.target.value;
        if (e.target.value.trim()) { state.filter.category = 'all'; renderFilterPills(); }
        renderProducts();
        if (e.target.value.trim()) document.getElementById('urunler').scrollIntoView({ behavior: 'smooth' });
      }, 250);
    });

    // Filtre temizle
    $('#clearFilters').addEventListener('click', () => { state.filter = { category: 'all', search: '', sort: 'featured' }; $('#searchInput').value = ''; renderFilterPills(); renderProducts(); });

    // Mobil menü
    $('#navToggle').addEventListener('click', () => $('#navLinks').classList.toggle('open'));
    $$('#navLinks a, [data-scroll]').forEach((a) => a.addEventListener('click', () => $('#navLinks').classList.remove('open')));

    // Navbar scroll
    const nav = $('#nav');
    window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 20), { passive: true });

    // Bülten
    $('#newsletterForm').addEventListener('submit', (e) => { e.preventDefault(); e.target.reset(); $('#newsletterNote').hidden = false; toast('Bültene abone oldun ✦'); });
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
  async function init() {
    $('#year').textContent = new Date().getFullYear();
    state.favs = new Set();
    bindEvents();
    updateCartUI();
    observeReveal();
    animateCounters();

    // İskelet (skeleton) yükleme
    $('#productGrid').innerHTML = Array.from({ length: 8 }).map(() => '<div class="skeleton"></div>').join('');

    try {
      const [cats, prods] = await Promise.all([api('/categories'), api('/products?limit=100')]);
      state.categories = cats;
      state.products = prods;
      renderCategories();
      renderFilterPills();
      renderNewRail();
      renderProducts();
      observeReveal();
    } catch (err) {
      console.error(err);
      $('#productGrid').innerHTML = `<div class="empty" style="grid-column:1/-1"><p>Ürünler yüklenemedi. Sunucu ve veritabanı çalışıyor mu?</p></div>`;
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
