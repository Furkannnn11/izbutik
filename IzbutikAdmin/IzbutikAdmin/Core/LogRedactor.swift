import Foundation

/// Loglara sızabilecek gizli değerleri maskeleyen saf (yan etkisiz) yardımcı.
///
/// Kural: JWT / Bearer token, `password` alanı, `Authorization` header'ı ve
/// e-posta adresleri log satırlarında **asla** açık görünmez. Bu tip yalnız
/// string dönüştürür; kendisi hiçbir yere yazmaz. `AppLog` bunu kullanarak
/// `#if DEBUG` altında konsola yazar; Release'te log tamamen kapalıdır.
public enum LogRedactor {

    /// Maske metni.
    public static let mask = "***"

    // Bearer <token>  (token boşluğa kadar)
    private static let bearer = try! NSRegularExpression(
        pattern: #"(?i)(Bearer)\s+[A-Za-z0-9\-._~+/]+=*"#)

    // JSON "password":"...."  / "token":"...." / "jwt":"...."
    private static let jsonSecret = try! NSRegularExpression(
        pattern: #"(?i)"(password|token|jwt|access_token|refresh_token|api[_-]?key)"\s*:\s*"[^"]*""#)

    // Kaba JWT deseni: xxxxx.yyyyy.zzzzz (üç base64url parça)
    private static let rawJWT = try! NSRegularExpression(
        pattern: #"eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+"#)

    // E-posta
    private static let email = try! NSRegularExpression(
        pattern: #"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}"#)

    /// Verilen metindeki tüm gizli değerleri maskeler.
    public static func redact(_ input: String) -> String {
        var s = input
        s = replace(bearer, in: s, template: "$1 \(mask)")
        s = replace(jsonSecret, in: s) { m, str in
            // "key":"value" -> "key":"***"
            guard let keyRange = Range(m.range(at: 1), in: str) else { return mask }
            return "\"\(str[keyRange])\":\"\(mask)\""
        }
        s = replaceAll(rawJWT, in: s, with: mask)
        s = replaceAll(email, in: s, with: mask)
        return s
    }

    // MARK: - Regex yardımcıları

    private static func replace(_ re: NSRegularExpression, in s: String, template: String) -> String {
        let range = NSRange(s.startIndex..., in: s)
        return re.stringByReplacingMatches(in: s, range: range, withTemplate: template)
    }

    private static func replaceAll(_ re: NSRegularExpression, in s: String, with repl: String) -> String {
        let range = NSRange(s.startIndex..., in: s)
        return re.stringByReplacingMatches(in: s, range: range, withTemplate: repl)
    }

    /// Karmaşık değişim (kapanış ile) — eşleşmeleri sondan başa değiştirir.
    private static func replace(_ re: NSRegularExpression, in s: String,
                                _ transform: (NSTextCheckingResult, String) -> String) -> String {
        let ns = s as NSString
        let matches = re.matches(in: s, range: NSRange(location: 0, length: ns.length))
        guard !matches.isEmpty else { return s }
        var result = s
        for m in matches.reversed() {
            guard let r = Range(m.range, in: result) else { continue }
            result.replaceSubrange(r, with: transform(m, s))
        }
        return result
    }
}

/// Redaksiyonlu, yapılandırmaya duyarlı log cephesi.
///
/// - Release: hiçbir şey yazılmaz (gizli sızıntısı imkânsız).
/// - Debug: her satır `LogRedactor.redact` üzerinden geçirilerek yazılır.
public enum AppLog {
    /// Test edilebilirlik için son yazılan (redaksiyonlu) satır tutulur.
    public private(set) static var lastRedactedLine: String?

    public static func debug(_ message: @autoclosure () -> String) {
        let safe = LogRedactor.redact(message())
        lastRedactedLine = safe
        #if DEBUG
        print("[İzbutikAdmin] \(safe)")
        #endif
    }
}
