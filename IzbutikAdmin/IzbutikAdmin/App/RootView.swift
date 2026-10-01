import SwiftUI

/// Kök yönlendirme: oturum durumuna göre yükleniyor / giriş / ana sekmeler.
struct RootView: View {
    @EnvironmentObject private var session: SessionManager

    var body: some View {
        ZStack {
            BrandColor.background.ignoresSafeArea()
            switch session.state {
            case .loading:
                ProgressView("Yükleniyor…")
                    .tint(BrandColor.accent)
                    .accessibilityLabel(Text("İçerik yükleniyor"))
            case .loggedOut:
                LoginView()
            case .loggedIn:
                MainTabView()
            }
        }
    }
}

/// Ana sekmeler — özellik ekranları paylaşılan API istemcisini alır.
struct MainTabView: View {
    @EnvironmentObject private var session: SessionManager

    var body: some View {
        TabView {
            DashboardView(client: session.client)
                .tabItem { Label("Panel", systemImage: "square.grid.2x2") }
            ProductListView(client: session.client)
                .tabItem { Label("Ürünler", systemImage: "tag") }
            OrderListView(client: session.client)
                .tabItem { Label("Siparişler", systemImage: "shippingbox") }
        }
    }
}
