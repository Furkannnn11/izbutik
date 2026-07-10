import pool, { getClient } from './index.js';

// Unsplash CDN üzerinden doğrulanmış moda/giyim görselleri.
// (İzbutik Instagram hesabı giriş duvarı arkasında olduğundan örnek
//  yüksek kaliteli görseller kullanıldı; gerçek ürün görselleriyle
//  kolayca değiştirilebilir.)
const U = (id, w = 800) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

const IMG = {
  a: '1515372039744-b8f02a3ae446',
  b: '1539109136881-3be0616acf4b',
  c: '1483985988355-763728e1935b',
  d: '1521572163474-6864f9cf17ab',
  e: '1551232864-3f0890e580d9',
  f: '1572804013309-59a88b7e92f1',
  g: '1485968579580-b6d095142e6e',
  h: '1496747611176-843222e1e57c',
  i: '1469334031218-e382a71b716b',
  j: '1487412720507-e7ab37603c6f',
  k: '1490481651871-ab68de25d43d',
  l: '1495121605193-b116b5b9c5fe',
  m: '1542295669297-4d352b042bca',
  n: '1556905055-8f358a7a47b2',
  o: '1576566588028-4147f3842f27',
  p: '1434389677669-e08b4cac3105',
  q: '1554568218-0f1715e72254',
  r: '1503342217505-b0a15ec3261c',
  s: '1502716119720-b23a93e5fe1b',
  t: '1475180098004-ca77a66827be',
  u: '1525507119028-ed4c629a60a3',
  v: '1582142306909-195724d33ffc',
  w: '1518049362265-d5b2a6467637',
  x: '1539008835657-9e8e9680c956',
  y: '1583496661160-fb5886a0aaaa',
  z: '1490114538077-0a7f8cb49891',
  a2: '1485462537746-965f33f7f6a7',
  b2: '1533659124865-d6072dc035e1',
  c2: '1492707892479-7bc8d5a4ee93',
  d2: '1479064555552-3ef4979f8908',
  e2: '1611312449408-fcece27cdbb7',
  f2: '1581044777550-4cfa60707c03',
  g2: '1566174053879-31528523f8ae',
  h2: '1564257631407-4deb1f99d992',
  i2: '1487222477894-8943e31ef7b2',
  j2: '1485231183945-fffde7cc051e',
};

const categories = [
  {
    slug: 'elbise',
    name: 'Elbise',
    description: 'Günlük, ofis ve abiye; her ana yakışan elbise modelleri.',
    image_url: U(IMG.a, 900),
    sort_order: 1,
  },
  {
    slug: 'ust-giyim',
    name: 'Üst Giyim',
    description: 'Bluz, gömlek ve body modelleriyle modern kombinler.',
    image_url: U(IMG.h, 900),
    sort_order: 2,
  },
  {
    slug: 'alt-giyim',
    name: 'Alt Giyim',
    description: 'Pantolon, etek ve şort; rahat ve şık alt giyim.',
    image_url: U(IMG.k, 900),
    sort_order: 3,
  },
  {
    slug: 'dis-giyim',
    name: 'Dış Giyim',
    description: 'Ceket, blazer ve trençkot ile sezonun trendleri.',
    image_url: U(IMG.j, 900),
    sort_order: 4,
  },
  {
    slug: 'triko',
    name: 'Triko',
    description: 'Yumuşacık kazak ve hırkalarla sıcak dokunuşlar.',
    image_url: U(IMG.r, 900),
    sort_order: 5,
  },
  {
    slug: 'takim',
    name: 'Takım',
    description: 'İkili takımlarla zahmetsiz ve tarz kombinler.',
    image_url: U(IMG.m, 900),
    sort_order: 6,
  },
  {
    slug: 'aksesuar',
    name: 'Aksesuar',
    description: 'Çanta ve tamamlayıcı aksesuarlarla detaylarda fark yarat.',
    image_url: U(IMG.f, 900),
    sort_order: 7,
  },
];

