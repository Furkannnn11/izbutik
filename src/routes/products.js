import { Router } from 'express';
import { query } from '../db/index.js';
import {
  getMedusaProductByHandle,
  isMedusaCommerce,
  listMedusaProducts,
} from '../lib/medusa.js';

const router = Router();

// Legacy PostgreSQL fallback'i: COMMERCE_BACKEND=legacy ile kullanılabilir.
const SELECT_PRODUCT = `
  SELECT p.id, p.slug, p.name, p.description, p.price, p.old_price,
         p.stock, p.rating, p.is_new, p.is_featured, p.created_at,
         c.slug AS category_slug, c.name AS category_name,
         COALESCE(
           (SELECT json_agg(pi.url ORDER BY pi.sort_order)
              FROM product_images pi WHERE pi.product_id = p.id),
           '[]'
         ) AS images,
         COALESCE(
           (SELECT json_agg(ps.size)
              FROM product_sizes ps WHERE ps.product_id = p.id),
           '[]'
         ) AS sizes
    FROM products p
    JOIN categories c ON c.id = p.category_id
`;

function filterAndSort(products, requestQuery) {
  const { category, search, sort, featured, isNew, limit } = requestQuery;
  let rows = products;

  if (category) rows = rows.filter((product) => product.category_slug === category);
  if (search) {
    const needle = String(search).toLocaleLowerCase('tr-TR');
    rows = rows.filter(
      (product) =>
        product.name.toLocaleLowerCase('tr-TR').includes(needle) ||
        product.description.toLocaleLowerCase('tr-TR').includes(needle)
    );
  }
  if (featured === 'true') rows = rows.filter((product) => product.is_featured);
  if (isNew === 'true') rows = rows.filter((product) => product.is_new);

  const sorters = {
    price_asc: (a, b) => a.price - b.price,
    price_desc: (a, b) => b.price - a.price,
    rating: (a, b) => b.rating - a.rating,
    newest: (a, b) => new Date(b.created_at) - new Date(a.created_at),
  };
  rows = [...rows].sort(
    sorters[sort] || ((a, b) => Number(b.is_featured) - Number(a.is_featured))
  );
  return rows.slice(0, Math.min(Number(limit) || 100, 200));
}

// GET /api/products?category=elbise&search=...&sort=price_asc&featured=true&limit=50
router.get('/', async (req, res, next) => {
  try {
    if (isMedusaCommerce()) {
      const products = await listMedusaProducts({ limit: 200 });
      return res.json(filterAndSort(products, req.query));
    }

    const { category, search, sort, featured, isNew, limit } = req.query;
    const where = [];
    const params = [];

    if (category) {
      params.push(category);
      where.push(`c.slug = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(p.name ILIKE $${params.length} OR p.description ILIKE $${params.length})`);
    }
    if (featured === 'true') where.push('p.is_featured = true');
    if (isNew === 'true') where.push('p.is_new = true');

    let sql = SELECT_PRODUCT;
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`;

    const sortMap = {
      price_asc: 'p.price ASC',
      price_desc: 'p.price DESC',
      rating: 'p.rating DESC',
      newest: 'p.created_at DESC, p.id DESC',
    };
    sql += ` ORDER BY ${sortMap[sort] || 'p.is_featured DESC, p.id ASC'}`;

    const maxRows = Math.min(Number(limit) || 100, 200);
    params.push(maxRows);
    sql += ` LIMIT $${params.length}`;

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/:slug', async (req, res, next) => {
  try {
    if (isMedusaCommerce()) {
      const product = await getMedusaProductByHandle(req.params.slug);
      if (!product) return res.status(404).json({ error: 'Ürün bulunamadı' });
      return res.json(product);
    }

    const { rows } = await query(`${SELECT_PRODUCT} WHERE p.slug = $1 LIMIT 1`, [
      req.params.slug,
    ]);
    if (!rows.length) return res.status(404).json({ error: 'Ürün bulunamadı' });
    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

export default router;
