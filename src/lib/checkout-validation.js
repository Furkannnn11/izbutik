// Ödeme formu müşteri bilgisi doğrulaması (sunucu tarafı).
// İstemci (public/js/app.js) aynı kuralları uygular; sunucu yine de her isteği
// kendisi doğrular, çünkü istemci kontrolü atlanabilir.
//
// Medusa adres eşlemesi (Türkiye): city = ilçe, province = il.

// 81 il, Türk alfabesi sırasıyla. public/js/app.js içindeki liste ile aynı
// olmalı (test/checkout_validation.test.mjs bunu denetler).
export const TR_PROVINCES = Object.freeze([
  'Adana', 'Adıyaman', 'Afyonkarahisar', 'Ağrı', 'Aksaray', 'Amasya', 'Ankara', 'Antalya',
  'Ardahan', 'Artvin', 'Aydın', 'Balıkesir', 'Bartın', 'Batman', 'Bayburt', 'Bilecik',
  'Bingöl', 'Bitlis', 'Bolu', 'Burdur', 'Bursa', 'Çanakkale', 'Çankırı', 'Çorum',
  'Denizli', 'Diyarbakır', 'Düzce', 'Edirne', 'Elazığ', 'Erzincan', 'Erzurum', 'Eskişehir',
  'Gaziantep', 'Giresun', 'Gümüşhane', 'Hakkâri', 'Hatay', 'Iğdır', 'Isparta', 'İstanbul',
  'İzmir', 'Kahramanmaraş', 'Karabük', 'Karaman', 'Kars', 'Kastamonu', 'Kayseri', 'Kırıkkale',
  'Kırklareli', 'Kırşehir', 'Kilis', 'Kocaeli', 'Konya', 'Kütahya', 'Malatya', 'Manisa',
  'Mardin', 'Mersin', 'Muğla', 'Muş', 'Nevşehir', 'Niğde', 'Ordu', 'Osmaniye',
  'Rize', 'Sakarya', 'Samsun', 'Siirt', 'Sinop', 'Sivas', 'Şanlıurfa', 'Şırnak',
  'Tekirdağ', 'Tokat', 'Trabzon', 'Tunceli', 'Uşak', 'Van', 'Yalova', 'Yozgat', 'Zonguldak',
]);

// Türkçe büyük/küçük harf farkını ve şapkalı harfleri yok sayan anahtar:
// "ISTANBUL", "Istanbul", "istanbul" ve "İstanbul" aynı ile eşlenir.
const ASCII_FOLD = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
function foldKey(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]/g, (ch) => ASCII_FOLD[ch]);
}
const PROVINCE_BY_KEY = new Map(TR_PROVINCES.map((name) => [foldKey(name), name]));

export function canonicalProvince(value) {
  return PROVINCE_BY_KEY.get(foldKey(value)) || null;
}

// Cep telefonu: 05XX XXX XX XX, 5XX..., +90 5XX..., 0090 5XX... kabul edilir;
// sonuç E.164 biçiminde döner (+905XXXXXXXXX). Geçersizse null.
export function normalizeTrMobile(value) {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 14 && digits.startsWith('0090')) digits = digits.slice(4);
  else if (digits.length === 12 && digits.startsWith('90')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^5\d{9}$/.test(digits) ? `+90${digits}` : null;
}

const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

export const CHECKOUT_MESSAGES = Object.freeze({
  name: 'Adını ve soyadını yaz.',
  email: 'Geçerli bir e-posta adresi yaz.',
  phone: 'Cep telefonunu 05XX XXX XX XX biçiminde yaz.',
  address: 'Mahalle, cadde/sokak, bina ve daire numarasıyla açık adresini yaz.',
  province: 'İlini seç.',
  district: 'İlçeni yaz.',
  postal_code: 'Posta kodu 5 haneli olmalı.',
});

// Döner: { ok: true, customer } ya da { ok: false, errors: { alan: mesaj } }.
export function validateCheckoutCustomer(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const errors = {};

  const name = oneLine(raw.name);
  if (name.length > 100 || name.split(' ').filter(Boolean).length < 2) errors.name = CHECKOUT_MESSAGES.name;

  const email = oneLine(raw.email).toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = CHECKOUT_MESSAGES.email;

  const phone = normalizeTrMobile(raw.phone);
  if (!phone) errors.phone = CHECKOUT_MESSAGES.phone;

  const address = oneLine(raw.address);
  if (address.length < 10 || address.length > 300) errors.address = CHECKOUT_MESSAGES.address;

  const province = canonicalProvince(raw.province);
  if (!province) errors.province = CHECKOUT_MESSAGES.province;

  const district = oneLine(raw.district);
  if (!/^\p{L}[\p{L} .'-]{1,49}$/u.test(district)) errors.district = CHECKOUT_MESSAGES.district;

  const postal = oneLine(raw.postal_code);
  if (postal && !/^\d{5}$/.test(postal)) errors.postal_code = CHECKOUT_MESSAGES.postal_code;

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    customer: { name, email, phone, address, province, district, postal_code: postal || undefined },
  };
}
