import Foundation
import Security
import Supabase

// The same project and public key as the website. Access is enforced in the database.
let supabase = SupabaseClient(
    supabaseURL: URL(string: "https://ydvdhhdpygzwalosbjcc.supabase.co")!,
    supabaseKey: "sb_publishable_J1p_UQdBFtKyEiT57AlZ2Q_2f9t38XC",
    options: SupabaseClientOptions(auth: .init(emitLocalSessionAsInitialSession: true))
)

struct Invite: Decodable { let name: String; let status: String?; let diet: String?; let note: String?; let email: String? }

struct TastingInfo: Decodable {
    let slug: String; let title: String; let starts_at: String?; let place: String?; let intro: String?
    let host_names: [String]?; let host_name: String?
    let coming: Int?; let full: Bool?; let signup_open: Bool?
    var start: Date? { parseDate(starts_at) }
    var hosts: String? {
        let names = (host_names ?? [host_name].compactMap { $0 }).filter { !$0.isEmpty }
        return names.isEmpty ? nil : names.formatted(.list(type: .and).locale(appLocale))
    }
}

struct MyTasting: Decodable, Hashable, Identifiable {
    let code: String; let slug: String; let title: String; let starts_at: String?; let place: String?; let status: String?
    var id: String { slug }
    var start: Date? { parseDate(starts_at) }
    var isPast: Bool { (start ?? .now) < Date.now.addingTimeInterval(-86_400) }
}

struct Wine: Decodable, Hashable, Identifiable {
    let id: Int; let sort_order: Int?; let name: String?; let producer: String?; let style: String?; let vintage: String?
    let abv: Double?; let price_dkk: Double?; let retail_price_dkk: Double?; let description: String?; let image_url: String?; let details: String?
    let country: String?; let region: String?; let appellation: String?; let producer_website: String?
    let producer_address: String?; let grapes: String?; let food_pairing: String?; let serving: String?; let blind: Bool?
    var isBlind: Bool { blind ?? false }
    var imageURL: URL? {
        guard let image_url, !image_url.isEmpty else { return nil }
        return URL(string: image_url.hasPrefix("/") ? "https://winetastr.com" + image_url : image_url)
    }
    /// As originLine on the site: appellation and region, without repeating a name.
    var originLine: String? {
        var parts: [String] = []
        for p in [appellation, region].compactMap({ $0 }) where !p.isEmpty && !parts.contains(where: { $0.caseInsensitiveCompare(p) == .orderedSame }) { parts.append(p) }
        return parts.isEmpty ? countryName(country) : parts.joined(separator: " · ")
    }
    var fullOrigin: String? {
        [originLine?.replacingOccurrences(of: " · ", with: ", "), parts(country)].compactMap { $0 }.joined(separator: ", ").nilIfEmpty
    }
    private func parts(_ c: String?) -> String? { let n = countryName(c); return n == originLine ? nil : n }
    var detailLines: [(label: String?, text: String)] {
        (details ?? "").split(separator: "\n").map { String($0).trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }.map { line in
            if let i = line.firstIndex(of: ":"), line.distance(from: line.startIndex, to: i) < 30 {
                return (String(line[..<i]), line[line.index(after: i)...].trimmingCharacters(in: .whitespaces))
            }
            return (nil, line)
        }
    }
}

struct MyRating: Decodable { let wine_id: Int; let rating: Int?; let note: String? }
struct Profile: Decodable { let email: String?; let name: String? }

private struct CodeParam: Encodable, Sendable { let code: String }
private struct EmailParam: Encodable, Sendable { let e: String }
private struct SetEmail: Encodable, Sendable { let code: String; let e: String }
private struct Respond: Encodable, Sendable { let code: String; let attending: Bool; let note: String? }
private struct Rate: Encodable, Sendable { let code: String; let w_id: Int; let stars: Int?; let note: String? }
private struct Usage: Encodable, Sendable { let feature: String }

