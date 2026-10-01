import XCTest
@testable import IzbutikAdmin

/// `URLProtocol` tabanlı sahte ağ katmanı. Gerçek sunucuya çıkmadan
/// login/token/401 senaryolarını deterministik test eder.
final class MockURLProtocol: URLProtocol {

    /// (request) -> (status, data, capturedRequest). Test her istekte set eder.
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> (Int, Data))?
    /// Son gözlemlenen istek (header/gövde doğrulaması için).
    nonisolated(unsafe) static var lastRequest: URLRequest?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        MockURLProtocol.lastRequest = request
        guard let handler = MockURLProtocol.handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }
        do {
            let (status, data) = try handler(request)
            let response = HTTPURLResponse(url: request.url!,
                                           statusCode: status,
                                           httpVersion: "HTTP/1.1",
                                           headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}

    /// Mock protokol enjekte edilmiş bir `URLSession`.
    static func makeSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        return URLSession(configuration: config)
    }
}

final class AuthFlowTests: XCTestCase {

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

    // MARK: - Login başarı

    func testLoginSuccessReturnsToken() async throws {
        MockURLProtocol.handler = { req in
            XCTAssertEqual(req.url?.path, "/auth/user/emailpass")
            XCTAssertEqual(req.httpMethod, "POST")
            let json = #"{"token":"eyJhbGciOiJIUzI1NiJ9.payload.sig"}"#
            return (200, Data(json.utf8))
        }
        await api.configure(backendURL: "https://shop.example.com", token: nil)
        let token = try await api.login(email: "admin@izbutik.local", password: "secret123")
        XCTAssertEqual(token, "eyJhbGciOiJIUzI1NiJ9.payload.sig")
    }

    // MARK: - Login başarısız (401)

    func testLoginFailureThrowsUnauthorized() async {
        MockURLProtocol.handler = { _ in
            (401, Data(#"{"message":"Unauthorized"}"#.utf8))
        }
        await api.configure(backendURL: "https://shop.example.com", token: nil)
        do {
            _ = try await api.login(email: "admin@izbutik.local", password: "wrong")
            XCTFail("401 bekleniyordu")
        } catch let e as APIError {
            XCTAssertEqual(e, .unauthorized)
            XCTAssertEqual(e.userMessage, "E-posta veya parola hatalı. Lütfen tekrar deneyin.")
        } catch {
            XCTFail("APIError bekleniyordu, gelen: \(error)")
        }
    }

    // MARK: - Token injection (Bearer header)

    func testAuthenticatedRequestInjectsBearerToken() async throws {
        MockURLProtocol.handler = { _ in (200, Data("{}".utf8)) }
        await api.configure(backendURL: "https://shop.example.com",
                            token: "eyJabc.def.ghi")
        try await api.verifyToken()
        let auth = MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Authorization")
        XCTAssertEqual(auth, "Bearer eyJabc.def.ghi")
    }

    func testLoginRequestHasNoBearerHeader() async throws {
        MockURLProtocol.handler = { _ in (200, Data(#"{"token":"eyJa.b.c"}"#.utf8)) }
        await api.configure(backendURL: "https://shop.example.com", token: nil)
        _ = try await api.login(email: "admin@izbutik.local", password: "secret")
        XCTAssertNil(MockURLProtocol.lastRequest?.value(forHTTPHeaderField: "Authorization"),
                     "Login isteği Bearer header taşımamalı")
    }

    // MARK: - 401 → güvenli logout callback

    func testUnauthorizedOnSessionRequestTriggersHandler() async throws {
        MockURLProtocol.handler = { _ in (401, Data("{}".utf8)) }
        await api.configure(backendURL: "https://shop.example.com", token: "expired.token.xyz")

        let expectation = expectation(description: "onUnauthorized çağrıldı")
        await api.setUnauthorizedHandler { expectation.fulfill() }

        do {
            try await api.verifyToken()
            XCTFail("401 bekleniyordu")
        } catch let e as APIError {
            XCTAssertEqual(e, .unauthorized)
        }
        await fulfillment(of: [expectation], timeout: 2.0)
    }

    func testLoginFailureDoesNotTriggerLogoutHandler() async {
        MockURLProtocol.handler = { _ in (401, Data("{}".utf8)) }
        await api.configure(backendURL: "https://shop.example.com", token: nil)

        var handlerCalled = false
        await api.setUnauthorizedHandler { handlerCalled = true }

        _ = try? await api.login(email: "admin@izbutik.local", password: "wrong")
        XCTAssertFalse(handlerCalled, "Login 401'inde global logout tetiklenmemeli")
    }

    // MARK: - Offline

    func testOfflineMapsToOfflineError() async {
        MockURLProtocol.handler = { _ in throw URLError(.notConnectedToInternet) }
        await api.configure(backendURL: "https://shop.example.com", token: "t.o.k")
        do {
            try await api.verifyToken()
            XCTFail("offline bekleniyordu")
        } catch let e as APIError {
            XCTAssertEqual(e, .offline)
            XCTAssertEqual(e.userMessage, "İnternet bağlantısı yok. Bağlantınızı kontrol edin.")
        } catch {
            XCTFail("APIError.offline bekleniyordu, gelen: \(error)")
        }
    }
}

// MARK: - Log redaksiyon testleri

final class LogRedactionTests: XCTestCase {

    func testBearerTokenRedacted() {
        let out = LogRedactor.redact("Authorization: Bearer eyJhbGci.payload.signature123")
        XCTAssertFalse(out.contains("payload.signature123"))
        XCTAssertTrue(out.contains("Bearer ***"))
    }

    func testPasswordFieldRedacted() {
        let out = LogRedactor.redact(#"{"email":"a@b.com","password":"S3cr3t!"}"#)
        XCTAssertFalse(out.contains("S3cr3t!"))
        XCTAssertTrue(out.contains(#""password":"***""#))
    }

    func testTokenFieldRedacted() {
        let out = LogRedactor.redact(#"{"token":"eyJraw.jwt.value"}"#)
        XCTAssertFalse(out.contains("eyJraw.jwt.value"))
        XCTAssertTrue(out.contains(#""token":"***""#))
    }

    func testRawJWTRedacted() {
        let out = LogRedactor.redact("kaydedildi: eyJ0eXAiOiJKV1QifQ.eyJzdWIiOiIxIn0.abc-_123")
        XCTAssertFalse(out.contains("eyJ0eXAiOiJKV1QifQ.eyJzdWIiOiIxIn0.abc-_123"))
        XCTAssertTrue(out.contains("***"))
    }

    func testEmailRedacted() {
        let out = LogRedactor.redact("giriş: admin@izbutik.local")
        XCTAssertFalse(out.contains("admin@izbutik.local"))
        XCTAssertTrue(out.contains("***"))
    }

    func testAppLogStoresRedactedLine() {
        AppLog.debug("Bearer supersecret.token.value ve password:\"abc\"")
        let line = AppLog.lastRedactedLine ?? ""
        XCTAssertFalse(line.contains("supersecret.token.value"))
        XCTAssertTrue(line.contains("***"))
    }

    func testNonSecretTextUnchanged() {
        let input = "GET /admin/products status 200"
        XCTAssertEqual(LogRedactor.redact(input), input)
    }
}
