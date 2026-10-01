// Paylaşım önizlemesi (Open Graph) birim testleri — ağ gerektirmez.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  injectShareMeta,
  productShareMeta,
  defaultShareMeta,
  clip,
} from '../src/lib/share-meta.js';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const BASE = 'https://izbutik.example';

const product = {
  slug: 'retro-cicek-elbise',
  name: 'Retro "çiçek" <elbise>',
  description: 'Yazlık   retro\nçiçek desenli elbise.',
  price: 1100,
  stock: 3,
  category_name: 'Elbise',
  images: ['https://cdn.shopier.app/pictures_large/a.jpeg', 'https://cdn.shopier.app/b.jpeg'],
};

test('OG: ürün sayfası ürüne özel başlık, fiyat, görsel ve URL üretir', () => {
  const out = injectShareMeta(html, productShareMeta(product, BASE));
  assert.match(out, /<meta property="og:type" content="product" \/>/);
  assert.match(out, /og:title" content="Retro &quot;çiçek&quot; &lt;elbise&gt; · İzbutik"/);
  assert.match(out, /og:image" content="https:\/\/cdn\.shopier\.app\/pictures_large\/a\.jpeg"/);
  assert.match(out, /og:url" content="https:\/\/izbutik\.example\/urun\/retro-cicek-elbise"/);
  assert.match(out, /product:price:amount" content="1100\.00"/);
  assert.match(out, /product:availability" content="in stock"/);
  assert.match(out, /og:description" content="₺1\.100,00 · Yazlık retro çiçek desenli elbise\."/);
  assert.match(out, /<title>Retro &quot;çiçek&quot; &lt;elbise&gt; · İzbutik<\/title>/);
  // Varsayılan blok tamamen değişmiş, sayfanın geri kalanı korunmuş olmalı
  assert.equal((out.match(/<title>/g) || []).length, 1);
  assert.equal((out.match(/og:title/g) || []).length, 1);
  assert.ok(out.includes('<script src="/js/app.js"></script>'));
});

test('OG: görselsiz ürün varsayılan mağaza görseline düşer, göreli yol mutlak olur', () => {
  const noImg = productShareMeta({ ...product, images: [] }, BASE);
  assert.match(noImg.image, /^https:\/\/cdn\.shopier\.app\//);
  const rel = productShareMeta({ ...product, images: ['/img/x.jpg'] }, BASE);
  assert.equal(rel.image, 'https://izbutik.example/img/x.jpg');
});

test('OG: varsayılan meta ve noindex', () => {
  const out = injectShareMeta(html, { ...defaultShareMeta(BASE, '/sepet'), noindex: true });
  assert.match(out, /og:url" content="https:\/\/izbutik\.example\/sepet"/);
  assert.match(out, /<meta name="robots" content="noindex, follow" \/>/);
});

test('OG: uzun açıklama kelime sınırında kısaltılır', () => {
  const t = clip('kelime '.repeat(60), 50);
  assert.ok(t.length <= 50);
  assert.ok(t.endsWith('…'));
});
