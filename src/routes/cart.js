import { Router } from 'express';
import { getStoreContext, medusaRequest } from '../lib/medusa.js';

const router = Router();

// Yeni Medusa sepeti oluştur.
router.post('/', async (_req, res, next) => {
  try {
    const { regionId } = await getStoreContext();
    const data = await medusaRequest('/store/carts', {
      method: 'POST',
      body: { region_id: regionId },
    });
    res.status(201).json(data);
  } catch (error) {
    next(error);
  }
});

// Mevcut sepeti getir.
router.get('/:id', async (req, res, next) => {
  try {
    const data = await medusaRequest(`/store/carts/${encodeURIComponent(req.params.id)}`);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Sepete varyant ekle.
router.post('/:id/items', async (req, res, next) => {
  const { variant_id, quantity = 1 } = req.body || {};
  if (!variant_id) return res.status(400).json({ error: 'variant_id zorunludur.' });

  try {
    const data = await medusaRequest(
      `/store/carts/${encodeURIComponent(req.params.id)}/line-items`,
      {
        method: 'POST',
        body: {
          variant_id,
          quantity: Math.max(1, Number(quantity) || 1),
        },
      }
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Sepet satırı miktarını güncelle.
router.post('/:id/items/:lineId', async (req, res, next) => {
  const quantity = Number(req.body?.quantity);
  if (!Number.isFinite(quantity) || quantity < 1) {
    return res.status(400).json({ error: 'quantity en az 1 olmalıdır.' });
  }

  try {
    const data = await medusaRequest(
      `/store/carts/${encodeURIComponent(req.params.id)}/line-items/${encodeURIComponent(req.params.lineId)}`,
      { method: 'POST', body: { quantity } }
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Sepet satırını sil.
router.delete('/:id/items/:lineId', async (req, res, next) => {
  try {
    const data = await medusaRequest(
      `/store/carts/${encodeURIComponent(req.params.id)}/line-items/${encodeURIComponent(req.params.lineId)}`,
      { method: 'DELETE' }
    );
    res.json({ cart: data.parent });
  } catch (error) {
    next(error);
  }
});

export default router;
