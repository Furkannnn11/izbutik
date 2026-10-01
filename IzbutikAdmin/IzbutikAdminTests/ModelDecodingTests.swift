import XCTest
@testable import IzbutikAdmin

/// Gözlenen Medusa v2 JSON şemalarına karşı Codable decode doğrulaması.
/// Fixture'lar API sözleşmesindeki (§3–§5) GERÇEK gözlemlerden türetildi;
/// gizli değer içermez.
final class ModelDecodingTests: XCTestCase {

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    func testProductListDecoding() throws {
        let json = """
        { "products": [
            { "id": "prod_1", "title": "Keten Gömlek", "status": "published",
              "thumbnail": "https://x/y.jpg",
              "variants": [ { "id": "var_1", "title": "M", "sku": "KG-M",
                "manage_inventory": true,
                "prices": [ { "id": "price_1", "amount": 749.9, "currency_code": "try" } ] } ] }
          ], "count": 55, "offset": 0, "limit": 1 }
        """
        let r = try decode(ProductListResponse.self, json)
        XCTAssertEqual(r.count, 55)
        XCTAssertEqual(r.products.first?.status, .published)
        XCTAssertEqual(r.products.first?.primaryTRYPrice, Decimal(string: "749.9"))
    }

    func testDraftStatusDecoding() throws {
        let json = #"{ "product": { "id": "p", "title": "Taslak", "status": "draft", "thumbnail": null, "variants": [] } }"#
        let r = try decode(ProductDetailResponse.self, json)
        XCTAssertEqual(r.product.status, .draft)
        XCTAssertEqual(r.product.status.displayName, "Taslak")
    }

    func testInventoryAvailableDerivation() throws {
        let json = """
        { "inventory_items": [
            { "id": "iitem_1", "sku": "KG-M", "title": "Keten Gömlek",
              "stocked_quantity": 28, "reserved_quantity": 3 } ],
          "count": 149, "offset": 0, "limit": 1 }
        """
        let r = try decode(InventoryListResponse.self, json)
        XCTAssertEqual(r.inventoryItems.first?.availableQuantity, 25)
    }

    func testOrderDecoding() throws {
        let json = """
        { "orders": [
            { "id": "order_1", "display_id": 1, "status": "pending",
              "payment_status": "authorized", "fulfillment_status": "not_fulfilled",
              "total": 829.8, "currency_code": "try", "email": "m@e.com",
              "created_at": "2026-09-25T00:00:00.000Z" } ],
          "count": 1, "offset": 0, "limit": 1 }
        """
        let r = try decode(OrderListResponse.self, json)
        XCTAssertEqual(r.orders.first?.displayId, 1)
        XCTAssertEqual(r.orders.first?.total, Decimal(string: "829.8"))
        XCTAssertEqual(r.orders.first?.paymentStatus, "authorized")
    }

    func testAuthTokenDecoding() throws {
        let r = try decode(AuthTokenResponse.self, #"{ "token": "abc.def.ghi" }"#)
        XCTAssertEqual(r.token, "abc.def.ghi")
    }
}
