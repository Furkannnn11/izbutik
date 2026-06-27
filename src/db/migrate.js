import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('==> Şema uygulanıyor...');
  await pool.query(sql);
  console.log('==> Şema başarıyla oluşturuldu.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Migrate hatası:', err.message);
  process.exit(1);
});
