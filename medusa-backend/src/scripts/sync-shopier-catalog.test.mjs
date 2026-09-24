/**
 * sync-shopier-catalog.test.mjs — Task 5 hedefli testler (KALICI)
 * ============================================================================
 * Shopier→Medusa senkron aracının SAF çekirdek mantığını (sync-core.mjs) GERÇEK
 * Task 3 manifesti + Task 4 sınıflandırması fixturelarına karşı doğrular. DB /
 * Medusa / ağ GEREKTİRMEZ. Node 22 LTS ile çalışır:
 *
 *   cd medusa-backend
 *   npm run test:sync           # veya: node src/scripts/sync-shopier-catalog.test.mjs
 *
 * Kapsanan spec gereksinimleri:
 *   - external_id = shopier:<id> (demo izbutik:product:<id> ile karışmaz)
 *   - kategori çıkarımı (ürün adından, Task 4 taksonomisine — 7 slug)
 *   - fiyat / envanter (beden bazlı stok) / görseller (tüm gallery)
 *   - varsayılan dry-run vs açık --apply ayrımı (statik kod sözleşmesi)
 *   - force-remove-demo → geri alınabilir DRAFT; manual-review dokunulmaz
 *   - restore-archived → PUBLISHED geri alma; kalıcı silme YOK
 *   - kategori / kanal / profil / fiyat / görsel / varyant / envanter / idempotency
 */

import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  shopierExternalId,
  resolveCategorySlug,
  slugify,
  buildProductInput,
  buildSyncPlan,
  CURRENCY,
} from "./sync-core.mjs"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(
  fs.readFileSync(path.join(HERE, "__fixtures__", "03_product_manifest.json"), "utf8")
)
const classification = JSON.parse(
  fs.readFileSync(path.join(HERE, "__fixtures__", "04_mapping_classification.json"), "utf8")
)
const scriptPath = path.join(HERE, "sync-shopier-catalog.ts")
const scriptSrc = fs.readFileSync(scriptPath, "utf8")
const coreSrc = fs.readFileSync(path.join(HERE, "sync-core.mjs"), "utf8")

let passed = 0
let failed = 0
const results = []
function test(name, fn) {
  try {
    fn()
    passed++
    results.push({ name, status: "PASS" })
    console.log(`PASS  ${name}`)
  } catch (e) {
    failed++
    results.push({ name, status: "FAIL", error: e.message })
    console.error(`FAIL  ${name}\n      ${e.message}`)
  }
}

// --- 1) external_id sözleşmesi ---------------------------------------------
test("external_id shopier:<id> formatındadır ve demo prefix'iyle çakışmaz", () => {
  assert.equal(shopierExternalId(42086106), "shopier:42086106")
  const demoExt = "izbutik:product:1"
  assert.ok(!shopierExternalId(1).startsWith(demoExt.split(":")[0] + ":product"))
  const ids = manifest.products.map((p) => shopierExternalId(p.id))
  assert.equal(new Set(ids).size, ids.length, "external_id benzersiz olmalı")
})

// --- 2) kategori çıkarımı ---------------------------------------------------
test("kategori ürün adından doğru çıkarılır (Task 4 taksonomisi, 7 slug)", () => {
  assert.equal(resolveCategorySlug("Puf kazak"), "triko")
  assert.equal(resolveCategorySlug("Latte hırka"), "triko")
  assert.equal(resolveCategorySlug("Retro çiçek elbise"), "elbise")
  assert.equal(resolveCategorySlug("Meva pantolon"), "alt-giyim")
  assert.equal(resolveCategorySlug("Siyah balon etek"), "alt-giyim")
  assert.equal(resolveCategorySlug("Blazer ceket"), "dis-giyim")
  assert.equal(resolveCategorySlug("Bomber ceket"), "dis-giyim")
  assert.equal(resolveCategorySlug("Poplin tasarım gömlek"), "ust-giyim")
  assert.equal(resolveCategorySlug("Laci triko takım"), "takim")
  assert.equal(resolveCategorySlug("Mini goyard"), "aksesuar")
  assert.equal(resolveCategorySlug("Miu miu çanta"), "aksesuar")
  const allowed = new Set(["takim", "aksesuar", "dis-giyim", "triko", "elbise", "ust-giyim", "alt-giyim"])
  for (const p of manifest.products) {
    assert.ok(allowed.has(resolveCategorySlug(p.name)), `${p.name} → geçersiz slug`)
  }
})