enum Backend {
    private static func decode<T: Decodable>(_ data: Data) throws -> T { try JSONDecoder().decode(T.self, from: data) }

    static func invite(_ code: String) async throws -> Invite? {
        let rows: [Invite] = try decode(try await supabase.rpc("get_invite", params: CodeParam(code: code)).execute().data)
        return rows.first
    }
    static func tasting(_ code: String) async throws -> TastingInfo? {
        let data = try await supabase.rpc("get_tasting", params: CodeParam(code: code)).execute().data
        return try? decode(data)
    }
    static func wines(_ code: String) async throws -> [Wine] {
        try decode(try await supabase.rpc("get_wines", params: CodeParam(code: code)).execute().data)
    }
    static func ratings(_ code: String) async throws -> [Int: MyRating] {
        let rows: [MyRating] = try decode(try await supabase.rpc("get_my_ratings", params: CodeParam(code: code)).execute().data)
        return Dictionary(uniqueKeysWithValues: rows.map { ($0.wine_id, $0) })
    }
    static func rate(_ code: String, wine: Int, stars: Int?, note: String?) async throws {
        try await supabase.rpc("rate_wine", params: Rate(code: code, w_id: wine, stars: stars, note: note)).execute()
    }
    /// Returns the guest's new status: yes, waitlist or no.
    static func respond(_ code: String, attending: Bool, note: String?) async throws -> String {
        try decode(try await supabase.rpc("respond_invite", params: Respond(code: code, attending: attending, note: note)).execute().data)
    }
    static func setEmail(_ code: String, _ email: String) async throws {
        try await supabase.rpc("set_my_email", params: SetEmail(code: code, e: email)).execute()
    }
    static func myTastings() async throws -> [MyTasting] {
        try decode(try await supabase.rpc("my_tastings").execute().data)
    }
    static func emailKnown(_ email: String) async throws -> Bool {
        try decode(try await supabase.rpc("login_email_known", params: EmailParam(e: email)).execute().data)
    }
    static func inviteIsMine(_ code: String) async -> Bool {
        guard let data = try? await supabase.rpc("invite_is_mine", params: CodeParam(code: code)).execute().data else { return true }
        return (try? JSONDecoder().decode(Bool.self, from: data)) ?? true
    }
    static func linkMe() async { _ = try? await supabase.rpc("link_me_tastings").execute() }
    static func logLogin() async { _ = try? await supabase.rpc("log_usage", params: Usage(feature: "login")).execute() }
}

func dbMessage(_ error: Error) -> String {
    (error as? PostgrestError)?.message ?? String(describing: error)
}

/// The invite codes on this device, kept in the keychain (they give access to the guest's invitation).
enum CodeStore {
    private static let account = "guest_codes"
    private static var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrAccount as String: account, kSecAttrService as String: "com.winetastr.app"]
    }
    static func all() -> [String: String] {
        var q = query; q[kSecReturnData as String] = true
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return [:] }
        return (try? JSONDecoder().decode([String: String].self, from: data)) ?? [:]
    }
    static func save(_ codes: [String: String]) {
        SecItemDelete(query as CFDictionary)
        guard !codes.isEmpty, let data = try? JSONEncoder().encode(codes) else { return }
        var q = query; q[kSecValueData as String] = data
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(q as CFDictionary, nil)
    }
    static func set(slug: String, code: String) { var c = all(); c[slug] = code; save(c) }
}

/// The code from a pasted invitation link, or the code itself.
func extractInviteCode(_ text: String) -> String? {
    let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !t.isEmpty else { return nil }
    if let c = URLComponents(string: t), let k = c.queryItems?.first(where: { $0.name == "k" })?.value, !k.isEmpty { return k }
    return t.contains("/") || t.contains(" ") ? nil : t
}

extension String { var nilIfEmpty: String? { isEmpty ? nil : self } }
