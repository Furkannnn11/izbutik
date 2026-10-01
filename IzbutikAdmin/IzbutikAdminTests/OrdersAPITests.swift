import XCTest
@testable import IzbutikAdmin

/// Sipariş GET sözleşmesi: liste + detay decode, pagination ve durum filtresi
/// query parametreleri, major-unit toplam, Türkçe durum metinleri.
/// `MockURLProtocol` (AuthFlowTests'te tanımlı) ile deterministik.
final class OrdersAPITests: XCTestCase {

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

    // MARK: - Liste decode + major-unit toplam

    func testOrderListDecodesAndMajorUnitTotal() async throws {
        let json = """
        {"orders":[
          {"id":"order_1","display_id":1,"status":"pending",
           "payment_status":"authorized","fulfillment_status":"not_fulfilled",
           "total":829.8,"currency_code":"try","email":"musteri@example.com",
           "created_at":"2026-09-25T10:22:03.123Z"}
        ],"count":1,"offset":0,"limit":20}
        """
        MockURLProtocol.handler = { _ in (200, Data(json.utf8)) }
        await configure()
        let resp = try await api.orders(limit: 20, offset: 0)
        XCTAssertEqual(resp.count, 1)
        let o = resp.orders.first
        XCTAssertEqual(o?.displayId, 1)
        XCTAssertEqual(o?.status, "pending")
        XCTAssertEqual(o?.paymentStatus, "authorized")
        XCTAssertEqual(o?.fulfillmentStatus, "not_fulfilled")
        // 829.8 major-unit — *100 YOK
        XCTAssertEqual(o?.total, Decimal(string: "829.8"))
        XCTAssertEqual(o?.email, "musteri@example.com")
    }

    // MARK: - Pagination query

