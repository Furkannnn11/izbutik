// Ödeme formu doğrulaması: birim testleri (canlı servis gerekmez).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  TR_PROVINCES,
  canonicalProvince,
  normalizeTrMobile,
  validateCheckoutCustomer,
} from '../src/lib/checkout-validation.js';

const valid = {
  name: '  Ayşe   Yılmaz ',
  email: 'Ayse@Example.com',
  phone: '0532 123 45 67',
  address: 'Moda Mah. Bahariye Cad.\nNo: 12 D: 3',
  province: 'İstanbul',
  district: 'Kadıköy',
  postal_code: '34710',
};

test('geçerli müşteri bilgisi normalize edilir', () => {
  const r = validateCheckoutCustomer(valid);
  assert.equal(r.ok, true);
  assert.deepEqual(r.customer, {
    name: 'Ayşe Yılmaz',
    email: 'ayse@example.com',
    phone: '+905321234567',
    address: 'Moda Mah. Bahariye Cad. No: 12 D: 3',
    province: 'İstanbul',
    district: 'Kadıköy',
    postal_code: '34710',
  });
});

test('posta kodu isteğe bağlı; yazılırsa 5 hane olmalı', () => {
  const empty = validateCheckoutCustomer({ ...valid, postal_code: '' });
  assert.equal(empty.ok, true);
  assert.equal(empty.customer.postal_code, undefined);
  assert.deepEqual(Object.keys(validateCheckoutCustomer({ ...valid, postal_code: '3471' }).errors), ['postal_code']);
});

test('cep telefonu biçimleri', () => {
  for (const v of ['05321234567', '5321234567', '+90 532 123 45 67', '0090 532 123 4567', '90-532-123-45-67']) {
    assert.equal(normalizeTrMobile(v), '+905321234567', v);
  }
  for (const v of ['', undefined, '0212 123 45 67', '053212345', '05321234567890', 'abc']) {
    assert.equal(normalizeTrMobile(v), null, String(v));
  }
});

test('il: Türkçe büyük/küçük harf ve şapka farkı yok sayılır', () => {
  assert.equal(TR_PROVINCES.length, 81);
  for (const p of TR_PROVINCES) assert.equal(canonicalProvince(p), p, p);
  assert.equal(canonicalProvince('ISTANBUL'), 'İstanbul');
  assert.equal(canonicalProvince('Istanbul'), 'İstanbul');
  assert.equal(canonicalProvince('IĞDIR'), 'Iğdır');
  assert.equal(canonicalProvince('hakkari'), 'Hakkâri');
  assert.equal(canonicalProvince('Atlantis'), null);
});

test('eksik ya da hatalı her alan ayrı hata mesajı alır', () => {
  const r = validateCheckoutCustomer({ name: 'Ayşe', email: 'x', phone: '123', address: 'kısa', province: '', district: '', postal_code: '34' });
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['address', 'district', 'email', 'name', 'phone', 'postal_code', 'province']);
  assert.equal(validateCheckoutCustomer(undefined).ok, false);
  assert.equal(validateCheckoutCustomer({ ...valid, district: '<script>' }).ok, false);
});

test('istemcideki il listesi sunucudakiyle aynı', () => {
  const src = fs.readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
  const m = src.match(/const TR_PROVINCES = (\[[\s\S]*?\]);/);
  assert.ok(m, 'app.js içinde TR_PROVINCES bulunmalı');
  assert.deepEqual(Function(`return ${m[1]}`)(), [...TR_PROVINCES]);
});
