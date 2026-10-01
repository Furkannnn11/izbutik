import SwiftUI

/// Marka birincil butonu: 44pt minimum dokunma alanı, scheme-aware aksan
/// zemini + kontrastlı `onAccent` metin, VoiceOver için erişilebilir.
public struct BrandPrimaryButton: View {
    private let title: String
    private let systemImage: String?
    private let isLoading: Bool
    private let action: () -> Void

    public init(_ title: String,
                systemImage: String? = nil,
                isLoading: Bool = false,
                action: @escaping () -> Void) {
        self.title = title
        self.systemImage = systemImage
        self.isLoading = isLoading
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            HStack(spacing: BrandSpacing.sm) {
                if isLoading {
                    ProgressView().tint(BrandColor.onAccent)
                } else if let systemImage {
                    Image(systemName: systemImage)
                }
                Text(title).font(BrandTypography.headline)
            }
            .frame(maxWidth: .infinity, minHeight: BrandLayout.minTouchTarget)
            .foregroundStyle(BrandColor.onAccent)
            .background(BrandColor.accent)
            .clipShape(RoundedRectangle(cornerRadius: BrandLayout.cornerRadius))
        }
        .disabled(isLoading)
        .accessibilityLabel(Text(title))
        .accessibilityAddTraits(.isButton)
        .accessibilityHint(isLoading ? Text("İşlem sürüyor") : Text(""))
    }
}

/// Durum rozeti (yayınlandı / taslak / düşük stok vb.). Renk yanında MUTLAKA
/// metin taşır — renk körü kullanıcılar için tek başına renge güvenilmez.
public struct BrandStatusBadge: View {
    public enum Kind { case success, warning, danger, neutral }
    private let text: String
    private let kind: Kind

    public init(_ text: String, kind: Kind) {
        self.text = text
        self.kind = kind
    }

    private var color: Color {
        switch kind {
        case .success: return BrandColor.success
        case .warning: return BrandColor.warning
        case .danger: return BrandColor.danger
        case .neutral: return BrandColor.textSecondary
        }
    }

    public var body: some View {
        Text(text)
            .font(BrandTypography.caption.weight(.semibold))
            .padding(.horizontal, BrandSpacing.sm)
            .padding(.vertical, BrandSpacing.xxs)
            .foregroundStyle(.white)
            .background(color)
            .clipShape(Capsule())
            .accessibilityLabel(Text(text))
    }
}
