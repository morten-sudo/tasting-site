import Foundation
import Security
import Supabase

/// Which database the app talks to, chosen when it is built, never in the app (as the site's src/lib/config.ts):
/// the test build (Debug, com.winetastr.app.dev) uses the test database `winetastr-test` and shows a "Test" chip by
/// the logo; the real build (Release, com.winetastr.app) uses the live one. DB_TEST is set only in the app target's
/// Debug configuration (Winetastr.xcodeproj). Only the public (publishable) keys are here: access is enforced in the database.
enum AppDatabase {
#if DB_TEST
    static let isTest = true
    static let url = URL(string: "https://piiuhgzsnphhuceojldz.supabase.co")!
    static let key = "sb_publishable_fgw-aZhF7pXyTjdG-AgDjg_Pfqd_SIW"
#else
    static let isTest = false
    static let url = URL(string: "https://ydvdhhdpygzwalosbjcc.supabase.co")!
    static let key = "sb_publishable_J1p_UQdBFtKyEiT57AlZ2Q_2f9t38XC"
#endif
}
#if DB_TEST && !DEBUG
#error("The test database is for the test build (Debug) only: a release build must use the live database")
#endif

let supabase = SupabaseClient(
    supabaseURL: AppDatabase.url,
    supabaseKey: AppDatabase.key,
    options: SupabaseClientOptions(auth: .init(emitLocalSessionAsInitialSession: true))
)

struct Invite: Decodable { let name: String; let status: String?; let diet: String?; let note: String?; let email: String? }

struct TastingInfo: Decodable {
    let slug: String; let title: String; let starts_at: String?; let place: String?; let intro: String?
    let host_names: [String]?; let host_name: String?
    let coming: Int?; let full: Bool?; let signup_open: Bool?
    let ends_at: String?; let quiz_count: Int?; let quiz_open: Bool?; let quiz_finished: Bool?
    let orders_open: Bool?; let mobilepay: String?; let bulk_mode: String?
    /// The language the host writes the tasting in (the site marks its name and introduction with it)
    let language: String?
    var start: Date? { parseDate(starts_at) }
    var end: Date? { parseDate(ends_at) }
    var hosts: String? {
        let names = (host_names ?? [host_name].compactMap { $0 }).filter { !$0.isEmpty }
        return names.isEmpty ? nil : names.formatted(.list(type: .and).locale(appLocale))
    }
    /// "Host: Morten" or "Hosts: Morten and Erlingur"
    var hostLine: String? {
        guard let h = hosts else { return nil }
        let many = (host_names ?? []).filter { !$0.isEmpty }.count > 1
        return many ? L("tastingHome.hosts", ["names": h]) : L("tastingHome.host", ["name": h])
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
    let appellation_id: String?; let producer_lat: Double?; let producer_lon: Double?
    let orderable: Bool?; let ordered: Int?; let price_tiers: [PriceTier]?
    /// The bottle's size in cl (wines.bottle_cl, numeric): 75 unless set, null for a blind wine and from older databases
    var bottle_cl: FlexNumber?
    var isBlind: Bool { blind ?? false }
    /// "150 cl" / "37,5 cl" when the bottle is not an ordinary 75 cl one (bottleText in src/lib/bottle.ts)
    var bottleLine: String? { bottleText(bottle_cl?.value) }
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

/// A Postgres numeric: a JSON number, or a string should the server ever send one – never a reason to drop the wine
struct FlexNumber: Decodable, Hashable {
    let value: Double?
    init(_ value: Double?) { self.value = value }
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let d = try? c.decode(Double.self) { value = d }
        else if let s = try? c.decode(String.self) { value = Double(s.replacingOccurrences(of: ",", with: ".")) }
        else { value = nil }
    }
}

/// bottleText() in src/lib/bottle.ts: "150 cl", "37,5 cl" (Danish, Icelandic) or "37.5 cl" (English) – nil for an
/// ordinary 75 cl bottle or no size
func bottleText(_ cl: Double?) -> String? {
    guard let n = cl, n.isFinite, n != 75 else { return nil }
    return "\(n.formatted(.number.locale(appLocale).precision(.fractionLength(0...1)).grouping(.never))) cl"
}

/// nameWithSize(): "Quinta do Noval LBV · 150 cl" where only the wine's name is shown (order lines); the name alone at 75 cl
func nameWithSize(_ name: String, _ cl: Double?) -> String {
    bottleText(cl).map { "\(name) · \($0)" } ?? name
}

/// wineMeta() in src/lib/bottle.ts (WIN-170): the one meta line wherever a wine is listed – "Rød · 2019 · 150 cl ·
/// producer", the size after the vintage and none at 75 cl; without empties and repeats
func wineMeta(style: String?, vintage: String?, cl: Double?, producer: String?) -> String? {
    var out: [String] = []
    for x in [styleName(style), vintage, bottleText(cl), producer].compactMap({ $0 }) where !x.isEmpty && !out.contains(x) { out.append(x) }
    return out.isEmpty ? nil : out.joined(separator: " · ")
}

/// A quantity price: from qty bottles, price each
struct PriceTier: Decodable, Hashable { let qty: Int; let price: Double }

struct QuizOption: Decodable, Hashable { let key: String; let text: String }
struct QuizQuestion: Decodable, Identifiable { let id: Int; let sort_order: Int?; let question: String; let options: [QuizOption]; let correct_key: String?; let explanation: String? }
struct ChatMessage: Decodable, Identifiable {
    let id: Int; let author: String; let body: String; let created_at: String; let from_host: Bool; let mine: Bool
    var date: Date { parseDate(created_at) ?? .now }
}
extension ChatMessage {
    private enum CodingKeys: String, CodingKey { case id, author, body, created_at, from_host, mine }
    /// `mine` is read as optional and defaults to false: databases from before WIN-303 sent null for the host's messages.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(id: try c.decode(Int.self, forKey: .id), author: try c.decode(String.self, forKey: .author),
                  body: try c.decode(String.self, forKey: .body), created_at: try c.decode(String.self, forKey: .created_at),
                  from_host: try c.decodeIfPresent(Bool.self, forKey: .from_host) ?? false,
                  mine: try c.decodeIfPresent(Bool.self, forKey: .mine) ?? false)
    }
}
/// A line on the leaderboard (tasting_board): first names only for guests (WIN-173); `mine` marks the guest's own line
struct BoardRow: Decodable { let name: String; let points: Int; let answered: Int; var mine: Bool? = nil }

