import CryptoKit
import Foundation
import SwiftUI
import UIKit

/// WIN-287: the last fetched wine list and the guest's own ratings, kept on the device so the wines show without network.
/// One folder per invite code (named by a hash of it, so the code itself is never written to a file) – a guest only ever
/// sees what was fetched with their own code. The wines are stored exactly as get_wines returned them, so a blind wine
/// holds no more than the database gave (no name, picture or details). Everything is deleted at log out.
enum WineCache {
    private static let root: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        // The test build keeps its own, as with the codes and carts
        return base.appendingPathComponent(AppDatabase.isTest ? "wine-cache-test" : "wine-cache", isDirectory: true)
    }()

    static func folder(_ code: String) -> URL {
        let hash = SHA256.hash(data: Data(code.utf8)).map { String(format: "%02x", $0) }.joined()
        return root.appendingPathComponent(hash, isDirectory: true)
    }

    private static func write(_ data: Data, _ name: String, _ code: String) {
        let dir = folder(code)
        do {
            if !FileManager.default.fileExists(atPath: root.path) {
                try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
                // Not in the phone's backup: it is only a copy of what the database has
                var r = root; var v = URLResourceValues(); v.isExcludedFromBackup = true; try? r.setResourceValues(v)
            }
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            try data.write(to: dir.appendingPathComponent(name), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        } catch {}
    }
    private static func read(_ name: String, _ code: String) -> Data? { try? Data(contentsOf: folder(code).appendingPathComponent(name)) }

    /// get_wines' answer as it came
    static func saveWines(_ data: Data, code: String) { write(data, "wines.json", code) }
    static func wines(_ code: String) -> [Wine]? { read("wines.json", code).flatMap { try? JSONDecoder().decode([Wine].self, from: $0) } }

    static func saveRatings(_ ratings: [Int: MyRating], code: String) {
        if let data = try? JSONEncoder().encode(Array(ratings.values)) { write(data, "ratings.json", code) }
    }
    static func ratings(_ code: String) -> [Int: MyRating]? {
        guard let data = read("ratings.json", code), let rows = try? JSONDecoder().decode([MyRating].self, from: data) else { return nil }
        return Dictionary(rows.map { ($0.wine_id, $0) }, uniquingKeysWith: { $1 })
    }
    /// A rating that was just saved, so the stored copy agrees with the database until the next fetch
    static func setRating(_ code: String, wine: Int, stars: Int?, note: String?) {
        guard var r = ratings(code) else { return }
        r[wine] = MyRating(wine_id: wine, rating: stars, note: note)
        saveRatings(r, code: code)
    }

    static func savePending(_ data: Data?, code: String) {
        if let data { write(data, "pending.json", code) } else { try? FileManager.default.removeItem(at: folder(code).appendingPathComponent("pending.json")) }
    }
    static func pending(_ code: String) -> Data? { read("pending.json", code) }

    /// Log out: every guest's copy goes, and the pictures with it
    static func clearAll() {
        try? FileManager.default.removeItem(at: root)
        URLCache.shared.removeAllCachedResponses()
    }
}

/// WIN-287 (WIN-232): stars and notes that could not be saved wait here – on the device, per invite code – and are sent
/// when the network is back, also when the guest has left the wine's page.
@MainActor @Observable
final class RatingOutbox {
    static let shared = RatingOutbox()
    struct Pending: Codable, Equatable { var stars: Int?; var note: String? }
    /// code → wine → what is not saved yet
    private(set) var waiting: [String: [Int: Pending]] = [:]
    private var flushing: Task<Void, Never>?

    func pending(_ code: String, _ wine: Int) -> Pending? { load(code)[wine] }
    /// Reads what waits for this code from the device (before a page shows it)
    func prepare(_ code: String) { _ = load(code) }

