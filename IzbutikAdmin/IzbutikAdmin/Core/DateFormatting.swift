import Foundation

/// ISO-8601 sipariş tarihlerini `tr_TR` yerelinde okunur biçime çevirir.
/// Medusa `created_at` alanı ISO-8601 (`2026-09-25T10:22:03.123Z`) döndürür.
public enum OrderDateFormatter {

    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let isoNoFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private static let display: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "tr_TR")
        f.dateFormat = "d MMM yyyy, HH:mm"
        return f
    }()

    private static let dateOnly: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "tr_TR")
        f.dateFormat = "d MMM yyyy"
        return f
    }()

    static func parse(_ raw: String?) -> Date? {
        guard let raw, !raw.isEmpty else { return nil }
        return iso.date(from: raw) ?? isoNoFraction.date(from: raw)
    }

    /// Tam tarih + saat ("25 Eyl 2026, 13:22"); parse edilemezse ham metin/"—".
    public static func full(_ raw: String?) -> String {
        guard let date = parse(raw) else { return (raw?.isEmpty == false ? raw! : "—") }
        return display.string(from: date)
    }

    /// Kısa tarih ("25 Eyl 2026"); liste satırları için.
    public static func short(_ raw: String?) -> String {
        guard let date = parse(raw) else { return (raw?.isEmpty == false ? raw! : "—") }
        return dateOnly.string(from: date)
    }
}
