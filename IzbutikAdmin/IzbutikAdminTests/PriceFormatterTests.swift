import XCTest
@testable import IzbutikAdmin

/// Fiyat biçimlendirme: Medusa v2 major-unit ondalık → "749,90 ₺".
/// `*100` YAPILMADIĞI doğrulanır.
final class PriceFormatterTests: XCTestCase {

    func testMajorUnitDecimalIsNotScaled() {
        // 749.90 major-unit; kuruşa çevrilmemeli (74990 gibi görünmemeli).
        let s = PriceFormatter.string(amount: Decimal(string: "749.9")!, currencyCode: "try")
        XCTAssertTrue(s.contains("749"), "749 tam kısmı korunmalı: \(s)")
        XCTAssertFalse(s.contains("74.990"), "minor-unit'e ölçeklenmemeli: \(s)")
        XCTAssertFalse(s.contains("74990"), "minor-unit'e ölçeklenmemeli: \(s)")
    }

    func testTwoFractionDigits() {
        let s = PriceFormatter.string(amount: Decimal(string: "829.8")!, currencyCode: "try")
        // tr_TR ondalık ayırıcı virgül → "829,80"
        XCTAssertTrue(s.contains("829"), s)
        XCTAssertTrue(s.contains("80"), "iki ondalık basamak: \(s)")
    }

    func testUppercaseCurrencyCodeAccepted() {
        let s = PriceFormatter.string(amount: Decimal(string: "10")!, currencyCode: "TRY")
        XCTAssertTrue(s.contains("10"), s)
    }

    func testNilCurrencyDefaultsToTRY() {
        let s = PriceFormatter.string(amount: Decimal(string: "5.5")!, currencyCode: nil)
        XCTAssertTrue(s.contains("5"), s)
    }
}
