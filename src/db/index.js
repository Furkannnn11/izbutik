import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// DATABASE_URL varsa onu kullan, yoksa tekil değişkenlere düş.
const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST || '127.0.0.1',
        port: Number(process.env.PGPORT) || 5432,
        user: process.env.PGUSER || 'izbutik',
        password: process.env.PGPASSWORD || 'izbutik123',
        database: process.env.PGDATABASE || 'izbutik_db',
      }
);

pool.on('error', (err) => {
  console.error('Beklenmeyen PostgreSQL havuz hatası:', err);
});

export const query = (text, params) => pool.query(text, params);

export const getClient = () => pool.connect();

export default pool;
