import { Router } from 'express';
import { query } from '../db/index.js';

const router = Router();

// Tüm kategoriler (ürün sayısıyla birlikte)
router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT c.id, c.slug, c.name, c.description, c.image_url, c.sort_order,
              COUNT(p.id)::int AS product_count
         FROM categories c
         LEFT JOIN products p ON p.category_id = c.id
        GROUP BY c.id
        ORDER BY c.sort_order, c.name`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;
