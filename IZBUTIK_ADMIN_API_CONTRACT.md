# İzbutik Native Admin — Medusa v2 API Sözleşmesi ve Mimari Kararı

Görev: TASK_3314f4a3 / Adım 3 — Swift/Medusa araştırma ve API sözleşmesi
Tarih: 2026-09-25 (Europe/Istanbul)
Backend: Medusa **v2.21.0** (`@medusajs/medusa`, `@medusajs/framework`, `@medusajs/admin-sdk` = 2.21.0)
Doğrulama yöntemi: yerel backend (`http://127.0.0.1:9000`) üzerinde **salt-okunur (GET) canlı probe** + resmî docs.

> Bu dokümandaki tüm istek/yanıt şemaları, çalışan yerel `izbutik_medusa`
> veritabanına karşı gerçekten gözlenen JSON'dan çıkarıldı (framework varsayımı
> DEĞİL). Gizli değerler (e-posta/parola/JWT/token) hiçbir yerde loglanmadı.

---

## 0. Referans kaynaklar

| Kaynak | Tür | Lisans | Son durum | Kullanım |
|--------|-----|--------|-----------|----------|
| https://docs.medusajs.com/api/admin/ | Resmî API referansı | — | v2 (güncel) | **Otoriter**: auth, products, orders, inventory endpoint ve şema tanımları |
| https://github.com/mllrr96/Medusa-Admin-Flutter | 3. taraf örnek (Flutter) | **MIT** (doğrulandı) | 497 commit, aktif, Medusa **v2**, beta | **Yalnız araştırma**: JWT (email+password) akışı, "set URL" ekranı, salt-JWT (cookie yok) yaklaşımı teyidi. Dart/Flutter kodu; Swift'e KOPYALANMADI. |
| medusajs resmî örnekleri (docs `/resources/js-sdk`) | Resmî | MIT | v2 | JS SDK auth `type: "jwt"` davranışı; native Swift'te elle URLSession ile eşlenir |

### Native Swift açık kaynak örneği
Medusa v2 için resmî ya da yaygın, **lisansı doğrulanmış, güncel** bir native
**SwiftUI** admin örneği tespit edilmedi. Bu yüzden referans mimari Flutter
örneğinden (yalnız akış/UX düzeyinde) ve resmî docs'tan türetildi; **üçüncü
taraf kod kopyalanmadı**. Uygulama sıfırdan, bağımlılıksız yazılacak.

---

## 1. Mimari Kararı (ADR)

