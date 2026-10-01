import Foundation

// MARK: - JSON gövde değeri (mutation payload'ları için)

/// Tip-güvenli JSON değeri. `Decimal` (fiyat) JSON **sayı** olarak, kayan-nokta
/// hatası olmadan serialize edilir (`NSDecimalNumber` → `JSONSerialization`
/// sayıyı korur). String'e düşürülmez.
public indirect enum JSONValue: Equatable {
    case string(String)
    case int(Int)
    case decimal(Decimal)
    case bool(Bool)
    case null
    case array([JSONValue])
    case object([String: JSONValue])

    /// `JSONSerialization` için Foundation nesnesi.
    public var foundationObject: Any {
        switch self {
        case .string(let s): return s
        case .int(let i): return i
        case .decimal(let d): return d as NSDecimalNumber   // sayı olarak korunur
        case .bool(let b): return b
        case .null: return NSNull()
        case .array(let a): return a.map { $0.foundationObject }
        case .object(let o): return o.mapValues { $0.foundationObject }
        }
    }
}


// Kaynak: IZBUTIK_ADMIN_API_CONTRACT.md §2–§7 (canlı GET probe'larından türetildi).

// MARK: - Kimlik

public struct AuthTokenResponse: Codable, Equatable {
    public let token: String
}

// MARK: - Ürün

public enum ProductStatus: String, Codable, CaseIterable {
    case published, draft, proposed, rejected

    /// Türkçe görünen ad.
    public var displayName: String {
        switch self {
        case .published: return "Yayında"
        case .draft: return "Taslak"
        case .proposed: return "Önerildi"
        case .rejected: return "Reddedildi"
        }
    }
}

public struct Price: Codable, Equatable, Identifiable {
    public let id: String
    public let amount: Decimal          // major-unit (ör. 749.90) — *100 YOK
    public let currencyCode: String?

    enum CodingKeys: String, CodingKey {
        case id, amount
        case currencyCode = "currency_code"
    }
}

public struct Variant: Codable, Equatable, Identifiable {
    public let id: String
    public let title: String?
    public let sku: String?
    public let manageInventory: Bool?
    public let prices: [Price]?

    enum CodingKeys: String, CodingKey {
        case id, title, sku, prices
        case manageInventory = "manage_inventory"
    }
}

public struct Product: Codable, Equatable, Identifiable {
    public let id: String
    public let title: String
    public let status: ProductStatus
    public let thumbnail: String?
    public let variants: [Variant]?

    /// TRY listeleme fiyatı (ilk varyantın ilk try fiyatı).
    public var primaryTRYPrice: Decimal? {
        variants?
            .compactMap { $0.prices?.first(where: { ($0.currencyCode ?? "").lowercased() == "try" }) }
            .first?
            .amount
    }
}

public struct ProductListResponse: Codable, Equatable {
    public let products: [Product]
    public let count: Int
    public let offset: Int
    public let limit: Int
}

public struct ProductDetailResponse: Codable, Equatable {
    public let product: Product
}

// MARK: - Stok

public struct InventoryItem: Codable, Equatable, Identifiable {
    public let id: String
    public let sku: String?
    public let title: String?
    public let stockedQuantity: Int?
    public let reservedQuantity: Int?

    enum CodingKeys: String, CodingKey {
        case id, sku, title
        case stockedQuantity = "stocked_quantity"
        case reservedQuantity = "reserved_quantity"
    }

    /// available = stocked - reserved (gözlenen kural).
    public var availableQuantity: Int {
        (stockedQuantity ?? 0) - (reservedQuantity ?? 0)
    }
}

public struct InventoryListResponse: Codable, Equatable {
    public let inventoryItems: [InventoryItem]
    public let count: Int
    public let offset: Int
    public let limit: Int

    enum CodingKeys: String, CodingKey {
        case inventoryItems = "inventory_items"
        case count, offset, limit
    }
}

// MARK: - Stok konum seviyesi (location level)

public struct InventoryLevel: Codable, Equatable, Identifiable {
    public let id: String
    public let inventoryItemId: String
    public let locationId: String
    public let stockedQuantity: Int
    public let reservedQuantity: Int?
    public let availableQuantity: Int?

