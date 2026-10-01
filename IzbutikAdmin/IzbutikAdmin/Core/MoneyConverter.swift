import Foundation

/// TRY tutar dönüşümleri — **kayıpsız**, tamsayı kuruş tabanlı.
///
/// KRİTİK bağlam: Medusa v2 fiyatı **major-unit ondalık** (`749.9` = 749,90 ₺)
/// olarak döndürür ve bekler (v1'deki minor-unit/kuruş DEĞİL). Bu yüzden ağ
/// katmanında `*100` / `/100` YAPILMAZ — `amount` doğrudan major-unit `Decimal`.
///
/// Ancak UI kullanıcıya "749,90 ₺" gösterip düzenleme aldığında, kullanıcı
/// girişini (metin) güvenli biçimde `Decimal` major-unit'e çevirirken ve bir
/// tutarı "tam lira + kuruş" olarak ayrıştırırken kayan nokta (Double) hatası
/// oluşmamalıdır. Bu yardımcı tüm dönüşümleri `Decimal` / `Int` (kuruş) üzerinden
/// yapar; `Double` KULLANMAZ.
public enum MoneyConverter {

    /// Major-unit `Decimal` (ör. 749.90) → tamsayı kuruş (ör. 74990).
    /// Yarıya yuvarlama: `.plain` (bankacılık değil, standart yakın-yuvarlama)
    /// ama zaten 2 ondalık girişte yuvarlama tetiklenmez.
    public static func kurus(fromMajor amount: Decimal) -> Int {
        var scaled = amount * 100
        var rounded = Decimal()
        NSDecimalRound(&rounded, &scaled, 0, .plain)
        return (rounded as NSDecimalNumber).intValue
    }

    /// Tamsayı kuruş (ör. 74990) → major-unit `Decimal` (749.90).
    public static func major(fromKurus kurus: Int) -> Decimal {
        Decimal(kurus) / 100
    }

    /// Kullanıcının girdiği metni (ör. "749,90" veya "749.90") kayıpsız
    /// major-unit `Decimal`'e çevirir. Türkçe ondalık ayıracı virgül (`,`) ve
    /// nokta (`.`) kabul edilir; binlik ayıraç (`.` TR'de) desteklenmez —
    /// kullanıcıdan sade sayı beklenir. Geçersizse `nil`.
    ///
    /// - Note: `Decimal(string:)` yerine bileşen ayrıştırma kullanılır çünkü
    ///   `Decimal(string:)` yereli locale'e bağlıdır ve virgülü kaçırabilir.
    public static func parseMajor(_ raw: String) -> Decimal? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        // Virgülü noktaya normalize et (tek ondalık ayıraç varsayımı).
        let normalized = trimmed.replacingOccurrences(of: ",", with: ".")
        // Yalnız [0-9.] ve tek nokta kabul.
        let allowed = CharacterSet(charactersIn: "0123456789.")
        guard normalized.unicodeScalars.allSatisfy({ allowed.contains($0) }) else {
            return nil
        }
        guard normalized.filter({ $0 == "." }).count <= 1 else { return nil }
        // En fazla 2 ondalık hane (kuruş) — fazlası reddedilir (kayıp önleme).
        if let dot = normalized.firstIndex(of: ".") {
            let fraction = normalized.distance(from: normalized.index(after: dot),
                                               to: normalized.endIndex)
            if fraction > 2 { return nil }
        }
        // Locale-bağımsız ayrıştırma: NSDecimalNumber POSIX locale ile.
        let dec = NSDecimalNumber(string: normalized, locale: Locale(identifier: "en_US_POSIX"))
        if dec == NSDecimalNumber.notANumber { return nil }
        return dec as Decimal
    }
}
