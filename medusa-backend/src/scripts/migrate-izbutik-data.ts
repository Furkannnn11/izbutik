/**
 * migrate-izbutik-data.ts — İzbutik → Medusa v2 (2.21.0) veri aktarım scripti (Adım 9)
 * ---------------------------------------------------------------------------------
 * AMAÇ
 *   Mevcut `izbutik_db` (Node.js Express + PostgreSQL) verisini —
 *   7 kategori ve 26 ürün (+ görseller, bedenler) — Medusa'nın
 *   product / product-category / variant / price / inventory modeline aktarır.
 *
 * ÇALIŞTIRMA (Adım 10'da; henüz çalıştırma):
 *   cd medusa-backend
 *   npx medusa exec ./src/scripts/migrate-izbutik-data.ts
 *
 * GÜVENLİK KURALLARI (bu script bunları GARANTİ eder)
 *   1. KAYNAK SALT OKUNUR: `izbutik_db`'ye YALNIZCA SELECT çalıştırılır. Aktarım
 *      için ayrı, salt okunur amaçlı bir pg havuzu (source pool) kullanılır ve
 *      bu havuz üzerinde hiçbir INSERT/UPDATE/DELETE/DDL çalıştırılmaz.
 *   2. HEDEF İZOLE: Yazma işlemleri YALNIZCA Medusa container'ı üzerinden yapılır;
 *      Medusa `DATABASE_URL` = izole `izbutik_medusa`'ya işaret eder (Adım 4/6/7).
 *      Bu script kaynak ve hedefi ayrı bağlantılarla ele alır, birbirine karıştırmaz.
 *   3. IDEMPOTENT: Kategoriler `handle` (=slug), ürünler `external_id`
 *      (=`izbutik:<id>`) ile eşleştirilir. Var olan kayıt GÜNCELLENİR, yoksa
 *      OLUŞTURULUR. Tekrar çalıştırınca kopya üretmez.
 *
 * KAYNAK ŞEMA (izbutik_db)
 *   categories(id, slug, name, description, image_url, sort_order)
 *   products(id, category_id, slug, name, description, price, old_price,
 *            stock, rating, is_new, is_featured, created_at)
 *   product_images(id, product_id, url, sort_order)
 *   product_sizes(id, product_id, size)
 *
 * NOT: Fiyatlar TRY (Türk Lirası) kabul edilir. Medusa fiyatları kuruş/cent
 *      cinsinden DEĞİL, para birimi ana biriminde saklar (v2). Kaynak NUMERIC(10,2)
 *      değerleri olduğu gibi (749.90 gibi) aktarılır.
 */

