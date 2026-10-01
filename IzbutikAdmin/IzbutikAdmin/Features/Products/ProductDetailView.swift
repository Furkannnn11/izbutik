import SwiftUI

/// Ürün detay/düzenleme görünüm modeli.
///
/// Kurallar (§3.4, §4.2):
/// - Değişiklikler kaydetme onayı gerektirir (`confirm...` akışları).
/// - Başarılı mutation sonrası ürün yeniden GET edilerek server state doğrulanır.
/// - Fiyat girişi kayıpsız (`MoneyConverter`) major-unit `Decimal`'e çevrilir.
/// - Stok yalnız `location-level` üzerinden, negatif değer reddedilerek güncellenir.
@MainActor
final class ProductDetailViewModel: ObservableObject {
    @Published private(set) var product: Product
    @Published var title: String
    @Published var status: ProductStatus
    @Published private(set) var isSaving = false
    @Published private(set) var isRefreshing = false
    @Published var errorMessage: String?
    @Published var successMessage: String?

    let productId: String
    private let client: MedusaAPIClient

    init(client: MedusaAPIClient, productId: String, initialProduct: Product) {
        self.client = client
        self.productId = productId
        self.product = initialProduct
        self.title = initialProduct.title
        self.status = initialProduct.status
    }

    var hasFieldChanges: Bool {
        title.trimmingCharacters(in: .whitespacesAndNewlines) != product.title
            || status != product.status
    }

    /// Detayı yeniden çeker (server state doğrulama).
    func refresh() async {
        isRefreshing = true
        defer { isRefreshing = false }
        do {
            let fresh = try await client.product(id: productId)
            apply(fresh)
        } catch let e as APIError {
            errorMessage = e.userMessage
        } catch {
            errorMessage = APIError.transport(error.localizedDescription).userMessage
        }
    }

    /// Başlık + durum kaydeder, sonra yeniden GET ile doğrular.
    func saveFields() async {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            errorMessage = "Başlık boş olamaz."
            return
        }
        await runMutation {
            if trimmed != self.product.title {
                _ = try await self.client.updateProductFields(id: self.productId, title: trimmed)
            }
            if self.status != self.product.status {
                _ = try await self.client.updateProductStatus(id: self.productId, status: self.status)
            }
        }
    }

    /// Bir varyantın TRY fiyatını kaydeder (kullanıcı metninden kayıpsız çevrilir).
    func saveVariantPrice(variantId: String, rawInput: String) async {
        guard let amount = MoneyConverter.parseMajor(rawInput), amount >= 0 else {
            errorMessage = "Geçerli bir fiyat girin (ör. 749,90)."
            return
        }
        await runMutation {
            _ = try await self.client.updateVariantTRYPrice(
                productId: self.productId, variantId: variantId, amount: amount)
        }
    }

    /// Bir konum seviyesinin stoğunu günceller (negatif reddedilir), sonra doğrular.
    func saveInventory(itemId: String, locationId: String, rawInput: String) async {
        guard let qty = Int(rawInput.trimmingCharacters(in: .whitespaces)), qty >= 0 else {
            errorMessage = "Stok negatif olmayan bir tam sayı olmalı."
            return
        }
        await runMutation {
            _ = try await self.client.updateInventoryLevel(
                itemId: itemId, locationId: locationId, stockedQuantity: qty)
        }
    }

    /// Ortak mutation sarmalayıcı: kaydet → başarıda yeniden GET → mesaj.
    private func runMutation(_ op: @escaping () async throws -> Void) async {
        isSaving = true
        errorMessage = nil
        successMessage = nil
        defer { isSaving = false }
        do {
            try await op()
            let fresh = try await client.product(id: productId)  // server state doğrula
            apply(fresh)
            successMessage = "Değişiklik kaydedildi ve doğrulandı."
        } catch let e as APIError {
            errorMessage = e.userMessage
        } catch {
            errorMessage = APIError.transport(error.localizedDescription).userMessage
        }
    }

    private func apply(_ fresh: Product) {
        product = fresh
        title = fresh.title
        status = fresh.status
    }

    // InventoryEditor için köprü (client actor izolasyonu).
    func inventoryItemsPage() async throws -> [InventoryItem] {
        try await client.inventoryItems(limit: 200, offset: 0).inventoryItems
    }
    func locationLevels(itemId: String) async throws -> [InventoryLevel] {
        try await client.inventoryLocationLevels(itemId: itemId).inventoryLevels
    }
}