    enum CodingKeys: String, CodingKey {
        case id
        case inventoryItemId = "inventory_item_id"
        case locationId = "location_id"
        case stockedQuantity = "stocked_quantity"
        case reservedQuantity = "reserved_quantity"
        case availableQuantity = "available_quantity"
    }
}

public struct InventoryLevelListResponse: Codable, Equatable {
    public let inventoryLevels: [InventoryLevel]
    public let count: Int
    public let offset: Int
    public let limit: Int

    enum CodingKeys: String, CodingKey {
        case inventoryLevels = "inventory_levels"
        case count, offset, limit
    }
}

// MARK: - Sipariş

public struct Order: Codable, Equatable, Identifiable {
    public let id: String
    public let displayId: Int
    public let status: String
    public let paymentStatus: String?
    public let fulfillmentStatus: String?
    public let total: Decimal
    public let currencyCode: String?
    public let email: String?
    public let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id, status, total, email
        case displayId = "display_id"
        case paymentStatus = "payment_status"
        case fulfillmentStatus = "fulfillment_status"
        case currencyCode = "currency_code"
        case createdAt = "created_at"
    }
}

public struct OrderListResponse: Codable, Equatable {
    public let orders: [Order]
    public let count: Int
    public let offset: Int
    public let limit: Int
}

// MARK: - Sipariş durumları (Türkçe görünen adlar)
//
// Medusa v2 gözlenen değerler (§5.2): status=pending, payment_status=authorized,
// fulfillment_status=not_fulfilled. Bilinmeyen değerler ham (raw) gösterilir;
// asla sahte bir durum uydurulmaz.

/// Sipariş yaşam döngüsü durumu filtresi (liste `status[]` param).
public enum OrderStatusFilter: String, CaseIterable, Equatable {
    case pending, completed, archived, canceled, requiresAction = "requires_action"

    public var displayName: String {
        switch self {
        case .pending: return "Beklemede"
        case .completed: return "Tamamlandı"
        case .archived: return "Arşivlendi"
        case .canceled: return "İptal"
        case .requiresAction: return "İşlem Gerekli"
        }
    }
}

/// Ham durum kodunu Türkçe görünen ada çevirir (bilinmeyende ham kodu döndürür).
public enum OrderStatusText {
    public static func lifecycle(_ raw: String?) -> String {
        switch (raw ?? "").lowercased() {
        case "pending": return "Beklemede"
        case "completed": return "Tamamlandı"
        case "archived": return "Arşivlendi"
        case "canceled", "cancelled": return "İptal"
        case "requires_action": return "İşlem Gerekli"
        case "draft": return "Taslak"
        case "": return "—"
        default: return raw ?? "—"
        }
    }

    public static func payment(_ raw: String?) -> String {
        switch (raw ?? "").lowercased() {
        case "not_paid": return "Ödenmedi"
        case "awaiting": return "Ödeme Bekleniyor"
        case "authorized": return "Yetkilendirildi"
        case "partially_authorized": return "Kısmen Yetkilendirildi"
        case "captured": return "Tahsil Edildi"
        case "partially_captured": return "Kısmen Tahsil Edildi"
        case "partially_refunded": return "Kısmen İade"
        case "refunded": return "İade Edildi"
        case "canceled", "cancelled": return "İptal"
        case "requires_action": return "İşlem Gerekli"
        case "": return "—"
        default: return raw ?? "—"
        }
    }

    public static func fulfillment(_ raw: String?) -> String {
        switch (raw ?? "").lowercased() {
        case "not_fulfilled": return "Karşılanmadı"
        case "partially_fulfilled": return "Kısmen Karşılandı"
        case "fulfilled": return "Karşılandı"
        case "partially_shipped": return "Kısmen Kargolandı"
        case "shipped": return "Kargolandı"
        case "partially_delivered": return "Kısmen Teslim"
        case "delivered": return "Teslim Edildi"
        case "partially_returned": return "Kısmen İade"
        case "returned": return "İade Edildi"
        case "canceled", "cancelled": return "İptal"
        case "": return "—"
        default: return raw ?? "—"
        }
    }
}

