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
  const { variant_id } = req.body || {};
  if (!variant_id) return res.status(400).json({ error: 'variant_id zorunludur.' });

  // Sayısal quantity doğrulaması. Alan yoksa varsayılan 1'dir; verildiyse
  // pozitif tam sayıya çözülebilmeli. Metin/negatif/NaN/kesirli değerler
  // sessizce 1'e zorlanmaz, açık 400 ile reddedilir (güvenli sözleşme).
  const quantity = normalizeQuantity(req.body?.quantity, { defaultTo: 1 });
  if (quantity === null) {
    return res.status(400).json({ error: 'quantity pozitif bir tam sayı olmalıdır.' });
  }

  try {
    const data = await medusaRequest(
      `/store/carts/${encodeURIComponent(req.params.id)}/line-items`,
      {
        method: 'POST',
        body: { variant_id, quantity },
      }
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// Sepet satırı miktarını güncelle.
router.post('/:id/items/:lineId', async (req, res, next) => {
  const quantity = normalizeQuantity(req.body?.quantity);
  if (quantity === null) {
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
  const cartId = req.params.id;
  try {
    const data = await medusaRequest(
      `/store/carts/${encodeURIComponent(cartId)}/line-items/${encodeURIComponent(req.params.lineId)}`,
      { method: 'DELETE' }
    );

    // Medusa'nın mutlu yolu güncel sepeti `parent` içinde döndürür. Bazı
    // sürüm/yanıt yollarında gövde yalnız { id, object:'line-item', deleted:true }
    // olur ve `parent` bulunmaz. O durumda { cart: undefined } döndürmek
    // frontend'de syncCart(undefined) tetikler; bunun yerine güncel sepeti
    // GET ile tazeleyip her zaman kullanılabilir bir cart zarfı garanti et.
    let cart = data && typeof data.parent === 'object' && data.parent ? data.parent : null;
    if (!cart) {
      try {
        const fresh = await medusaRequest(`/store/carts/${encodeURIComponent(cartId)}`);
        cart = fresh?.cart || null;
      } catch {
        // GET de başarısızsa (ör. sepet artık yok) en azından tutarlı bir
        // şekil ver: silmenin gerçekleştiğini ve cart id'sini taşıyan minimal
        // zarf. Frontend bunu geçerli nesne olarak işleyebilir.
        cart = null;
      }
    }
    res.json({ cart: cart || { id: cartId, items: [] } });
  } catch (error) {
    next(error);
  }
});

// Quantity doğrulama yardımcısı. `defaultTo` verilirse alan yoksa/boşsa o
// değeri döndürür (add rotası: 1). Aksi halde alan zorunludur. Değer numerik
// veya numerik-benzeri string ("2") olabilir; pozitif tam sayıya çözülemezse
// (negatif, sıfır, kesirli, NaN, metin) null döner ve çağıran 400 verir.
function normalizeQuantity(raw, { defaultTo = null } = {}) {
  if (raw === undefined || raw === null || raw === '') {
    return defaultTo;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export default router;