struct ProductDetailView: View {
    @StateObject private var vm: ProductDetailViewModel
    @State private var showFieldsConfirm = false

    init(client: MedusaAPIClient, productId: String, initialProduct: Product) {
        _vm = StateObject(wrappedValue: ProductDetailViewModel(
            client: client, productId: productId, initialProduct: initialProduct))
    }

    var body: some View {
        Form {
            gallerySection
            fieldsSection
            variantsSection
            if let ok = vm.successMessage {
                Section { Text(ok).foregroundStyle(BrandColor.success).font(BrandTypography.footnote) }
            }
            if let err = vm.errorMessage {
                Section { Text(err).foregroundStyle(BrandColor.danger).font(BrandTypography.footnote) }
            }
        }
        .scrollContentBackground(.hidden)
        .background(BrandColor.background)
        .navigationTitle(vm.product.title)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await vm.refresh() }
        .overlay { if vm.isSaving { savingOverlay } }
    }

    // MARK: - Görsel galeri (salt-okunur)
    @ViewBuilder
    private var gallerySection: some View {
        let urls = [vm.product.thumbnail]
            .compactMap { $0 }
            .compactMap { URL(string: $0) }
        if !urls.isEmpty {
            Section("Görseller (salt-okunur)") {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: BrandSpacing.md) {
                        ForEach(urls, id: \.absoluteString) { url in
                            AsyncImage(url: url) { phase in
                                if let img = phase.image {
                                    img.resizable().aspectRatio(contentMode: .fill)
                                } else {
                                    ZStack { BrandColor.separator; Image(systemName: "photo") }
                                }
                            }
                            .frame(width: 96, height: 96)
                            .clipShape(RoundedRectangle(cornerRadius: BrandLayout.cornerRadius))
                        }
                    }
                }
                .accessibilityLabel(Text("Ürün görselleri, salt-okunur"))
            }
        }
    }

    // MARK: - Başlık + durum
    private var fieldsSection: some View {
        Section("Ürün bilgisi") {
            TextField("Başlık", text: $vm.title, axis: .vertical)
                .font(BrandTypography.body)
            Picker("Durum", selection: $vm.status) {
                Text("Yayında").tag(ProductStatus.published)
                Text("Taslak").tag(ProductStatus.draft)
            }
            Button {
                showFieldsConfirm = true
            } label: {
                Text("Değişiklikleri kaydet")
            }
            .disabled(!vm.hasFieldChanges || vm.isSaving)
            .confirmationDialog("Değişiklikleri kaydet?",
                                isPresented: $showFieldsConfirm, titleVisibility: .visible) {
                Button("Kaydet") { Task { await vm.saveFields() } }
                Button("Vazgeç", role: .cancel) {}
            } message: {
                Text("Başlık ve durum güncellenecek. Onaylıyor musunuz?")
            }
        }
    }

    // MARK: - Varyant fiyat + stok
    @ViewBuilder
    private var variantsSection: some View {
        ForEach(vm.product.variants ?? []) { variant in
            VariantEditor(variant: variant, vm: vm)
        }
    }

    private var savingOverlay: some View {
        ZStack {
            Color.black.opacity(0.15).ignoresSafeArea()
            ProgressView("Kaydediliyor…")
                .padding(BrandSpacing.lg)
                .background(BrandColor.surface)
                .clipShape(RoundedRectangle(cornerRadius: BrandLayout.cornerRadius))
        }
    }
}

