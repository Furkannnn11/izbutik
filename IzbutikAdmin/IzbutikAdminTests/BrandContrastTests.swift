import XCTest
@testable import IzbutikAdmin

/// Marka renk çiftlerinin WCAG kontrast oranlarını doğrular.
/// Normal metin ≥ 4.5:1, büyük metin / anlamlı grafik ≥ 3:1.
final class BrandContrastTests: XCTestCase {

    // MARK: - WCAG relative luminance + contrast

    private func relLuminance(_ c: (r: Double, g: Double, b: Double)) -> Double {
        func lin(_ v: Double) -> Double {
            v <= 0.03928 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
    }

    private func contrast(_ a: (r: Double, g: Double, b: Double),
                          _ b: (r: Double, g: Double, b: Double)) -> Double {
        let la = relLuminance(a), lb = relLuminance(b)
        let hi = max(la, lb), lo = min(la, lb)
        return (hi + 0.05) / (lo + 0.05)
    }

    // MARK: - Açık mod

    func testPrimaryTextOnBackgroundLight() {
        let ratio = contrast(BrandColor.textPrimaryPair.light,
                             BrandColor.backgroundPair.light)
        XCTAssertGreaterThanOrEqual(ratio, 4.5, "Açık mod birincil metin ≥ 4.5:1 olmalı (\(ratio))")
    }

    func testSecondaryTextOnBackgroundLight() {
        let ratio = contrast(BrandColor.textSecondaryPair.light,
                             BrandColor.backgroundPair.light)
        XCTAssertGreaterThanOrEqual(ratio, 4.5, "Açık mod ikincil metin ≥ 4.5:1 olmalı (\(ratio))")
    }

    func testOnAccentOnAccentLight() {
        let ratio = contrast(BrandColor.onAccentPair.light,
                             BrandColor.accentPair.light)
        XCTAssertGreaterThanOrEqual(ratio, 4.5, "Açık mod buton metni ≥ 4.5:1 olmalı (\(ratio))")
    }

    func testStatusBadgesOnWhiteLight() {
        let white = (r: 1.0, g: 1.0, b: 1.0)
        XCTAssertGreaterThanOrEqual(contrast(white, BrandColor.successPair.light), 4.5)
        XCTAssertGreaterThanOrEqual(contrast(white, BrandColor.warningPair.light), 4.5)
        XCTAssertGreaterThanOrEqual(contrast(white, BrandColor.dangerPair.light), 4.5)
    }

    // MARK: - Koyu mod

    func testPrimaryTextOnBackgroundDark() {
        let ratio = contrast(BrandColor.textPrimaryPair.dark,
                             BrandColor.backgroundPair.dark)
        XCTAssertGreaterThanOrEqual(ratio, 4.5, "Koyu mod birincil metin ≥ 4.5:1 olmalı (\(ratio))")
    }

    func testSecondaryTextOnBackgroundDark() {
        let ratio = contrast(BrandColor.textSecondaryPair.dark,
                             BrandColor.backgroundPair.dark)
        XCTAssertGreaterThanOrEqual(ratio, 4.5, "Koyu mod ikincil metin ≥ 4.5:1 olmalı (\(ratio))")
    }

    func testAccentGraphicOnDarkBackground() {
        // Aksan anlamlı grafik olarak kullanılırsa büyük-öğe eşiği ≥ 3:1.
        let ratio = contrast(BrandColor.accentPair.dark,
                             BrandColor.backgroundPair.dark)
        XCTAssertGreaterThanOrEqual(ratio, 3.0, "Koyu mod aksan grafiği ≥ 3:1 olmalı (\(ratio))")
    }
}
