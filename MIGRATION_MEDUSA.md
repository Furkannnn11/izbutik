# İzbutik → Medusa Backend Geçişi

> Bu belge aşamalı olarak doldurulmaktadır. Bu ilk taslak **Adım 1 – Mevcut proje ve ortam durumu incelemesinin** salt-okunur bulgularını içerir. Hiçbir kaynak dosya değiştirilmemiş/silinmemiştir.

---

## 1. Mevcut Proje ve Ortam Durumu (Adım 1 – salt okunur inceleme)

**İnceleme tarihi:** 2026-09-12
**Proje dizini:** `/Users/furkanatmaca/Downloads/izbutik`

### 1.1 Git durumu

- **Aktif branch:** `feat/izbutik-store` (up to date with `origin/feat/izbutik-store`)
- **Son commitler:**
  - `4d281df` feat: İzbutik online giyim mağazası (Node.js + Express + PostgreSQL)
  - `a5f52a3` Initial commit
- **Uncommitted (staged edilmemiş) değişiklikler — DOKUNULMAYACAK:**
  - `modified: public/css/styles.css`
  - `modified: public/index.html`
  - `modified: public/js/app.js`
  - `modified: src/server.js`
- **Takip edilmeyen (untracked) dosyalar:**
  - `.kiro/` (ajan/ayar dizini)
  - `.tmp_rakip/` (geçici rakip site HTML'leri + extract scriptleri)

> ⚠️ Kural: Bu uncommitted değişiklikler kullanıcının çalışması olup **git reset/checkout/pull ile ezilmeyecek**. Gerekli olursa scratch kopyada çalışılacak.

### 1.2 Teknoloji ve çalışma komutları

- **Stack:** Node.js + Express (ESM, `"type": "module"`) + PostgreSQL 16
- **Bağımlılıklar (sabit majör):** express `^4.19.2`, pg `^8.12.0`, compression `^1.7.4`, morgan `^1.10.0`, dotenv `^16.4.5`
- **package.json script'leri:**
  | Script | Komut |
  |--------|-------|
  | `start` | `node src/server.js` |
  | `dev` | `node --watch src/server.js` |
  | `db:start` | `bash scripts/start-db.sh` |
  | `db:migrate` | `node src/db/migrate.js` |
  | `db:seed` | `node src/db/seed.js` |
  | `setup` | `db:start && db:migrate && db:seed` |

### 1.3 Sunucu bind ayarı (`src/server.js`)

- `PORT = process.env.PORT || 3000` (bilinen yerel çalışma portu 3001 — 3000 dolu olduğunda düşülüyor)
- `HOST = process.env.HOST || '127.0.0.1'` → **yalnızca loopback'e bind** ediliyor (kural uyumlu)
- API prefix'i: `/api/*`; API dışı tüm istekler `public/index.html`'e (SPA fallback)
- Health endpoint: `GET /api/health` → `{ status: 'ok', service: 'izbutik' }`

### 1.4 Klasör yapısı

```
izbutik/
├── public/                 # Frontend (statik, framework yok — vanilla JS)
│   ├── index.html          # (uncommitted değişiklik var)
│   ├── css/styles.css      # (uncommitted değişiklik var)
│   └── js/app.js           # (uncommitted değişiklik var) — sepet localStorage, fetch /api/*
├── src/
│   ├── server.js           # Express app (uncommitted değişiklik var)
│   ├── db/
│   │   ├── index.js        # pg Pool; DATABASE_URL veya PG* değişkenleri
│   │   ├── schema.sql      # Tablo şeması (migration kaynağı)
│   │   ├── migrate.js      # schema.sql'i uygular (DROP ... CASCADE içerir!)
│   │   └── seed.js         # 7 kategori + 26 ürün örnek verisi
│   └── routes/
│       ├── categories.js   # GET /api/categories
│       ├── products.js     # GET /api/products (filtre/sıralama), GET /api/products/:slug
│       └── orders.js       # POST /api/orders, GET /api/orders/:id
├── scripts/start-db.sh     # Lokal PostgreSQL başlatma yardımcısı
├── .env / .env.example
└── package.json
```

> Not: Ayrı `migrations/` klasörü **yok**; migration = `src/db/schema.sql` (tabloları `DROP ... CASCADE` ile sıfırlıyor). Bu yüzden Medusa migration'ları **kesinlikle** ayrı DB'de (`izbutik_medusa`) çalıştırılmalı — mevcut `izbutik_db` verisini korumak için.

### 1.5 Mevcut REST API (frontend-backend bağı)

| Metot | Yol | Açıklama |
|-------|-----|----------|
| GET | `/api/health` | Servis durumu |
| GET | `/api/categories` | Kategoriler + `product_count` |
| GET | `/api/products` | `?category=slug&search=&sort=(price_asc\|price_desc\|rating\|newest)&featured=&isNew=&limit=` |
| GET | `/api/products/:slug` | Tek ürün (images[], sizes[] dahil) |
| POST | `/api/orders` | `{ customer:{name,email,phone,address}, items:[{id,size,quantity}] }` |
| GET | `/api/orders/:id` | Sipariş + order_items |

Frontend (`public/js/app.js`) bu `/api/*` uçlarına `fetch` ile bağlanıyor; sepet `localStorage`'da tutuluyor. Medusa geçişinde bu veri erişim katmanı Medusa Store API'ye adaptör ile yönlendirilecek (Adım 12–14).

### 1.6 Veritabanı şeması özeti (`src/db/schema.sql`)

- **categories**: `id (SERIAL PK)`, `slug (UNIQUE)`, `name`, `description`, `image_url`, `sort_order`
- **products**: `id (SERIAL PK)`, `category_id (FK → categories, ON DELETE CASCADE)`, `slug (UNIQUE)`, `name`, `description`, `price NUMERIC(10,2)`, `old_price`, `stock`, `rating`, `is_new`, `is_featured`, `created_at`
- **product_images**: `id`, `product_id (FK)`, `url`, `sort_order` — ürün başına çoklu görsel
- **product_sizes**: `id`, `product_id (FK)`, `size` — beden seçenekleri
- **orders**: `id`, `customer_name`, `email`, `phone`, `address`, `total`, `status ('pending' default)`, `created_at`
- **order_items**: `id`, `order_id (FK)`, `product_id (FK, ON DELETE SET NULL)`, `name`, `size`, `quantity`, `price`
- İndeksler: `idx_products_category`, `idx_products_featured`, `idx_product_images_product`, `idx_order_items_order`

> Medusa eşleme ön-notu (Adım 2'de detaylandırılacak): categories → Medusa Product Category; products → Medusa Product; price/old_price → Price Set; stock → Inventory; product_sizes → Product Variant/Option; product_images → Product Images.

### 1.7 Veritabanı bağlantısı (`src/db/index.js` + `.env`)

- Bağlantı: önce `DATABASE_URL`, yoksa `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE`
- `.env` / `.env.example` varsayılanları:
  - `DATABASE_URL=postgres://izbutik:izbutik123@127.0.0.1:5432/izbutik_db`
  - `PGUSER=izbutik`, `PGDATABASE=izbutik_db`, `PGHOST=127.0.0.1`, `PGPORT=5432`
- Mevcut veri: **7 kategori, 26 ürün** (bilinen seed verisi).

### 1.8 PostgreSQL 16 çalışıyor mu?

- `pg_isready` PATH'te değil; PostgreSQL 16 Homebrew Cellar altında: `/opt/homebrew/Cellar/postgresql@16/16.11_1/bin/`
- Doğrulama komutu ve sonucu:
  ```
  /opt/homebrew/opt/postgresql@16/bin/pg_isready -h 127.0.0.1 -p 5432
  → 127.0.0.1:5432 - bağlantılar kabul ediliyor
  ```
- **Sonuç:** PostgreSQL 16 çalışıyor ve 127.0.0.1:5432 üzerinde bağlantı kabul ediyor. ✅

### 1.9 Adım 1 özeti ve sonraki adım için notlar

- Proje sağlıklı; uncommitted değişiklikler mevcut ve korunacak.
- Migration klasörü yok → `schema.sql` yıkıcı (`DROP CASCADE`) olduğu için Medusa **ayrı DB** (`izbutik_medusa`) zorunlu.
- PostgreSQL 16 hazır; `izbutik` kullanıcısı mevcut.
- Bir sonraki adım (Adım 2): `izbutik_db` içindeki 7 kategori / 26 ürün verisini salt-okunur analiz et; kolon tipleri, FK ilişkileri, örnek satırlar ve Medusa model eşlemesini çıkar.

---

## 2. Veritabanı Şeması ve Veri Analizi (Adım 2 – salt okunur, canlı DB)

**Analiz tarihi:** 2026-09-13 01:48 +03
**Bağlantı:** `psql -U izbutik -d izbutik_db` (Homebrew **PostgreSQL 16.11**, `127.0.0.1:5432`, `LC_ALL=C`)
**Yöntem:** Yalnızca `information_schema` / `pg_catalog` sorguları, `SELECT count(*)`, salt-okunur örnek `SELECT`'ler. **Hiçbir `INSERT/UPDATE/DELETE/ALTER` çalıştırılmadı; kaynak DB'ye dokunulmadı.**
**Kaynak makine analizi:** `schema_analysis.json` (Adım 1/21 çıktısı). Bu bölüm **statik `schema.sql` özeti değil**, o dosyadaki **canlı DB'den çıkarılmış** verilere dayanır.

### 2.1 Tablolar ve doluluk (canlı)

`izbutik_db` içinde **6 tablo** (hepsi owner: `izbutik`):

| Tablo | Rol | Kayıt | Durum |
|-------|-----|------:|-------|
| `categories` | Ürün kategorileri | **7** | dolu ✅ (referans) |
| `products` | Ürünler | **26** | dolu ✅ (referans) |
| `product_images` | Ürün görselleri (1‑n) | 52 | dolu |
| `product_sizes` | Ürün bedenleri / varyant seçenekleri (1‑n) | 79 | dolu |
| `orders` | Siparişler | 0 | boş |
| `order_items` | Sipariş satırları | 0 | boş |

> 🔒 **Aktarım hedef sayıları (Adım 10/26 doğrulaması için sabit):** kategori == **7**, ürün == **26**.

### 2.2 Canlı veri agregatları (`schema_analysis.json > aggregates`)

- **Fiyat aralığı (products.price):** min **219.90 TRY** – max **1249.90 TRY**; para birimi **TRY**.
- **İndirimli ürünler:** **12 / 26** üründe `old_price` dolu (indirim işareti); 14 üründe `null`.
- **Stok aralığı (products.stock):** min **8** – max **43** (ürün düzeyinde tek stok).
- **Farklı beden değerleri:** `XS`, `S`, `M`, `L`, `XL`, `STD` (STD = tek beden / aksesuar).
- **Kategori başına ürün dağılımı:** cat1=4, cat2=4, cat3=4, cat4=4, cat5=3, cat6=3, cat7=4 (toplam 26).

### 2.3 `categories` — kolon tipleri, kısıt ve ilişkiler (canlı)

| Kolon | Tip | Null | Default |
|-------|-----|------|---------|
| `id` | integer | not null | `nextval('categories_id_seq')` (PK, SERIAL) |
| `slug` | varchar(80) | not null | — (**UNIQUE:** `categories_slug_key`) |
| `name` | varchar(120) | not null | — |
| `description` | text | null | — |
| `image_url` | text | null | — |
| `sort_order` | integer | null | `0` |

- **PK:** `id` — **FK yok** (kök tablo).
- **Referenced by:** `products.category_id → categories.id` (`ON DELETE CASCADE`).

**Örnek satırlar (canlı `sample_rows`):**

| id | slug | name | sort_order | image_url |
|---:|------|------|-----------:|-----------|
| 1 | elbise | Elbise | 1 | unsplash…photo-1515372039744 |
| 2 | ust-giyim | Üst Giyim | 2 | unsplash…photo-1496747611176 |
| 7 | aksesuar | Aksesuar | 7 | unsplash…photo-1572804013309 |

### 2.4 `products` — kolon tipleri, kısıt ve ilişkiler (canlı)

| Kolon | Tip | Null | Default |
|-------|-----|------|---------|
| `id` | integer | not null | `nextval('products_id_seq')` (PK, SERIAL) |
| `category_id` | integer | not null | — (**FK → categories(id)**, ON DELETE CASCADE) |
| `slug` | varchar(140) | not null | — (**UNIQUE:** `products_slug_key`) |
| `name` | varchar(160) | not null | — |
| `description` | text | null | — |
| `price` | numeric(10,2) | not null | — (TRY) |
| `old_price` | numeric(10,2) | null | — (indirim öncesi fiyat) |
| `stock` | integer | null | `0` (**ürün seviyesinde tek stok**) |
| `rating` | numeric(2,1) | null | `5.0` |
| `is_new` | boolean | null | `false` |
| `is_featured` | boolean | null | `false` |
| `created_at` | timestamptz | null | `now()` |

- **FK:** `products_category_id_fkey`: `category_id → categories(id)` (DELETE **CASCADE**, UPDATE NO ACTION).
- **Referenced by:** `product_images.product_id` (CASCADE), `product_sizes.product_id` (CASCADE), `order_items.product_id` (**SET NULL**).
- **Not (JSON):** `stock` ürün düzeyindedir, beden bazında değildir; bedenler `product_sizes`'ta ayrı tutulur ve beden başına stok kolonu yoktur.

**Örnek satırlar (canlı `sample_rows`):**

| id | cat | slug | name | price | old_price | stock | rating | is_new | is_featured |
|---:|---:|------|------|------:|----------:|------:|------:|:------:|:-----------:|
| 1 | 1 | saten-askili-midi-elbise | Saten Askılı Midi Elbise | 749.90 | 999.90 | 28 | 4.8 | t | t |
| 2 | 1 | cicek-desenli-yazlik-elbise | Çiçek Desenli Yazlık Elbise | 459.90 | — | 42 | 4.6 | t | f |
| 5 | 2 | saten-gomlek | Saten Gömlek | 389.90 | — | 39 | 4.7 | f | t |

### 2.5 `product_images` — görseller (1‑n, canlı)

| Kolon | Tip | Null | Default |
|-------|-----|------|---------|
| `id` | integer | not null | seq (PK) |
| `product_id` | integer | not null | — (**FK → products(id)**, ON DELETE CASCADE) |
| `url` | text | not null | — |
| `sort_order` | integer | null | `0` (ilk = kapak) |

- **FK:** `product_images_product_id_fkey` → `products(id)` (DELETE CASCADE).
- Toplam **52 görsel**. **Örnek:** ürün 1 → 2 görsel (`sort_order` 0,1); ürün 2 → görsel (`sort_order` 0).

### 2.6 `product_sizes` — bedenler / varyant seçenekleri (1‑n, canlı)

| Kolon | Tip | Null | Default |
|-------|-----|------|---------|
| `id` | integer | not null | seq (PK) |
| `product_id` | integer | not null | — (**FK → products(id)**, ON DELETE CASCADE) |
| `size` | varchar(10) | not null | — |

- **FK:** `product_sizes_product_id_fkey` → `products(id)` (DELETE CASCADE).
- Toplam **79 satır**; farklı bedenler: `XS, S, M, L, XL, STD`. **Örnek:** ürün 1 → `S,M,L`; ürün 2 → `XS…`.
- ⚠️ **Kritik fark:** Beden bazında **stok/fiyat kolonu YOK** (JSON `note`). Stok yalnızca `products.stock`'ta ürün düzeyinde.

### 2.7 `orders` / `order_items` — sipariş verisi (canlı: boş)

- Her ikisi de **0 kayıt** → taşınacak geçmiş sipariş verisi yok; sipariş akışı Medusa Cart/Order API ile sıfırdan (Adım 14+).
- **`orders`** kolonları (canlı): `id (PK)`, `customer_name varchar(160) NN`, `email varchar(160) NN`, `phone varchar(40)`, `address text`, `total numeric(10,2) NN default 0`, `status varchar(40) NN default 'pending'`, `created_at timestamptz default now()`. **Referenced by:** `order_items.order_id` (CASCADE).
- **`order_items`** kolonları (canlı): `id (PK)`, `order_id → orders(id)` (CASCADE), `product_id → products(id)` (**SET NULL**, nullable), `name varchar(160) NN`, `size varchar(10)`, `quantity integer NN default 1`, `price numeric(10,2) NN`.

### 2.8 Kaynak → Medusa v2 model eşleme tablosu (canlı veriye dayalı)

Aşağıdaki eşleme `schema_analysis.json > medusa_mapping_hints` ile canlı kolon tiplerine dayanır. Her satır: **kaynak alan → Medusa alan, dönüşüm notu, varsayılan değer**.

#### 2.8.1 `categories` → Medusa **Product Category**

| Kaynak alan | Medusa hedef alanı | Dönüşüm notu | Varsayılan |
|-------------|--------------------|--------------|-----------|
| `slug` | `product_category.handle` | Birebir; benzersizlik korunur | — |
| `name` | `product_category.name` | Birebir | — |
| `sort_order` | `product_category.rank` | integer → rank | `0` |
| `description` | `product_category.metadata.description` | Native alan yok → metadata | `null` |
| `image_url` | `product_category.metadata.image_url` | Native alan yok → metadata | `null` |
| — | `product_category.is_active` | Aktif yayın | `true` |
| `id` | `product_category.metadata.legacy_id` | Idempotency/izleme | — |

#### 2.8.2 `products` → Medusa **Product**

| Kaynak alan | Medusa hedef alanı | Dönüşüm notu | Varsayılan |
|-------------|--------------------|--------------|-----------|
| `slug` | `product.handle` | Birebir (UNIQUE) | — |
| `name` | `product.title` | Birebir | — |
| `description` | `product.description` | Birebir | `null` |
| `category_id` | Product ↔ Category ilişkisi | Kaynak `category_id` → kategori `handle`/`legacy_id` üzerinden bağla | — |
| `id` | `product.external_id = 'izbutik:<id>'` | **Idempotency anahtarı** (tekrar çalıştırmada upsert) | — |
| `rating` | `product.metadata.rating` | numeric(2,1) → metadata | `5.0` |
| `is_new` | `product.metadata.is_new` | boolean → metadata (rozet) | `false` |
| `is_featured` | `product.metadata.is_featured` | boolean → metadata (öne çıkan) | `false` |
| `old_price` | `product.metadata.old_price` | İndirim gösterimi; TRY decimal | `null` |
| `created_at` | `product.metadata.legacy_created_at` | İzleme; Medusa kendi timestamp'ini üretir | — |
| — | `product.status` | Yayın durumu | `published` |
| — | `product.is_giftcard` | | `false` |

#### 2.8.3 `product_sizes` → Medusa **Product Option + Variant**

| Kaynak alan | Medusa hedef alanı | Dönüşüm notu | Varsayılan |
|-------------|--------------------|--------------|-----------|
| `size` (bir ürünün tüm satırları) | `product.options[]` → tek option **"Beden"**, values = distinct size'lar | Ürün bazında option değerleri | — |
| `size` (her satır) | `product_variant` (option "Beden" = size) | Her beden = bir varyant; `title = size` | — |
| — | `variant.sku` | Deterministik: `izbutik-<product_id>-<size>` | üretilir |
| `STD` | tek varyant | Tek bedenli/aksesuar → tek "STD" varyant | — |

#### 2.8.4 `products.price` / `old_price` → Medusa **Price / Money Amount**

| Kaynak alan | Medusa hedef alanı | Dönüşüm notu | Varsayılan |
|-------------|--------------------|--------------|-----------|
| `price` (numeric(10,2), TRY) | `variant` price → Price Set / Money Amount | `currency_code = try`; **tutar ölçeği aktarımda doğrulanacak** (decimal vs minor unit — yanlış ölçek 100× hata). Tüm varyantlara aynı fiyat | — |
| `old_price` | `metadata.old_price` (veya opsiyonel price list "original") | İndirim gösterimi | `null` |

#### 2.8.5 `products.stock` → Medusa **Inventory Item + Stock Location Level**

| Kaynak alan | Medusa hedef alanı | Dönüşüm notu | Varsayılan |
|-------------|--------------------|--------------|-----------|
| `stock` (integer, **ürün düzeyi**) | Inventory Item + stok konumu seviyesi | Beden bazında stok olmadığından: **tek inventory item tüm varyantlara paylaştırılır** ya da her varyant `products.stock` değerini alır — script deterministik ve idempotent olmalı (bkz. 2.9) | `0` |

#### 2.8.6 `product_images` → Medusa **Product Images**

| Kaynak alan | Medusa hedef alanı | Dönüşüm notu | Varsayılan |
|-------------|--------------------|--------------|-----------|
| `url` | `product.images[].url` | `sort_order`'a göre sırala | — |
| `sort_order` = 0 | `product.thumbnail` | İlk görsel kapak | — |

#### 2.8.7 `orders` / `order_items`

| Kaynak | Medusa hedef | Not |
|--------|--------------|-----|
| `orders` (0), `order_items` (0) | — | **Boş** → veri taşıma yok; Medusa siparişleri bundan sonra kendi Order API'siyle üretir |

### 2.9 Eşlemenin çözülmesi gereken noktaları (Adım 9/24'te)

1. **Stok modeli farkı (en kritik):** izbutik'te stok **ürün düzeyinde tek** (`products.stock`, 8–43 aralığı); Medusa'da stok **varyant/inventory düzeyinde**. Karar: aynı `stock` her varyanta atanacak veya tek inventory item paylaştırılacak — script deterministik + tekrar çalıştırılabilir olmalı.
2. **Para birimi/ölçek:** Fiyatlar TRY `numeric(10,2)` (219.90–1249.90). Medusa v2 tutar temsili (decimal vs minor unit) aktarım anında doğrulanacak; yanlış ölçek 100× hataya yol açar.
3. **Idempotency:** `product.external_id = 'izbutik:<id>'` ve kategori `handle = slug` ile eşleştir → tekrar çalıştırıldığında çift kayıt üretme (`medusa_mapping_hints.idempotency`).
4. **Metadata'ya taşınan alanlar:** `rating`, `is_new`, `is_featured`, `old_price`, `description`/`image_url` (kategori) için Medusa'da native alan yok → `metadata`.

### 2.10 Adım 2 özeti

- Şema **canlı DB'den** tam çıkarıldı (`schema_analysis.json`): 6 tablo, tüm kolon tipleri, PK/UNIQUE ve FK'ler (`products.category_id` CASCADE; `product_images`/`product_sizes` CASCADE; `order_items.product_id` SET NULL) doğrulandı.
- **Kaynak sayılar sabitlendi:** 7 kategori, 26 ürün, 52 görsel, 79 beden; sipariş tabloları boş.
- Agregatlar: fiyat 219.90–1249.90 TRY, stok 8–43, 12 ürün indirimli, bedenler XS/S/M/L/XL/STD.
- **Tam kaynak → Medusa eşleme tablosu** (kategori/ürün/varyant/fiyat/stok/görsel) alan bazında yazıldı; kritik fark **ürün düzeyi stok**.
- Sonraki adım (Adım 3): güncel kararlı Medusa sürümü ve Node gereksinimi (aşağıda).

---

## 3. Sabitlenen Medusa Sürümü ve Kurulum Planı (Adım 3 – salt sürüm/plan tespiti)

**Doğrulama tarihi:** 2026-09-12
**Kaynaklar:** [Medusa resmi dokümantasyonu (Installation)](https://docs.medusajs.com/learn/installation), [medusajs/medusa GitHub](https://github.com/medusajs/medusa), npm registry (`registry.npmjs.org`)

> Bu adımda **kurulum yapılmadı**; yalnızca güncel kararlı sürümler, gereksinimler, kurulum yolu ve varsayılan portlar doğrulanıp sabitlendi.

### 3.1 Güncel kararlı sürüm (major serisi: **Medusa v2**)

Aktif kararlı seri **Medusa 2.x**'tir (dokümantasyon başlığı: `v2.21`). npm registry'den doğrulanan en güncel yayınlanmış sürümler (`latest` tag), aşağıdaki gibi **tam olarak sabitlenmiştir**:

| Paket | Sabitlenen sürüm | Rol |
|-------|------------------|-----|
| `@medusajs/medusa` | `2.21.0` | Ana Medusa uygulama paketi (backend) |
| `@medusajs/framework` | `2.21.0` | Framework çekirdeği (config, workflows, modules) |
| `@medusajs/cli` | `2.21.0` | `medusa` CLI (`db:migrate`, `develop`, `user`, `build`) |
| `@medusajs/admin-sdk` | `2.21.0` | Admin dashboard SDK |
| `@medusajs/js-sdk` | `2.21.0` | Storefront/istemci JS SDK (Store API çağrıları için) |
| `create-medusa-app` | `2.21.0` | Proje scaffold aracı |

> **Kural:** Tüm `@medusajs/*` paketleri **aynı minor sürümde (2.21.x)** tutulmalıdır; farklı minor karışımı desteklenmez. Kurulum sırasında bu sürümler açıkça sabitlenecek (`@2.21.0`).

### 3.2 Gereksinimler

- **Node.js:** `v20.19.0+` **veya** `v22.12.0+` — **yalnızca LTS sürümleri**.
  - Next.js Starter Storefront kurulacaksa: **Node v24 LTS veya altı** kullanılmalı.
- **PostgreSQL:** kurulu ve çalışıyor olmalı (bu projede PostgreSQL 16 zaten çalışıyor — bkz. Adım 1.8).
- **Git CLI** kurulu olmalı.
- **Redis:** yerel geliştirmede zorunlu değil; Medusa varsayılan olarak in-memory (simulated) event bus/cache/workflow engine ile çalışır. Üretimde Redis önerilir (Adım 6'da worker/redis notu).

> ⚠️ **Node sürüm uyarısı (bu makine):** Aktif Node **v25.2.0** (LTS **değil**). Medusa yalnızca LTS (v20.19+ / v22.12+; storefront için ≤ v24) destekler. Kuruluma (Adım 5) geçmeden önce `nvm` ile bir LTS sürüme geçilmeli — örn. Node **v22.x LTS** (yerelde v22.22.2 mevcut, bkz. memory). Bu, `create-medusa-app` ve `medusa` CLI'nin desteklenmeyen sürüm uyarısı/hatası vermemesi için gereklidir.

### 3.3 Kurulum yolu (Adım 5'te uygulanacak — burada sadece plan)

İki seçenek doğrulandı:

1. **`create-medusa-app` (önerilen):**
   ```
   npx create-medusa-app@2.21.0 medusa-backend
   ```
   - Storefront kurulum sorusuna **hayır** denecek (mevcut vanilla-JS storefront korunacak; Adım 12–14'te Store API'ye adaptörle bağlanacak).
   - Araç varsayılan olarak `medusa-<proje-adı>` adında bir DB oluşturmak ister; bunun yerine **izole DB `izbutik_medusa`** kullanılacak (Adım 4'te oluşturulur) ve DB URL'i özelleştirilerek verilecek. Mevcut `izbutik_db`'ye **dokunulmayacak**.
   - Not: `create-medusa-app` bir **monorepo** iskeleti kurabilir (`apps/backend`). Bu projede alt dizin `medusa-backend` olarak hedeflenmiştir; monorepo yerleşimi çıkarsa backend'in gerçek dizini (`apps/backend`) Adım 5'te gerekçesiyle belgelenecek.
2. **Manuel kurulum (yedek):** boş bir Node projesine `@medusajs/medusa@2.21.0`, `@medusajs/framework@2.21.0`, `@medusajs/cli@2.21.0`, `@medusajs/admin-sdk@2.21.0` eklenip `medusa-config.ts` elle yazılır. `create-medusa-app` sorun çıkarırsa bu yola geçilecek.

**Paket yöneticisi:** Doküman hız için `yarn`/`pnpm` önerir; proje `npm` tabanlı olduğundan tutarlılık için `npm` (veya gerekirse `yarn`) kullanılacak — seçim Adım 5'te sabitlenecek.

### 3.4 Varsayılan portlar ve adresler

| Servis | Varsayılan | Bu projedeki plan |
|--------|-----------|-------------------|
| Medusa backend (Store + Admin API) | `http://localhost:9000` | `http://127.0.0.1:9000` (yalnızca loopback bind) |
| Medusa Admin dashboard | `http://localhost:9000/app` | `http://127.0.0.1:9000/app` |
| (Opsiyonel) Next.js Starter Storefront | `http://localhost:8000` | Kullanılmayacak — mevcut storefront `127.0.0.1:3001` korunacak |

- **Store API tabanı:** `http://127.0.0.1:9000/store/*` (ürün: `/store/products`, kategori: `/store/product-categories`, sepet: `/store/carts`). Store API çağrıları **publishable API key** gerektirir (Adım 12'de env değişkeni olarak verilecek).
- **Admin API tabanı:** `http://127.0.0.1:9000/admin/*`.
- Mevcut Express storefront (`127.0.0.1:3001`) ile Medusa (`127.0.0.1:9000`) **farklı portlarda** çalışacağından CORS ayarı gerekir (Adım 6): Store CORS'a `http://127.0.0.1:3001` origin'i eklenecek.

### 3.5 Admin kullanıcısı ve migration komutları (referans — ilgili adımlarda kullanılacak)

- **Migration (yalnızca `izbutik_medusa`):** `npx medusa db:migrate` (Adım 7).
- **Admin kullanıcısı:** `npx medusa user -e <email>` (parola interaktif/gizli girilir, komut satırına yazılmaz; kaynağa/`.env`'e gömülmez). Tam kullanım, güvenli biçim, doğrulama ve admin panel girişi (`http://127.0.0.1:9000/app`) için bkz. **Bölüm 8 (Adım 8 – Yerel Admin Kullanıcısı Oluşturma)**.

### 3.6 Adım 3 özeti

- Sabitlenen seri: **Medusa v2**, tüm `@medusajs/*` paketleri **`2.21.0`**, `create-medusa-app@2.21.0`.
- Node gereksinimi: **LTS** (v20.19+/v22.12+; storefront için ≤ v24). Bu makinedeki v25.2.0 desteklenmiyor → kurulumdan önce **Node v22 LTS**'e geçilmeli.
- Kurulum: `create-medusa-app@2.21.0` (storefront'suz), izole DB `izbutik_medusa`; yedek yol manuel kurulum.
- Portlar: Medusa `127.0.0.1:9000` (Store/Admin), storefront `127.0.0.1:3001` korunur → CORS ayarı gerekli.
- **Bu adımda kurulum/DB işlemi yapılmadı.** Sonraki adım (Adım 4): izole `izbutik_medusa` veritabanını oluştur.

---

## 5. Medusa Backend İskeleti Kurulumu (Adım 5 – kurulum, migration YOK)

**Tarih:** 2026-09-12
**Konum:** `/Users/furkanatmaca/Downloads/izbutik/medusa-backend/` (kök izbutik Express projesi değiştirilmedi)

### 5.1 Seçilen kurulum yolu ve gerekçe

Adım 3'te iki yol sabitlenmişti. **Manuel kurulum (3.3 – yedek yol)** seçildi:

- `create-medusa-app` **interaktif**tir ve akış sırasında DB'ye bağlanıp **otomatik migration + seed** çalıştırır. Bu adımın açık kısıtı "veritabanı otomatik migration'ı henüz çalıştırılmadan" olduğundan ve task-runner ortamında interaktif prompt'lar cevaplanamayacağından, kontrollü ve prompt'suz olan manuel iskelet tercih edildi.
- Manuel yol, sürümleri `package.json`'da **tam sabit** (caret'siz) tutmayı ve migration'ı Adım 7'ye ertelemeyi garanti eder.

### 5.2 Sabitlenen bağımlılıklar (tam sürüm — caret yok)

Tüm `@medusajs/*` paketleri **`2.21.0`** (Adım 3 kuralı). `npm install --save-exact` ile kuruldu.

| Paket | Sürüm | Rol |
|-------|-------|-----|
| `@medusajs/medusa` | `2.21.0` | Ana backend |
| `@medusajs/framework` | `2.21.0` | Framework çekirdeği |
| `@medusajs/cli` | `2.21.0` | `medusa` CLI |
| `@medusajs/admin-sdk` | `2.21.0` | Admin dashboard SDK |
| `@medusajs/test-utils` | `2.21.0` (dev) | Test yardımcıları |
| `@mikro-orm/*` | `6.4.3` | ORM (core/knex/migrations/postgresql/cli) |
| `pg` | `8.13.0` | PostgreSQL sürücüsü |
| `@swc/core` | `1.16.2` | Derleyici — Medusa peer `^1.7.28` gereksinimini karşılar |
| `typescript` | `5.6.2` (dev) | TS |

> **Peer çakışması notu:** İlk denemede `@swc/core@1.5.7` (create-medusa-app şablon değeri), Medusa 2.21.0'ın `@swc/core@^1.7.28` peer gereksinimiyle çakıştı. `--force`/`--legacy-peer-deps` ile hatalı çözüm **yapılmadı**; bunun yerine kök neden düzeltildi: `@swc/core` **`1.16.2`**'e sabitlendi ve kurulum temiz tamamlandı (1249 paket).

### 5.3 Node sürümü

Kurulum **Node v22.22.2 (LTS)** ile yapıldı (`~/.nvm/versions/node/v22.22.2`). Makinedeki varsayılan v25.2.0 (LTS değil) **kullanılmadı** (Adım 3.2 uyarısı). `package.json > engines.node`: `">=20.19.0 <25"`.

### 5.4 Oluşturulan dizin yapısı (`medusa-backend/`)

```
medusa-backend/
├── .env.example        # env ŞABLONU (secret yok; DATABASE_URL → izbutik_medusa)
├── .gitignore          # node_modules/, .medusa/, .env, dist/ hariç
├── medusa-config.ts    # env-tabanlı minimum config (CORS detayı Adım 6)
├── package.json        # tam sabit sürümler
├── package-lock.json
├── tsconfig.json
└── src/
    ├── admin/  api/  jobs/  links/  modules/  scripts/  subscribers/  workflows/  (.gitkeep)
```

### 5.5 İzolasyon ve doğrulama

- `medusa --version` → **CLI 2.21.0 / Medusa 2.21.0** (site: `medusa-backend`). ✅
- `izbutik_medusa` public şema tablo sayısı = **0** → **migration çalıştırılmadı** (bu adımın kısıtına uygun). ✅
- `izbutik_db` **değiştirilmedi** (mevcut tablolar korunuyor). ✅
- Kurulum logları `$KIROCREW_SCRATCH` altına yönlendirildi (`medusa-install-*.log`), repoya yazılmadı.
- `node_modules/` ve `.env` **gitignore** kapsamında (`git check-ignore` doğruladı) → kök proje pollute edilmedi.

### 5.6 Adım 5 özeti

- `medusa-backend/` iskeleti kuruldu; tüm `@medusajs/*` **2.21.0**, `@swc/core` **1.16.2**, Node **v22 LTS**.
- Migration/seed **çalıştırılmadı** (Adım 7'ye ertelendi); `izbutik_medusa` boş, `izbutik_db` dokunulmamış.
- Sonraki adım (Adım 6): `medusa-config.ts`'i izbutik_medusa bağlantısı + Store/Admin/Auth CORS (127.0.0.1:3001 storefront origin'i) ile yerel geliştirmeye ayarla.

---

## 8. Yerel Admin Kullanıcısı Oluşturma (Adım 8 – belgelenmiş talimat, otomatik ÇALIŞTIRILMADI)

**Tarih:** 2026-09-12
**Konum:** `/Users/furkanatmaca/Downloads/izbutik/medusa-backend/`

> ⚠️ **Bu adımda hiçbir kullanıcı oluşturulmadı.** Aşağıdaki komut yalnızca **talimattır**; parolayı **kullanıcının kendisi** interaktif olarak girene kadar çalıştırılmaz. Parola bu dokümana, `.env`'e, script'e veya git geçmişine **GÖMÜLMEZ**.

### 8.1 Ön koşullar

1. Migration `izbutik_medusa` üzerinde tamamlanmış olmalı (Adım 7 – `npx medusa db:migrate`). Admin kullanıcısı `user` tablosuna yazılır; tablolar migration ile oluşur.
2. `medusa-backend/.env` içinde `DATABASE_URL` **`izbutik_medusa`** veritabanına işaret etmeli (izbutik_db değil). Komut çalıştırılmadan önce doğrula:

   ```bash
   cd /Users/furkanatmaca/Downloads/izbutik/medusa-backend
   grep -E '^DATABASE_URL=' .env    # .../izbutik_medusa içermeli
   ```

### 8.2 Güvenli komut biçimi (ÖNERİLEN — parola interaktif)

Medusa admin kullanıcısı `medusa user` komutu ile oluşturulur. **Parolayı komut satırında AÇIK yazma** (shell history'ye ve process listesine sızar). Bunun yerine `-p` bayrağını **atla** → CLI parolayı gizli (echo'suz) prompt ile ister:

```bash
cd /Users/furkanatmaca/Downloads/izbutik/medusa-backend

# Parola İSTENİR, ekrana yazılmaz. E-postayı kendi değerinizle değiştirin.
npx medusa user -e admin@izbutik.local
# → "Enter a password: " (gizli giriş)
```

- `-e / --email` : admin e-postası (zorunlu).
- `-p / --password` : **kasıtlı olarak verilmedi** → interaktif gizli prompt devreye girer.
- `--invite` : alternatif akış; parola belirlemeden davet token'ı üretir (kullanıcı ilk girişte kendi parolasını belirler). Ekip/paylaşımlı kurulum için tercih edilebilir:

  ```bash
  npx medusa user -e admin@izbutik.local --invite
  ```

### 8.3 Kaçınılması gereken güvensiz biçimler

```bash
# ❌ YAPMA: parola shell history + ps çıktısına sızar
npx medusa user -e admin@izbutik.local -p SuperSecret123

# ❌ YAPMA: parolayı repoya/örneğe gömme
#   .env / .env.example / script içine düz metin parola yazma
```

Zorunlu olarak script'ten geçmesi gerekiyorsa (CI vb.), parola **ortam değişkeninden** okunmalı ve değişken repoya yazılmamalıdır:

```bash
# Parola dışarıdan (secret manager / interaktif) enjekte edilir, repoya girmez:
read -rs ADMIN_PW && npx medusa user -e admin@izbutik.local -p "$ADMIN_PW"; unset ADMIN_PW
```

### 8.4 Doğrulama (opsiyonel, salt okunur)

Kullanıcı oluşturduktan sonra `izbutik_medusa`'da (parolayı göstermeden) kontrol edilebilir:

```bash
psql -U izbutik -d izbutik_medusa -c "SELECT email FROM \"user\" ORDER BY created_at DESC LIMIT 5;"
```

Admin paneli girişi (backend çalışırken – Adım 11): `http://127.0.0.1:9000/app`

### 8.5 Adım 8 özeti

- Admin kullanıcı oluşturma **komutu belgelendi**; güvenli (interaktif/gizli parola) biçim önerildi.
- Parola hiçbir yere **gömülmedi**; kullanıcı parolayı verene kadar komut **çalıştırılmadı**.
- Sonraki adım (Adım 9): `scripts/migrate-izbutik-data.ts` — izbutik_db'den (salt okunur) 7 kategori + 26 ürünü Medusa modeline aktaran tekrar çalıştırılabilir script.

---

## 10. Uygulama Sonucu (2026-09-13)

### 10.1 Tamamlanan mimari

- Medusa v2.21.0 backend: `medusa-backend/`
- İzole hedef veritabanı: `izbutik_medusa`
- Korunan kaynak veritabanı: `izbutik_db` (aktarım scripti yalnız `SELECT` çalıştırır)
- Mevcut vanilla storefront ve görsel tasarım korunmuştur.
- Express katmanı storefront için uyumluluk/BFF görevi görür:
  - `/api/categories` → Medusa Product Categories
  - `/api/products` ve `/api/products/:slug` → Medusa Store Products
  - `/api/cart/*` → Medusa Cart/Line Item API
  - `/api/orders` → adres + manual shipping + system-default payment + cart completion
- `COMMERCE_BACKEND=legacy` ile eski PostgreSQL ürün/kategori/sipariş akışına geri dönülebilir.

### 10.2 Aktarılan veri ve eşleme doğrulaması

| Veri | Kaynak | Medusa hedef | Sonuç |
|------|-------:|-------------:|-------|
| Kategori | 7 | 7 | ✅ |
| Ürün | 26 | 26 | ✅ |
| Görsel | 52 | 52 | ✅ |
| Beden / varyant | 79 | 79 | ✅ |
| Envanter seviyesi | — | 79 | ✅ |
| Shipping profile bağlantısı | — | 26 ürün | ✅ |

`npm run migrate:izbutik` ikinci kez çalıştırılmış; 0 yeni ürün, 26 güncelleme ve 0 yeni envanter seviyesi üretmiştir. Bu sonuç veri aktarımının idempotent olduğunu doğrular.

### 10.3 Yerel kurulum ve çalıştırma

Gereksinimler:

- Node.js 20.19+ veya 22.12+ LTS (doğrulanan sürüm: 22.22.2)
- PostgreSQL 16
- `izbutik` kullanıcısının erişebildiği ayrı `izbutik_medusa` veritabanı

Medusa backend:

```bash
cd /Users/furkanatmaca/Downloads/izbutik/medusa-backend
npm ci
npm run predeploy
npm run seed
npm run migrate:izbutik
MEDUSA_DISABLE_ADMIN=true HOST=127.0.0.1 PORT=9000 npm run dev
```

`npm run seed` çıktısındaki `pk_...` ile başlayan **publishable** Store API anahtarını storefront ortamına ekleyin. Bu anahtar gizli sunucu anahtarı değildir; yine de ortama göre yönetilmelidir.

Storefront (ayrı terminal):

```bash
cd /Users/furkanatmaca/Downloads/izbutik
npm ci
COMMERCE_BACKEND=medusa \
MEDUSA_BACKEND_URL=http://127.0.0.1:9000 \
MEDUSA_PUBLISHABLE_KEY=pk_yerel_seed_ciktisi \
HOST=127.0.0.1 PORT=3001 npm start
```

Yerel adresler:

- Storefront: `http://127.0.0.1:3001`
- Medusa API: `http://127.0.0.1:9000`
- Medusa health: `http://127.0.0.1:9000/health`

Admin kullanıcı parolasını kaynağa yazmayın. Etkileşimli olarak oluşturun:

```bash
cd /Users/furkanatmaca/Downloads/izbutik/medusa-backend
npx medusa user -e admin@example.com
```

Admin paneli gerektiğinde `MEDUSA_DISABLE_ADMIN=false npm run dev` ile açılabilir. Düşük bellekli yerel doğrulamada Admin derlemesi kapalı tutulmuştur.

### 10.4 Doğrulama sonuçları

- PostgreSQL migration: ✅ 147 Medusa public tablosu
- MikroORM paket ağacı: ✅ tamamı 6.6.14
- TypeScript `tsc --noEmit`: ✅
- Değişen JavaScript dosyaları `node --check`: ✅
- Store API region: ✅ Türkiye / TRY
- Store API categories: ✅ 7
- Store API products: ✅ 26
- Tek ürün: ✅ görseller, 3+ beden varyantı, TRY calculated price, inventory
- Cart create: ✅
- Line item add: ✅
- Quantity update: ✅
- Line item delete: ✅
- Checkout: ✅ manual shipping + `pp_system_default`; yerel Medusa siparişi oluşturuldu
- Kaynak `izbutik_db`: ✅ 7 kategori / 26 ürün / 52 görsel / 79 beden değişmeden korundu

Native Browser paneli ve Playwright/agent-browser bu makinede kurulu olmadığından piksel tabanlı ekran görüntüsü doğrulaması yapılamadı. HTTP ve API smoke testleri başarılıdır.

### 10.5 Rollback

Kod rollback'i için storefront ortamında yalnız şu değişkeni kullanın:

```bash
COMMERCE_BACKEND=legacy
```

Bu durumda mevcut Express + `izbutik_db` ürün/kategori/sipariş rotaları kullanılır. `izbutik_medusa` ayrı olduğu için rollback sırasında kaynak şemaya migration veya veri geri yükleme gerekmez.

### 10.6 Üretim öncesi kalan kararlar

1. `pp_system_default` yerine seçilecek gerçek ödeme sağlayıcısı ve 3D Secure akışı.
2. Manual fulfillment yerine kargo firması/entegrasyonu, takip numarası ve iade akışı.
3. Redis event bus/cache/workflow engine (in-memory yalnız yerel geliştirme içindir).
4. Güçlü JWT/cookie secret’ları ve production secret manager.
5. E-posta/SMS sağlayıcısı ve sipariş bildirimleri.
6. Görsel dosya sağlayıcısı/CDN ve upload politikası.
7. Checkout formuna şehir/ilçe/posta kodu alanlarının eklenmesi; mevcut adaptör yerel demo için İstanbul/34000 varsayımı kullanır.
8. Stok kaynağının beden bazında modellenmesi. Eski kaynakta stok ürün seviyesindedir; geçişte aynı stok değeri her varyanta yazılmıştır.
9. Production CORS alan adları, TLS, rate limit, gözlemlenebilirlik ve yedekleme.
10. Browser aracı kurulduktan sonra masaüstü/mobil görsel ve erişilebilirlik doğrulaması.
