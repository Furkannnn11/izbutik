import { loadEnv, defineConfig, Modules } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

/**
 * Medusa v2 (2.21.0) — yerel geliştirme yapılandırması (Adım 6).
 *
 * Kurallar:
 *  - DATABASE_URL YALNIZCA izole `izbutik_medusa` veritabanına işaret eder;
 *    mevcut `izbutik_db` bu backend tarafından ASLA kullanılmaz.
 *  - Tüm sunucu bind'leri loopback (127.0.0.1) üzerindedir. Medusa v2, HTTP host/port'u
 *    `medusa-config` içinden değil, `HOST`/`PORT` env değişkenlerinden okur (CLI
 *    `default: process.env.HOST`). Bu yüzden bind, `.env` içindeki HOST=127.0.0.1 ile sağlanır.
 *  - CORS origin'leri env üzerinden gelir (STORE_CORS/ADMIN_CORS/AUTH_CORS);
 *    mevcut storefront origin'i http://127.0.0.1:3001 Store/Auth CORS'a dahildir.
 *  - Secret'lar env üzerinden gelir; gerçek değerler kaynağa yazılmaz.
 *  - REDIS_URL verilmişse Redis tabanlı event bus / cache / workflow engine
 *    kullanılır; verilmemişse Medusa'nın yerleşik in-memory sağlayıcıları
 *    (yerel geliştirme için) devreye girer.
 */

const REDIS_URL = process.env.REDIS_URL

// Redis yoksa yerel geliştirme için in-memory sağlayıcılara düş.
const redisBackedModules = REDIS_URL
  ? [
      {
        resolve: "@medusajs/medusa/event-bus-redis",
        key: Modules.EVENT_BUS,
        options: { redisUrl: REDIS_URL },
      },
      {
        resolve: "@medusajs/medusa/cache-redis",
        key: Modules.CACHE,
        options: { redisUrl: REDIS_URL },
      },
      {
        resolve: "@medusajs/medusa/workflow-engine-redis",
        key: Modules.WORKFLOW_ENGINE,
        options: { redis: { url: REDIS_URL } },
      },
    ]
  : [
      {
        resolve: "@medusajs/medusa/event-bus-local",
        key: Modules.EVENT_BUS,
      },
      {
        resolve: "@medusajs/medusa/cache-inmemory",
        key: Modules.CACHE,
      },
      {
        resolve: "@medusajs/medusa/workflow-engine-inmemory",
        key: Modules.WORKFLOW_ENGINE,
      },
    ]

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    // Yerel geliştirmede tek sunucu; ayrı worker gerekmez.
    workerMode:
      (process.env.MEDUSA_WORKER_MODE as "shared" | "worker" | "server") ||
      "shared",
    http: {
      // Bind loopback üzerinde; HOST/PORT env ile kontrol edilir (bkz. .env.example).
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
  },
  admin: {
    // Admin panelini loopback üzerinde sun.
    backendUrl: process.env.MEDUSA_BACKEND_URL || "http://127.0.0.1:9000",
    disable: process.env.MEDUSA_DISABLE_ADMIN === "true",
  },
  modules: [
    ...redisBackedModules,
    // Auth modülü + emailpass sağlayıcısı AÇIKÇA kayıtlı.
    // Medusa v2 framework varsayılanı emailpass'i zaten aktif eder; burada
    // configde açıkça bildirerek admin/store email+password girişini kaynak
    // düzeyinde garanti altına alıyoruz (yerel email/password auth provider).
    {
      resolve: "@medusajs/medusa/auth",
      key: Modules.AUTH,
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/auth-emailpass",
            id: "emailpass",
            options: {},
          },
        ],
      },
    },
  ],
})
