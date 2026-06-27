# İzbutik 👗

Modern, hareketli ve mobil uyumlu bir **online kadın giyim mağazası**. Node.js + Express
backend, **PostgreSQL** veritabanı ve vanilla JS ile yazılmış zarif, animasyonlu bir arayüz.

> Tasarım ilhamı: [@izbutik20](https://www.instagram.com/izbutik20/)

## ✨ Özellikler

- **Kategorilere ayrılmış ürünler** — Elbise, Üst Giyim, Alt Giyim, Dış Giyim, Triko, Takım, Aksesuar
- **Hareketli görseller & animasyonlar** — hero parallax/blob animasyonları, kayan şeritler (marquee), scroll-reveal, ürün kartlarında hover ile görsel değişimi, sayaç animasyonları
- **Modern UI/UX** — zarif butik paleti (krem / gül kurusu / bordo / altın), Cormorant Garamond + Jost tipografisi, tamamen responsive
- **Ürün detay modalı** — galeri, beden seçimi, indirim rozetleri
- **Sepet** — kayan sepet çekmecesi, adet güncelleme, `localStorage` kalıcılığı
- **Sipariş** — checkout formu, PostgreSQL'e kaydedilen siparişler (fiyatlar sunucuda doğrulanır)
- **REST API** — kategoriler, filtrelenebilir/sıralanabilir ürünler, sipariş oluşturma
- **Performans** — gzip sıkıştırma, lazy-loading görseller, statik dosya cache

## 🧱 Teknoloji

| Katman | Teknoloji |
|--------|-----------|
| Backend | Node.js, Express |
| Veritabanı | PostgreSQL (`pg` sürücüsü) |
| Frontend | HTML5, modern CSS, vanilla JavaScript (framework yok) |
| Diğer | compression, morgan, dotenv |

## 📂 Proje Yapısı

```
izbutik/
├── public/                 # Frontend (statik)
│   ├── index.html
│   ├── css/styles.css
│   └── js/app.js
├── src/
│   ├── server.js           # Express uygulaması
│   ├── db/
│   │   ├── index.js        # PostgreSQL bağlantı havuzu
│   │   ├── schema.sql      # Tablo şeması
│   │   ├── migrate.js      # Şemayı uygular
│   │   └── seed.js         # Örnek kategori + ürün verisi
│   └── routes/
│       ├── categories.js
│       ├── products.js
│       └── orders.js
├── scripts/start-db.sh     # Lokal PostgreSQL başlatma yardımcısı
├── .env.example
└── package.json
```

## 🚀 Kurulum

### 1. Gereksinimler
- Node.js 18+
- PostgreSQL 13+

### 2. Bağımlılıkları yükle
```bash
npm install
```

### 3. Ortam değişkenleri
`.env.example` dosyasını `.env` olarak kopyala ve veritabanı bilgilerini gir:
```bash
cp .env.example .env
```
```env
DATABASE_URL=postgres://izbutik:izbutik123@127.0.0.1:5432/izbutik_db
PORT=3000
```

### 4. Veritabanını hazırla
PostgreSQL kurulu ve `izbutik_db` veritabanı oluşturulmuş olmalı. Ardından:
```bash
npm run db:migrate   # tabloları oluşturur
npm run db:seed      # örnek verileri ekler
```

> İpucu: Bu repodaki `scripts/start-db.sh`, lokal/sandbox ortamında PostgreSQL'i
> başlatıp kullanıcıyı ve veritabanını otomatik hazırlamak için kullanılabilir.

### 5. Çalıştır
```bash
npm start
# http://localhost:3000
```

## 🔌 API Uç Noktaları

| Metot | Yol | Açıklama |
|-------|-----|----------|
| GET | `/api/health` | Servis durumu |
| GET | `/api/categories` | Tüm kategoriler (ürün sayısıyla) |
| GET | `/api/products` | Ürünler — `?category=`, `?search=`, `?sort=`, `?featured=`, `?isNew=`, `?limit=` |
| GET | `/api/products/:slug` | Tek ürün detayı |
| POST | `/api/orders` | Sipariş oluştur |
| GET | `/api/orders/:id` | Sipariş detayı |

**Sipariş örneği:**
```bash
curl -X POST http://localhost:3000/api/orders \
  -H 'Content-Type: application/json' \
  -d '{"customer":{"name":"Ad Soyad","email":"ad@mail.com"},"items":[{"id":1,"size":"M","quantity":2}]}'
```

## 🖼️ Görseller Hakkında

İzbutik Instagram hesabı giriş duvarı arkasında olduğundan, demo için yüksek kaliteli
[Unsplash](https://unsplash.com) görselleri kullanılmıştır. Gerçek ürün görselleri,
`src/db/seed.js` içindeki `IMG` haritası güncellenerek kolayca eklenebilir.

## 📝 Lisans

MIT
