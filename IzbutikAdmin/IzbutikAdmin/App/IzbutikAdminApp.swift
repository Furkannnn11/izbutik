import SwiftUI

@main
struct IzbutikAdminApp: App {
    @StateObject private var session = SessionManager()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .tint(BrandColor.accent)
                .task { await session.restore() }
        }
    }
}
