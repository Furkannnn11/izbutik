// Paylaşım önizlemesi (Open Graph / Twitter Card) için sunucu tarafı meta üretimi.
//
// WhatsApp, Instagram DM, Telegram, Facebook ve X gibi uygulamalar link
// önizlemesini oluştururken JavaScript ÇALIŞTIRMAZ; yalnız ilk HTML'deki
// <meta> etiketlerini okur. Bu yüzden /urun/:slug ve /kategori/:slug için
// index.html şablonundaki varsayılan blok sunucuda sayfaya özel etiketlerle
// değiştirilir.

export const SITE_NAME = 'İzbutik';
export const DEFAULT_TITLE = 'İzbutik · Modern Kadın Giyim';
export const DEFAULT_DESCRIPTION =
  'İzbutik - Kadın giyimde trend ve şıklık. Elbise, üst giyim, dış giyim ve daha fazlası.';
// Ana sayfa hero görseli (gerçek İzbutik ürün fotoğrafı, Shopier CDN)
export const DEFAULT_IMAGE_PATH =
  'https://cdn.shopier.app/pictures_large/izbutik20_1b3f7fcea77a784e7c09e31fd71a9725.jpeg';

const META_START = '<!-- share-meta:start -->';
const META_END = '<!-- share-meta:end -->';

export function escAttr(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Uzun açıklamayı kelime sınırında kısaltır; satır sonlarını tek boşluğa indirir.
export function clip(text = '', max = 180) {
  const flat = String(text).replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

export function absoluteUrl(url, baseUrl) {
  if (!url) return '';
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return '';
  }
}

export function formatTry(amount) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(
    Number(amount) || 0
  );
}

export function defaultShareMeta(baseUrl, path = '/') {
  return {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    url: absoluteUrl(path, baseUrl),
    image: absoluteUrl(DEFAULT_IMAGE_PATH, baseUrl),
    type: 'website',
  };
}

export function productShareMeta(product, baseUrl) {
  const path = `/urun/${encodeURIComponent(product.slug)}`;
  const price = Number(product.price) || 0;
  const desc = clip(product.description || '') ||
    `${product.category_name || 'Yeni sezon'} · İzbutik'te keşfet.`;
  return {
    title: `${product.name} · ${SITE_NAME}`,
    description: price > 0 ? `${formatTry(price)} · ${desc}` : desc,
    url: absoluteUrl(path, baseUrl),
    image: absoluteUrl(product.images?.[0], baseUrl) || absoluteUrl(DEFAULT_IMAGE_PATH, baseUrl),
    imageAlt: product.name,
    type: 'product',
    price,
    available: Number(product.stock) > 0,
  };
}

export function categoryShareMeta(category, baseUrl) {
  const path = `/kategori/${encodeURIComponent(category.slug)}`;
  return {
    title: `${category.name} · ${SITE_NAME}`,
    description: clip(category.description || '') || `İzbutik ${category.name} koleksiyonunu keşfet.`,
    url: absoluteUrl(path, baseUrl),
    image: absoluteUrl(category.image, baseUrl) || absoluteUrl(DEFAULT_IMAGE_PATH, baseUrl),
    imageAlt: category.name,
    type: 'website',
  };
}

export function buildMetaTags(meta) {
  const tags = [
    `<title>${escAttr(meta.title)}</title>`,
    `<meta name="description" content="${escAttr(meta.description)}" />`,
    `<link rel="canonical" href="${escAttr(meta.url)}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="tr_TR" />`,
    `<meta property="og:type" content="${escAttr(meta.type)}" />`,
    `<meta property="og:title" content="${escAttr(meta.title)}" />`,
    `<meta property="og:description" content="${escAttr(meta.description)}" />`,
    `<meta property="og:url" content="${escAttr(meta.url)}" />`,
    `<meta property="og:image" content="${escAttr(meta.image)}" />`,
  ];
  if (meta.imageAlt) tags.push(`<meta property="og:image:alt" content="${escAttr(meta.imageAlt)}" />`);
  if (meta.noindex) tags.push('<meta name="robots" content="noindex, follow" />');
  if (meta.type === 'product' && meta.price > 0) {
    tags.push(
      `<meta property="product:price:amount" content="${escAttr(meta.price.toFixed(2))}" />`,
      `<meta property="product:price:currency" content="TRY" />`,
      `<meta property="product:availability" content="${meta.available ? 'in stock' : 'out of stock'}" />`
    );
  }
  tags.push(
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escAttr(meta.title)}" />`,
    `<meta name="twitter:description" content="${escAttr(meta.description)}" />`,
    `<meta name="twitter:image" content="${escAttr(meta.image)}" />`
  );
  return tags.map((t) => `  ${t}`).join('\n');
}

// index.html şablonundaki işaretli bloğu verilen meta ile değiştirir.
export function injectShareMeta(html, meta) {
  const start = html.indexOf(META_START);
  const end = html.indexOf(META_END);
  if (start === -1 || end === -1 || end < start) return html;
  return `${html.slice(0, start + META_START.length)}\n${buildMetaTags(meta)}\n  ${html.slice(end)}`;
}
