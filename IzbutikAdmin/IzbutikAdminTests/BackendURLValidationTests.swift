import XCTest
@testable import IzbutikAdmin

/// Backend URL doğrulama. Debug'da loopback http kabul; her yapılandırmada
/// https kabul; geçersiz/şemasız reddedilir. (Release'te http reddi yalnız
/// Release derlemesinde gözlemlenebilir; burada https + geçersiz durumlar
/// yapılandırmadan bağımsız doğrulanır.)
final class BackendURLValidationTests: XCTestCase {

    func testHTTPSAlwaysAccepted() {
        XCTAssertTrue(AppEnvironment.isValidBackendURL("https://admin.izbutik.com"))
        XCTAssertTrue(AppEnvironment.isValidBackendURL("https://shop.example.com:9000"))
    }

    func testEmptyRejected() {
        XCTAssertFalse(AppEnvironment.isValidBackendURL(""))
        XCTAssertFalse(AppEnvironment.isValidBackendURL("   "))
    }

    func testSchemelessRejected() {
        XCTAssertFalse(AppEnvironment.isValidBackendURL("izbutik.com"))
        XCTAssertFalse(AppEnvironment.isValidBackendURL("ftp://izbutik.com"))
    }

    func testDebugDefaultIsLoopbackOrEmptyByConfig() {
        #if DEBUG
        XCTAssertEqual(AppEnvironment.defaultBackendURL, "http://127.0.0.1:9000")
        XCTAssertTrue(AppEnvironment.isValidBackendURL("http://127.0.0.1:9000"))
        XCTAssertTrue(AppEnvironment.isValidBackendURL("http://localhost:9000"))
        #else
        XCTAssertEqual(AppEnvironment.defaultBackendURL, "")
        XCTAssertFalse(AppEnvironment.isValidBackendURL("http://127.0.0.1:9000"))
        #endif
    }
}
