import SwiftUI

/// Sipariş detayı görünüm modeli: `GET /admin/orders/{id}` ile kalemler, adres,
/// ödeme/fulfillment durumu ve toplamları getirir (§5.2). Salt-okunur — bu
/// adımda doğrulanmış bir sipariş mutation endpoint'i yoktur, bu yüzden sahte
/// aksiyon butonu GÖSTERİLMEZ.
@MainActor
final class OrderDetailViewModel: ObservableObject {
    @Published private(set) var order: OrderDetail?
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?

    private let client: MedusaAPIClient
    private let orderId: String

    init(client: MedusaAPIClient, orderId: String) {
        self.client = client
        self.orderId = orderId
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            order = try await client.order(id: orderId)
        } catch let e as APIError {
            errorMessage = e.userMessage
        } catch {
            errorMessage = APIError.transport(error.localizedDescription).userMessage
        }
    }
}

struct OrderDetailView: View {
    @StateObject private var vm: OrderDetailViewModel
    /// Detay gelene kadar liste satırından gelen özet ile başlık/durum gösterilir.
    private let initialOrder: Order?
    @State private var didLoad = false

    init(client: MedusaAPIClient, orderId: String, initialOrder: Order? = nil) {
        self.initialOrder = initialOrder
        _vm = StateObject(wrappedValue: OrderDetailViewModel(client: client, orderId: orderId))
    }

