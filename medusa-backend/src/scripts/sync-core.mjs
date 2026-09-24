/**
 * sync-core.mjs — Shopier→Medusa senkron aracının SAF çekirdek mantığı
 * ============================================================================
 * DB / Medusa container / ağ erişimi YOKTUR. Bu modül hem üretim scripti
 * (`sync-shopier-catalog.ts`) hem de hedefli testler (`sync-shopier-catalog.test.mjs`)
 * tarafından TEK KAYNAK olarak import edilir — böylece testler üretim mantığının
 * bir kopyasını değil, gerçeğini doğrular.
 *
 * KALICILAŞTIRMA (Task 5): Bu dosya önceki plan_9580f123 artifactindeki
 * sync-core.mjs referansının tracked (kaynağa commit edilen) sürümüdür. Aynı
 * saf sözleşmeyi (external_id = shopier:<id>, kategori çıkarımı, SKU, plan
 * özeti) korur; hiçbir yan etkisi yoktur.
 */

export const CURRENCY = (process.env.IZBUTIK_CURRENCY || "try").toLowerCase()
export const SALES_CHANNEL_NAME =
  process.env.IZBUTIK_SALES_CHANNEL_NAME || "İzbutik Web Mağazası"
export const SHOPIER_EXTERNAL_PREFIX = "shopier"
export const DEFAULT_SIZE = "STD"
export const OPTION_TITLE = "Beden"

/**
 * Kategori anahtar-kelime kuralları (spesifik → genel sıralı).
 * Ürün adından Medusa'nın 7-kategorili taksonomisine deterministik eşler.
 * Sıra ÖNEMLİDİR: "triko takım" → önce "takim" kuralına takılır.
 */
export const CATEGORY_KEYWORD_RULES = [
  { slug: "takim", keywords: ["takım", "takim"] },
  { slug: "aksesuar", keywords: ["çanta", "canta", "goyard", "miu miu", "bag", "clutch"] },
  { slug: "dis-giyim", keywords: ["ceket", "mont", "trençkot", "trenckot", "kaban", "bomber", "blazer", "panço", "panco"] },
  { slug: "triko", keywords: ["hırka", "hirka", "kazak", "triko", "sweat", "kaşe", "kase", "angora", "örgü", "orgu"] },
  { slug: "elbise", keywords: ["elbise", "tunik", "tulum"] },
  { slug: "ust-giyim", keywords: ["gömlek", "gomlek", "bluz", "body", "büstiyer", "bustiyer", "tişört", "tisort", "crop"] },
  { slug: "alt-giyim", keywords: ["etek", "pantolon", "şort", "sort", "jean", "tayt", "palazzo"] },
]
export const CATEGORY_FALLBACK_SLUG = "elbise"

export function shopierExternalId(shopierId) {
  return `${SHOPIER_EXTERNAL_PREFIX}:${shopierId}`
}

export function normalizeTr(s) {
  return (s || "")
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .trim()
}

export function slugify(s) {
  return normalizeTr(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}

export function resolveCategorySlug(name) {
  const n = normalizeTr(name)
  for (const rule of CATEGORY_KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      if (n.includes(normalizeTr(kw))) return rule.slug
    }
  }
  return CATEGORY_FALLBACK_SLUG
}

export function buildProductInput(prod, opts = {}) {
  const ext = shopierExternalId(prod.id)
  const price = Number(prod?.price?.try)
  const handle = `${slugify(prod.name)}-shopier-${prod.id}`

  const gallery =
    (prod?.photos?.gallery_large && prod.photos.gallery_large.length
      ? prod.photos.gallery_large
      : prod?.photos?.gallery_scaledoriginal) || []
  const images = gallery.map((url) => ({ url }))
  const thumbnail = gallery[0]

  const hasAxis = !!prod?.variants?.has_variation_axis
  const optionRows = hasAxis
    ? (prod.variants.options || []).map((o) => ({ name: String(o.name), stock: Number(o.stock) || 0 }))
    : [{ name: DEFAULT_SIZE, stock: Number(prod?.product_level_stock) || 0 }]
  const sizeValues = optionRows.map((o) => o.name)

  const categorySlug = resolveCategorySlug(prod.name)
  const categoryId = opts.categoryIdBySlug?.get(categorySlug)

  const metadata = {
    shopier_id: prod.id,
    shopier_link: prod.link,
    source: "shopier:izbutik20",
    resolved_category_slug: categorySlug,
    product_level_stock: prod?.product_level_stock ?? null,
    discount: prod?.discount ?? null,
    photo_count: gallery.length,
  }

  const variants = optionRows.map((o) => ({
    title: o.name,
    sku: `IZB-SHP-${prod.id}-${slugify(o.name).toUpperCase() || "STD"}`,
    manage_inventory: true,
    options: { [OPTION_TITLE]: o.name },
    prices: [{ amount: price, currency_code: CURRENCY }],
    metadata: { shopier_id: prod.id, shopier_variant_size: o.name, shopier_variant_stock: o.stock },
  }))

  return {
    external_id: ext,
    handle,
    title: prod.name,
    description: prod?.description?.text || prod?.description?.html || "",
    thumbnail,
    images,
    category_slug: categorySlug,
    category_id: categoryId ?? null,
    sales_channel_id: opts.salesChannelId ?? null,
    shipping_profile_id: opts.shippingProfileId ?? null,
    options: [{ title: OPTION_TITLE, values: sizeValues }],
    variants,
    metadata,
    _stock_by_size: Object.fromEntries(optionRows.map((o) => [o.name, o.stock])),
    _price: price,
  }
}

export function buildSyncPlan(manifest, classification) {
  const products = manifest?.products || []
  const upserts = products.map((p) => {
    const input = buildProductInput(p)
    return {
      shopier_id: p.id,
      external_id: input.external_id,
      title: input.title,
      price: input._price,
      currency: CURRENCY,
      category_slug: input.category_slug,
      variant_count: input.variants.length,
      image_count: input.images.length,
      stock_by_size: input._stock_by_size,
    }
  })

  const classifications = classification?.classifications || []
  const toArchive = classifications
    .filter((c) => c.classification === "archive-demo")
    .map((c) => ({ external_id: c.medusa_external_id, demo_id: c.demo_id, name: c.demo_name, action: "unpublish (status=DRAFT, reversible)" }))
  const manualReview = classifications
    .filter((c) => c.classification === "manual-review")
    .map((c) => ({ external_id: c.medusa_external_id, demo_id: c.demo_id, name: c.demo_name, action: "UNTOUCHED (requires human review)" }))

  return {
    upsert: upserts,
    archive_demo: toArchive,
    manual_review_untouched: manualReview,
    summary: {
      shopier_products_to_upsert: upserts.length,
      demo_to_archive_reversible: toArchive.length,
      demo_manual_review_untouched: manualReview.length,
      total_variants: upserts.reduce((a, u) => a + u.variant_count, 0),
      total_images: upserts.reduce((a, u) => a + u.image_count, 0),
    },
  }
}