    private func load(_ code: String) -> [Int: Pending] {
        if let p = waiting[code] { return p }
        let p = WineCache.pending(code).flatMap { try? JSONDecoder().decode([Int: Pending].self, from: $0) } ?? [:]
        waiting[code] = p
        return p
    }
    private func store(_ code: String, _ p: [Int: Pending]) {
        waiting[code] = p
        WineCache.savePending(p.isEmpty ? nil : try? JSONEncoder().encode(p), code: code)
    }

    /// The guest changed stars or the note: kept until it is saved
    func stage(_ code: String, wine: Int, stars: Int?, note: String?) {
        var p = load(code); p[wine] = Pending(stars: stars, note: note); store(code, p)
    }

    /// Sends what waits for this wine; true when it is saved (or nothing waited)
    @discardableResult func send(_ code: String, wine: Int) async -> Bool {
        guard let item = load(code)[wine] else { return true }
        do {
            try await Backend.rate(code, wine: wine, stars: item.stars, note: item.note)
            WineCache.setRating(code, wine: wine, stars: item.stars, note: item.note)
            // Only if the guest has not changed it again meanwhile
            var p = load(code); if p[wine] == item { p[wine] = nil; store(code, p) }
            return true
        } catch {
            return false
        }
    }

    /// The network is back (or the app starts): everything that waits, for every code on the device
    func flushAll() async {
        if let flushing { await flushing.value; return }
        let task = Task { @MainActor in
            for code in Set(CodeStore.all().values) {
                for wine in load(code).keys.sorted() { if !(await send(code, wine: wine)) { break } }
            }
        }
        flushing = task
        await task.value
        flushing = nil
    }

    func clearAll() { waiting = [:] }
}

/// The guest's stars with what is not saved yet on top
@MainActor func shownRatings(_ ratings: [Int: MyRating], code: String) -> [Int: MyRating] {
    var out = ratings
    for (wine, p) in RatingOutbox.shared.waiting[code] ?? [:] { out[wine] = MyRating(wine_id: wine, rating: p.stars, note: p.note) }
    return out
}

/// A wine's picture that also shows without network: from the phone's cache when the network is gone or fails
struct CachedImage<Placeholder: View>: View {
    @Environment(AppModel.self) private var model
    let url: URL
    @ViewBuilder var placeholder: Placeholder
    @State private var image: UIImage?
    @State private var failed = false

    var body: some View {
        Group {
            if let image { Image(uiImage: image).resizable().scaledToFit() }
            else if failed { placeholder }
            else { ProgressView().tint(Color.bordeaux) }
        }
        .task(id: url) { await load() }
        .onChange(of: model.online) { if model.online && failed { Task { await load() } } }
    }

    private func load() async {
        var policies: [URLRequest.CachePolicy] = [.returnCacheDataDontLoad]
        if model.online { policies.insert(.useProtocolCachePolicy, at: 0) }
        for policy in policies {
            if let got = try? await URLSession.shared.data(for: URLRequest(url: url, cachePolicy: policy)), let ui = UIImage(data: got.0) {
                image = ui; failed = false; return
            }
        }
        if image == nil { failed = true }
    }
}

/// Debug only (never in a Release build): pretend there is no network, for tests and screenshots, as the simulator has
/// no flight mode. -offlineAfter 10 -onlineAfter 40: no network from 10 to 40 seconds after the app started.
enum NetHook {
    #if DEBUG
    static let started = Date()
    static var forcedOffline: Bool {
        let d = UserDefaults.standard
        guard d.object(forKey: "offlineAfter") != nil else { return false }
        let t = Date().timeIntervalSince(started)
        let on = d.object(forKey: "onlineAfter") != nil ? d.double(forKey: "onlineAfter") : .infinity
        return t >= d.double(forKey: "offlineAfter") && t < on
    }
    #endif
    static func check() throws {
        #if DEBUG
        if forcedOffline { throw URLError(.notConnectedToInternet) }
        #endif
    }
}