// price/old_price TL
const products = [
  // ELBİSE
  { cat: 'elbise', name: 'Saten Askılı Midi Elbise', price: 749.9, old: 999.9, imgs: [IMG.a, IMG.c], sizes: ['S','M','L'], rating: 4.8, is_new: true, is_featured: true, desc: 'Dökümlü saten kumaş, vücudu saran zarif kesim. Davet ve özel günler için ideal.' },
  { cat: 'elbise', name: 'Çiçek Desenli Yazlık Elbise', price: 459.9, imgs: [IMG.i, IMG.t], sizes: ['XS','S','M','L'], rating: 4.6, is_new: true, desc: 'Hafif viskon kumaş, ferah kesim. Yazın vazgeçilmezi.' },
  { cat: 'elbise', name: 'Siyah Mini Kokteyl Elbise', price: 689.9, old: 849.9, imgs: [IMG.d2, IMG.a], sizes: ['S','M','L'], rating: 4.9, is_featured: true, desc: 'Klasik siyah, modern kesim. Her gardırobun olmazsa olmazı.' },
  { cat: 'elbise', name: 'Triko Kemerli Uzun Elbise', price: 599.9, imgs: [IMG.b2, IMG.r], sizes: ['M','L','XL'], rating: 4.5, desc: 'Sıcacık triko, kemer detayıyla beli vurgulayan kesim.' },

  // ÜST GİYİM
  { cat: 'ust-giyim', name: 'Saten Gömlek', price: 389.9, imgs: [IMG.h, IMG.g], sizes: ['S','M','L'], rating: 4.7, is_featured: true, desc: 'Işıltılı saten, oversize kesim. Hem ofise hem davete.' },
  { cat: 'ust-giyim', name: 'Fırfır Detaylı Bluz', price: 299.9, old: 379.9, imgs: [IMG.s, IMG.h], sizes: ['XS','S','M','L'], rating: 4.4, is_new: true, desc: 'Romantik fırfır detaylar, hafif ve ferah kumaş.' },
  { cat: 'ust-giyim', name: 'Basic Pamuklu Body', price: 219.9, imgs: [IMG.g, IMG.s], sizes: ['S','M','L'], rating: 4.6, desc: 'Esnek pamuklu kumaş, pürüzsüz görünüm sağlayan body.' },
  { cat: 'ust-giyim', name: 'Keten Oversize Gömlek', price: 349.9, imgs: [IMG.q, IMG.h], sizes: ['S','M','L','XL'], rating: 4.5, is_new: true, desc: 'Nefes alan keten kumaş, rahat oversize kesim.' },

  // ALT GİYİM
  { cat: 'alt-giyim', name: 'Yüksek Bel Palazzo Pantolon', price: 429.9, old: 549.9, imgs: [IMG.k, IMG.z], sizes: ['S','M','L'], rating: 4.8, is_featured: true, desc: 'Dökümlü bol paça, yüksek bel ile bacakları uzatan kesim.' },
  { cat: 'alt-giyim', name: 'Saten Midi Etek', price: 359.9, imgs: [IMG.z, IMG.k], sizes: ['XS','S','M','L'], rating: 4.6, is_new: true, desc: 'Parlak saten, A kesim midi boy. Şıklığın kolay yolu.' },
  { cat: 'alt-giyim', name: 'Mom Jean Pantolon', price: 469.9, imgs: [IMG.f2, IMG.k], sizes: ['S','M','L','XL'], rating: 4.7, desc: 'Yüksek bel mom kesim, rahat ve trend denim.' },
  { cat: 'alt-giyim', name: 'Pileli Mini Etek', price: 279.9, old: 329.9, imgs: [IMG.u, IMG.z], sizes: ['XS','S','M'], rating: 4.3, desc: 'Hareketli pile detayı, genç ve dinamik bir görünüm.' },

  // DIŞ GİYİM
  { cat: 'dis-giyim', name: 'Blazer Ceket', price: 799.9, old: 999.9, imgs: [IMG.j, IMG.m], sizes: ['S','M','L'], rating: 4.9, is_featured: true, desc: 'Yapılandırılmış blazer, ofisten davete uzanan zarafet.' },
  { cat: 'dis-giyim', name: 'Bej Trençkot', price: 1099.9, imgs: [IMG.p, IMG.j], sizes: ['S','M','L','XL'], rating: 4.8, is_new: true, is_featured: true, desc: 'Klasik bej trençkot, su itici kumaş. Sonbaharın simgesi.' },
  { cat: 'dis-giyim', name: 'Oversize Deri Ceket', price: 1249.9, old: 1499.9, imgs: [IMG.c2, IMG.j], sizes: ['S','M','L'], rating: 4.7, desc: 'Yumuşak suni deri, oversize kesim ile asi bir hava.' },
  { cat: 'dis-giyim', name: 'Kapüşonlu Şişme Mont', price: 899.9, imgs: [IMG.j2, IMG.p], sizes: ['M','L','XL'], rating: 4.5, is_new: true, desc: 'Hafif ve sıcak dolgu, kapüşon detaylı kışlık mont.' },

  // TRİKO
  { cat: 'triko', name: 'Boğazlı Triko Kazak', price: 329.9, imgs: [IMG.r, IMG.b2], sizes: ['S','M','L'], rating: 4.6, is_featured: true, desc: 'Yumuşacık boğazlı kazak, soğuk günlerin konforu.' },
  { cat: 'triko', name: 'Oversize Örgü Hırka', price: 449.9, old: 569.9, imgs: [IMG.x, IMG.r], sizes: ['S','M','L','XL'], rating: 4.7, is_new: true, desc: 'Kalın örgü, cep detaylı uzun hırka. Sımsıcak ve şık.' },
  { cat: 'triko', name: 'V Yaka İnce Kazak', price: 289.9, imgs: [IMG.b2, IMG.x], sizes: ['XS','S','M','L'], rating: 4.4, desc: 'İnce örgü, V yaka. Katmanlı kombinlerin yıldızı.' },

  // TAKIM
  { cat: 'takim', name: 'Blazer Pantolon Takım', price: 1199.9, old: 1499.9, imgs: [IMG.m, IMG.j], sizes: ['S','M','L'], rating: 4.9, is_new: true, is_featured: true, desc: 'Uyumlu blazer ve pantolon, zahmetsiz profesyonel şıklık.' },
  { cat: 'takim', name: 'Triko İkili Takım', price: 699.9, imgs: [IMG.n, IMG.r], sizes: ['S','M','L'], rating: 4.6, desc: 'Kazak ve etek/pantolon uyumu, rahat ve modern.' },
  { cat: 'takim', name: 'Saten Gömlek Şort Takım', price: 649.9, old: 799.9, imgs: [IMG.o, IMG.h], sizes: ['XS','S','M','L'], rating: 4.5, is_new: true, desc: 'Parlak saten ikili takım, yaz akşamlarının favorisi.' },

  // AKSESUAR
  { cat: 'aksesuar', name: 'Deri Omuz Çantası', price: 549.9, old: 699.9, imgs: [IMG.f, IMG.e], sizes: ['STD'], rating: 4.8, is_featured: true, desc: 'Şık ve fonksiyonel, ayarlanabilir askılı omuz çantası.' },
  { cat: 'aksesuar', name: 'Mini Çapraz Çanta', price: 379.9, imgs: [IMG.e, IMG.f], sizes: ['STD'], rating: 4.6, is_new: true, desc: 'Kompakt boy, zincir askı detaylı çapraz çanta.' },
  { cat: 'aksesuar', name: 'Hasır Plaj Çantası', price: 259.9, imgs: [IMG.v, IMG.f], sizes: ['STD'], rating: 4.4, desc: 'Doğal hasır dokulu, ferah hacimli yazlık çanta.' },
  { cat: 'aksesuar', name: 'Tote Bag', price: 229.9, old: 289.9, imgs: [IMG.g2, IMG.e], sizes: ['STD'], rating: 4.3, is_new: true, desc: 'Geniş hacimli, günlük kullanıma uygun tote çanta.' },
];

