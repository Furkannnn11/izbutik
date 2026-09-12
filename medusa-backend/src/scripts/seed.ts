import type { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  ModuleRegistrationName,
  Modules,
} from "@medusajs/framework/utils"
import {
  createApiKeysWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createStockLocationsWorkflow,
  createStoresWorkflow,
  createTaxRegionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows"

const STORE_NAME = "İzbutik"
const SALES_CHANNEL_NAME = "İzbutik Web Mağazası"
const REGION_NAME = "Türkiye"
const STOCK_LOCATION_NAME = "İzbutik Ana Depo"
const FULFILLMENT_SET_NAME = "İzbutik Türkiye Teslimat"
const SHIPPING_OPTION_NAME = "Standart Kargo"
const API_KEY_TITLE = "İzbutik Storefront"

/**
 * İzbutik Medusa temel commerce seed'i.
 *
 * Tekrar çalıştırılabilir: isim/type üzerinden mevcut kayıtları bulur ve yalnız
 * eksikleri oluşturur. Kaynak `izbutik_db` ile bağlantı kurmaz; yalnızca izole
 * Medusa `DATABASE_URL` hedefinde çalışır.
 */
export default async function seedIzbutik({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const fulfillmentModule: any = container.resolve(
    ModuleRegistrationName.FULFILLMENT
  )
  const salesChannelModule: any = container.resolve(Modules.SALES_CHANNEL)
  const apiKeyModule: any = container.resolve(Modules.API_KEY)
  const storeModule: any = container.resolve(Modules.STORE)
  const regionModule: any = container.resolve(Modules.REGION)
  const stockLocationModule: any = container.resolve(Modules.STOCK_LOCATION)
  const taxModule: any = container.resolve(Modules.TAX)

  logger.info("[seed-izbutik] Temel mağaza verisi hazırlanıyor...")

  let [salesChannel] = await salesChannelModule.listSalesChannels(
    { name: SALES_CHANNEL_NAME },
    { take: 1 }
  )
  if (!salesChannel) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: {
        salesChannelsData: [
          {
            name: SALES_CHANNEL_NAME,
            description: "İzbutik web storefront satış kanalı",
          },
        ],
      },
    })
    salesChannel = result[0]
    logger.info(`[seed-izbutik] Satış kanalı oluşturuldu: ${salesChannel.id}`)
  }

  let [publishableApiKey] = await apiKeyModule.listApiKeys(
    { title: API_KEY_TITLE, type: "publishable" },
    { take: 1 }
  )
  if (!publishableApiKey) {
    const { result } = await createApiKeysWorkflow(container).run({
      input: {
        api_keys: [
          {
            title: API_KEY_TITLE,
            type: "publishable",
            created_by: "",
          },
        ],
      },
    })
    publishableApiKey = result[0]
    await linkSalesChannelsToApiKeyWorkflow(container).run({
      input: {
        id: publishableApiKey.id,
        add: [salesChannel.id],
      },
    })
    logger.info(
      `[seed-izbutik] Store API anahtarı oluşturuldu ve satış kanalına bağlandı: ${publishableApiKey.token}`
    )
  }

  let [store] = await storeModule.listStores(
    { name: STORE_NAME },
    { take: 1 }
  )
  if (!store) {
    const { result } = await createStoresWorkflow(container).run({
      input: {
        stores: [
          {
            name: STORE_NAME,
            supported_currencies: [
              {
                currency_code: "try",
                is_default: true,
              },
            ],
            default_sales_channel_id: salesChannel.id,
          },
        ],
      },
    })
    store = result[0]
    logger.info(`[seed-izbutik] Mağaza oluşturuldu: ${store.id}`)
  }

  let [region] = await regionModule.listRegions(
    { name: REGION_NAME },
    { take: 1 }
  )
  if (!region) {
    const { result } = await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: REGION_NAME,
            currency_code: "try",
            countries: ["tr"],
            payment_providers: ["pp_system_default"],
          },
        ],
      },
    })
    region = result[0]
    logger.info(`[seed-izbutik] Türkiye/TRY bölgesi oluşturuldu: ${region.id}`)
  }

  const [taxRegion] = await taxModule.listTaxRegions(
    { country_code: "tr" },
    { take: 1 }
  )
  if (!taxRegion) {
    await createTaxRegionsWorkflow(container).run({
      input: [
        {
          country_code: "tr",
          provider_id: "tp_system",
        },
      ],
    })
    logger.info("[seed-izbutik] Türkiye vergi bölgesi oluşturuldu.")
  }

  let [stockLocation] = await stockLocationModule.listStockLocations(
    { name: STOCK_LOCATION_NAME },
    { take: 1 }
  )
  if (!stockLocation) {
    const { result } = await createStockLocationsWorkflow(container).run({
      input: {
        locations: [
          {
            name: STOCK_LOCATION_NAME,
            address: {
              city: "İstanbul",
              country_code: "TR",
              address_1: "Yerel geliştirme deposu",
            },
          },
        ],
      },
    })
    stockLocation = result[0]
    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: {
        id: stockLocation.id,
        add: [salesChannel.id],
      },
    })
    logger.info(
      `[seed-izbutik] Stok konumu oluşturuldu ve satış kanalına bağlandı: ${stockLocation.id}`
    )
  }

  let [shippingOption] = await fulfillmentModule.listShippingOptions(
    { name: SHIPPING_OPTION_NAME },
    { take: 1 }
  )
  if (!shippingOption) {
    let [fulfillmentSet] = await fulfillmentModule.listFulfillmentSets(
      { name: FULFILLMENT_SET_NAME },
      { take: 1, relations: ["service_zones"] }
    )

    if (!fulfillmentSet) {
      await link.create({
        [Modules.STOCK_LOCATION]: {
          stock_location_id: stockLocation.id,
        },
        [Modules.FULFILLMENT]: {
          fulfillment_provider_id: "manual_manual",
        },
      })

      fulfillmentSet = await fulfillmentModule.createFulfillmentSets({
        name: FULFILLMENT_SET_NAME,
        type: "shipping",
        service_zones: [
          {
            name: "Türkiye",
            geo_zones: [
              {
                country_code: "tr",
                type: "country",
              },
            ],
          },
        ],
      })

      await link.create({
        [Modules.STOCK_LOCATION]: {
          stock_location_id: stockLocation.id,
        },
        [Modules.FULFILLMENT]: {
          fulfillment_set_id: fulfillmentSet.id,
        },
      })
    }

    const { data: shippingProfiles } = await query.graph({
      entity: "shipping_profile",
      fields: ["id"],
    })
    const shippingProfile = shippingProfiles[0]
    if (!shippingProfile) {
      throw new Error(
        "[seed-izbutik] Shipping profile bulunamadı; Medusa migration'ını kontrol et."
      )
    }

    const serviceZone = fulfillmentSet.service_zones?.[0]
    if (!serviceZone) {
      throw new Error(
        "[seed-izbutik] Türkiye fulfillment service zone oluşturulamadı."
      )
    }

    const { result } = await createShippingOptionsWorkflow(container).run({
      input: [
        {
          name: SHIPPING_OPTION_NAME,
          price_type: "flat",
          provider_id: "manual_manual",
          service_zone_id: serviceZone.id,
          shipping_profile_id: shippingProfile.id,
          type: {
            label: "Standart Kargo",
            description: "Yerel geliştirme için manual teslimat",
            code: "izbutik-standard",
          },
          prices: [
            {
              currency_code: "try",
              amount: 79.9,
            },
            {
              region_id: region.id,
              amount: 79.9,
            },
          ],
          rules: [
            {
              attribute: "enabled_in_store",
              value: "true",
              operator: "eq",
            },
            {
              attribute: "is_return",
              value: "false",
              operator: "eq",
            },
          ],
        },
      ],
    })
    shippingOption = result[0]
    logger.info(
      `[seed-izbutik] Manual kargo seçeneği oluşturuldu: ${shippingOption.id}`
    )
  }

  logger.info("[seed-izbutik] Temel seed tamamlandı.")
  logger.info(
    `[seed-izbutik] Publishable API key: ${publishableApiKey.token}`
  )
  logger.info(`[seed-izbutik] Region ID: ${region.id}`)
}
