import Foundation

/// API katmanı hataları. Türkçe kullanıcı mesajları `userMessage` ile.
public enum APIError: Error, Equatable, LocalizedError {
    case invalidURL
    case unauthorized                 // 401
    case http(status: Int)
    case decoding(String)
    case transport(String)
    case offline                      // ağ yok
    case notConfigured                // backend URL ayarlı değil

    /// Kullanıcıya gösterilecek Türkçe mesaj (gizli değer içermez).
    public var userMessage: String {
        switch self {
        case .invalidURL:
            return "Sunucu adresi geçersiz. Lütfen backend URL'ini kontrol edin."
        case .unauthorized:
            return "E-posta veya parola hatalı. Lütfen tekrar deneyin."
        case .http(let status):
            return "Sunucu hatası (\(status)). Lütfen daha sonra tekrar deneyin."
        case .decoding:
            return "Sunucu yanıtı çözümlenemedi. Backend sürümünü kontrol edin."
        case .transport:
            return "Bağlantı hatası oluştu. Lütfen tekrar deneyin."
        case .offline:
            return "İnternet bağlantısı yok. Bağlantınızı kontrol edin."
        case .notConfigured:
            return "Önce geçerli bir sunucu adresi (backend URL) girin."
        }
    }

    public var errorDescription: String? { userMessage }
}

