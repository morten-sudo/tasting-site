import Foundation

/// A text from Localizable.xcstrings. Keys match the website's dictionaries where the text exists there.
func L(_ key: String, _ values: [String: String] = [:]) -> String {
    var text = String(localized: String.LocalizationValue(key))
    for (name, value) in values { text = text.replacingOccurrences(of: "{\(name)}", with: value) }
    return text
}

/// The language the app is actually shown in (follows the phone, or Settings → Winetastr → Language).
var appLocale: Locale { Locale(identifier: Bundle.main.preferredLocalizations.first ?? "en") }
var appLanguageCode: String { Bundle.main.preferredLocalizations.first ?? "en" }

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
