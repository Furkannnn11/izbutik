import { Router } from 'express';
import { isMedusaCommerce, medusaRequest } from '../lib/medusa.js';

const router = Router();

// Kargo seçeneklerinin müşteriye gösterilen teslim süresi. Medusa'daki
// shipping option type kodu ile eşleşir; bilinmeyen kodda tip açıklaması
// kullanılır (geliştirme notu içeren açıklamalar gösterilmez).
const ETA_BY_CODE = {
  'izbutik-standard': '2-4 iş günü',
  'izbutik-express': '1-2 iş günü',
};

export function normalizeShippingOption(option) {
  const code = option?.type?.code || null;
  const rawDesc = option?.type?.description || '';
  const description = ETA_BY_CODE[code] || (/geliştirme|development/i.test(rawDesc) ? '' : rawDesc);
  const amount = Number(option?.calculated_price?.calculated_amount ?? option?.amount ?? 0);
  return {
    id: option.id,
    name: option.name,
    code,
    description,
    amount: Number.isFinite(amount) ? amount : 0,
  };
}

// Bir sepet için seçilebilir kargo seçenekleri, ucuzdan pahalıya.
export async function listCartShippingOptions(cartId) {
  const data = await medusaRequest(
    `/store/shipping-options?cart_id=${encodeURIComponent(cartId)}`
  );
  return (data.shipping_options || [])
    .map(normalizeShippingOption)
    .sort((a, b) => a.amount - b.amount);
}

// GET /api/shipping-options?cart_id=...
router.get('/', async (req, res, next) => {
  const cartId = String(req.query.cart_id || '');
  if (!cartId) return res.status(400).json({ error: 'cart_id zorunludur.' });
  if (!isMedusaCommerce()) return res.json({ shipping_options: [] });
  try {
    res.json({ shipping_options: await listCartShippingOptions(cartId) });
  } catch (error) {
    next(error);
  }
});

export default router;