| Karar | Seçim | Gerekçe |
|-------|-------|---------|
| UI | **SwiftUI**, iOS 17+ | Spec gereği; modern, deklaratif |
| Ağ | **URLSession** + `async/await` | Bağımlılık yok; native, test edilebilir |
| Serialization | **Codable** | Native; gözlenen JSON şemalarına birebir modellenecek |
| Kimlik/oturum | **JWT Bearer** (`Authorization: Bearer <token>`) | Medusa v2'de `x-medusa-access-token` KALDIRILDI; docs JWT önerir. Cookie/session mobilde kullanılmayacak. |
| Secret saklama | **Keychain** (`kSecClassGenericPassword`) | Parola/JWT koda/log'a/UserDefaults'a YAZILMAZ |
| 3. taraf bağımlılık | **Yok** (SPM'siz) | Spec: "mümkünse üçüncü taraf bağımlılık yok" — karşılandı |
| Backend URL | **Kullanıcı tarafından ayarlanabilir** (varsayılan boş) | `admin@izbutik.local` ve URL koda gömülmez (Flutter örneğindeki "set URL" deseni) |
| Para birimi | Sunucu **major-unit ondalık** döndürür (aşağıya bkz.) | TRY dönüşümü buna göre yapılır |

---

## 2. Kimlik Doğrulama Sözleşmesi

### 2.1 JWT alma
```
POST {backend_url}/auth/user/emailpass
Content-Type: application/json

{ "email": "<email>", "password": "<password>" }
```
**Yanıt (gözlenen):**
```json
{ "token": "<jwt>" }   // tek alan: token (string, ~504 char)
```
- Başarısız kimlik → **401** (`{"type":"unauthorized",...}`). Provider explicit
  kayıtlı (`medusa-config.ts` → `@medusajs/medusa/auth` + `auth-emailpass`), bu
  framework varsayılanı değil, **config-level explicit** kayıttır (doğrulandı).

### 2.2 JWT kullanımı
Sonraki tüm `/admin/*` isteklerinde:
```
Authorization: Bearer <token>
```
- Doğrulama: `GET /admin/users/me` → **200** (yetkili token teyidi).

### 2.3 Güvenlik notları
- Token yalnız Keychain'de; bellek dışına yazılmaz, loglanmaz, screenshot'a girmez.
- Backend URL kullanıcı alanından; loopback dev'de `http://127.0.0.1:9000`.

---

## 3. Ürün Sözleşmesi

### 3.1 Liste + pagination
```
GET /admin/products?limit={n}&offset={m}
    &fields=id,title,status,thumbnail,*variants,*variants.prices
    [&q={arama}] [&status[]=published|draft]
Authorization: Bearer <token>
```
**Yanıt (gözlenen, top-level):**
```json
{ "products": [ ... ], "count": 55, "offset": 0, "limit": 1 }
```
- **Pagination**: `limit` (sayfa boyu), `offset` (atlanacak), `count` (toplam).
  Sayfa sayısı = ceil(count/limit). (docs "Pagination" ile birebir.)
- **Arama**: `q` query param (serbest metin).
- **Filtre**: `status[]=published` / `status[]=draft` (dizi filtresi).

**Product nesnesi (gözlenen anahtarlar):**
`id, title, status, thumbnail, variants[]`
- `status` ∈ `published | draft | proposed | rejected` (publish/draft ayrımı buradan).

### 3.2 Varyant + fiyat (gözlenen anahtarlar)
Variant: `id, title, sku, barcode, ean, upc, allow_backorder, manage_inventory,
hs_code, origin_country, mid_code, material, weight, length, height, width,
metadata, variant_rank, thumbnail, product_id, created_at, updated_at,
deleted_at, inventory_items[], prices[]`

Price: `id, amount, currency_code, min_quantity, max_quantity, variant_id,
created_at, updated_at, rules`

> **KRİTİK — Para birimi biçimi:** Gözlenen `amount = 749.9`, `currency_code = "try"`.
> Medusa v2 fiyatı **major-unit ondalık** (749.90 ₺) olarak döndürür — v1'deki
> minor-unit (kuruş/cent) DEĞİL. Swift tarafında `Decimal` ile tutulacak, `*100`
> **yapılmayacak**. Görüntüleme: `NumberFormatter` `.currency`, `currencyCode="TRY"`,
> `locale = tr_TR` → "749,90 ₺".

### 3.3 Ürün detay
```
GET /admin/products/{id}?fields=...,*variants,*variants.prices,*variants.inventory_items
```
→ **200**, `{ "product": { ... } }`.

### 3.4 Publish / Draft değiştirme (MUTATION — Adım 5+/9'da uygulanır)
```
POST /admin/products/{id}
Authorization: Bearer <token>
Content-Type: application/json

{ "status": "published" }   // veya "draft"
```
> Bu adımda **çalıştırılmadı** (salt-okunur sözleşme). Riskli mutation'lar yalnız
> resmî endpoint + mevcut backend yeteneği doğrulanarak ve kullanıcı onaylı draft
> hedefte Adım 9'da denenecektir.

---

## 4. Stok / Konum Seviyesi Sözleşmesi

### 4.1 Inventory item listesi
```
GET /admin/inventory-items?limit={n}&offset={m}
    &fields=id,sku,title,stocked_quantity,reserved_quantity,location_levels
```
**Yanıt:** `{ "inventory_items":[...], "count":149, "offset":0, "limit":1 }`
Item anahtarları: `id, sku, title, description, thumbnail, requires_shipping,
unit_of_measure, weight/length/height/width, metadata, reserved_quantity,
stocked_quantity, created_at, updated_at, location_levels[]`

### 4.2 Konum seviyeleri (location levels)
```
GET /admin/inventory-items/{id}/location-levels
```
**Yanıt:** `{ "inventory_levels":[...], "count", "offset", "limit" }`
Level anahtarları: `id, inventory_item_id, location_id, stocked_quantity,
reserved_quantity, incoming_quantity, available_quantity, metadata,
created_at, updated_at`
- `available_quantity = stocked - reserved` (gözlenen: stocked 28, reserved 0, available 28).

### 4.3 Stok konumu
```
GET /admin/stock-locations?limit={n}
```
Gözlenen: 1 konum → `sloc_01M2BX0QVD9ACV8Q7NSB8CE096` = "İzbutik Ana Depo".

### 4.4 Düşük stok (dashboard)
Eşik uygulama tarafında (varsayılan `available <= 5`). Gözlenen veri: 149 inventory
item, `available<=5` olan 70 (canlı seed durumu; eşik ayarlanabilir olacak).

---

## 5. Sipariş Sözleşmesi

### 5.1 Liste
```
GET /admin/orders?limit={n}&offset={m} [&status[]=...]
```
**Yanıt:** `{ "orders":[...], "count":1, "offset":0, "limit":1 }`
Order (liste) anahtarları: `id, display_id, custom_display_id, status, version,
summary, total, metadata, locale, created_at, updated_at, items[],
payment_status, fulfillment_status`

### 5.2 Detay
```
GET /admin/orders/{id}?fields=id,display_id,status,email,currency_code,total,
    item_total,*items,*shipping_address,*payment_collections,*fulfillments
```
Detay anahtarları: `id, display_id, status, email, currency_code, total,
item_total, version, items[], shipping_address, payment_collections[],
fulfillments[], payment_status, fulfillment_status`

**Durum alanları (gözlenen):**
- `status`: `pending` (sipariş yaşam döngüsü)
- `payment_status`: `authorized` (ödeme durumu)
- `fulfillment_status`: `not_fulfilled` (karşılama durumu)

**Line item (gözlenen anahtarlar, kısaltılmış):**
`id, title, subtitle, thumbnail, variant_id, product_id, product_title,
variant_sku, variant_title, quantity, unit_price, compare_at_unit_price,
subtotal, total, tax_total, discount_total, ...` (+ çok sayıda `raw_*` ve
türetilmiş toplam). UI için `title, variant_title, quantity, unit_price, total`
yeterli.

**Toplamlar (gözlenen):** `total=829.8, item_total=749.9, currency_code="try",
display_id=1` → yine **major-unit ondalık**; §3.2 ile aynı biçimlendirme.

---

## 6. Dashboard Sayıları Sözleşmesi

Ayrı bir "dashboard" endpoint'i YOK; sayılar liste endpoint'lerinin `count`
alanından türetilir (limit=1, count okunur — hafif):

| Metrik | İstek | Gözlenen |
|--------|-------|----------|
| Yayınlanan ürün | `GET /admin/products?status[]=published&limit=1` → `count` | **29** |
| Draft ürün | `GET /admin/products?status[]=draft&limit=1` → `count` | **26** |
| Toplam ürün | `GET /admin/products?limit=1` → `count` | **55** |
| Sipariş sayısı | `GET /admin/orders?limit=1` → `count` | **1** |
| Düşük stok | `GET /admin/inventory-items?limit=all&fields=stocked_quantity,reserved_quantity` → app-side eşik | 70 (`available<=5`) |

---

## 7. Swift veri modeli eşlemesi (özet, Adım 4'te uygulanacak)

```swift
struct AuthTokenResponse: Codable { let token: String }

struct ProductListResponse: Codable {
    let products: [Product]; let count: Int; let offset: Int; let limit: Int
}
struct Product: Codable {
    let id: String; let title: String; let status: ProductStatus
    let thumbnail: String?; let variants: [Variant]?
}
enum ProductStatus: String, Codable { case published, draft, proposed, rejected }

struct Variant: Codable {
    let id: String; let title: String?; let sku: String?
    let manageInventory: Bool?; let prices: [Price]?
    enum CodingKeys: String, CodingKey { case id, title, sku, prices; case manageInventory = "manage_inventory" }
}
struct Price: Codable { let id: String; let amount: Decimal; let currencyCode: String
    enum CodingKeys: String, CodingKey { case id, amount; case currencyCode = "currency_code" } }

struct OrderListResponse: Codable { let orders: [Order]; let count: Int; let offset: Int; let limit: Int }
struct Order: Codable {
    let id: String; let displayId: Int; let status: String
    let paymentStatus: String; let fulfillmentStatus: String
    let total: Decimal; let currencyCode: String?
    enum CodingKeys: String, CodingKey {
        case id, status, total; case displayId="display_id"
        case paymentStatus="payment_status"; case fulfillmentStatus="fulfillment_status"
        case currencyCode="currency_code" }
}
```
- `amount`/`total` = **Decimal**, major-unit; `*100` yok.
- Fiyat gösterimi: `NumberFormatter(.currency, locale: tr_TR, code: "TRY")`.

---

## 8. Güvenlik ve doğrulama teyidi
- Tüm probe'lar salt-okunur **GET** (mutation çalıştırılmadı).
- Parola/JWT hiçbir dosyaya/loga/bu dokümana yazılmadı; yerel dev DB'de emailpass
  kimliği yalnız probe için yenilendi (izole `izbutik_medusa`; kaynak/secret'a dokunulmadı).
- `auth-emailpass` provider'ı `medusa-config.ts`'de **explicit** kayıtlıdır
  (framework varsayılanı olarak raporlanmadı).
- Backend yalnız `127.0.0.1:9000` üzerinde açıldı.
