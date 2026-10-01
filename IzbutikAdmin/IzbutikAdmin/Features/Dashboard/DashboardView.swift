import SwiftUI

/// Kontrol paneli: yayınlanan/draft ürün, düşük stok ve sipariş sayıları.
/// Sayılar liste endpoint'lerinin `count` alanından türetilir (§6). Düşük stok
/// eşiği uygulama tarafında (varsayılan `available <= 5`), inventory item'lar
/// üzerinden hesaplanır. Pull-to-refresh ile yenilenir.
@MainActor
final class DashboardViewModel: ObservableObject {
    @Published private(set) var counts: DashboardCounts?
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?

    /// Düşük stok eşiği (ayarlanabilir; varsayılan 5).
    let lowStockThreshold: Int
    private let client: MedusaAPIClient

    init(client: MedusaAPIClient, lowStockThreshold: Int = 5) {
        self.client = client
        self.lowStockThreshold = lowStockThreshold
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            async let published = client.productCount(status: .published)
            async let draft = client.productCount(status: .draft)
            async let total = client.productCount(status: nil)
            async let orders = client.orderCount()
            let low = try await computeLowStock()
            counts = DashboardCounts(
                publishedProducts: try await published,
                draftProducts: try await draft,
                totalProducts: try await total,
                orders: try await orders,
                lowStock: low
            )
        } catch let e as APIError {
            errorMessage = e.userMessage
        } catch {
            errorMessage = APIError.transport(error.localizedDescription).userMessage
        }
    }

    /// Tüm inventory item'ları sayfalayarak `available <= eşik` olanları sayar.
    private func computeLowStock() async throws -> Int {
        var offset = 0
        let pageSize = 200
        var low = 0
        while true {
            let page = try await client.inventoryItems(limit: pageSize, offset: offset)
            for item in page.inventoryItems where item.availableQuantity <= lowStockThreshold {
                low += 1
            }
            offset += page.inventoryItems.count
            if page.inventoryItems.isEmpty || offset >= page.count { break }
        }
        return low
    }
}

struct DashboardView: View {
    @EnvironmentObject private var session: SessionManager
    @StateObject private var vm: DashboardViewModel
    @State private var didLoad = false

    init(client: MedusaAPIClient) {
        _vm = StateObject(wrappedValue: DashboardViewModel(client: client))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: BrandSpacing.lg) {
                    if let c = vm.counts {
                        grid(c)
                    } else if vm.isLoading {
                        ProgressView("Yükleniyor…")
                            .frame(maxWidth: .infinity)
                            .padding(.top, BrandSpacing.xxl)
                    }
                    if let error = vm.errorMessage {
                        errorBanner(error)
                    }
                }
                .padding(BrandSpacing.lg)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(BrandColor.background)
            .navigationTitle("Panel")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Çıkış") { session.logout() }
                        .accessibilityLabel(Text("Oturumu kapat"))
                }
            }
            .refreshable { await vm.load() }
            .task {
                guard !didLoad else { return }
                didLoad = true
                await vm.load()
            }
        }
    }

    @ViewBuilder
    private func grid(_ c: DashboardCounts) -> some View {
        let columns = [GridItem(.flexible(), spacing: BrandSpacing.md),
                       GridItem(.flexible(), spacing: BrandSpacing.md)]
        LazyVGrid(columns: columns, spacing: BrandSpacing.md) {
            statCard("Yayında", value: c.publishedProducts, systemImage: "checkmark.seal", kind: .success)
            statCard("Taslak", value: c.draftProducts, systemImage: "doc", kind: .neutral)
            statCard("Toplam ürün", value: c.totalProducts, systemImage: "tag", kind: .neutral)
            statCard("Sipariş", value: c.orders, systemImage: "shippingbox", kind: .neutral)
            statCard("Düşük stok (≤\(vm.lowStockThreshold))", value: c.lowStock,
                     systemImage: "exclamationmark.triangle",
                     kind: c.lowStock > 0 ? .warning : .success)
        }
    }

    private func statCard(_ title: String, value: Int, systemImage: String,
                          kind: BrandStatusBadge.Kind) -> some View {
        VStack(alignment: .leading, spacing: BrandSpacing.sm) {
            HStack {
                Image(systemName: systemImage)
                    .foregroundStyle(BrandColor.accent)
                Spacer()
                BrandStatusBadge(String(value), kind: kind)
            }
            Text(title)
                .font(BrandTypography.subheadline)
                .foregroundStyle(BrandColor.textSecondary)
            Text(String(value))
                .font(BrandTypography.largeTitle)
                .foregroundStyle(BrandColor.textPrimary)
                .accessibilityHidden(true)
        }
        .padding(BrandSpacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BrandColor.surface)
        .clipShape(RoundedRectangle(cornerRadius: BrandLayout.cardCornerRadius))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("\(title): \(value)"))
    }

    private func errorBanner(_ text: String) -> some View {
        Text(text)
            .font(BrandTypography.footnote)
            .foregroundStyle(.white)
            .padding(BrandSpacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(BrandColor.danger)
            .clipShape(RoundedRectangle(cornerRadius: BrandLayout.cornerRadius))
            .accessibilityLabel(Text("Hata: \(text)"))
    }
}
