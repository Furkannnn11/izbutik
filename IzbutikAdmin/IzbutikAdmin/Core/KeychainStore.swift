import Foundation
import Security

/// Keychain sarmalayıcı (`kSecClassGenericPassword`).
///
/// JWT ve parola gibi gizli değerler YALNIZ burada saklanır — UserDefaults,
/// log, dosya veya kaynağa asla yazılmaz. Backend URL gizli değildir ama
/// tutarlılık için aynı güvenli depoda tutulabilir.
public struct KeychainStore {

    public enum KeychainError: Error, Equatable {
        case unexpectedStatus(OSStatus)
    }

    private let service: String

    public init(service: String = "com.izbutik.admin") {
        self.service = service
    }

    /// Bir değeri kaydeder (varsa üzerine yazar).
    public func set(_ value: String, for key: String) throws {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)   // idempotent üzerine yazma

        var attributes = query
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let status = SecItemAdd(attributes as CFDictionary, nil)
        guard status == errSecSuccess else { throw KeychainError.unexpectedStatus(status) }
    }

    /// Bir değeri okur (yoksa nil).
    public func get(_ key: String) throws -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else { throw KeychainError.unexpectedStatus(status) }
        guard let data = item as? Data else { return nil }
        return String(decoding: data, as: UTF8.self)
    }

    /// Bir değeri siler (oturum kapatma).
    public func delete(_ key: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.unexpectedStatus(status)
        }
    }

    /// Anahtar sabitleri.
    public enum Key {
        public static let jwt = "jwt_token"
        public static let backendURL = "backend_url"
    }
}