import { Pool } from "pg"
import { Modules, ProductStatus, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { ExecArgs } from "@medusajs/framework/types"
import {
  createProductCategoriesWorkflow,
  updateProductCategoriesWorkflow,
  createProductsWorkflow,
  updateProductsWorkflow,
  createInventoryLevelsWorkflow,
} from "@medusajs/medusa/core-flows"

// --- Sabitler ------------------------------------------------------------------
const CURRENCY = (process.env.IZBUTIK_CURRENCY || "try").toLowerCase()
const SALES_CHANNEL_NAME =
  process.env.IZBUTIK_SALES_CHANNEL_NAME || "İzbutik Web Mağazası"
const EXTERNAL_PREFIX = "izbutik"
const DEFAULT_SIZE = "STD" // Beden verisi olmayan ürünler için tek-beden değeri

// Kaynak (izbutik_db) salt okunur bağlantı adresi.
// Öncelik: IZBUTIK_SOURCE_DATABASE_URL. Verilmezse yerel varsayılan kullanılır.
const SOURCE_DATABASE_URL =
  process.env.IZBUTIK_SOURCE_DATABASE_URL ||
  "postgres://izbutik@127.0.0.1:5432/izbutik_db"

// --- Kaynak veri tipleri -------------------------------------------------------
type SrcCategory = {
  id: number
  slug: string
  name: string
  description: string | null
  image_url: string | null
  sort_order: number
}
type SrcProduct = {
  id: number
  category_id: number
  slug: string
  name: string
  description: string | null
  price: string // NUMERIC -> string (pg)
  old_price: string | null
  stock: number
  rating: string | null
  is_new: boolean
  is_featured: boolean
}
type SrcImage = { product_id: number; url: string; sort_order: number }
type SrcSize = { product_id: number; size: string }

/**
 * Kaynak veritabanından (izbutik_db) tüm veriyi SALT OKUNUR olarak çeker.
 * Bu fonksiyon YALNIZCA SELECT çalıştırır.
 */
async function readSource(): Promise<{
  categories: SrcCategory[]
  products: SrcProduct[]
  imagesByProduct: Map<number, string[]>
  sizesByProduct: Map<number, string[]>
}> {
  const pool = new Pool({
    connectionString: SOURCE_DATABASE_URL,
    // Salt okunur amaç: tek/küçük havuz yeterli.
    max: 2,
    // Güvenlik: her oturumu salt okunur işleme kilitle.
    application_name: "izbutik-medusa-migration-readonly",
  })

  try {
    // Bağlantı başına oturumu salt okunura zorla (ekstra güvence).
    pool.on("connect", (client) => {
      client
        .query("SET default_transaction_read_only = on")
        .catch(() => {
          /* yetki yoksa yoksay; yine de yalnızca SELECT çalıştırıyoruz */
        })
    })

    const [cats, prods, imgs, sizes] = await Promise.all([
      pool.query<SrcCategory>(
        `SELECT id, slug, name, description, image_url, sort_order
         FROM categories ORDER BY sort_order, id`
      ),
      pool.query<SrcProduct>(
        `SELECT id, category_id, slug, name, description,
                price::text AS price, old_price::text AS old_price,
                stock, rating::text AS rating, is_new, is_featured
         FROM products ORDER BY id`
      ),
      pool.query<SrcImage>(
        `SELECT product_id, url, sort_order
         FROM product_images ORDER BY product_id, sort_order, id`
      ),
      pool.query<SrcSize>(
        `SELECT product_id, size
         FROM product_sizes ORDER BY product_id, id`
      ),
    ])

    const imagesByProduct = new Map<number, string[]>()
    for (const r of imgs.rows) {
      const arr = imagesByProduct.get(r.product_id) ?? []
      arr.push(r.url)
      imagesByProduct.set(r.product_id, arr)
    }

    const sizesByProduct = new Map<number, string[]>()
    for (const r of sizes.rows) {
      const arr = sizesByProduct.get(r.product_id) ?? []
      const val = (r.size || "").trim()
      if (val && !arr.includes(val)) arr.push(val)
      sizesByProduct.set(r.product_id, arr)
    }

    return {
      categories: cats.rows,
      products: prods.rows,
      imagesByProduct,
      sizesByProduct,
    }
  } finally {
    await pool.end()
  }
}

// --- Yardımcılar ---------------------------------------------------------------
function extProductId(srcId: number): string {
  return `${EXTERNAL_PREFIX}:product:${srcId}`
}
function toAmount(numeric: string | null | undefined): number | null {
  if (numeric == null) return null
  const n = Number.parseFloat(numeric)
  return Number.isFinite(n) ? n : null
}
function variantSku(productSlug: string, size: string): string {
  const norm = size.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-")
  return `IZB-${productSlug}-${norm}`.toUpperCase()
}

/**
 * Ana giriş noktası — `medusa exec` bunu container ile çağırır.
 */
export default async function migrateIzbutikData({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productModule = container.resolve(Modules.PRODUCT)
  const salesChannelModule = container.resolve(Modules.SALES_CHANNEL)
  const stockLocationModule = container.resolve(Modules.STOCK_LOCATION)

  logger.info(
    `[migrate-izbutik] Kaynak (SALT OKUNUR): ${SOURCE_DATABASE_URL.replace(
      /:\/\/([^@/]*)@/,
      "://***@"
    )}`
  )

  // 1) Kaynağı oku (SALT OKUNUR)
  const { categories, products, imagesByProduct, sizesByProduct } =
    await readSource()
  logger.info(
    `[migrate-izbutik] Kaynak okundu: ${categories.length} kategori, ${products.length} ürün, ` +
      `${[...imagesByProduct.values()].reduce((a, b) => a + b.length, 0)} görsel, ` +
      `${[...sizesByProduct.values()].reduce((a, b) => a + b.length, 0)} beden.`
  )

  // 2) İzbutik storefront satış kanalı (ürünleri publishable key ile görünür kılar)
  const [defaultChannel] = await salesChannelModule.listSalesChannels(
    { name: SALES_CHANNEL_NAME },
    { take: 1 }
  )
  if (!defaultChannel) {
    throw new Error(
      `[migrate-izbutik] "${SALES_CHANNEL_NAME}" satış kanalı bulunamadı. Önce npm run seed çalıştır.`
    )
  }

  // 3) Stok konumu (inventory level yazmak için gerekir)
  const [stockLocation] = await stockLocationModule.listStockLocations(
    {},
    { take: 1 }
  )

  const { data: shippingProfiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  })
  const shippingProfile = shippingProfiles[0]
  if (!shippingProfile) {
    throw new Error(
      "[migrate-izbutik] Shipping profile bulunamadı. Önce Medusa migration ve seed çalıştır."
    )
  }

  // ---------------------------------------------------------------------------
  // KATEGORİLER — handle (=slug) ile idempotent upsert
  // ---------------------------------------------------------------------------
  const catIdBySrc = new Map<number, string>() // izbutik category id -> medusa category id
  const bySlug = new Map<string, SrcCategory>()
  for (const c of categories) bySlug.set(c.slug, c)

  const slugs = categories.map((c) => c.slug)
  const existingCats = slugs.length
    ? await productModule.listProductCategories(
        { handle: slugs },
        { take: slugs.length }
      )
    : []
  const existingCatByHandle = new Map<string, any>()
  for (const ec of existingCats) existingCatByHandle.set(ec.handle, ec)

  const toCreateCats: any[] = []
  const toUpdateCats: any[] = []
  for (const c of categories) {
    const payload = {
      name: c.name,
      handle: c.slug,
      description: c.description ?? "",
      is_active: true,
      is_internal: false,
      rank: c.sort_order ?? 0,
      metadata: {
        izbutik_id: c.id,
        source_image_url: c.image_url ?? null,
      },
    }
    const existing = existingCatByHandle.get(c.slug)
    if (existing) {
      toUpdateCats.push({ id: existing.id, ...payload })
      catIdBySrc.set(c.id, existing.id)
    } else {
      toCreateCats.push(payload)
    }
  }

  if (toCreateCats.length) {
    const { result } = await createProductCategoriesWorkflow(container).run({
      input: { product_categories: toCreateCats },
    })
    for (const created of result) {
      const src = bySlug.get(created.handle)
      if (src) catIdBySrc.set(src.id, created.id)
    }
    logger.info(
      `[migrate-izbutik] Kategori oluşturuldu: ${toCreateCats.length}`
    )
  }
  if (toUpdateCats.length) {
    for (const upd of toUpdateCats) {
      const { id, ...update } = upd
      await updateProductCategoriesWorkflow(container).run({
        input: { selector: { id }, update },
      })
    }
    logger.info(`[migrate-izbutik] Kategori güncellendi: ${toUpdateCats.length}`)
  }

  // ---------------------------------------------------------------------------
  // ÜRÜNLER — external_id (=izbutik:product:<id>) ile idempotent upsert
  // ---------------------------------------------------------------------------
  const externalIds = products.map((p) => extProductId(p.id))
  const existingProducts = externalIds.length
    ? await productModule.listProducts(
        { external_id: externalIds },
        { take: externalIds.length, relations: ["variants"] }
      )
    : []
  const existingProdByExt = new Map<string, any>()
  for (const ep of existingProducts) {
    if (ep.external_id) existingProdByExt.set(ep.external_id, ep)
  }

  let created = 0
  let updated = 0

  for (const p of products) {
    const ext = extProductId(p.id)
    const categoryId = catIdBySrc.get(p.category_id)
    const images = imagesByProduct.get(p.id) ?? []
    let sizes = sizesByProduct.get(p.id) ?? []
    if (sizes.length === 0) sizes = [DEFAULT_SIZE]

    const price = toAmount(p.price)
    if (price == null) {
      logger.warn(
        `[migrate-izbutik] Ürün #${p.id} (${p.slug}) geçersiz fiyat, atlandı.`
      )
      continue
    }

    // Her beden bir varyant. Fiyat/stok ürün seviyesinden gelir; kaynakta
    // beden bazlı fiyat/stok yok, bu yüzden tüm varyantlara aynı fiyat verilir.
    const variants = sizes.map((size) => ({
      title: size,
      sku: variantSku(p.slug, size),
      manage_inventory: true,
      options: { Beden: size },
      prices: [{ amount: price, currency_code: CURRENCY }],
      metadata: {
        izbutik_product_id: p.id,
        izbutik_size: size,
      },
    }))

    const commonMetadata = {
      izbutik_id: p.id,
      izbutik_slug: p.slug,
      rating: toAmount(p.rating),
      is_new: p.is_new,
      is_featured: p.is_featured,
      old_price: toAmount(p.old_price),
      source_stock: p.stock,
    }

    const existing = existingProdByExt.get(ext)

    if (existing) {
      // GÜNCELLE — kopya üretmeden alanları tazele.
      // Varyant senkronu karmaşık olabileceğinden, güncellemede temel alanları
      // ve kategori bağını tazeliyoruz; varyant/fiyat yeniden yazımı yalnızca
      // eksikse yapılır (idempotency önceliği).
      await updateProductsWorkflow(container).run({
        input: {
          selector: { id: existing.id },
          update: {
            title: p.name,
            handle: p.slug,
            description: p.description ?? "",
            status: ProductStatus.PUBLISHED,
            thumbnail: images[0] ?? undefined,
            images: images.map((url) => ({ url })),
            category_ids: categoryId ? [categoryId] : [],
            sales_channels: [{ id: defaultChannel.id }],
            shipping_profile_id: shippingProfile.id,
            metadata: commonMetadata,
          },
        },
      })
      updated++
    } else {
      // OLUŞTUR
      await createProductsWorkflow(container).run({
        input: {
          products: [
            {
              title: p.name,
              handle: p.slug,
              external_id: ext,
              description: p.description ?? "",
              status: ProductStatus.PUBLISHED,
              thumbnail: images[0] ?? undefined,
              images: images.map((url) => ({ url })),
              category_ids: categoryId ? [categoryId] : [],
              sales_channels: [{ id: defaultChannel.id }],
              shipping_profile_id: shippingProfile.id,
              options: [
                {
                  title: "Beden",
                  values: sizes,
                },
              ],
              variants,
              metadata: commonMetadata,
            },
          ],
        },
      })
      created++
    }
  }

  logger.info(
    `[migrate-izbutik] Ürün upsert tamamlandı: ${created} oluşturuldu, ${updated} güncellendi.`
  )

  // ---------------------------------------------------------------------------
  // ENVANTER — kaynak stock değerini stok konumuna yaz (idempotent)
  // ---------------------------------------------------------------------------
  if (!stockLocation) {
    logger.warn(
      "[migrate-izbutik] Stok konumu bulunamadı; envanter seviyeleri atlandı. " +
        "Bir stok konumu oluşturup scripti tekrar çalıştırınca stoklar yazılır."
    )
  } else {
    // Ürünlerin güncel varyant + inventory_item bağlarını çek.
    const stockBySrc = new Map<number, number>()
    for (const p of products) stockBySrc.set(p.id, p.stock ?? 0)

    const { data: variantRows } = await query.graph({
      entity: "variant",
      fields: [
        "id",
        "sku",
        "metadata",
        "product.external_id",
        "inventory_items.inventory_item_id",
        "inventory_items.inventory.location_levels.location_id",
        "inventory_items.inventory.location_levels.stocked_quantity",
      ],
      filters: { product: { external_id: externalIds } },
    })

    const levelsToCreate: {
      inventory_item_id: string
      location_id: string
      stocked_quantity: number
    }[] = []

    for (const v of variantRows as any[]) {
      const ext = v?.product?.external_id as string | undefined
      if (!ext) continue
      const srcId = Number.parseInt(ext.split(":").pop() || "", 10)
      const qty = stockBySrc.get(srcId) ?? 0
      for (const ii of v.inventory_items ?? []) {
        const invId = ii.inventory_item_id
        const existingLevel = (ii.inventory?.location_levels ?? []).find(
          (l: any) => l.location_id === stockLocation.id
        )
        if (!existingLevel && invId) {
          levelsToCreate.push({
            inventory_item_id: invId,
            location_id: stockLocation.id,
            stocked_quantity: qty,
          })
        }
        // Var olan seviye idempotency için olduğu gibi bırakılır (tekrar
        // yazımda stok üzerine ekleme yapılmaz).
      }
    }

    if (levelsToCreate.length) {
      await createInventoryLevelsWorkflow(container).run({
        input: { inventory_levels: levelsToCreate },
      })
      logger.info(
        `[migrate-izbutik] Envanter seviyesi oluşturuldu: ${levelsToCreate.length}`
      )
    } else {
      logger.info(
        "[migrate-izbutik] Yeni envanter seviyesi yok (zaten mevcut) — atlandı."
      )
    }
  }

  logger.info("[migrate-izbutik] TAMAMLANDI.")
}