// --- 3) slug güvenliği ------------------------------------------------------
test("slugify Türkçe karakterleri güvenli ASCII slug'a indirger", () => {
  assert.equal(slugify("Şölen Keten elbise"), "solen-keten-elbise")
  assert.equal(slugify("İpek kupra elbise"), "ipek-kupra-elbise")
  assert.ok(/^[a-z0-9-]+$/.test(slugify("Puf kazak")))
})

// --- 4) ürün payload: fiyat, görseller, varyant, kanal/profil --------------
test("buildProductInput fiyat + tüm gallery görselleri + beden varyantları üretir", () => {
  const puf = manifest.products.find((p) => p.id === 42086106) // Puf kazak, STD
  const input = buildProductInput(puf, {
    categoryIdBySlug: new Map([["triko", "cat_triko"]]),
    salesChannelId: "sc_1",
    shippingProfileId: "sp_1",
  })
  assert.equal(input.external_id, "shopier:42086106")
  assert.equal(input.variants[0].prices[0].currency_code, CURRENCY)
  assert.equal(input.variants[0].prices[0].amount, input._price)
  assert.equal(input.category_id, "cat_triko")
  assert.equal(input.sales_channel_id, "sc_1")
  assert.equal(input.shipping_profile_id, "sp_1")
  assert.equal(input.images.length, puf.photos.gallery_large.length)
  assert.ok(input.images.length >= 1)
  assert.equal(input.thumbnail, puf.photos.gallery_large[0])
})

test("varyasyonsuz ürün (çanta) tek STD varyant + ürün stoğu ile üretilir", () => {
  const goyard = manifest.products.find((p) => p.id === 34432859) // Mini goyard
  const input = buildProductInput(goyard)
  assert.equal(input.variants.length, 1)
  assert.equal(input.variants[0].title, "STD")
  assert.equal(input.options[0].values[0], "STD")
})

test("beden bazlı stok her varyant metadata'sına doğru yazılır", () => {
  const retro = manifest.products.find((p) => p.id === 29092947)
  const input = buildProductInput(retro)
  assert.equal(input.variants.length, retro.variants.options.length)
  for (const opt of retro.variants.options) {
    const v = input.variants.find((x) => x.title === String(opt.name))
    assert.ok(v, `varyant ${opt.name} bulunmalı`)
    assert.equal(v.metadata.shopier_variant_stock, opt.stock)
  }
})

test("SKU benzersiz ve deterministiktir (idempotency temeli)", () => {
  const skus = []
  for (const p of manifest.products) {
    const input = buildProductInput(p)
    for (const v of input.variants) skus.push(v.sku)
  }
  assert.equal(new Set(skus).size, skus.length, "SKU'lar benzersiz olmalı")
  const a = buildProductInput(manifest.products[0]).variants.map((v) => v.sku)
  const b = buildProductInput(manifest.products[0]).variants.map((v) => v.sku)
  assert.deepEqual(a, b)
})

// --- 5) tam plan: sayılar Task 3/4 ile tutarlı -----------------------------
test("buildSyncPlan sayıları Task 3 (29 ürün) ve Task 4 (13/13) ile tutar", () => {
  const plan = buildSyncPlan(manifest, classification)
  assert.equal(plan.summary.shopier_products_to_upsert, 29)
  assert.equal(plan.summary.demo_to_archive_reversible, 13)
  assert.equal(plan.summary.demo_manual_review_untouched, 13)
  assert.equal(plan.summary.total_images, manifest.totals?.total_gallery_photos ?? plan.summary.total_images)
  const expectedVariants = manifest.products.reduce(
    (a, p) => a + (p.variants?.has_variation_axis ? p.variants.options.length : 1),
    0
  )
  assert.equal(plan.summary.total_variants, expectedVariants)
})

