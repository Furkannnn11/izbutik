import XCTest
@testable import IzbutikAdmin

/// TRY para dönüşümlerinin **kayıpsız** olduğunu doğrular. Medusa v2 major-unit
/// ondalık kullandığı için `*100`/`/100` ağ katmanında YAPILMAZ; ancak UI giriş
/// ayrıştırma ve kuruş dönüşümleri kayan-nokta hatası içermemelidir.
final class MoneyConverterTests: XCTestCase {

    func testMajorToKurusExact() {
        XCTAssertEqual(MoneyConverter.kurus(fromMajor: Decimal(string: "749.90")!), 74990)
        XCTAssertEqual(MoneyConverter.kurus(fromMajor: Decimal(string: "0.01")!), 1)
        XCTAssertEqual(MoneyConverter.kurus(fromMajor: Decimal(string: "1000")!), 100000)
        XCTAssertEqual(MoneyConverter.kurus(fromMajor: Decimal(string: "829.80")!), 82980)
    }

    func testKurusToMajorExact() {
        XCTAssertEqual(MoneyConverter.major(fromKurus: 74990), Decimal(string: "749.90"))
        XCTAssertEqual(MoneyConverter.major(fromKurus: 1), Decimal(string: "0.01"))
        XCTAssertEqual(MoneyConverter.major(fromKurus: 82980), Decimal(string: "829.80"))
    }

    func testRoundTripLossless() {
        for cents in [0, 1, 99, 100, 74990, 123456, 999999] {
            let major = MoneyConverter.major(fromKurus: cents)
            XCTAssertEqual(MoneyConverter.kurus(fromMajor: major), cents,
                           "round-trip \(cents) kayıp verdi")
        }
    }

    func testParseTurkishCommaDecimal() {
        XCTAssertEqual(MoneyConverter.parseMajor("749,90"), Decimal(string: "749.90"))
        XCTAssertEqual(MoneyConverter.parseMajor("749.90"), Decimal(string: "749.90"))
        XCTAssertEqual(MoneyConverter.parseMajor("1000"), Decimal(string: "1000"))
        XCTAssertEqual(MoneyConverter.parseMajor("0,01"), Decimal(string: "0.01"))
    }

    func testParseRejectsInvalid() {
        XCTAssertNil(MoneyConverter.parseMajor(""))
        XCTAssertNil(MoneyConverter.parseMajor("abc"))
        XCTAssertNil(MoneyConverter.parseMajor("12,34,56"))   // iki ondalık ayıraç
        XCTAssertNil(MoneyConverter.parseMajor("12.345"))     // 3 ondalık = kuruş kaybı
        XCTAssertNil(MoneyConverter.parseMajor("10 TL"))
        XCTAssertNil(MoneyConverter.parseMajor("-5"))         // eksi işareti reddedilir
    }

    func testParseThenKurusNoFloatDrift() {
        // 0.1 + 0.2 gibi Double sorunlarının Decimal'de olmadığını doğrula.
        let a = MoneyConverter.parseMajor("0,10")!
        let b = MoneyConverter.parseMajor("0,20")!
        XCTAssertEqual(MoneyConverter.kurus(fromMajor: a + b), 30)
    }
}