function slugify(str) {
  const map = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', İ: 'i' };
  return str
    .toLowerCase()
    .replace(/[çğıöşüİ]/g, (c) => map[c] || c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function seed() {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Kategoriler
    const catIdBySlug = {};
    for (const c of categories) {
      const res = await client.query(
        `INSERT INTO categories (slug, name, description, image_url, sort_order)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [c.slug, c.name, c.description, c.image_url, c.sort_order]
      );
      catIdBySlug[c.slug] = res.rows[0].id;
    }
    console.log(`==> ${categories.length} kategori eklendi.`);

    // Ürünler
    let count = 0;
    const usedSlugs = new Set();
    for (const p of products) {
      let baseSlug = slugify(p.name);
      let slug = baseSlug;
      let n = 2;
      while (usedSlugs.has(slug)) slug = `${baseSlug}-${n++}`;
      usedSlugs.add(slug);

      const stock = 5 + Math.floor(Math.random() * 40);
      const res = await client.query(
        `INSERT INTO products
           (category_id, slug, name, description, price, old_price, stock, rating, is_new, is_featured)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [
          catIdBySlug[p.cat],
          slug,
          p.name,
          p.desc,
          p.price,
          p.old ?? null,
          stock,
          p.rating ?? 5.0,
          !!p.is_new,
          !!p.is_featured,
        ]
      );
      const productId = res.rows[0].id;

      // Görseller
      let order = 0;
      for (const imgId of p.imgs) {
        await client.query(
          `INSERT INTO product_images (product_id, url, sort_order) VALUES ($1,$2,$3)`,
          [productId, U(imgId), order++]
        );
      }

      // Bedenler
      for (const size of p.sizes) {
        await client.query(
          `INSERT INTO product_sizes (product_id, size) VALUES ($1,$2)`,
          [productId, size]
        );
      }
      count++;
    }
    console.log(`==> ${count} ürün eklendi.`);

    await client.query('COMMIT');
    console.log('==> Seed işlemi tamamlandı.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed hatası:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