// --- 6) geri alınabilir arşiv sözleşmesi -----------------------------------
test("archive-demo unpublish (DRAFT) planlanır; manual-review DOKUNULMAZ", () => {
  const plan = buildSyncPlan(manifest, classification)
  const archiveIds = new Set(plan.archive_demo.map((a) => a.external_id))
  const reviewIds = new Set(plan.manual_review_untouched.map((a) => a.external_id))
  for (const id of archiveIds) assert.ok(!reviewIds.has(id), `${id} iki listede birden olamaz`)
  for (const a of plan.archive_demo) {
    assert.match(a.action, /unpublish|DRAFT|reversible/i)
    assert.doesNotMatch(a.action, /delete|sil|permanent/i)
  }
  for (const m of plan.manual_review_untouched) {
    assert.match(m.action, /UNTOUCHED|review/i)
  }
})

// --- 7) statik kod sözleşmesi: dry-run varsayılan, apply açık --------------
test("script varsayılan dry-run'dır; yazım yalnız --apply/SYNC_APPLY ile açılır", () => {
  assert.match(scriptSrc, /const APPLY = hasFlag\("--apply"\)/)
  assert.match(scriptSrc, /if \(!APPLY\)/)
  assert.match(scriptSrc, /Hiçbir yazım yapılmadı/)
  const applyGuardIdx = scriptSrc.indexOf("if (!APPLY)")
  const createIdx = scriptSrc.indexOf("createProductsWorkflow(container).run")
  assert.ok(applyGuardIdx > 0 && createIdx > applyGuardIdx, "yazım çağrıları dry-run guard'ından sonra olmalı")
})

test("script demo arşivini kalıcı silmez (ProductStatus.DRAFT + geri alma)", () => {
  assert.match(scriptSrc, /status:\s*ProductStatus\.DRAFT/)
  assert.match(scriptSrc, /izbutik_archived:\s*true/)
  assert.match(scriptSrc, /--restore-archived/)
  assert.match(scriptSrc, /--force-remove-demo/)
  assert.doesNotMatch(scriptSrc, /deleteProductsWorkflow/)
})

test("script Shopier'e ağ isteği yapmaz (yalnız yerel manifest okur)", () => {
  assert.doesNotMatch(scriptSrc, /shopier\.com\/(api|search_product|cart|checkout)/)
  assert.match(scriptSrc, /03_product_manifest\.json/)
})

// --- 8) drift-guard: .ts çekirdekle (sync-core.mjs) tutarlı ----------------
test(".ts saf mantığı çekirdekle aynı sözleşmeyi paylaşır (external_id, kategori, SKU)", () => {
  for (const needle of [
    "`${SHOPIER_EXTERNAL_PREFIX}:${shopierId}`",
    "IZB-SHP-",
    "has_variation_axis",
    "gallery_large",
    "resolved_category_slug",
  ]) {
    assert.ok(coreSrc.includes(needle), `core eksik: ${needle}`)
  }
  // .ts saf mantığı çekirdekten import eder (kopya mantık taşımaz — drift imkansız)
  assert.match(scriptSrc, /from "\.\/sync-core\.mjs"/)
  assert.match(scriptSrc, /buildProductInput/)
  assert.match(scriptSrc, /buildSyncPlan/)
  // Kategori kural sırası (spesifik→genel) çekirdekte takim/aksesuar önce
  const orderRe = /takim[\s\S]*aksesuar[\s\S]*dis-giyim[\s\S]*triko[\s\S]*elbise[\s\S]*ust-giyim[\s\S]*alt-giyim/
  assert.match(coreSrc, orderRe)
})

// --- 9) idempotency sözleşmesi (statik): upsert + envanter yalnız eksikse ---
test("script idempotent upsert yapar (external_id eşleşme, mevcut→update)", () => {
  assert.match(scriptSrc, /listProducts\(\s*\{ external_id: externalIds \}/)
  assert.match(scriptSrc, /if \(existing\)/)
  assert.match(scriptSrc, /updateProductsWorkflow/)
  assert.match(scriptSrc, /createProductsWorkflow/)
  // envanter yalnız eksik seviye için oluşturulur
  assert.match(scriptSrc, /if \(!existingLevel && invId\)/)
})

// --- Özet -------------------------------------------------------------------
const gate = { pass: failed === 0, passed, failed, total: passed + failed }
fs.writeFileSync(
  path.join(HERE, "__fixtures__", ".t05_test_result.json"),
  JSON.stringify({ generated_at: new Date().toISOString(), gate, results }, null, 2)
)
console.log(`\n${passed}/${passed + failed} test PASS`)
if (failed > 0) process.exit(1)
