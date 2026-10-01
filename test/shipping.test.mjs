// Kargo seçenekleri: normalize birim testi + canlı BFF sözleşme testleri.
// Canlı testler için BFF 127.0.0.1:3001 ve Medusa 127.0.0.1:9000 çalışıyor olmalı.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeShippingOption } from '../src/routes/shipping.js';

const BFF = 'http://127.0.0.1:3001';

test('normalize: bilinen kod teslim süresine çevrilir, geliştirme notu gizlenir', () => {
  const std = normalizeShippingOption({
    id: 'so_1', name: 'Standart Kargo', amount: 79.9,
    type: { code: 'izbutik-standard', description: 'Yerel geliştirme için manual teslimat' },
  });
  assert.deepEqual(std, { id: 'so_1', name: 'Standart Kargo', code: 'izbutik-standard', description: '2-4 iş günü', amount: 79.9 });
  const other = normalizeShippingOption({ id: 'so_2', name: 'X', amount: 10, type: { code: 'x', description: 'Yerel geliştirme' } });
  assert.equal(other.description, '');
  const calc = normalizeShippingOption({ id: 'so_3', name: 'Y', calculated_price: { calculated_amount: 149.9 } });
  assert.equal(calc.amount, 149.9);
});

test('GET /api/shipping-options: cart_id zorunlu', async () => {
  const res = await fetch(BFF + '/api/shipping-options');
  assert.equal(res.status, 400);
});

test('GET /api/shipping-options: sepet için ucuzdan pahalıya en az iki seçenek', async () => {
  const cart = await (await fetch(BFF + '/api/cart', { method: 'POST' })).json();
  const res = await fetch(`${BFF}/api/shipping-options?cart_id=${encodeURIComponent(cart.cart.id)}`);
  assert.equal(res.status, 200);
  const { shipping_options: opts } = await res.json();
  assert.ok(opts.length >= 2, 'Standart ve Hızlı Kargo dönmeli');
  for (let i = 1; i < opts.length; i++) assert.ok(opts[i - 1].amount <= opts[i].amount, 'fiyata göre sıralı olmalı');
  assert.ok(opts.every((o) => o.id && o.name && o.description), 'her seçenekte ad ve teslim süresi olmalı');
});

test('POST /api/orders: geçersiz kargo seçeneği 400 döner, sipariş oluşmaz', async () => {
  const cart = await (await fetch(BFF + '/api/cart', { method: 'POST' })).json();
  const res = await fetch(BFF + '/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cart_id: cart.cart.id,
      shipping_option_id: 'so_gecersiz',
      customer: { name: 'Test Kullanıcı', email: 'test@example.com' },
    }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /kargo/i);
});
