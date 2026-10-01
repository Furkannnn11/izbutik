import XCTest
@testable import IzbutikAdmin

/// Ürün/varyant/stok mutation'larının gövde (payload) şekillerini doğrular.
/// Kritik: fiyat `amount` JSON **sayı** olarak (major-unit, kayıpsız) gönderilir,
/// string DEĞİL. Ayrıca başarılı mutation sonrası çağıran katmanın yeniden GET
/// ile doğrulayabilmesi için detay decode edilebilir olmalıdır.
final class MutationPayloadTests: XCTestCase {

    private var api: MedusaAPIClient!

    override func setUp() {
        super.setUp()
        api = MedusaAPIClient(session: MockURLProtocol.makeSession())
        MockURLProtocol.handler = nil
        MockURLProtocol.lastRequest = nil
    }

    override func tearDown() {
        MockURLProtocol.handler = nil
        MockURLProtocol.lastRequest = nil
        api = nil
        super.tearDown()
    }

    private func configure() async {
        await api.configure(backendURL: "https://shop.example.com", token: "t.o.k")
    }

    /// MockURLProtocol `httpBody`'yi bazı yapılandırmalarda stream'e çevirir;
    /// güvenli okuma için `httpBodyStream`'i de dener.
    private func bodyData(_ req: URLRequest?) -> Data {
        if let b = req?.httpBody { return b }
        guard let stream = req?.httpBodyStream else { return Data() }
        stream.open(); defer { stream.close() }
        var data = Data()
        let bufSize = 4096
        let buf = UnsafeMutablePointer<UInt8>.allocate(capacity: bufSize)
        defer { buf.deallocate() }
        while stream.hasBytesAvailable {
            let read = stream.read(buf, maxLength: bufSize)
            if read <= 0 { break }
            data.append(buf, count: read)
        }
        return data
    }

    // MARK: - Durum değiştirme payload

    func testUpdateStatusSendsStatusBody() async throws {
        let detail = #"{"product":{"id":"prod_1","title":"X","status":"published","variants":[]}}"#
        MockURLProtocol.handler = { _ in (200, Data(detail.utf8)) }
        await configure()
        let p = try await api.updateProductStatus(id: "prod_1", status: .published)
        XCTAssertEqual(p.status, .published)
        XCTAssertEqual(MockURLProtocol.lastRequest?.httpMethod, "POST")
        XCTAssertEqual(MockURLProtocol.lastRequest?.url?.path, "/admin/products/prod_1")

        let body = bodyData(MockURLProtocol.lastRequest)
        let obj = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        XCTAssertEqual(obj?["status"] as? String, "published")
    }

    // MARK: - Fiyat payload — amount JSON SAYI olmalı

    func testUpdateVariantPriceSendsAmountAsNumber() async throws {
        let detail = #"{"product":{"id":"prod_1","title":"X","status":"draft","variants":[]}}"#
        MockURLProtocol.handler = { _ in (200, Data(detail.utf8)) }
        await configure()
        _ = try await api.updateVariantTRYPrice(productId: "prod_1", variantId: "var_1",
                                                amount: Decimal(string: "749.90")!)
        XCTAssertEqual(MockURLProtocol.lastRequest?.url?.path,
                       "/admin/products/prod_1/variants/var_1")

        let body = bodyData(MockURLProtocol.lastRequest)
        let obj = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        let prices = obj?["prices"] as? [[String: Any]]
        XCTAssertEqual(prices?.count, 1)
        let price = prices?.first
        XCTAssertEqual(price?["currency_code"] as? String, "try")

        // amount SAYI olmalı (NSNumber), string DEĞİL.
        let amount = price?["amount"]
        XCTAssertTrue(amount is NSNumber, "amount JSON sayı olmalı, string değil")
        XCTAssertFalse(amount is String, "amount string olmamalı")
        // Ham JSON'da tırnaklı "amount":"..." bulunmamalı.
        let raw = String(data: body, encoding: .utf8) ?? ""
        XCTAssertFalse(raw.contains("\"amount\":\""), "amount tırnaklı (string) serialize edilmiş: \(raw)")
        // Değer kayıpsız 749.9.
        XCTAssertEqual((amount as? NSNumber)?.decimalValue, Decimal(string: "749.9"))
    }

    // MARK: - Stok payload

    func testUpdateInventoryLevelSendsStockedQuantity() async throws {
        MockURLProtocol.handler = { _ in
            (200, Data(#"{"inventory_item":{"id":"iitem_1"}}"#.utf8))
        }
        await configure()
        _ = try await api.updateInventoryLevel(itemId: "iitem_1", locationId: "sloc_1",
                                               stockedQuantity: 42)
        XCTAssertEqual(MockURLProtocol.lastRequest?.url?.path,
                       "/admin/inventory-items/iitem_1/location-levels/sloc_1")
        let body = bodyData(MockURLProtocol.lastRequest)
        let obj = try JSONSerialization.jsonObject(with: body) as? [String: Any]
        XCTAssertEqual((obj?["stocked_quantity"] as? NSNumber)?.intValue, 42)
    }

    // MARK: - Mutation isteği Bearer taşımalı

    func testMutationCarriesBearerHeader() async throws {
        let detail = #"{"product":{"id":"prod_1","title":"X","status":"draft","variants":[]}}"#
        MockURLProtocol.handler = { _ in (200, Data(detail.utf8)) }
        await configure()
        _ = try await api.updateProductStatus(id: "prod_1", status: .draft)
        XCTAssertEqual(MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Authorization"),
                       "Bearer t.o.k")
    }
}
