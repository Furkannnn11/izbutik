/**
 * sync-shopier-catalog.ts — Shopier (izbutik20) → Medusa v2 (2.21.0) kalıcı,
 * idempotent katalog senkronizasyon scripti (Task 5)
 * ============================================================================
 * AMAÇ
 *   `izbutik_full_fix/03_product_manifest.json` (29 gerçek stok Shopier ürünü,
 *   133 gerçek görsel, 68+2 varyant) manifestini Medusa'nın product /
 *   product-category / variant / price / inventory modeline KALICI, tekrar
 *   çalıştırılabilir biçimde uygular. Ayrıca `04_mapping_classification.json`
 *   sınıflandırmasına göre demo ürünleri GERİ ALINABİLİR biçimde arşivler.
 *
 *   Bu script, önceki plan_9580f123'te yalnız scratch/artifact olarak kalan
 *   `sync-core.mjs` mantığını kaynağa commit edilmiş, npm scriptli ve testli
 *   bir üretim aracına dönüştürür (kaynakta kalıcı DEĞİLDİ).
 *
 * ÇALIŞTIRMA (medusa-backend/ içinde, Node 22 LTS):
 *   # 1) VARSAYILAN: dry-run (hiçbir yazım yapılmaz, plan yazdırılır)
 *   npm run sync:shopier
 *   # 2) Açık uygulama (yazım):
 *   npm run sync:shopier:apply           # veya: medusa exec ... -- --apply
 *   # 3) Demo ürünleri geri-alınabilir arşivle (DRAFT):
 *   npm run sync:shopier:remove-demo     # --apply --force-remove-demo
 *   # 4) Arşivlenmiş demo ürünleri geri getir (PUBLISHED):
 *   npm run sync:shopier:restore         # --apply --restore-archived
 *
 * BAYRAKLAR
 *   --apply                 Yazımı açar. YOKSA dry-run (varsayılan güvenli).
 *                           SYNC_APPLY=1 ortam değişkeni de açar.
 *   --force-remove-demo     Task 4 'archive-demo' ürünlerini status=DRAFT yapar
 *                           (geri alınabilir; KALICI SİLME YOK). --apply gerekir.
 *   --restore-archived      Bu araçla arşivlenmiş (metadata.izbutik_archived)
 *                           ürünleri tekrar PUBLISHED yapar. --apply gerekir.
 *   --manifest=<path>       Manifest yolu (varsayılan izbutik_full_fix altında).
 *   --classification=<path> Sınıflandırma yolu.
 *
 * GÜVENLİK SÖZLEŞMELERİ
 *   1. AĞ YOK: Shopier'e HİÇBİR istek atılmaz. Yalnız yerel manifest okunur.
 *   2. VARSAYILAN GÜVENLİ: --apply olmadan hiçbir yazım yapılmaz.
 *   3. IDEMPOTENT: Ürünler external_id=shopier:<id>, kategoriler handle=slug ile
 *      eşleşir; varsa GÜNCELLENİR, yoksa OLUŞTURULUR. Tekrar çalıştırınca kopya
 *      üretmez. Envanter seviyesi yalnız eksikse oluşturulur (stok üzerine
 *      ekleme yapılmaz).
 *   4. GERİ ALINABİLİR: Demo temizliği kalıcı silme değil, DRAFT'a alma; her
 *      arşiv metadata.izbutik_archived=true ile işaretlenir ve geri getirilebilir.
 */