/// Medusa v2 Admin API istemcisi.
///
/// - Bağımlılıksız (`URLSession` + `async/await`).
/// - Kimlik: JWT `Authorization: Bearer <token>` (Medusa v2; cookie/session yok).
/// - Fiyat/tutar alanları major-unit `Decimal` olarak decode edilir.
public actor MedusaAPIClient {

    private let session: URLSession
    private var backendURL: URL?
    private var token: String?

    /// 401 alındığında (token doğrulama hariç login akışı) tetiklenir; oturum
    /// yöneticisi buna bağlanıp güvenli logout yapar. Aktörden ana iş parçacığına
    /// güvenli geçiş için `@Sendable` closure kullanılır.
    private var onUnauthorized: (@Sendable () -> Void)?

    public init(session: URLSession = .shared) {
        self.session = session
    }

    // MARK: - Yapılandırma

    public func configure(backendURL: String, token: String?) {
        self.backendURL = URL(string: backendURL.trimmingCharacters(in: .whitespacesAndNewlines))
        self.token = token
    }

    public func setToken(_ token: String?) { self.token = token }

    /// 401 (yetkisiz) durumunda çağrılacak geri aramayı ayarlar.
    public func setUnauthorizedHandler(_ handler: (@Sendable () -> Void)?) {
        self.onUnauthorized = handler
    }

    // MARK: - Kimlik

    /// JWT login: `POST /auth/user/emailpass`.
    public func login(email: String, password: String) async throws -> String {
        let payload = ["email": email, "password": password]
        let data = try await post(path: "/auth/user/emailpass",
                                   body: payload, authenticated: false)
        let decoded = try decode(AuthTokenResponse.self, from: data)
        self.token = decoded.token
        return decoded.token
    }

    /// Token doğrulama: `GET /admin/users/me` → 200.
    public func verifyToken() async throws {
        _ = try await get(path: "/admin/users/me")
    }

    // MARK: - Ürünler

    public func products(limit: Int = 20, offset: Int = 0,
                         query: String? = nil,
                         status: ProductStatus? = nil) async throws -> ProductListResponse {
        var items = [
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "offset", value: String(offset)),
            URLQueryItem(name: "fields",
                         value: "id,title,status,thumbnail,*variants,*variants.prices")
        ]
        if let query, !query.isEmpty { items.append(URLQueryItem(name: "q", value: query)) }
        if let status { items.append(URLQueryItem(name: "status[]", value: status.rawValue)) }
        let data = try await get(path: "/admin/products", queryItems: items)
        return try decode(ProductListResponse.self, from: data)
    }

    public func product(id: String) async throws -> Product {
        let items = [URLQueryItem(name: "fields",
                                  value: "id,title,status,thumbnail,*variants,*variants.prices")]
        let data = try await get(path: "/admin/products/\(id)", queryItems: items)
        return try decode(ProductDetailResponse.self, from: data).product
    }

    // MARK: - Ürün mutasyonları (Adım 6)
    //
    // Medusa v2 admin ürün güncelleme: `POST /admin/products/{id}`.
    // Riskli mutation; yalnız resmî sözleşme (§3.4) uyarınca, açık payload ve
    // çağıran katmanda değişiklik-öncesi doğrulama + kaydetme onayı ile.

    /// Ürün durumunu (`published`/`draft`) değiştirir ve güncel ürünü döndürür.
    @discardableResult
    public func updateProductStatus(id: String, status: ProductStatus) async throws -> Product {
        let body: [String: JSONValue] = ["status": .string(status.rawValue)]
        let data = try await post(path: "/admin/products/\(id)", jsonBody: body, authenticated: true)
        return try decode(ProductDetailResponse.self, from: data).product
    }

    /// Ürün başlık/açıklama gibi metin alanlarını günceller.
    @discardableResult
    public func updateProductFields(id: String, title: String?) async throws -> Product {
        var body: [String: JSONValue] = [:]
        if let title { body["title"] = .string(title) }
        let data = try await post(path: "/admin/products/\(id)", jsonBody: body, authenticated: true)
        return try decode(ProductDetailResponse.self, from: data).product
    }

    /// Bir varyantın TRY fiyatını günceller: `POST /admin/products/{id}/variants/{variantId}`.
    /// `amount` **major-unit** `Decimal` olarak gönderilir (*100 YOK).
    @discardableResult
    public func updateVariantTRYPrice(productId: String, variantId: String,
                                      amount: Decimal) async throws -> Product {
        let price: [String: JSONValue] = [
            "amount": .decimal(amount),
            "currency_code": .string("try")
        ]
        let body: [String: JSONValue] = ["prices": .array([.object(price)])]
        let data = try await post(path: "/admin/products/\(productId)/variants/\(variantId)",
                                  jsonBody: body, authenticated: true)
        return try decode(ProductDetailResponse.self, from: data).product
    }

    // MARK: - Stok

    public func inventoryItems(limit: Int = 100, offset: Int = 0) async throws -> InventoryListResponse {
        let items = [
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "offset", value: String(offset)),
            URLQueryItem(name: "fields", value: "id,sku,title,stocked_quantity,reserved_quantity")
        ]
        let data = try await get(path: "/admin/inventory-items", queryItems: items)
        return try decode(InventoryListResponse.self, from: data)
    }

    /// Bir inventory item'ın konum seviyelerini okur:
    /// `GET /admin/inventory-items/{id}/location-levels`.
    public func inventoryLocationLevels(itemId: String) async throws -> InventoryLevelListResponse {
        let data = try await get(path: "/admin/inventory-items/\(itemId)/location-levels")
        return try decode(InventoryLevelListResponse.self, from: data)
    }

    /// Bir konum seviyesinin stok miktarını günceller:
    /// `POST /admin/inventory-items/{itemId}/location-levels/{locationId}`.
    /// Body: `{ "stocked_quantity": <Int> }` (negatif kabul edilmez — çağıran doğrular).
    @discardableResult
    public func updateInventoryLevel(itemId: String, locationId: String,
                                     stockedQuantity: Int) async throws -> InventoryLevel? {
        let body: [String: JSONValue] = ["stocked_quantity": .int(stockedQuantity)]
        let data = try await post(path: "/admin/inventory-items/\(itemId)/location-levels/\(locationId)",
                                  jsonBody: body, authenticated: true)
        // Yanıt gövdesi item veya inventory_item sarmalayabilir; seviye yeniden
        // GET ile doğrulanır (çağıran katman). Burada best-effort decode.
        return try? decode(InventoryLevel.self, from: data)
    }

    // MARK: - Siparişler

    public func orders(limit: Int = 20, offset: Int = 0,
                       status: OrderStatusFilter? = nil) async throws -> OrderListResponse {
        var items = [
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "offset", value: String(offset)),
            URLQueryItem(name: "fields",
                         value: "id,display_id,status,payment_status,fulfillment_status,total,currency_code,email,created_at")
        ]
        if let status { items.append(URLQueryItem(name: "status[]", value: status.rawValue)) }
        let data = try await get(path: "/admin/orders", queryItems: items)
        return try decode(OrderListResponse.self, from: data)
    }

    /// Sipariş detayı: `GET /admin/orders/{id}` (§5.2) — kalemler, adres,
    /// ödeme/fulfillment durumu ve toplamlar.
    public func order(id: String) async throws -> OrderDetail {
        let items = [URLQueryItem(
            name: "fields",
            value: "id,display_id,status,payment_status,fulfillment_status,email,currency_code,total,item_total,shipping_total,tax_total,discount_total,created_at,*items,*shipping_address,*fulfillments")]
        let data = try await get(path: "/admin/orders/\(id)", queryItems: items)
        return try decode(OrderDetailResponse.self, from: data).order
    }

    /// Yalnız `count` okumak için hafif istek (dashboard sayıları).
    public func productCount(status: ProductStatus? = nil) async throws -> Int {
        try await products(limit: 1, offset: 0, status: status).count
    }
    public func orderCount() async throws -> Int {
        try await orders(limit: 1, offset: 0).count
    }

    // MARK: - HTTP çekirdeği

    private func get(path: String, queryItems: [URLQueryItem] = []) async throws -> Data {
        guard let base = backendURL else { throw APIError.notConfigured }
        guard var comps = URLComponents(url: base.appendingPathComponent(path),
                                        resolvingAgainstBaseURL: false) else {
            throw APIError.invalidURL
        }
        if !queryItems.isEmpty { comps.queryItems = queryItems }
        guard let url = comps.url else { throw APIError.invalidURL }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        applyAuth(&request)
        return try await perform(request, triggersLogoutOn401: true)
    }

    private func post(path: String, body: [String: String],
                      authenticated: Bool) async throws -> Data {
        guard let base = backendURL else { throw APIError.notConfigured }
        let url = base.appendingPathComponent(path)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        if authenticated { applyAuth(&request) }
        return try await perform(request, triggersLogoutOn401: authenticated)
    }

    /// JSON gövdeli POST (mutation'lar). `JSONValue` ile tip-güvenli gövde;
    /// `Decimal` (fiyat) JSON **sayı** olarak, kayıpsız serialize edilir.
    private func post(path: String, jsonBody: [String: JSONValue],
                      authenticated: Bool) async throws -> Data {
        guard let base = backendURL else { throw APIError.notConfigured }
        let url = base.appendingPathComponent(path)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let object = JSONValue.object(jsonBody).foundationObject
        request.httpBody = try JSONSerialization.data(withJSONObject: object)
        if authenticated { applyAuth(&request) }
        return try await perform(request, triggersLogoutOn401: authenticated)
    }

    private func applyAuth(_ request: inout URLRequest) {
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
    }

    private func perform(_ request: URLRequest, triggersLogoutOn401: Bool) async throws -> Data {
        AppLog.debug("→ \(request.httpMethod ?? "GET") \(request.url?.absoluteString ?? "")")
        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                throw APIError.transport("HTTP yanıtı alınamadı")
            }
            AppLog.debug("← \(http.statusCode) \(request.url?.path ?? "")")
            switch http.statusCode {
            case 200...299:
                return data
            case 401:
                // Kimlik doğrulanmış istekteki 401 = geçersiz/expired token →
                // güvenli logout tetiklenir. Login isteğindeki 401 = yalnız
                // kimlik hatası; logout tetiklenmez (zaten oturum yok).
                if triggersLogoutOn401 { onUnauthorized?() }
                throw APIError.unauthorized
            default:
                throw APIError.http(status: http.statusCode)
            }
        } catch let e as APIError {
            throw e
        } catch let urlError as URLError {
            switch urlError.code {
            case .notConnectedToInternet, .networkConnectionLost,
                 .dataNotAllowed, .internationalRoamingOff:
                throw APIError.offline
            default:
                throw APIError.transport(urlError.localizedDescription)
            }
        } catch {
            throw APIError.transport(error.localizedDescription)
        }
    }

    private nonisolated func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch { throw APIError.decoding(String(describing: error)) }
    }
}
