const MEDUSA_BACKEND_URL = (
  process.env.MEDUSA_BACKEND_URL || 'http://127.0.0.1:9000'
).replace(/\/$/, '');

export const isMedusaCommerce = () =>
  (process.env.COMMERCE_BACKEND || 'medusa').toLowerCase() === 'medusa';

export class MedusaRequestError extends Error {
  constructor(message, status = 502, details = null) {
    super(message);
    this.name = 'MedusaRequestError';
    this.status = status;
    this.details = details;
  }
}

function publishableKey() {
  const key = process.env.MEDUSA_PUBLISHABLE_KEY;
  if (!key) {
    throw new MedusaRequestError(
      'MEDUSA_PUBLISHABLE_KEY tanımlı değil. medusa-backend içinde npm run seed çalıştırıp oluşan publishable key değerini storefront ortamına ekleyin.',
      503
    );
  }
  return key;
}

export async function medusaRequest(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${MEDUSA_BACKEND_URL}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-publishable-api-key': publishableKey(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }

  if (!response.ok) {
    throw new MedusaRequestError(
      data?.message || data?.error || `Medusa isteği başarısız: ${path}`,
      response.status,
      data
    );
  }

  return data;
}

let storeContextPromise;
export function getStoreContext() {
  if (!storeContextPromise) {
    storeContextPromise = medusaRequest('/store/regions?limit=10').then((data) => {
      const region = (data.regions || []).find((item) => item.currency_code === 'try') || data.regions?.[0];
      if (!region) {
        throw new MedusaRequestError('Medusa Store API için bölge bulunamadı.', 503);
      }
      return { regionId: region.id, currencyCode: region.currency_code };
    });
  }
  return storeContextPromise;
}

export function mapMedusaProduct(product) {
  const metadata = product.metadata || {};
  const category = product.categories?.[0] || null;
  const variants = (product.variants || []).map((variant) => ({
    id: variant.id,
    title: variant.title,
    size:
      variant.metadata?.izbutik_size ||
      variant.options?.find((option) => option.option?.title === 'Beden')?.value ||
      variant.title ||
      'STD',
    sku: variant.sku,
    price: Number(variant.calculated_price?.calculated_amount || 0),
    inventory_quantity: Number(variant.inventory_quantity || 0),
  }));
  const firstVariant = variants[0];

  return {
    id: Number(metadata.izbutik_id) || product.id,
    medusa_id: product.id,
    slug: product.handle,
    name: product.title,
    description: product.description || '',
    price: firstVariant?.price || 0,
    old_price: metadata.old_price == null ? null : Number(metadata.old_price),
    stock: Number(metadata.source_stock ?? firstVariant?.inventory_quantity ?? 0),
    rating: Number(metadata.rating ?? 5),
    is_new: Boolean(metadata.is_new),
    is_featured: Boolean(metadata.is_featured),
    created_at: product.created_at,
    category_slug: category?.handle || '',
    category_name: category?.name || '',
    images: (product.images || []).map((image) => image.url),
    sizes: variants.map((variant) => variant.size),
    variants,
  };
}

export async function listMedusaProducts({ limit = 100 } = {}) {
  const { regionId } = await getStoreContext();
  const params = new URLSearchParams({
    limit: String(Math.min(Number(limit) || 100, 200)),
    region_id: regionId,
    fields:
      '+metadata,+images.*,+categories.*,+variants.*,+variants.calculated_price,+variants.inventory_quantity',
  });
  const data = await medusaRequest(`/store/products?${params}`);
  return (data.products || []).map(mapMedusaProduct);
}

export async function getMedusaProductByHandle(handle) {
  const { regionId } = await getStoreContext();
  const params = new URLSearchParams({
    handle,
    limit: '1',
    region_id: regionId,
    fields:
      '+metadata,+images.*,+categories.*,+variants.*,+variants.calculated_price,+variants.inventory_quantity',
  });
  const data = await medusaRequest(`/store/products?${params}`);
  return data.products?.[0] ? mapMedusaProduct(data.products[0]) : null;
}

export async function listMedusaCategories() {
  const [categoryData, products] = await Promise.all([
    medusaRequest('/store/product-categories?limit=100&fields=%2Bmetadata'),
    listMedusaProducts({ limit: 200 }),
  ]);
  const counts = new Map();
  for (const product of products) {
    counts.set(product.category_slug, (counts.get(product.category_slug) || 0) + 1);
  }

  return (categoryData.product_categories || [])
    .map((category) => ({
      id: Number(category.metadata?.izbutik_id) || category.id,
      medusa_id: category.id,
      slug: category.handle,
      name: category.name,
      description: category.description || '',
      image_url: category.metadata?.source_image_url || '',
      sort_order: Number(category.rank || 0),
      product_count: counts.get(category.handle) || 0,
    }))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'tr'));
}
