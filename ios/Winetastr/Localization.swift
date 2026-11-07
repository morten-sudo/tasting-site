import Foundation

/// The app's languages, as on the site (LANGS in src/i18n/index.ts) – the ones the app has texts for.
let appLanguages: [(code: String, name: String)] = [("da", "Dansk"), ("en", "English"), ("is", "Íslenska")]

/// The language the app is shown in: the one picked in the app (the flag in the top bar, or the profile), else the phone's.
enum AppLanguage {
    static let key = "appLanguage"
    /// Picked during this run (the launch arguments of the tests outrank what is saved)
    static var chosen: String?
    static var code: String {
        if let chosen { return chosen }
        if let c = UserDefaults.standard.string(forKey: key), appLanguages.contains(where: { $0.code == c }) { return c }
        return Bundle.main.preferredLocalizations.first ?? "en"
    }
    private static var cache: (String, Bundle)?
    static var bundle: Bundle {
        let c = code
        if let cache, cache.0 == c { return cache.1 }
        let b = Bundle.main.path(forResource: c, ofType: "lproj").flatMap(Bundle.init(path:)) ?? .main
        cache = (c, b)
        return b
    }
}

/// A text from Localizable.xcstrings. Keys match the website's dictionaries where the text exists there.
/// With a whole number {n}, the form for that number is used when there is one, as t() on the site (WIN-335):
/// "<key>#one" when the language's plural rule says "one" ("1 is coming so far"), else the key itself.
func L(_ key: String, _ values: [String: String] = [:]) -> String {
    let bundle = AppLanguage.bundle
    var text = bundle.localizedString(forKey: key, value: nil, table: nil)
    if let s = values["n"], let n = Int(s), s.allSatisfy(\.isASCII), s.allSatisfy(\.isNumber),
       pluralForm(n, appLanguageCode) == "one" {
        let missing = "\u{0}"
        let one = bundle.localizedString(forKey: key + "#one", value: missing, table: nil)
        if one != missing, one != key + "#one" { text = one }
    }
    for (name, value) in values { text = text.replacingOccurrences(of: "{\(name)}", with: value) }
    return text
}

/// The plural form of a whole number in one of the app's languages, as Intl.PluralRules on the site (CLDR):
/// Danish and English "one" only for 1, Icelandic for numbers ending in 1 but not 11 (1, 21, 31, 101 – not 11, 111).
func pluralForm(_ n: Int, _ lang: String) -> String {
    switch lang {
    case "is": return n % 10 == 1 && n % 100 != 11 ? "one" : "other"
    default: return n == 1 ? "one" : "other"
    }
}

var appLocale: Locale { Locale(identifier: appLanguageCode) }
var appLanguageCode: String { AppLanguage.code }

private let isoFractional: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f
}()
private let isoPlain = ISO8601DateFormatter()

func parseDate(_ s: String?) -> Date? {
    guard let s else { return nil }
    return isoPlain.date(from: s) ?? isoFractional.date(from: s)
}

func whenText(_ date: Date) -> String {
    let f = DateFormatter(); f.locale = appLocale
    f.setLocalizedDateFormatFromTemplate("EEEEdMMMMHHmm")
    let text = f.string(from: date)
    return text.prefix(1).uppercased() + text.dropFirst()
}

/// "Om 37 dage", up to 60 days ahead, as on the site.
func countdownText(_ date: Date) -> String? {
    let cal = Calendar.current
    let days = cal.dateComponents([.day], from: cal.startOfDay(for: .now), to: cal.startOfDay(for: date)).day ?? -1
    guard (0...60).contains(days) else { return nil }
    let f = RelativeDateTimeFormatter(); f.locale = appLocale; f.dateTimeStyle = .named
    let text = f.localizedString(from: DateComponents(day: days))
    return text.prefix(1).uppercased() + text.dropFirst()
}

func krText(_ amount: Double) -> String {
    let f = NumberFormatter(); f.locale = Locale(identifier: "da_DK"); f.numberStyle = .decimal
    f.minimumFractionDigits = 2; f.maximumFractionDigits = 2
    return "\(f.string(from: NSNumber(value: amount)) ?? "\(amount)") kr."
}

func countryName(_ code: String?) -> String? {
    guard let code, !code.isEmpty else { return nil }
    return code.count == 2 ? (appLocale.localizedString(forRegionCode: code) ?? code) : code
}

func styleName(_ key: String?) -> String? {
    guard let key, !key.isEmpty else { return nil }
    let known = ["Red", "WhiteWine", "Rose", "Orange", "Sparkling", "Sweet", "Fortified", "Other"]
    return known.contains(key) ? L("style.\(key)") : key
}

func vintageText(_ vintage: String?) -> String? {
    guard let v = vintage, !v.isEmpty else { return nil }
    return v.range(of: #"^\d{4}$"#, options: .regularExpression) != nil ? L("wine.vintage", ["year": v]) : v
}
