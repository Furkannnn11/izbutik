import Foundation

/// Para birimi biçimlendirme.
///
/// KRİTİK: Medusa v2 fiyatı **major-unit ondalık** döndürür (ör. `749.9` = 749,90 ₺).
/// v1'deki minor-unit (kuruş) DEĞİL — bu yüzden `*100` / `/100` YAPILMAZ.
/// Değerler `Decimal` ile tutulur, `tr_TR` yerelinde "749,90 ₺" olarak gösterilir.
public enum PriceFormatter {

    private static let currencyFormatter: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.locale = Locale(identifier: "tr_TR")
        f.currencyCode = "TRY"
        f.minimumFractionDigits = 2
        f.maximumFractionDigits = 2
        return f
    }()

    /// Medusa'dan gelen major-unit `Decimal` tutarı TRY olarak biçimlendirir.
    /// - Parameters:
    ///   - amount: major-unit tutar (ör. 749.90).
    ///   - currencyCode: gelen kod; "try" beklenir (büyük/küçük harf duyarsız).
    public static func string(amount: Decimal, currencyCode: String? = "try") -> String {
        let code = (currencyCode ?? "try").uppercased()
        if code == "TRY" {
            return currencyFormatter.string(from: amount as NSDecimalNumber)
                ?? "\(amount) ₺"
        }
        // TRY dışı bir kod gelirse yerelde o kodla biçimlendir.
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.locale = Locale(identifier: "tr_TR")
        f.currencyCode = code
        f.minimumFractionDigits = 2
        f.maximumFractionDigits = 2
        return f.string(from: amount as NSDecimalNumber) ?? "\(amount) \(code)"
    }
}