    func testOrdersPaginationQueryParams() async throws {
        MockURLProtocol.handler = { _ in
            (200, Data(#"{"orders":[],"count":0,"offset":40,"limit":20}"#.utf8))
        }
        await configure()
        _ = try await api.orders(limit: 20, offset: 40)
        let url = MockURLProtocol.lastRequest?.url?.absoluteString ?? ""
        XCTAssertTrue(url.contains("limit=20"), url)
        XCTAssertTrue(url.contains("offset=40"), url)
    }

    // MARK: - Durum filtresi query

    func testOrdersStatusFilterQuery() async throws {
        MockURLProtocol.handler = { _ in
            (200, Data(#"{"orders":[],"count":0,"offset":0,"limit":20}"#.utf8))
        }
        await configure()
        _ = try await api.orders(limit: 20, offset: 0, status: .completed)
        let url = MockURLProtocol.lastRequest?.url?.absoluteString ?? ""
        XCTAssertTrue(url.contains("status") && url.contains("completed"), url)
    }

    // MARK: - orderCount hafif istek

    func testOrderCountReadsCountField() async throws {
        MockURLProtocol.handler = { _ in
            (200, Data(#"{"orders":[],"count":7,"offset":0,"limit":1}"#.utf8))
        }
        await configure()
        let n = try await api.orderCount()
        XCTAssertEqual(n, 7)
        let url = MockURLProtocol.lastRequest?.url?.absoluteString ?? ""
        XCTAssertTrue(url.contains("limit=1"), url)
    }

    // MARK: - Detay decode (kalemler, adres, toplamlar)

    func testOrderDetailDecodesItemsAddressAndTotals() async throws {
        let json = """
        {"order":{
          "id":"order_1","display_id":1,"status":"pending",
          "payment_status":"authorized","fulfillment_status":"not_fulfilled",
          "email":"musteri@example.com","currency_code":"try",
          "total":829.8,"item_total":749.9,"shipping_total":79.9,
          "tax_total":0,"discount_total":0,
          "created_at":"2026-09-25T10:22:03.123Z",
          "items":[
            {"id":"item_1","title":"Keten Gömlek","subtitle":null,"thumbnail":"https://x/y.jpg",
             "variant_title":"M / Beyaz","variant_sku":"KG-M","quantity":2,
             "unit_price":374.95,"total":749.9}
          ],
          "shipping_address":{
            "first_name":"Ayşe","last_name":"Yılmaz","company":null,
            "address_1":"Bağdat Cad. No:1","address_2":"Daire 5",
            "city":"İstanbul","province":"Kadıköy","postal_code":"34710",
            "country_code":"tr","phone":"+905551112233"},
          "fulfillments":[]
        }}
        """
        MockURLProtocol.handler = { _ in (200, Data(json.utf8)) }
        await configure()
        let detail = try await api.order(id: "order_1")
        XCTAssertEqual(detail.displayId, 1)
        XCTAssertEqual(detail.items?.count, 1)
        let item = detail.items?.first
        XCTAssertEqual(item?.title, "Keten Gömlek")
        XCTAssertEqual(item?.quantity, 2)
        XCTAssertEqual(item?.unitPrice, Decimal(string: "374.95"))
        XCTAssertEqual(item?.total, Decimal(string: "749.9"))
        XCTAssertEqual(item?.variantTitle, "M / Beyaz")
        // Adres blokları
        XCTAssertEqual(detail.shippingAddress?.fullName, "Ayşe Yılmaz")
        let lines = detail.shippingAddress?.lines ?? []
        XCTAssertTrue(lines.contains("Ayşe Yılmaz"), "\(lines)")
        XCTAssertTrue(lines.contains("Bağdat Cad. No:1"), "\(lines)")
        XCTAssertTrue(lines.contains("34710 İstanbul Kadıköy"), "\(lines)")
        // Toplamlar (major-unit)
        XCTAssertEqual(detail.total, Decimal(string: "829.8"))
        XCTAssertEqual(detail.itemTotal, Decimal(string: "749.9"))
        XCTAssertEqual(detail.shippingTotal, Decimal(string: "79.9"))
        // Detay path
        let path = MockURLProtocol.lastRequest?.url?.path ?? ""
        XCTAssertEqual(path, "/admin/orders/order_1")
    }

    // MARK: - Boş adres → boş satırlar

    func testOrderDetailWithNoAddressYieldsEmptyLines() async throws {
        let json = """
        {"order":{"id":"o2","display_id":2,"status":"completed",
          "payment_status":"captured","fulfillment_status":"fulfilled",
          "email":null,"currency_code":"try","total":100,"item_total":100,
          "created_at":null,"items":[],"shipping_address":null,"fulfillments":null}}
        """
        MockURLProtocol.handler = { _ in (200, Data(json.utf8)) }
        await configure()
        let detail = try await api.order(id: "o2")
        XCTAssertNil(detail.shippingAddress)
        XCTAssertEqual(detail.items?.count, 0)
        XCTAssertEqual(detail.status, "completed")
    }

    // MARK: - Türkçe durum metinleri

    func testTurkishStatusText() {
        XCTAssertEqual(OrderStatusText.lifecycle("pending"), "Beklemede")
        XCTAssertEqual(OrderStatusText.payment("authorized"), "Yetkilendirildi")
        XCTAssertEqual(OrderStatusText.payment("captured"), "Tahsil Edildi")
        XCTAssertEqual(OrderStatusText.fulfillment("not_fulfilled"), "Karşılanmadı")
        XCTAssertEqual(OrderStatusText.fulfillment("shipped"), "Kargolandı")
        // Bilinmeyen kod ham gösterilir (sahte durum uydurulmaz)
        XCTAssertEqual(OrderStatusText.lifecycle("some_new_state"), "some_new_state")
        XCTAssertEqual(OrderStatusText.payment(nil), "—")
    }

    // MARK: - 401 → unauthorized

    func testOrders401MapsToUnauthorized() async {
        MockURLProtocol.handler = { _ in (401, Data(#"{"type":"unauthorized"}"#.utf8)) }
        await configure()
        do {
            _ = try await api.orders()
            XCTFail("401 beklenirken hata atılmadı")
        } catch let e as APIError {
            XCTAssertEqual(e, .unauthorized)
        } catch {
            XCTFail("Beklenmeyen hata: \(error)")
        }
    }
}
