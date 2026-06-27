import express from 'express';
import compression from 'compression';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import categoriesRouter from './routes/categories.js';
import productsRouter from './routes/products.js';
import ordersRouter from './routes/orders.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(compression());
app.use(express.json());
app.use(morgan('dev'));

// API rotaları
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'izbutik' }));
app.use('/api/categories', categoriesRouter);
app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);

// Statik frontend
const publicDir = path.join(__dirname, '..', 'public');
app.use(
  express.static(publicDir, {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  })
);

// SPA fallback (API dışı tüm istekler index.html'e)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Hata yakalayıcı
app.use((err, _req, res, _next) => {
  console.error('API hatası:', err);
  res.status(500).json({ error: 'Sunucu hatası', detail: err.message });
});

app.listen(PORT, () => {
  console.log(`İzbutik sunucusu çalışıyor: http://localhost:${PORT}`);
});

export default app;