import fs from "node:fs"
import path from "node:path"
import { Modules, ProductStatus, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { ExecArgs } from "@medusajs/framework/types"
import {
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  updateProductsWorkflow,
  createInventoryLevelsWorkflow,
} from "@medusajs/medusa/core-flows"
// NOT: sync-core.mjs saf ESM'dir. `medusa exec` scripti ts-node ile CommonJS
// olarak derlediğinden statik `import ... from "./sync-core.mjs"` çalışma
// anında ERR_REQUIRE_ESM verir. Bu yüzden çekirdek, async giriş noktası
// içinde dinamik `import()` ile yüklenir (CJS'ten ESM'e güvenli köprü).
// Tipler için ayrı bir `import type` kullanılır (yalnız derleme zamanı).
import type * as SyncCore from "./sync-core.mjs"

// --- Bayrak / girdi çözümleme ---------------------------------------------
function hasFlag(name: string): boolean {
  return process.argv.slice(2).includes(name)
}
function flagValue(name: string): string | undefined {
  const pref = `${name}=`
  const hit = process.argv.slice(2).find((a) => a.startsWith(pref))
  return hit ? hit.slice(pref.length) : undefined
}

const APPLY = hasFlag("--apply") || process.env.SYNC_APPLY === "1"
const FORCE_REMOVE_DEMO = hasFlag("--force-remove-demo")
const RESTORE_ARCHIVED = hasFlag("--restore-archived")

// Manifest/sınıflandırma yolları: bayrak > repo kökü izbutik_full_fix/ > cwd.
const REPO_ARTIFACT_DIR = path.resolve(process.cwd(), "..", "izbutik_full_fix")
const MANIFEST_PATH =
  flagValue("--manifest") ||
  path.join(REPO_ARTIFACT_DIR, "03_product_manifest.json")
const CLASSIFICATION_PATH =
  flagValue("--classification") ||
  path.join(REPO_ARTIFACT_DIR, "04_mapping_classification.json")

function readJson(p: string): any {
  return JSON.parse(fs.readFileSync(p, "utf8"))
}

/**
 * Ana giriş noktası — `medusa exec` bunu container ile çağırır.
 */
export default async function syncShopierCatalog({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const productModule = container.resolve(Modules.PRODUCT)
  const salesChannelModule = container.resolve(Modules.SALES_CHANNEL)
  const stockLocationModule = container.resolve(Modules.STOCK_LOCATION)

  // Saf ESM çekirdeği CJS ts-node bağlamından güvenle yükle (bkz. üstteki not).
  const core = (await import("./sync-core.mjs")) as typeof SyncCore
  const {
    SALES_CHANNEL_NAME,
    SHOPIER_EXTERNAL_PREFIX,
    buildProductInput,
    buildSyncPlan,
    resolveCategorySlug,
  } = core

  logger.info(
    `[sync-shopier] Manifest: ${MANIFEST_PATH} | Sınıflandırma: ${CLASSIFICATION_PATH}`
  )
  logger.info(
    `[sync-shopier] Mod: ${
      APPLY ? "APPLY (yazım açık)" : "DRY-RUN (yalnız plan, yazım YOK)"
    }${FORCE_REMOVE_DEMO ? " +force-remove-demo" : ""}${
      RESTORE_ARCHIVED ? " +restore-archived" : ""
    }`
  )

  const manifest = readJson(MANIFEST_PATH)
  const classification = fs.existsSync(CLASSIFICATION_PATH)
    ? readJson(CLASSIFICATION_PATH)
    : { classifications: [] }

  // Saf plan (DB'siz) — dry-run çıktısının ve doğrulamanın temeli.
  const plan = buildSyncPlan(manifest, classification)
  logger.info(
    `[sync-shopier] PLAN: ${plan.summary.shopier_products_to_upsert} ürün upsert, ` +
      `${plan.summary.total_variants} varyant, ${plan.summary.total_images} görsel, ` +
      `arşivlenecek demo (geri alınabilir): ${plan.summary.demo_to_archive_reversible}, ` +
      `dokunulmayan (manual-review): ${plan.summary.demo_manual_review_untouched}.`
  )

  // ---- Hedef kaynaklar (kategori/kanal/profil/stok konumu) -----------------
  const [defaultChannel] = await salesChannelModule.listSalesChannels(
    { name: SALES_CHANNEL_NAME },
    { take: 1 }
  )
  if (!defaultChannel) {
    throw new Error(
      `[sync-shopier] "${SALES_CHANNEL_NAME}" satış kanalı bulunamadı. Önce npm run seed çalıştır.`
    )
  }

  const { data: shippingProfiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  })
  const shippingProfile = shippingProfiles[0]
  if (!shippingProfile) {
    throw new Error(
      "[sync-shopier] Shipping profile bulunamadı. Önce Medusa migration ve seed çalıştır."
    )
  }

  const [stockLocation] = await stockLocationModule.listStockLocations({}, { take: 1 })

  // Manifestteki ürünlerin çözülen kategori slug'ları → mevcut Medusa kategorileri.
  const neededSlugs = Array.from(
    new Set((manifest.products || []).map((p: any) => resolveCategorySlug(p.name)))
  ) as string[]
  const existingCats = neededSlugs.length
    ? await productModule.listProductCategories(
        { handle: neededSlugs },
        { take: neededSlugs.length }
      )
    : []
  const categoryIdBySlug = new Map<string, string>()
  for (const c of existingCats) categoryIdBySlug.set(c.handle, c.id)

  // Eksik kategori slug'ları (mevcut 7-kategoride yoksa) yalnız APPLY'de oluşturulur.
  const missingSlugs = neededSlugs.filter((s) => !categoryIdBySlug.has(s))

  // ---------------------------------------------------------------------------
  // DRY-RUN: yazım yapmadan planı raporla ve çık.
  // ---------------------------------------------------------------------------
  if (!APPLY) {
    logger.info(
      "[sync-shopier] DRY-RUN — Hiçbir yazım yapılmadı. Uygulamak için --apply " +
        "(veya SYNC_APPLY=1) ver."
    )
    logger.info(
      `[sync-shopier] Çözülen kategoriler: mevcut ${categoryIdBySlug.size}, eksik ${missingSlugs.length} (${missingSlugs.join(", ") || "-"})`
    )
    logger.info(
      `[sync-shopier] Stok konumu: ${stockLocation ? stockLocation.id : "YOK (envanter atlanır)"}`
    )
    return
  }

  // ---------------------------------------------------------------------------
  // APPLY: eksik kategori oluştur (idempotent, handle ile).
  // ---------------------------------------------------------------------------
  for (const slug of missingSlugs) {
    const { result } = await createProductCategoriesWorkflow(container).run({
      input: {
        product_categories: [
          { name: slug, handle: slug, is_active: true, is_internal: false },
        ],
      },
    })
    const created = result?.[0]
    if (created) categoryIdBySlug.set(slug, created.id)
  }
  if (missingSlugs.length) {
    logger.info(`[sync-shopier] Eksik kategori oluşturuldu: ${missingSlugs.length}`)
  }

  // ---------------------------------------------------------------------------
  // ÜRÜN UPSERT — external_id=shopier:<id> ile idempotent.
  // ---------------------------------------------------------------------------
  const products = manifest.products || []
  const externalIds = products.map((p: any) => `${SHOPIER_EXTERNAL_PREFIX}:${p.id}`)
  const existingProducts = externalIds.length
    ? await productModule.listProducts(
        { external_id: externalIds },
        { take: externalIds.length, relations: ["variants"] }
      )
    : []
  const existingByExt = new Map<string, any>()
  for (const ep of existingProducts) if (ep.external_id) existingByExt.set(ep.external_id, ep)

  let created = 0
  let updated = 0

  for (const p of products) {
    const input = buildProductInput(p, {
      categoryIdBySlug,
      salesChannelId: defaultChannel.id,
      shippingProfileId: shippingProfile.id,
    })
    const existing = existingByExt.get(input.external_id)

    if (existing) {
      await updateProductsWorkflow(container).run({
        input: {
          selector: { id: existing.id },
          update: {
            title: input.title,
            handle: input.handle,
            description: input.description,
            status: ProductStatus.PUBLISHED,
            thumbnail: input.thumbnail ?? undefined,
            images: input.images,
            category_ids: input.category_id ? [input.category_id] : [],
            sales_channels: [{ id: defaultChannel.id }],
            shipping_profile_id: shippingProfile.id,
            metadata: input.metadata,
          },
        },
      })
      updated++
    } else {
      await createProductsWorkflow(container).run({
        input: {
          products: [
            {
              external_id: input.external_id,
              title: input.title,
              handle: input.handle,
              description: input.description,
              status: ProductStatus.PUBLISHED,
              thumbnail: input.thumbnail ?? undefined,
              images: input.images,
              category_ids: input.category_id ? [input.category_id] : [],
              sales_channels: [{ id: defaultChannel.id }],
              shipping_profile_id: shippingProfile.id,
              options: input.options,
              variants: input.variants,
              metadata: input.metadata,
            },
          ],
        },
      })
      created++
    }
  }
  logger.info(`[sync-shopier] Ürün upsert: ${created} oluşturuldu, ${updated} güncellendi.`)

  // ---------------------------------------------------------------------------
  // ENVANTER — beden bazlı stoğu stok konumuna yaz (idempotent, yalnız eksikse).
  // ---------------------------------------------------------------------------
  if (!stockLocation) {
    logger.warn("[sync-shopier] Stok konumu YOK — envanter seviyeleri atlandı.")
  } else {
    // shopier external_id + beden → stok haritası (manifestten).
    const stockByExtSize = new Map<string, number>()
    for (const p of products) {
      const input = buildProductInput(p)
      for (const [size, qty] of Object.entries(input._stock_by_size)) {
        stockByExtSize.set(`${input.external_id}::${size}`, Number(qty) || 0)
      }
    }

    const { data: variantRows } = await query.graph({
      entity: "variant",
      fields: [
        "id",
        "title",
        "product.external_id",
        "inventory_items.inventory_item_id",
        "inventory_items.inventory.location_levels.location_id",
      ],
      filters: { product: { external_id: externalIds } },
    })

    const levelsToCreate: {
      inventory_item_id: string
      location_id: string
      stocked_quantity: number
    }[] = []

    for (const v of variantRows as any[]) {
      const ext = v?.product?.external_id
      if (!ext) continue
      const qty = stockByExtSize.get(`${ext}::${v.title}`) ?? 0
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
      }
    }

    if (levelsToCreate.length) {
      await createInventoryLevelsWorkflow(container).run({
        input: { inventory_levels: levelsToCreate },
      })
      logger.info(`[sync-shopier] Envanter seviyesi oluşturuldu: ${levelsToCreate.length}`)
    } else {
      logger.info("[sync-shopier] Yeni envanter seviyesi yok (zaten mevcut) — atlandı.")
    }
  }

  // ---------------------------------------------------------------------------
  // GERİ ALINABİLİR DEMO ARŞİVİ — status=DRAFT (KALICI SİLME YOK).
  // ---------------------------------------------------------------------------
  if (FORCE_REMOVE_DEMO) {
    const archiveExtIds = plan.archive_demo.map((a: any) => a.external_id).filter(Boolean)
    if (archiveExtIds.length) {
      const demoProducts = await productModule.listProducts(
        { external_id: archiveExtIds },
        { take: archiveExtIds.length }
      )
      let archived = 0
      for (const dp of demoProducts) {
        await updateProductsWorkflow(container).run({
          input: {
            selector: { id: dp.id },
            update: {
              status: ProductStatus.DRAFT,
              metadata: { ...(dp.metadata || {}), izbutik_archived: true },
            },
          },
        })
        archived++
      }
      logger.info(
        `[sync-shopier] Demo arşivlendi (geri alınabilir, DRAFT): ${archived}/${archiveExtIds.length}`
      )
    } else {
      logger.info("[sync-shopier] Arşivlenecek demo ürün yok.")
    }
  }

  // ---------------------------------------------------------------------------
  // ARŞİV GERİ ALMA — izbutik_archived işaretli ürünleri PUBLISHED yap.
  // ---------------------------------------------------------------------------
  if (RESTORE_ARCHIVED) {
    const allProducts = await productModule.listProducts({}, { take: 1000 })
    const archivedProducts = allProducts.filter(
      (p: any) => p?.metadata?.izbutik_archived === true
    )
    let restored = 0
    for (const ap of archivedProducts) {
      const meta = { ...(ap.metadata || {}) }
      delete (meta as any).izbutik_archived
      await updateProductsWorkflow(container).run({
        input: {
          selector: { id: ap.id },
          update: { status: ProductStatus.PUBLISHED, metadata: meta },
        },
      })
      restored++
    }
    logger.info(`[sync-shopier] Arşivden geri getirildi (PUBLISHED): ${restored}`)
  }

  logger.info("[sync-shopier] TAMAMLANDI.")
}