struct TastingPayment: Decodable { let amount: Double; let paid: Bool }

struct MyRating: Decodable { let wine_id: Int; let rating: Int?; let note: String? }
struct Profile: Decodable { let email: String?; let name: String?; let is_host: Bool? }

/// A wine in "My wine book" (my_wine_book)
struct BookWine: Decodable, Identifiable {
    let wine_id: Int; let name: String; let producer: String?; let vintage: String?; let style: String?; let image_url: String?
    let appellation: String?; let region: String?; let country: String?; let slug: String; let title: String; let starts_at: String?
    let sort_order: Int?; let rating: Int?; let note: String?; let rated_at: String?; let bought: Int
    /// The bottle's size in cl (WIN-170); missing from older databases, null for a blind wine (never in the book)
    var bottle_cl: FlexNumber?
    var id: String { "\(slug)-\(wine_id)" }
    var imageURL: URL? {
        guard let image_url, !image_url.isEmpty else { return nil }
        return URL(string: image_url.hasPrefix("/") ? "https://winetastr.com" + image_url : image_url)
    }
}

/// One line of an order (get_my_orders, my_orders); slug and title are filled in for the wine book
struct OrderLine: Decodable {
    let order_id: Int; let created_at: String; let paid: Bool; var slug: String?; var title: String?
    let wine_id: Int?; let wine_name: String; let quantity: Int; let unit_price: Double
    /// The wine's size now in cl (WIN-170): it follows the name, also for a wine made blind after the order; missing
    /// from older databases
    var bottle_cl: FlexNumber?
}

private struct CodeParam: Encodable, Sendable { let code: String }
private struct SetEmail: Encodable, Sendable { let code: String; let e: String }
private struct Respond: Encodable, Sendable { let code: String; let attending: Bool; let note: String? }
private struct Rate: Encodable, Sendable { let code: String; let w_id: Int; let stars: Int?; let note: String? }
private struct Usage: Encodable, Sendable { let feature: String }
private struct Codes: Encodable, Sendable { let codes: [String] }
private struct Answer: Encodable, Sendable { let code: String; let q_id: Int; let a_key: String }
private struct OrderItem: Encodable, Sendable { let wine_id: Int; let qty: Int }
private struct PlaceOrder: Encodable, Sendable { let code: String; let items: [OrderItem] }
private struct ChatAfter: Encodable, Sendable { let code: String; let after_id: Int }
private struct ChatPost: Encodable, Sendable { let code: String; let body: String }
private struct Board: Encodable, Sendable { let code: String; let slug: String? }

enum Backend {
    private static func decode<T: Decodable>(_ data: Data) throws -> T { try JSONDecoder().decode(T.self, from: data) }
    /// -bottleMock 150 (DEBUG): the first order line gets that size, for screenshots of the orders
    private static func mockOrderSize(_ lines: [OrderLine]) -> [OrderLine] {
        #if DEBUG
        if let s = UserDefaults.standard.string(forKey: "bottleMock"), let v = Double(s), !lines.isEmpty {
            var out = lines; out[0].bottle_cl = FlexNumber(v); return out
        }
        #endif
        return lines
    }

