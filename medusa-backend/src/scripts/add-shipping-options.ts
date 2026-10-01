import type { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  ModuleRegistrationName,
  Modules,
} from "@medusajs/framework/utils"
import { createShippingOptionsWorkflow } from "@medusajs/medusa/core-flows"

const BASE_OPTION_NAME = "Standart Kargo"
const EXPRESS_OPTION_NAME = "Hızlı Kargo"
// Varsayılan fiyat; Medusa Admin -> Ayarlar -> Konumlar & Kargo'dan değiştirilebilir.
const EXPRESS_PRICE_TRY = 149.9

/**
 * Ödeme sayfasındaki kargo seçimi için "Hızlı Kargo" seçeneğini ekler.
 * Tekrar çalıştırılabilir: seçenek varsa hiçbir şey yapmaz. Servis bölgesi ve
 * kargo profili mevcut "Standart Kargo" seçeneğinden alınır.
 *   npx medusa exec ./src/scripts/add-shipping-options.ts
 */
export default async function addShippingOptions({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const fulfillmentModule: any = container.resolve(
    ModuleRegistrationName.FULFILLMENT
  )
  const regionModule: any = container.resolve(Modules.REGION)

  const [existing] = await fulfillmentModule.listShippingOptions(
    { name: EXPRESS_OPTION_NAME },
    { take: 1 }
  )
  if (existing) {
    logger.info(`[kargo] "${EXPRESS_OPTION_NAME}" zaten var: ${existing.id}`)
    return
  }

  const [base] = await fulfillmentModule.listShippingOptions(
    { name: BASE_OPTION_NAME },
    { take: 1 }
  )
  if (!base) {
    throw new Error(`[kargo] "${BASE_OPTION_NAME}" bulunamadı; önce seed çalıştırın.`)
  }
  const [region] = await regionModule.listRegions({ name: "Türkiye" }, { take: 1 })
  if (!region) throw new Error("[kargo] Türkiye bölgesi bulunamadı.")

  const { result } = await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: EXPRESS_OPTION_NAME,
        price_type: "flat",
        provider_id: base.provider_id,
        service_zone_id: base.service_zone_id,
        shipping_profile_id: base.shipping_profile_id,
        type: {
          label: EXPRESS_OPTION_NAME,
          description: "1-2 iş günü",
          code: "izbutik-express",
        },
        prices: [
          { currency_code: "try", amount: EXPRESS_PRICE_TRY },
          { region_id: region.id, amount: EXPRESS_PRICE_TRY },
        ],
        rules: [
          { attribute: "enabled_in_store", value: "true", operator: "eq" },
          { attribute: "is_return", value: "false", operator: "eq" },
        ],
      },
    ],
  })
  logger.info(`[kargo] "${EXPRESS_OPTION_NAME}" oluşturuldu: ${result[0].id}`)
}
