import SwiftUI

/// İzbutik Admin marka renk paleti — scheme-aware (açık/koyu).
///
/// Her token, `UIColor(dynamicProvider:)` ile açık/koyu için ayrı sRGB değeri
/// taşır; böylece sabit açık renk üzerine semantik metin karıştırma hatası
/// (okunamayan düşük kontrast) yapılmaz. Kontrast oranları `BrandContrastTests`
/// ile doğrulanır: normal metin ≥ 4.5:1, büyük metin/anlamlı grafik ≥ 3:1.
public enum BrandColor {

    // MARK: - Ham sRGB bileşenleri (kontrast testinin doğrulayabilmesi için açık)

    /// (light, dark) sRGB bileşen çifti. Değerler 0...1.
    public struct RGBAPair {
        public let light: (r: Double, g: Double, b: Double)
        public let dark: (r: Double, g: Double, b: Double)
    }

    // Butik/sade marka estetiği: yumuşak nötr zeminler + koyu mürekkep metin +
    // ölçülü bir marka aksanı (koyu bordo/şarap tonu — butik giyim hissi).
    public static let backgroundPair = RGBAPair(
        light: (0.980, 0.976, 0.972),   // #FAF9F8 sıcak beyaz
        dark:  (0.071, 0.071, 0.078)    // #121214 mürekkep siyahı
    )
    public static let surfacePair = RGBAPair(
        light: (1.000, 1.000, 1.000),   // #FFFFFF kart yüzeyi
        dark:  (0.114, 0.114, 0.125)    // #1D1D20
    )
    public static let textPrimaryPair = RGBAPair(
        light: (0.106, 0.106, 0.118),   // #1B1B1E — beyaz üstü ~15.9:1
        dark:  (0.949, 0.949, 0.953)    // #F2F2F3 — koyu üstü ~15.5:1
    )
    public static let textSecondaryPair = RGBAPair(
        light: (0.388, 0.388, 0.404),   // #636367 — beyaz üstü ~5.5:1
        dark:  (0.702, 0.702, 0.717)    // #B3B3B7 — koyu üstü ~7.6:1
    )
    /// Marka aksanı (bordo). Buton zemini olarak beyaz metinle kullanılır.
    public static let accentPair = RGBAPair(
        light: (0.482, 0.078, 0.184),   // #7B142F — beyaz metin ~8.8:1
        dark:  (0.831, 0.325, 0.435)    // #D45370 — koyu zemin üstü kontrastlı
    )
    /// Aksan üstü metin (buton yazısı). Açık modda beyaz, koyu modda koyu.
    public static let onAccentPair = RGBAPair(
        light: (1.000, 1.000, 1.000),   // beyaz — bordo üstü ~8.8:1
        dark:  (0.071, 0.071, 0.078)    // #121214 — açık pembe üstü ~7:1
    )
    public static let successPair = RGBAPair(
        light: (0.055, 0.416, 0.204),   // #0E6A34 published rozeti — beyaz metin ~5.0:1
        dark:  (0.298, 0.780, 0.482)    // #4CC77B
    )
    public static let warningPair = RGBAPair(
        light: (0.545, 0.373, 0.020),   // #8B5F05 düşük stok — beyaz metin ~4.9:1
        dark:  (0.929, 0.718, 0.310)    // #EDB74F
    )
    public static let dangerPair = RGBAPair(
        light: (0.647, 0.106, 0.149),   // #A51B26 — beyaz metin ~5.9:1
        dark:  (0.941, 0.416, 0.451)    // #F06A73
    )
    public static let separatorPair = RGBAPair(
        light: (0.851, 0.847, 0.839),   // #D9D8D6
        dark:  (0.235, 0.235, 0.251)    // #3C3C40
    )

    // MARK: - SwiftUI Color (dynamicProvider ile scheme-aware)

    public static var background: Color { dynamic(backgroundPair) }
    public static var surface: Color { dynamic(surfacePair) }
    public static var textPrimary: Color { dynamic(textPrimaryPair) }
    public static var textSecondary: Color { dynamic(textSecondaryPair) }
    public static var accent: Color { dynamic(accentPair) }
    public static var onAccent: Color { dynamic(onAccentPair) }
    public static var success: Color { dynamic(successPair) }
    public static var warning: Color { dynamic(warningPair) }
    public static var danger: Color { dynamic(dangerPair) }
    public static var separator: Color { dynamic(separatorPair) }

    private static func dynamic(_ pair: RGBAPair) -> Color {
        Color(UIColor { traits in
            let c = traits.userInterfaceStyle == .dark ? pair.dark : pair.light
            return UIColor(red: c.r, green: c.g, blue: c.b, alpha: 1.0)
        })
    }
}