    static func invite(_ code: String) async throws -> Invite? {
        let rows: [Invite] = try decode(try await supabase.rpc("get_invite", params: CodeParam(code: code)).execute().data)
        return rows.first
    }
    static func tasting(_ code: String) async throws -> TastingInfo? {
        let data = try await supabase.rpc("get_tasting", params: CodeParam(code: code)).execute().data
        return try? decode(data)
    }
    static func wines(_ code: String) async throws -> [Wine] {
        var list: [Wine] = try decode(try await supabase.rpc("get_wines", params: CodeParam(code: code)).execute().data)
        #if DEBUG
        // Screenshots of a size that is not 75 cl, without changing the test data: -bottleMock 150 sets the first wine's
        if let s = UserDefaults.standard.string(forKey: "bottleMock"), let v = Double(s), let i = list.firstIndex(where: { !$0.isBlind }) {
            list[i].bottle_cl = FlexNumber(v)
        }
        #endif
        return list
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
    static func inviteIsMine(_ code: String) async -> Bool {
        guard let data = try? await supabase.rpc("invite_is_mine", params: CodeParam(code: code)).execute().data else { return true }
        return (try? JSONDecoder().decode(Bool.self, from: data)) ?? true
    }
    static func linkMe() async { _ = try? await supabase.rpc("link_me_tastings").execute() }
    /// Sends the order; returns its number
    static func placeOrder(_ code: String, _ items: [(Int, Int)]) async throws -> Int {
        try decode(try await supabase.rpc("place_order", params: PlaceOrder(code: code, items: items.map { OrderItem(wine_id: $0.0, qty: $0.1) })).execute().data)
    }
    static func chat(_ code: String, after: Int) async throws -> [ChatMessage] {
        try decode(try await supabase.rpc("get_chat", params: ChatAfter(code: code, after_id: after)).execute().data)
    }
    static func postChat(_ code: String, _ body: String) async throws {
        try await supabase.rpc("post_chat", params: ChatPost(code: code, body: body)).execute()
    }
    static func quiz(_ code: String) async throws -> [QuizQuestion] {
        try decode(try await supabase.rpc("get_quiz", params: CodeParam(code: code)).execute().data)
    }
    static func myAnswers(_ code: String) async throws -> [Int: String] {
        struct Row: Decodable { let question_id: Int; let answer_key: String }
        let rows: [Row] = try decode(try await supabase.rpc("get_my_answers", params: CodeParam(code: code)).execute().data)
        return Dictionary(rows.map { ($0.question_id, $0.answer_key) }, uniquingKeysWith: { $1 })
    }
    static func submitAnswer(_ code: String, question: Int, key: String) async throws {
        try await supabase.rpc("submit_answer", params: Answer(code: code, q_id: question, a_key: key)).execute()
    }
    static func leaderboard(_ code: String) async throws -> [BoardRow] {
        try decode(try await supabase.rpc("tasting_board", params: Board(code: code, slug: nil)).execute().data)
    }
    /// The tasting's own price for the guest, when the host has set one
    static func payment(_ code: String) async throws -> TastingPayment? {
        let rows: [TastingPayment] = try decode(try await supabase.rpc("get_tasting_payment", params: CodeParam(code: code)).execute().data)
        return rows.first
    }
    static func wineBook(_ codes: [String]) async throws -> [BookWine] {
        var list: [BookWine] = try decode(try await supabase.rpc("my_wine_book", params: Codes(codes: codes)).execute().data)
        #if DEBUG
        // -bottleMock 150: the first wine of the book gets that size (screenshots without changing the test data)
        if let s = UserDefaults.standard.string(forKey: "bottleMock"), let v = Double(s), !list.isEmpty { list[0].bottle_cl = FlexNumber(v) }
        #endif
        return list
    }
    static func myOrders(_ code: String) async throws -> [OrderLine] {
        mockOrderSize(try decode(try await supabase.rpc("get_my_orders", params: CodeParam(code: code)).execute().data))
    }
    /// Signed in: every order of the email, with the tasting
    static func allMyOrders() async throws -> [OrderLine] {
        mockOrderSize(try decode(try await supabase.rpc("my_orders").execute().data))
    }
    static func profile() async throws -> Profile? {
        try? decode(try await supabase.rpc("my_profile").execute().data)
    }
    /// A shared list the site reads straight from its table (the appellations, regions and places for the maps)
    static func table<T: Decodable>(_ name: String, _ columns: String) async throws -> [T] {
        try decode(try await supabase.from(name).select(columns).execute().data)
    }
    static func logLogin() async { _ = try? await supabase.rpc("log_usage", params: Usage(feature: "login")).execute() }
}

func dbMessage(_ error: Error) -> String {
    (error as? PostgrestError)?.message ?? String(describing: error)
}

/// The invite codes on this device, kept in the keychain (they give access to the guest's invitation).
enum CodeStore {
    /// The test build keeps its own codes, so a code from one database is never sent to the other
    private static let account = AppDatabase.isTest ? "guest_codes_test" : "guest_codes"
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