// MARK: - Sipariş detay (§5.2)

public struct OrderLineItem: Codable, Equatable, Identifiable {
    public let id: String
    public let title: String
    public let subtitle: String?
    public let thumbnail: String?
    public let variantTitle: String?
    public let variantSku: String?
    public let quantity: Int
    public let unitPrice: Decimal
    public let total: Decimal

    enum CodingKeys: String, CodingKey {
        case id, title, subtitle, thumbnail, quantity, total
        case variantTitle = "variant_title"
        case variantSku = "variant_sku"
        case unitPrice = "unit_price"
    }
}

public struct OrderAddress: Codable, Equatable {
    public let firstName: String?
    public let lastName: String?
    public let company: String?
    public let address1: String?
    public let address2: String?
    public let city: String?
    public let province: String?
    public let postalCode: String?
    public let countryCode: String?
    public let phone: String?

    enum CodingKeys: String, CodingKey {
        case company, city, province, phone
        case firstName = "first_name"
        case lastName = "last_name"
        case address1 = "address_1"
        case address2 = "address_2"
        case postalCode = "postal_code"
        case countryCode = "country_code"
    }

    /// "Ad Soyad" (varsa) — ikisi de boşsa nil.
    public var fullName: String? {
        let parts = [firstName, lastName].compactMap { $0 }.filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: " ")
    }

    /// Çok satırlı adres blokları (boş alanlar atlanır).
    public var lines: [String] {
        var out: [String] = []
        if let n = fullName { out.append(n) }
        if let c = company, !c.isEmpty { out.append(c) }
        if let a = address1, !a.isEmpty { out.append(a) }
        if let a = address2, !a.isEmpty { out.append(a) }
        let cityLine = [postalCode, city, province]
            .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " ")
        if !cityLine.isEmpty { out.append(cityLine) }
        if let cc = countryCode, !cc.isEmpty { out.append(cc.uppercased()) }
        if let p = phone, !p.isEmpty { out.append(p) }
        return out
    }
}

public struct OrderFulfillment: Codable, Equatable, Identifiable {
    public let id: String
    public let shippedAt: String?
    public let deliveredAt: String?
    public let canceledAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case shippedAt = "shipped_at"
        case deliveredAt = "delivered_at"
        case canceledAt = "canceled_at"
    }
}

public struct OrderDetail: Codable, Equatable, Identifiable {
    public let id: String
    public let displayId: Int
    public let status: String
    public let paymentStatus: String?
    public let fulfillmentStatus: String?
    public let email: String?
    public let currencyCode: String?
    public let total: Decimal
    public let itemTotal: Decimal?
    public let shippingTotal: Decimal?
    public let taxTotal: Decimal?
    public let discountTotal: Decimal?
    public let createdAt: String?
    public let items: [OrderLineItem]?
    public let shippingAddress: OrderAddress?
    public let fulfillments: [OrderFulfillment]?

    enum CodingKeys: String, CodingKey {
        case id, status, email, total, items
        case displayId = "display_id"
        case paymentStatus = "payment_status"
        case fulfillmentStatus = "fulfillment_status"
        case currencyCode = "currency_code"
        case itemTotal = "item_total"
        case shippingTotal = "shipping_total"
        case taxTotal = "tax_total"
        case discountTotal = "discount_total"
        case createdAt = "created_at"
        case shippingAddress = "shipping_address"
        case fulfillments
    }
}

public struct OrderDetailResponse: Codable, Equatable {
    public let order: OrderDetail
}

// MARK: - Dashboard türetilmiş sayılar

public struct DashboardCounts: Equatable {
    public let publishedProducts: Int
    public let draftProducts: Int
    public let totalProducts: Int
    public let orders: Int
    public let lowStock: Int

    public init(publishedProducts: Int, draftProducts: Int, totalProducts: Int,
                orders: Int, lowStock: Int) {
        self.publishedProducts = publishedProducts
        self.draftProducts = draftProducts
        self.totalProducts = totalProducts
        self.orders = orders
        self.lowStock = lowStock
    }
}
