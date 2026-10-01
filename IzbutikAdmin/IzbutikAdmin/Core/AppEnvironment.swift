import Foundation

/// Uygulama ortam yapılandırması.
///
/// - **Debug**: varsayılan backend `http://127.0.0.1:9000` (loopback dev).
///   ATS localhost istisnası YALNIZ Debug Info.plist'te tanımlı.
/// - **Release**: koda gömülü varsayılan YOK; kullanıcı geçerli bir **HTTPS**
///   URL girmek zorunda. `admin@izbutik.local` gibi kimlik bilgileri de koda
///   gömülmez.
public enum AppEnvironment {

    /// Derleme yapılandırmasına göre varsayılan backend URL (yalnız Debug'da dolu).
    public static var defaultBackendURL: String {
        #if DEBUG
        return "http://127.0.0.1:9000"
        #else
        return ""   // Release: kullanıcı HTTPS URL'i girmek zorunda
        #endif
    }

    /// Girilen backend URL'inin bu yapılandırmada kabul edilip edilmediği.
    ///
    /// Release'te yalnız `https://` şemalı, host'u dolu URL kabul edilir.
    /// Debug'da ek olarak loopback `http://127.0.0.1` / `http://localhost` de kabul.
    public static func isValidBackendURL(_ raw: String) -> Bool {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed),
              let scheme = url.scheme?.lowercased(),
              let host = url.host, !host.isEmpty else {
            return false
        }
        if scheme == "https" { return true }
        #if DEBUG
        if scheme == "http", host == "127.0.0.1" || host == "localhost" {
            return true
        }
        #endif
        return false
    }

    /// Release yapılandırmasında güvensiz (http) URL'i engellemek için mesaj.
    public static var backendURLRequirementText: String {
        #if DEBUG
        return "Geliştirme: http://127.0.0.1:9000 veya HTTPS adresi girin."
        #else
        return "Güvenlik için yalnız HTTPS (https://) adres kabul edilir."
        #endif
    }
}