/// Tek varyant için fiyat ve stok düzenleyici (onaylı kaydet).
private struct VariantEditor: View {
    let variant: Variant
    @ObservedObject var vm: ProductDetailViewModel
    @State private var priceText: String = ""
    @State private var confirmPrice = false

    var body: some View {
        Section(variant.title ?? variant.sku ?? "Varyant") {
            HStack {
                Text("Fiyat (TRY)").font(BrandTypography.subheadline)
                Spacer()
                TextField("749,90", text: $priceText)
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(maxWidth: 120)
            }
            Button("Fiyatı kaydet") { confirmPrice = true }
                .disabled(priceText.isEmpty || vm.isSaving)
                .confirmationDialog("Fiyatı güncelle?",
                                    isPresented: $confirmPrice, titleVisibility: .visible) {
                    Button("Kaydet") {
                        Task { await vm.saveVariantPrice(variantId: variant.id, rawInput: priceText) }
                    }
                    Button("Vazgeç", role: .cancel) {}
                } message: {
                    Text("Bu varyantın TRY fiyatı \(priceText) olarak güncellenecek.")
                }

            InventoryEditor(sku: variant.sku, vm: vm)
        }
        .onAppear {
            if let p = variant.prices?.first(where: { ($0.currencyCode ?? "").lowercased() == "try" }) {
                priceText = NSDecimalNumber(decimal: p.amount).stringValue
            }
        }
    }
}

/// Varyant SKU'suna bağlı inventory item'ın konum seviyesi stoğunu düzenler.
private struct InventoryEditor: View {
    let sku: String?
    @ObservedObject var vm: ProductDetailViewModel
    @State private var level: InventoryLevel?
    @State private var itemId: String?
    @State private var stockText: String = ""
    @State private var loading = false
    @State private var confirm = false
    @State private var loadError: String?

    var body: some View {
        Group {
            if let sku {
                if let level, let itemId {
                    HStack {
                        Text("Stok").font(BrandTypography.subheadline)
                        Spacer()
                        TextField("0", text: $stockText)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .frame(maxWidth: 90)
                    }
                    Button("Stoğu kaydet") { confirm = true }
                        .disabled(stockText.isEmpty || vm.isSaving)
                        .confirmationDialog("Stoğu güncelle?",
                                            isPresented: $confirm, titleVisibility: .visible) {
                            Button("Kaydet") {
                                Task {
                                    await vm.saveInventory(itemId: itemId,
                                                           locationId: level.locationId,
                                                           rawInput: stockText)
                                    await loadLevel(sku: sku)
                                }
                            }
                            Button("Vazgeç", role: .cancel) {}
                        } message: {
                            Text("Depo stoğu \(stockText) olarak ayarlanacak.")
                        }
                } else if loading {
                    ProgressView().font(BrandTypography.caption)
                } else if let loadError {
                    Text(loadError).font(BrandTypography.caption)
                        .foregroundStyle(BrandColor.textSecondary)
                }
            }
        }
        .task { if let sku { await loadLevel(sku: sku) } }
    }

    /// SKU'dan inventory item'ı bulur, ilk konum seviyesini yükler.
    private func loadLevel(sku: String) async {
        loading = true
        loadError = nil
        defer { loading = false }
        do {
            let items = try await vm.inventoryItemsPage()
            guard let item = items.first(where: { $0.sku == sku }) else {
                loadError = "Stok kaydı bulunamadı."
                return
            }
            itemId = item.id
            let levels = try await vm.locationLevels(itemId: item.id)
            if let first = levels.first {
                level = first
                stockText = String(first.stockedQuantity)
            } else {
                loadError = "Konum seviyesi yok."
            }
        } catch {
            loadError = "Stok bilgisi alınamadı."
        }
    }
}
