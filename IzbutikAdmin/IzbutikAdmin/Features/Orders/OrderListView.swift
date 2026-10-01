import SwiftUI

/// Sipariş listesi görünüm modeli: durum filtresi (`status[]`) ve offset tabanlı
/// pagination (§5.1). Sayfa boyu 20; listenin altına gelince sonraki sayfa
/// yüklenir. Pull-to-refresh baştan yükler. Boş/hata durumları ayrı gösterilir.
@MainActor
final class OrderListViewModel: ObservableObject {
    @Published var statusFilter: OrderStatusFilter? = nil   // nil = tümü
    @Published private(set) var orders: [Order] = []
    @Published private(set) var isLoading = false
    @Published private(set) var isLoadingMore = false
    @Published var errorMessage: String?

    private let pageSize = 20
    private var offset = 0
    private var total = 0
    private let client: MedusaAPIClient

    init(client: MedusaAPIClient) { self.client = client }

    var canLoadMore: Bool { orders.count < total }

    /// Baştan yükler (filtre değişimi / pull-to-refresh / ilk açılış).
    func reload() async {
        offset = 0
        total = 0
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let resp = try await client.orders(limit: pageSize, offset: 0, status: statusFilter)
            orders = resp.orders
            total = resp.count
            offset = resp.orders.count
        } catch let e as APIError {
            errorMessage = e.userMessage
            orders = []
        } catch {
            errorMessage = APIError.transport(error.localizedDescription).userMessage
            orders = []
        }
    }

    /// Listenin sonundaki öğeye gelince sonraki sayfayı ekler.
    func loadMoreIfNeeded(current item: Order) async {
        guard canLoadMore, !isLoadingMore, !isLoading else { return }
        guard let last = orders.last, last.id == item.id else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let resp = try await client.orders(limit: pageSize, offset: offset, status: statusFilter)
            orders.append(contentsOf: resp.orders)
            offset += resp.orders.count
            total = resp.count
        } catch {
            // Sessiz: sonraki sayfa hatası mevcut listeyi bozmaz.
        }
    }
}

struct OrderListView: View {
    @StateObject private var vm: OrderListViewModel
    private let client: MedusaAPIClient
    @State private var didLoad = false

    init(client: MedusaAPIClient) {
        self.client = client
        _vm = StateObject(wrappedValue: OrderListViewModel(client: client))
    }

    var body: some View {
        NavigationStack {
            List {
                filterPicker
                if let error = vm.errorMessage {
                    errorRow(error)
                }
                ForEach(vm.orders) { order in
                    NavigationLink {
                        OrderDetailView(client: client, orderId: order.id, initialOrder: order)
                    } label: {
                        OrderRow(order: order)
                    }
                    .listRowBackground(BrandColor.surface)
                    .task { await vm.loadMoreIfNeeded(current: order) }
                }
                if vm.isLoadingMore {
                    HStack { Spacer(); ProgressView(); Spacer() }
                        .listRowBackground(BrandColor.background)
                }
                if !vm.isLoading && vm.orders.isEmpty && vm.errorMessage == nil {
                    emptyRow
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(BrandColor.background)
            .navigationTitle("Siparişler")
            .onChange(of: vm.statusFilter) { _, _ in Task { await vm.reload() } }
            .refreshable { await vm.reload() }
            .overlay {
                if vm.isLoading && vm.orders.isEmpty {
                    ProgressView("Yükleniyor…")
                }
            }
            .task {
                guard !didLoad else { return }
                didLoad = true
                await vm.reload()
            }
        }
    }

    private var filterPicker: some View {
        Picker("Durum", selection: $vm.statusFilter) {
            Text("Tümü").tag(OrderStatusFilter?.none)
            Text("Beklemede").tag(OrderStatusFilter?.some(.pending))
            Text("Tamamlandı").tag(OrderStatusFilter?.some(.completed))
            Text("İptal").tag(OrderStatusFilter?.some(.canceled))
        }
        .pickerStyle(.segmented)
        .listRowBackground(BrandColor.background)
        .accessibilityLabel(Text("Sipariş durumu filtresi"))
    }

    private func errorRow(_ error: String) -> some View {
        VStack(alignment: .leading, spacing: BrandSpacing.sm) {
            Text(error)
                .font(BrandTypography.footnote)
                .foregroundStyle(BrandColor.danger)
            Button("Tekrar dene") { Task { await vm.reload() } }
                .font(BrandTypography.callout)
                .tint(BrandColor.accent)
        }
        .listRowBackground(BrandColor.background)
    }

    private var emptyRow: some View {
        VStack(spacing: BrandSpacing.sm) {
            Image(systemName: "shippingbox")
                .font(.largeTitle)
                .foregroundStyle(BrandColor.textSecondary)
            Text("Sipariş bulunamadı.")
                .font(BrandTypography.body)
                .foregroundStyle(BrandColor.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, BrandSpacing.xl)
        .listRowBackground(BrandColor.background)
        .accessibilityElement(children: .combine)
    }
}

/// Tek sipariş satırı: no, müşteri e-postası, durum rozeti, toplam, tarih.
struct OrderRow: View {
    let order: Order

    var body: some View {
        VStack(alignment: .leading, spacing: BrandSpacing.xs) {
            HStack {
                Text("Sipariş #\(order.displayId)")
                    .font(BrandTypography.headline)
                    .foregroundStyle(BrandColor.textPrimary)
                Spacer()
                Text(PriceFormatter.string(amount: order.total, currencyCode: order.currencyCode))
                    .font(BrandTypography.priceValue)
                    .foregroundStyle(BrandColor.textPrimary)
            }
            if let email = order.email, !email.isEmpty {
                Text(email)
                    .font(BrandTypography.footnote)
                    .foregroundStyle(BrandColor.textSecondary)
                    .lineLimit(1)
            }
            HStack(spacing: BrandSpacing.sm) {
                BrandStatusBadge(OrderStatusText.lifecycle(order.status), kind: .neutral)
                BrandStatusBadge(OrderStatusText.payment(order.paymentStatus),
                                 kind: paymentKind(order.paymentStatus))
                Spacer()
                Text(OrderDateFormatter.short(order.createdAt))
                    .font(BrandTypography.caption)
                    .foregroundStyle(BrandColor.textSecondary)
            }
        }
        .padding(.vertical, BrandSpacing.xs)
        .accessibilityElement(children: .combine)
    }

    private func paymentKind(_ raw: String?) -> BrandStatusBadge.Kind {
        switch (raw ?? "").lowercased() {
        case "captured": return .success
        case "authorized", "awaiting", "partially_captured", "partially_authorized": return .warning
        case "canceled", "cancelled", "not_paid": return .danger
        default: return .neutral
        }
    }
}
