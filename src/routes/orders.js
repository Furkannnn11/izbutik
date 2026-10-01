import { Router } from 'express';
import pool, { getClient } from '../db/index.js';
import { isMedusaCommerce, medusaRequest } from '../lib/medusa.js';
import { listCartShippingOptions } from './shipping.js';

const router = Router();

function splitName(value = '') {
  const parts = String(value).trim().split(/\s+/).filter(Boolean);
  return {
    first_name: parts.shift() || 'Müşteri',
    last_name: parts.join(' ') || '-',
  };
}

async function completeMedusaOrder({ cart_id, customer, shipping_option_id }) {
  if (!cart_id) {
    const error = new Error('Medusa cart_id zorunludur.');
    error.status = 400;
    throw error;
  }

  const name = splitName(customer.name);
  const address = {
    ...name,
    address_1: customer.address || 'Adres belirtilmedi',
    city: customer.city || 'İstanbul',
    postal_code: customer.postal_code || '34000',
    country_code: 'tr',
    phone: customer.phone || undefined,
  };

  let cartData = await medusaRequest(`/store/carts/${encodeURIComponent(cart_id)}`, {
    method: 'POST',
    body: {
      email: customer.email,
      shipping_address: address,
      billing_address: address,
    },
  });

  // Müşterinin seçtiği kargo seçeneği; yalnız bu sepet için geçerli
  // seçenekler arasından kabul edilir. Seçim yoksa en ucuz seçenek kullanılır.
  const options = await listCartShippingOptions(cart_id);
  if (!options.length) {
    const error = new Error('Bu sepet için uygun kargo seçeneği bulunamadı.');
    error.status = 422;
    throw error;
  }
  const shippingOption = shipping_option_id
    ? options.find((option) => option.id === shipping_option_id)
    : options[0];
  if (!shippingOption) {
    const error = new Error('Seçilen kargo seçeneği geçerli değil. Lütfen yeniden seçin.');
    error.status = 400;
    throw error;
  }
  const currentMethod = cartData.cart?.shipping_methods?.[0];
  if (!currentMethod || currentMethod.shipping_option_id !== shippingOption.id) {
    cartData = await medusaRequest(
      `/store/carts/${encodeURIComponent(cart_id)}/shipping-methods`,
      { method: 'POST', body: { option_id: shippingOption.id } }
    );
  }

  let paymentCollection = cartData.cart?.payment_collection;
  if (!paymentCollection?.id) {
    const paymentData = await medusaRequest('/store/payment-collections', {
      method: 'POST',
      body: { cart_id },
    });
    paymentCollection = paymentData.payment_collection;
  }

  const initializedSession = paymentCollection?.payment_sessions?.find(
    (session) => session.provider_id === 'pp_system_default'
  );
  if (!initializedSession) {
    await medusaRequest(
      `/store/payment-collections/${encodeURIComponent(paymentCollection.id)}/payment-sessions`,
      {
        method: 'POST',
        body: { provider_id: 'pp_system_default' },
      }
    );
  }

  const completion = await medusaRequest(
    `/store/carts/${encodeURIComponent(cart_id)}/complete`,
    { method: 'POST', body: {} }
  );
  if (completion.type !== 'order' || !completion.order) {
    const error = new Error(completion.error?.message || 'Medusa siparişi tamamlanamadı.');
    error.status = 422;
    throw error;
  }

  return completion.order;
}

async function createLegacyOrder({ customer, items }) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const ids = items.map((item) => Number(item.id)).filter(Boolean);
    const { rows: dbProducts } = await client.query(
      `SELECT id, name, price, stock FROM products WHERE id = ANY($1)`,
      [ids]
    );
    const byId = new Map(dbProducts.map((product) => [product.id, product]));

    let total = 0;
    const lineItems = [];
    for (const item of items) {
      const product = byId.get(Number(item.id));
      if (!product) {
        const error = new Error(`Ürün bulunamadı: ${item.id}`);
        error.status = 400;
        throw error;
      }
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const price = Number(product.price);
      total += price * quantity;
      lineItems.push({
        product_id: product.id,
        name: product.name,
        size: item.size || null,
        quantity,
        price,
      });
    }

    const orderResult = await client.query(
      `INSERT INTO orders (customer_name, email, phone, address, total, status)
       VALUES ($1,$2,$3,$4,$5,'pending') RETURNING id, created_at`,
      [customer.name, customer.email, customer.phone || null, customer.address || null, total]
    );
    const orderId = orderResult.rows[0].id;

    for (const item of lineItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, name, size, quantity, price)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [orderId, item.product_id, item.name, item.size, item.quantity, item.price]
      );
    }

    await client.query('COMMIT');
    return {
      id: orderId,
      total,
      status: 'pending',
      created_at: orderResult.rows[0].created_at,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Yeni sipariş oluştur.
router.post('/', async (req, res, next) => {
  const { cart_id, customer, items } = req.body || {};
  const shipping_option_id =
    typeof req.body?.shipping_option_id === 'string' ? req.body.shipping_option_id : undefined;

  if (!customer?.name || !customer?.email) {
    return res.status(400).json({ error: 'Ad ve e-posta zorunludur.' });
  }

  try {
    if (isMedusaCommerce()) {
      const order = await completeMedusaOrder({ cart_id, customer, shipping_option_id });
      return res.status(201).json({
        id: order.display_id || order.id,
        medusa_id: order.id,
        total: Number(order.total || 0),
        status: order.status,
        created_at: order.created_at,
        message: 'Siparişiniz Medusa üzerinden alındı! Teşekkür ederiz.',
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Sepet boş olamaz.' });
    }
    const order = await createLegacyOrder({ customer, items });
    res.status(201).json({ ...order, message: 'Siparişiniz alındı! Teşekkür ederiz.' });
  } catch (error) {
    next(error);
  }
});

// Legacy sipariş detayı. Medusa siparişleri Admin/Store API üzerinden yönetilir.
router.get('/:id', async (req, res, next) => {
  if (isMedusaCommerce()) {
    return res.status(410).json({
      error: 'Medusa sipariş detayı için Admin panelini veya müşteri Store API akışını kullanın.',
    });
  }

  try {
    const { rows } = await pool.query(`SELECT * FROM orders WHERE id = $1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Sipariş bulunamadı' });
    const { rows: itemRows } = await pool.query(
      `SELECT * FROM order_items WHERE order_id = $1`,
      [req.params.id]
    );
    res.json({ ...rows[0], items: itemRows });
  } catch (error) {
    next(error);
  }
});

export default router;
