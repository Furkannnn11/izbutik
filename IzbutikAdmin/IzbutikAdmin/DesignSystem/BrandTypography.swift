import SwiftUI

/// Dinamik Tür (Dynamic Type) ile ölçeklenen tipografi tokenları.
/// Sabit punto YERİNE `Font.TextStyle` tabanlı; kullanıcı metin boyutu
/// tercihiyle otomatik ölçeklenir (erişilebilirlik gereği).
public enum BrandTypography {
    public static let largeTitle = Font.largeTitle.weight(.bold)
    public static let title = Font.title2.weight(.semibold)
    public static let headline = Font.headline
    public static let body = Font.body
    public static let callout = Font.callout
    public static let subheadline = Font.subheadline
    public static let footnote = Font.footnote
    public static let caption = Font.caption
    /// Fiyat gibi sayısal değerler için monospaced digit — hizalı okunur.
    public static let priceValue = Font.body.monospacedDigit().weight(.semibold)
}

/// Boşluk / yerleşim ölçekleri (8pt tabanlı).
public enum BrandSpacing {
    public static let xxs: CGFloat = 2
    public static let xs: CGFloat = 4
    public static let sm: CGFloat = 8
    public static let md: CGFloat = 12
    public static let lg: CGFloat = 16
    public static let xl: CGFloat = 24
    public static let xxl: CGFloat = 32
}

/// Yerleşim sabitleri. Dokunma alanları erişilebilirlik minimumunu karşılar.
public enum BrandLayout {
    /// Apple HIG + spec: minimum dokunma hedefi 44x44 pt.
    public static let minTouchTarget: CGFloat = 44
    public static let cornerRadius: CGFloat = 12
    public static let cardCornerRadius: CGFloat = 16
    public static let hairline: CGFloat = 1
}
