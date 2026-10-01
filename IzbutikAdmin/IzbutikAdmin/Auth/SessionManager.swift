import Foundation
import SwiftUI

/// Oturum durumu ve kimlik yönetimi (uygulama geneli).
///
/// JWT ve backend URL Keychain'de tutulur; parola asla saklanmaz. İskelet
/// aşamasında (Adım 4) tam giriş ekranı Adım 5'te bağlanacak — burada durum
/// makinesi ve güvenli depolama altyapısı kurulur.
@MainActor
public final class SessionManager: ObservableObject {

    public enum State: Equatable {
        case loading          // Keychain'den durum okunuyor
        case loggedOut        // giriş gerekli
        case loggedIn         // geçerli oturum
    }

    @Published public private(set) var state: State = .loading
    @Published public var backendURL: String = AppEnvironment.defaultBackendURL

    private let keychain: KeychainStore
    private let api: MedusaAPIClient
    private var unauthorizedHandlerInstalled = false

    public init(keychain: KeychainStore = KeychainStore(),
                api: MedusaAPIClient = MedusaAPIClient()) {
        self.keychain = keychain
        self.api = api
    }

    /// API istemcisine 401 → güvenli logout geri aramasını bir kez bağlar.
    private func installUnauthorizedHandlerIfNeeded() async {
        guard !unauthorizedHandlerInstalled else { return }
        unauthorizedHandlerInstalled = true
        await api.setUnauthorizedHandler { [weak self] in
            // Aktör dışı bağlamdan ana iş parçacığına güvenli geçiş.
            Task { @MainActor in self?.handleUnauthorized() }
        }
    }

    /// Oturum sırasında (token doğrulanmış istek) 401 alınınca çağrılır:
    /// JWT'yi siler ve giriş ekranına döner.
    public func handleUnauthorized() {
        try? keychain.delete(KeychainStore.Key.jwt)
        Task { await api.setToken(nil) }
        if state != .loggedOut {
            errorMessage = "Oturumunuzun süresi doldu. Lütfen tekrar giriş yapın."
            state = .loggedOut
        }
    }

    /// Kullanıcıya gösterilecek son hata (giriş ekranı okur).
    @Published public var errorMessage: String?

    /// Uygulama açılışında saklı durumu geri yükler.
    public func restore() async {
        await installUnauthorizedHandlerIfNeeded()
        let storedURL = (try? keychain.get(KeychainStore.Key.backendURL)) ?? nil
        if let storedURL, !storedURL.isEmpty { backendURL = storedURL }

        let token = (try? keychain.get(KeychainStore.Key.jwt)) ?? nil
        await api.configure(backendURL: backendURL, token: token)

        guard let token, !token.isEmpty else {
            state = .loggedOut
            return
        }
        do {
            try await api.verifyToken()
            state = .loggedIn
        } catch {
            try? keychain.delete(KeychainStore.Key.jwt)
            await api.setToken(nil)
            state = .loggedOut
        }
    }

    /// Giriş: backend URL doğrula → JWT login → token'ı Keychain'e yaz.
    /// Parola hiçbir yerde saklanmaz; yalnız login isteğinin gövdesinde kullanılır.
    public func login(email: String, password: String) async throws {
        errorMessage = nil
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard AppEnvironment.isValidBackendURL(backendURL) else {
            let e = APIError.notConfigured
            errorMessage = e.userMessage
            throw e
        }
        guard !trimmedEmail.isEmpty, !password.isEmpty else {
            let msg = "E-posta ve parola boş bırakılamaz."
            errorMessage = msg
            throw APIError.transport(msg)
        }
        await installUnauthorizedHandlerIfNeeded()
        do {
            try keychain.set(backendURL, for: KeychainStore.Key.backendURL)
            await api.configure(backendURL: backendURL, token: nil)
            let token = try await api.login(email: trimmedEmail, password: password)
            try keychain.set(token, for: KeychainStore.Key.jwt)
            state = .loggedIn
        } catch let e as APIError {
            errorMessage = e.userMessage
            throw e
        }
    }

    /// Oturumu kapatır ve JWT'yi Keychain'den siler.
    public func logout() {
        try? keychain.delete(KeychainStore.Key.jwt)
        Task { await api.setToken(nil) }
        errorMessage = nil
        state = .loggedOut
    }

    /// Alt görünümlere paylaşılacak API istemcisi.
    public var client: MedusaAPIClient { api }
}
