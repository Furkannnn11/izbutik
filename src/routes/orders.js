import { Router } from 'express';
import pool, { getClient } from '../db/index.js';

const router = Router();

// Yeni sipariş oluştur
// body: { customer: {name,email,phone,address}, items: [{id, size, quantity}] }
router.post('/', async (req, res, next) => {
  const { customer, items } = req.body || {};

  if (!customer || !customer.name || !customer.email) {
    return res.status(400).json({ error: 'Ad ve e-posta zorunludur.' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Sepet boş olamaz.' });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Ürünleri DB'den doğrula ve fiyatları güvenli şekilde al
    const ids = items.map((i) => Number(i.id)).filter(Boolean);
    const { rows: dbProducts } = await client.query(
      `SELECT id, name, price, stock FROM products WHERE id = ANY($1)`,
      [ids]
    );
    const byId = new Map(dbProducts.map((p) => [p.id, p]));

    let total = 0;
    const lineItems = [];
    for (const item of items) {
      const prod = byId.get(Number(item.id));
      if (!prod) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Ürün bulunamadı: ${item.id}` });
      }
      const qty = Math.max(1, Number(item.quantity) || 1);
      const price = Number(prod.price);
      total += price * qty;
      lineItems.push({ product_id: prod.id, name: prod.name, size: item.size || null, qty, price });
    }

    const orderRes = await client.query(
      `INSERT INTO orders (customer_name, email, phone, address, total, status)
       VALUES ($1,$2,$3,$4,$5,'pending') RETURNING id, created_at`,
      [customer.name, customer.email, customer.phone || null, customer.address || null, total]
    );
    const orderId = orderRes.rows[0].id;

    for (const li of lineItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, name, size, quantity, price)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [orderId, li.product_id, li.name, li.size, li.qty, li.price]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({
      id: orderId,
      total,
      status: 'pending',
      created_at: orderRes.rows[0].created_at,
      message: 'Siparişiniz alındı! Teşekkür ederiz.',
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// Sipariş detayı
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM orders WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Sipariş bulunamadı' });
    const { rows: itemRows } = await pool.query(
      `SELECT * FROM order_items WHERE order_id = $1`,
      [req.params.id]
    );
    res.json({ ...rows[0], items: itemRows });
  } catch (err) {
    next(err);
  }
});

export default router;