    private var displayId: Int { vm.order?.displayId ?? initialOrder?.displayId ?? 0 }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: BrandSpacing.lg) {
                if let error = vm.errorMessage {
                    errorBlock(error)
                }
                statusSection
                if let order = vm.order {
                    itemsSection(order)
                    addressSection(order)
                    totalsSection(order)
                } else if vm.isLoading {
                    HStack { Spacer(); ProgressView("Yükleniyor…"); Spacer() }
                        .padding(.vertical, BrandSpacing.xl)
                }
            }
            .padding(BrandSpacing.lg)
        }
        .background(BrandColor.background)
        .navigationTitle("Sipariş #\(displayId)")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await vm.load() }
        .task {
            guard !didLoad else { return }
            didLoad = true
            await vm.load()
        }
    }

    // MARK: - Durum

    private var statusSection: some View {
        let lifecycle = OrderStatusText.lifecycle(vm.order?.status ?? initialOrder?.status)
        let payment = OrderStatusText.payment(vm.order?.paymentStatus ?? initialOrder?.paymentStatus)
        let fulfillment = OrderStatusText.fulfillment(vm.order?.fulfillmentStatus ?? initialOrder?.fulfillmentStatus)
        let email = vm.order?.email ?? initialOrder?.email
        let created = vm.order?.createdAt ?? initialOrder?.createdAt
        return card(title: "Durum") {
            infoRow("Sipariş durumu", lifecycle)
            infoRow("Ödeme", payment)
            infoRow("Karşılama", fulfillment)
            if let email, !email.isEmpty { infoRow("Müşteri", email) }
            infoRow("Tarih", OrderDateFormatter.full(created))
        }
    }

    // MARK: - Kalemler

    private func itemsSection(_ order: OrderDetail) -> some View {
        let items = order.items ?? []
        return card(title: "Ürünler (\(items.count))") {
            if items.isEmpty {
                Text("Kalem bulunamadı.")
                    .font(BrandTypography.footnote)
                    .foregroundStyle(BrandColor.textSecondary)
            } else {
                ForEach(items) { item in
                    lineItemRow(item, currency: order.currencyCode)
                    if item.id != items.last?.id {
                        Divider().overlay(BrandColor.separator)
                    }
                }
            }
        }
    }

    private func lineItemRow(_ item: OrderLineItem, currency: String?) -> some View {
        HStack(alignment: .top, spacing: BrandSpacing.md) {
            AsyncImage(url: item.thumbnail.flatMap(URL.init(string:))) { phase in
                switch phase {
                case .success(let image): image.resizable().aspectRatio(contentMode: .fill)
                default:
                    ZStack { BrandColor.separator; Image(systemName: "photo").foregroundStyle(BrandColor.textSecondary) }
                }
            }
            .frame(width: 48, height: 48)
            .clipShape(RoundedRectangle(cornerRadius: BrandLayout.cornerRadius))
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: BrandSpacing.xxs) {
                Text(item.title)
                    .font(BrandTypography.callout)
                    .foregroundStyle(BrandColor.textPrimary)
                    .lineLimit(2)
                if let vt = item.variantTitle, !vt.isEmpty {
                    Text(vt)
                        .font(BrandTypography.caption)
                        .foregroundStyle(BrandColor.textSecondary)
                }
                Text("\(item.quantity) × \(PriceFormatter.string(amount: item.unitPrice, currencyCode: currency))")
                    .font(BrandTypography.caption)
                    .foregroundStyle(BrandColor.textSecondary)
            }
            Spacer(minLength: 0)
            Text(PriceFormatter.string(amount: item.total, currencyCode: currency))
                .font(BrandTypography.priceValue)
                .foregroundStyle(BrandColor.textPrimary)
        }
        .padding(.vertical, BrandSpacing.xs)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Adres

    private func addressSection(_ order: OrderDetail) -> some View {
        card(title: "Teslimat adresi") {
            if let lines = order.shippingAddress?.lines, !lines.isEmpty {
                VStack(alignment: .leading, spacing: BrandSpacing.xxs) {
                    ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                        Text(line)
                            .font(BrandTypography.footnote)
                            .foregroundStyle(BrandColor.textPrimary)
                    }
                }
                .accessibilityElement(children: .combine)
            } else {
                Text("Adres bilgisi yok.")
                    .font(BrandTypography.footnote)
                    .foregroundStyle(BrandColor.textSecondary)
            }
        }
    }

    // MARK: - Toplamlar

    private func totalsSection(_ order: OrderDetail) -> some View {
        card(title: "Toplamlar") {
            if let v = order.itemTotal { totalRow("Ara toplam", v, order.currencyCode) }
            if let v = order.discountTotal, v != 0 { totalRow("İndirim", v, order.currencyCode) }
            if let v = order.shippingTotal { totalRow("Kargo", v, order.currencyCode) }
            if let v = order.taxTotal { totalRow("Vergi", v, order.currencyCode) }
            Divider().overlay(BrandColor.separator)
            totalRow("Genel toplam", order.total, order.currencyCode, emphasized: true)
        }
    }

    // MARK: - Ortak parçalar

    private func card<Content: View>(title: String,
                                     @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: BrandSpacing.sm) {
            Text(title)
                .font(BrandTypography.headline)
                .foregroundStyle(BrandColor.textPrimary)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(BrandSpacing.lg)
        .background(BrandColor.surface)
        .clipShape(RoundedRectangle(cornerRadius: BrandLayout.cardCornerRadius))
    }

    private func infoRow(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top) {
            Text(label)
                .font(BrandTypography.footnote)
                .foregroundStyle(BrandColor.textSecondary)
            Spacer(minLength: BrandSpacing.md)
            Text(value)
                .font(BrandTypography.footnote)
                .foregroundStyle(BrandColor.textPrimary)
                .multilineTextAlignment(.trailing)
        }
        .accessibilityElement(children: .combine)
    }

    private func totalRow(_ label: String, _ amount: Decimal, _ currency: String?,
                          emphasized: Bool = false) -> some View {
        HStack {
            Text(label)
                .font(emphasized ? BrandTypography.headline : BrandTypography.footnote)
                .foregroundStyle(emphasized ? BrandColor.textPrimary : BrandColor.textSecondary)
            Spacer()
            Text(PriceFormatter.string(amount: amount, currencyCode: currency))
                .font(emphasized ? BrandTypography.headline.monospacedDigit() : BrandTypography.priceValue)
                .foregroundStyle(BrandColor.textPrimary)
        }
        .accessibilityElement(children: .combine)
    }

    private func errorBlock(_ error: String) -> some View {
        VStack(alignment: .leading, spacing: BrandSpacing.sm) {
            Text(error)
                .font(BrandTypography.footnote)
                .foregroundStyle(BrandColor.danger)
            Button("Tekrar dene") { Task { await vm.load() } }
                .font(BrandTypography.callout)
                .tint(BrandColor.accent)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(BrandSpacing.lg)
        .background(BrandColor.surface)
        .clipShape(RoundedRectangle(cornerRadius: BrandLayout.cardCornerRadius))
    }
}
