-- İzbutik veritabanı şeması
-- Temiz kurulum için tabloları sıfırla
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS product_sizes CASCADE;
DROP TABLE IF EXISTS product_images CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS categories CASCADE;

-- Kategoriler
CREATE TABLE categories (
  id          SERIAL PRIMARY KEY,
  slug        VARCHAR(80) UNIQUE NOT NULL,
  name        VARCHAR(120) NOT NULL,
  description TEXT,
  image_url   TEXT,
  sort_order  INT DEFAULT 0
);

-- Ürünler
CREATE TABLE products (
  id          SERIAL PRIMARY KEY,
  category_id INT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  slug        VARCHAR(140) UNIQUE NOT NULL,
  name        VARCHAR(160) NOT NULL,
  description TEXT,
  price       NUMERIC(10,2) NOT NULL,
  old_price   NUMERIC(10,2),
  stock       INT DEFAULT 0,
  rating      NUMERIC(2,1) DEFAULT 5.0,
  is_new      BOOLEAN DEFAULT false,
  is_featured BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Ürün görselleri (hover animasyonu için birden fazla görsel)
CREATE TABLE product_images (
  id         SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  sort_order INT DEFAULT 0
);

-- Beden seçenekleri
CREATE TABLE product_sizes (
  id         SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size       VARCHAR(10) NOT NULL
);

-- Siparişler
CREATE TABLE orders (
  id            SERIAL PRIMARY KEY,
  customer_name VARCHAR(160) NOT NULL,
  email         VARCHAR(160) NOT NULL,
  phone         VARCHAR(40),
  address       TEXT,
  total         NUMERIC(10,2) NOT NULL DEFAULT 0,
  status        VARCHAR(40) NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Sipariş kalemleri
CREATE TABLE order_items (
  id         SERIAL PRIMARY KEY,
  order_id   INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id) ON DELETE SET NULL,
  name       VARCHAR(160) NOT NULL,
  size       VARCHAR(10),
  quantity   INT NOT NULL DEFAULT 1,
  price      NUMERIC(10,2) NOT NULL
);

-- İndeksler
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_featured ON products(is_featured);
CREATE INDEX idx_product_images_product ON product_images(product_id);
CREATE INDEX idx_order_items_order ON order_items(order_id);
