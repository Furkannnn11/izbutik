#!/usr/bin/env bash
# İzbutik - PostgreSQL başlatma scripti (sandbox / lokal geliştirme için)
# Sunucu çalışmıyorsa başlatır, kullanıcı ve veritabanını hazırlar.
set -euo pipefail

PGBIN="${PGBIN:-/usr/bin}"
PGDATA="${PGDATA:-/var/lib/pgsql/data}"
DB_USER="${DB_USER:-izbutik}"
DB_PASS="${DB_PASS:-izbutik123}"
DB_NAME="${DB_NAME:-izbutik_db}"
SOCK_DIR="/var/run/postgresql"

echo "==> PostgreSQL durumu kontrol ediliyor..."

# Zaten ayakta mı?
if PGPASSWORD="$DB_PASS" psql -h 127.0.0.1 -p 5432 -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
  echo "==> PostgreSQL zaten çalışıyor ve erişilebilir."
  exit 0
fi

# Data dizini yoksa initdb
if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "==> initdb çalıştırılıyor..."
  sudo mkdir -p "$PGDATA"
  sudo chown -R postgres:postgres "$(dirname "$PGDATA")"
  sudo -u postgres "$PGBIN/initdb" -D "$PGDATA" >/dev/null
fi

# Socket dizini
sudo mkdir -p "$SOCK_DIR"
sudo chown postgres:postgres "$SOCK_DIR"

echo "==> PostgreSQL başlatılıyor (arka plan)..."
sudo -u postgres "$PGBIN/postgres" -D "$PGDATA" \
  -c listen_addresses='127.0.0.1' -c port=5432 \
  -c unix_socket_directories="$SOCK_DIR" \
  > /tmp/izbutik-pg.log 2>&1 &

# Hazır olana kadar bekle
for i in $(seq 1 30); do
  if sudo -u postgres psql -h "$SOCK_DIR" -c "SELECT 1;" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "==> Kullanıcı ve veritabanı hazırlanıyor..."
sudo -u postgres psql -h "$SOCK_DIR" -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 \
  || sudo -u postgres psql -h "$SOCK_DIR" -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
sudo -u postgres psql -h "$SOCK_DIR" -c "ALTER USER $DB_USER CREATEDB;" >/dev/null
sudo -u postgres psql -h "$SOCK_DIR" -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 \
  || sudo -u postgres createdb -h "$SOCK_DIR" -O "$DB_USER" "$DB_NAME"

echo "==> PostgreSQL hazır: postgres://$DB_USER@127.0.0.1:5432/$DB_NAME"
