import { Router } from 'express';
import { query } from '../db/index.js';
import { isMedusaCommerce, listMedusaCategories } from '../lib/medusa.js';

const router = Router();

// Tüm kategoriler (ürün sayısıyla birlikte)
router.get('/', async (_req, res, next) => {
  try {
    if (isMedusaCommerce()) {
      return res.json(await listMedusaCategories());
    }

    const { rows } = await query(
      `SELECT c.id, c.slug, c.name, c.description, c.image_url, c.sort_order,
              COUNT(p.id)::int AS product_count
         FROM categories c
         LEFT JOIN products p ON p.category_id = c.id
        GROUP BY c.id
        ORDER BY c.sort_order, c.name`
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

export default router;
