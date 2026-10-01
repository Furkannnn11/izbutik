import SwiftUI

/// Ürün listesi görünüm modeli: arama (`q`), published/draft filtresi ve
/// offset tabanlı pagination (§3.1). Sayfa boyu 20; alt sınıra gelince sonraki
/// sayfa yüklenir. Stok özeti için varyant SKU'ları üzerinden inventory item
/// available miktarları eşlenir (best-effort; başarısız olursa özet gizlenir).
@MainActor
final class ProductListViewModel: ObservableObject {
    @Published var query: String = ""
    @Published var statusFilter: ProductStatus? = .published   // nil = tümü; varsayılan yayındakiler
    @Published private(set) var products: [Product] = []
    @Published private(set) var isLoading = false
    @Published private(set) var isLoadingMore = false
    @Published var errorMessage: String?
    /// SKU → available miktar (stok özeti için).
    @Published private(set) var stockBySKU: [String: Int] = [:]

    private let pageSize = 20
    private var offset = 0
    private var total = 0
    private let client: MedusaAPIClient

    init(client: MedusaAPIClient) { self.client = client }

    var canLoadMore: Bool { products.count < total }

    /// Baştan yükler (arama/filtre değişiminde veya pull-to-refresh'te).
    func reload() async {
        offset = 0
        total = 0
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let resp = try await client.products(
                limit: pageSize, offset: 0,
                query: query.isEmpty ? nil : query,
                status: statusFilter)
            products = resp.products
            total = resp.count
            offset = resp.products.count
            await loadStockSummary(for: resp.products)
        } catch let e as APIError {
            errorMessage = e.userMessage
            products = []
        } catch {
            errorMessage = APIError.transport(error.localizedDescription).userMessage
            products = []
        }
    }

    /// Sonraki sayfayı ekler.
    func loadMoreIfNeeded(current item: Product) async {
        guard canLoadMore, !isLoadingMore, !isLoading else { return }
        guard let last = products.last, last.id == item.id else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let resp = try await client.products(
                limit: pageSize, offset: offset,
                query: query.isEmpty ? nil : query,
                status: statusFilter)
            products.append(contentsOf: resp.products)
            offset += resp.products.count
            total = resp.count
            await loadStockSummary(for: resp.products)
        } catch {
            // Sessiz: sonraki sayfa hatası mevcut listeyi bozmaz.
        }
    }

    /// Varyant SKU'ları için available stok özeti (best-effort, hata yutulur).
    private func loadStockSummary(for products: [Product]) async {
        let skus = Set(products.flatMap { ($0.variants ?? []).compactMap { $0.sku } })
        guard !skus.isEmpty else { return }
        do {
            // Tek sayfada makul üst sınır; eşleşen SKU'lar map'lenir.
            let page = try await client.inventoryItems(limit: 200, offset: 0)
            for item in page.inventoryItems {
                if let sku = item.sku, skus.contains(sku) {
                    stockBySKU[sku] = item.availableQuantity
                }
            }
        } catch {
            // özet opsiyonel
        }
    }

    /// Bir ürünün toplam available stoğu (bilinen SKU'lar toplamı) — bilinmezse nil.
    func stockSummary(for product: Product) -> Int? {
        let skus = (product.variants ?? []).compactMap { $0.sku }
        let known = skus.compactMap { stockBySKU[$0] }
        guard !known.isEmpty else { return nil }
        return known.reduce(0, +)
    }
}

struct ProductListView: View {
    @StateObject private var vm: ProductListViewModel
    private let client: MedusaAPIClient
    @State private var didLoad = false

    init(client: MedusaAPIClient) {
        self.client = client
        _vm = StateObject(wrappedValue: ProductListViewModel(client: client))
    }

    var body: some View {
        NavigationStack {
            List {
                filterPicker
                if let error = vm.errorMessage {
                    Text(error)
                        .font(BrandTypography.footnote)
                        .foregroundStyle(BrandColor.danger)
                        .listRowBackground(BrandColor.background)
                }
                ForEach(vm.products) { product in
                    NavigationLink {
                        ProductDetailView(client: client, productId: product.id,
                                          initialProduct: product)
                    } label: {
                        ProductRow(product: product, stock: vm.stockSummary(for: product))
                    }
                    .listRowBackground(BrandColor.surface)
                    .task { await vm.loadMoreIfNeeded(current: product) }
                }
                if vm.isLoadingMore {
                    HStack { Spacer(); ProgressView(); Spacer() }
                        .listRowBackground(BrandColor.background)
                }
                if !vm.isLoading && vm.products.isEmpty && vm.errorMessage == nil {
                    Text("Ürün bulunamadı.")
                        .font(BrandTypography.body)
                        .foregroundStyle(BrandColor.textSecondary)
                        .listRowBackground(BrandColor.background)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(BrandColor.background)
            .navigationTitle("Ürünler")
            .searchable(text: $vm.query, prompt: "Ürün ara")
            .onSubmit(of: .search) { Task { await vm.reload() } }
            .onChange(of: vm.statusFilter) { _, _ in Task { await vm.reload() } }
            .refreshable { await vm.reload() }
            .overlay {
                if vm.isLoading && vm.products.isEmpty {
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
            Text("Tümü").tag(ProductStatus?.none)
            Text("Yayında").tag(ProductStatus?.some(.published))
            Text("Taslak").tag(ProductStatus?.some(.draft))
        }
        .pickerStyle(.segmented)
        .listRowBackground(BrandColor.background)
        .accessibilityLabel(Text("Ürün durumu filtresi"))
    }
}

/// Tek ürün satırı: küçük görsel, başlık, durum rozeti, TRY fiyat, stok özeti.
struct ProductRow: View {
    let product: Product
    let stock: Int?

    var body: some View {
        HStack(spacing: BrandSpacing.md) {
            thumbnail
            VStack(alignment: .leading, spacing: BrandSpacing.xs) {
                Text(product.title)
                    .font(BrandTypography.headline)
                    .foregroundStyle(BrandColor.textPrimary)
                    .lineLimit(2)
                HStack(spacing: BrandSpacing.sm) {
                    statusBadge
                    if let price = product.primaryTRYPrice {
                        Text(PriceFormatter.string(amount: price))
                            .font(BrandTypography.priceValue)
                            .foregroundStyle(BrandColor.textPrimary)
                    }
                }
                if let stock {
                    Text("Stok: \(stock)")
                        .font(BrandTypography.caption)
                        .foregroundStyle(stock <= 5 ? BrandColor.warning : BrandColor.textSecondary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, BrandSpacing.xs)
        .accessibilityElement(children: .combine)
    }

    private var thumbnail: some View {
        AsyncImage(url: product.thumbnail.flatMap(URL.init(string:))) { phase in
            switch phase {
            case .success(let image):
                image.resizable().aspectRatio(contentMode: .fill)
            default:
                ZStack {
                    BrandColor.separator
                    Image(systemName: "photo")
                        .foregroundStyle(BrandColor.textSecondary)
                }
            }
        }
        .frame(width: 56, height: 56)
        .clipShape(RoundedRectangle(cornerRadius: BrandLayout.cornerRadius))
        .accessibilityHidden(true)
    }

    private var statusBadge: some View {
        let kind: BrandStatusBadge.Kind = product.status == .published ? .success
            : product.status == .draft ? .neutral : .warning
        return BrandStatusBadge(product.status.displayName, kind: kind)
    }
}
