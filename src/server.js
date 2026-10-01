import express from 'express';
import compression from 'compression';
import morgan from 'morgan';
import path from 'path';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import categoriesRouter from './routes/categories.js';
import productsRouter from './routes/products.js';
import cartRouter from './routes/cart.js';
import ordersRouter from './routes/orders.js';
import {
  getMedusaProductByHandle,
  isMedusaCommerce,
  listMedusaCategories,
} from './lib/medusa.js';
import {
  categoryShareMeta,
  defaultShareMeta,
  injectShareMeta,
  productShareMeta,
} from './lib/share-meta.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';

// Middleware
app.use(compression());
app.use(express.json());
app.use(morgan('dev'));

// API rotaları
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'izbutik' }));
app.use('/api/categories', categoriesRouter);
app.use('/api/products', productsRouter);
app.use('/api/cart', cartRouter);
app.use('/api/orders', ordersRouter);

// Statik frontend
const publicDir = path.join(__dirname, '..', 'public');
app.use(
  express.static(publicDir, {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
    index: false, // "/" de meta üreten fallback'ten geçsin
  })
);

// Sayfa HTML'i: ürün/kategori linkleri paylaşıldığında WhatsApp, Instagram,
// Telegram vb. önizleme için JavaScript çalıştırmaz; Open Graph etiketleri
// burada sunucu tarafında sayfaya özel üretilir.
const indexPath = path.join(publicDir, 'index.html');
let cachedTemplate = null;
async function indexTemplate() {
  if (cachedTemplate && process.env.NODE_ENV === 'production') return cachedTemplate;
  cachedTemplate = await readFile(indexPath, 'utf8');
  return cachedTemplate;
}

// Önizleme botları uzun beklemez; Medusa yavaşsa varsayılan etiketlerle devam et.
function withTimeout(promise, ms = 2500) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(undefined), ms))]);
}

function publicBaseUrl(req) {
  // Canlıda PUBLIC_BASE_URL (ör. https://izbutik.com) verilmeli; Host başlığına güvenmemek için.
  return process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
}

async function pageShareMeta(req) {
  const base = publicBaseUrl(req);
  let pathname = req.path.replace(/\/+$/, '') || '/';
  try { pathname = decodeURIComponent(pathname); } catch { /* bozuk URL */ }
  let m;
  if ((m = pathname.match(/^\/urun\/([^/]+)$/))) {
    const product = isMedusaCommerce()
      ? await withTimeout(getMedusaProductByHandle(m[1]).catch(() => undefined))
      : undefined;
    // null = Medusa 'yok' dedi (404); undefined = zaman aşımı/hata (200, istemci karar verir)
    if (product) return { meta: productShareMeta(product, base), status: 200 };
    return { meta: { ...defaultShareMeta(base, pathname), noindex: true }, status: product === null ? 404 : 200 };
  }
  if ((m = pathname.match(/^\/kategori\/([^/]+)$/))) {
    const cats = isMedusaCommerce()
      ? await withTimeout(listMedusaCategories().catch(() => null))
      : null;
    const cat = cats?.find((c) => c.slug === m[1]);
    if (cat) return { meta: categoryShareMeta(cat, base), status: 200 };
    return { meta: defaultShareMeta(base, pathname), status: 200 };
  }
  if (pathname === '/sepet' || pathname === '/odeme') {
    const title = pathname === '/sepet' ? 'Sepetim · İzbutik' : 'Siparişi Tamamla · İzbutik';
    return { meta: { ...defaultShareMeta(base, pathname), title, noindex: true }, status: 200 };
  }
  return { meta: defaultShareMeta(base, pathname), status: 200 };
}

// SPA fallback (API dışı tüm istekler index.html'e, sayfaya özel meta ile)
app.get('*', async (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  try {
    const [html, { meta, status }] = await Promise.all([indexTemplate(), pageShareMeta(req)]);
    res.status(status).type('html').set('Cache-Control', 'no-cache').send(injectShareMeta(html, meta));
  } catch (error) {
    next(error);
  }
});

// Hata yakalayıcı
app.use((err, _req, res, _next) => {
  console.error('API hatası:', err);
  const status = Number(err.status) || 500;
  res.status(status).json({
    error: status >= 500 ? 'Commerce servisi hatası' : err.message,
    detail: err.message,
  });
});

app.listen(PORT, HOST, () => {
  console.log(`İzbutik sunucusu çalışıyor: http://${HOST}:${PORT}`);
});

export default app;
