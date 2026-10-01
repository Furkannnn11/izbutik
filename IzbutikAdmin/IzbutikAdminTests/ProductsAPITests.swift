import XCTest
@testable import IzbutikAdmin

/// Ürün/stok GET sözleşmesi: pagination, arama/filtre query parametreleri,
/// liste ve konum-seviyesi decode. `MockURLProtocol` ile deterministik.
final class ProductsAPITests: XCTestCase {

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

    // MARK: - Liste decode + major-unit fiyat

    func testProductListDecodesAndPrimaryTRYPrice() async throws {
        let json = """
        {"products":[
          {"id":"prod_1","title":"Şık Elbise","status":"published","thumbnail":"https://x/y.jpg",
           "variants":[{"id":"var_1","title":"M","sku":"SKU-1","manage_inventory":true,
             "prices":[{"id":"pr_1","amount":749.9,"currency_code":"try"}]}]}
        ],"count":55,"offset":0,"limit":20}
        """
        MockURLProtocol.handler = { _ in (200, Data(json.utf8)) }
        await configure()
        let resp = try await api.products(limit: 20, offset: 0)
        XCTAssertEqual(resp.count, 55)
        XCTAssertEqual(resp.products.count, 1)
        let p = resp.products[0]
        XCTAssertEqual(p.title, "Şık Elbise")
        XCTAssertEqual(p.status, .published)
        // 749.9 major-unit — *100 YOK
        XCTAssertEqual(p.primaryTRYPrice, Decimal(string: "749.9"))
    }

    // MARK: - Pagination query

    func testProductsPaginationQueryParams() async throws {
        MockURLProtocol.handler = { _ in
            (200, Data(#"{"products":[],"count":0,"offset":40,"limit":20}"#.utf8))
        }
        await configure()
        _ = try await api.products(limit: 20, offset: 40)
        let url = MockURLProtocol.lastRequest?.url?.absoluteString ?? ""
        XCTAssertTrue(url.contains("limit=20"), url)
        XCTAssertTrue(url.contains("offset=40"), url)
    }

    // MARK: - Arama + durum filtresi

    func testProductsSearchAndStatusFilterQuery() async throws {
        MockURLProtocol.handler = { _ in
            (200, Data(#"{"products":[],"count":0,"offset":0,"limit":20}"#.utf8))
        }
        await configure()
        _ = try await api.products(limit: 20, offset: 0, query: "elbise", status: .draft)
        let url = MockURLProtocol.lastRequest?.url?.absoluteString ?? ""
        XCTAssertTrue(url.contains("q=elbise"), url)
        XCTAssertTrue(url.contains("status") && url.contains("draft"), url)
    }

    // MARK: - productCount hafif istek

    func testProductCountReadsCountField() async throws {
        MockURLProtocol.handler = { _ in
            (200, Data(#"{"products":[],"count":29,"offset":0,"limit":1}"#.utf8))
        }
        await configure()
        let n = try await api.productCount(status: .published)
        XCTAssertEqual(n, 29)
        let url = MockURLProtocol.lastRequest?.url?.absoluteString ?? ""
        XCTAssertTrue(url.contains("limit=1"), url)
    }

    // MARK: - Inventory item decode + available

    func testInventoryItemsDecodeAndAvailable() async throws {
        let json = """
        {"inventory_items":[
          {"id":"iitem_1","sku":"SKU-1","title":"Şık Elbise","stocked_quantity":28,"reserved_quantity":3}
        ],"count":149,"offset":0,"limit":100}
        """
        MockURLProtocol.handler = { _ in (200, Data(json.utf8)) }
        await configure()
        let resp = try await api.inventoryItems()
        XCTAssertEqual(resp.count, 149)
        XCTAssertEqual(resp.inventoryItems.first?.availableQuantity, 25)  // 28 - 3
    }

    // MARK: - Location level decode

    func testLocationLevelsDecode() async throws {
        let json = """
        {"inventory_levels":[
          {"id":"ilev_1","inventory_item_id":"iitem_1","location_id":"sloc_1",
           "stocked_quantity":28,"reserved_quantity":0,"available_quantity":28}
        ],"count":1,"offset":0,"limit":20}
        """
        MockURLProtocol.handler = { _ in (200, Data(json.utf8)) }
        await configure()
        let resp = try await api.inventoryLocationLevels(itemId: "iitem_1")
        XCTAssertEqual(resp.inventoryLevels.count, 1)
        let lvl = resp.inventoryLevels[0]
        XCTAssertEqual(lvl.locationId, "sloc_1")
        XCTAssertEqual(lvl.stockedQuantity, 28)
        XCTAssertEqual(lvl.availableQuantity, 28)
        let url = MockURLProtocol.lastRequest?.url?.path ?? ""
        XCTAssertEqual(url, "/admin/inventory-items/iitem_1/location-levels")
    }
}
