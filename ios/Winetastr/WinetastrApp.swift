import SwiftUI
import Network
import Supabase

@main
struct WinetastrApp: App {
    @State private var model = AppModel()

    init() {
        WTFonts.register()
        // Room for the wines' pictures, so they also show without network (WIN-287)
        URLCache.shared = URLCache(memoryCapacity: 20_000_000, diskCapacity: 200_000_000)
    }

    var body: some Scene {
        WindowGroup {
            RootView().environment(model).tint(Color.bordeaux).preferredColorScheme(.light)
        }
    }
}

enum Route: Hashable {
    case tasting(MyTasting)
    case wine(MyTasting, Wine, Int)
    case book
    case profile
    case cart(MyTasting)
}

@MainActor @Observable
final class AppModel {
    private(set) var ready = false
    private(set) var signedInEmail: String?
    private(set) var hasCodes = false
    /// The network as the phone sees it; when it comes back, stars and notes that could not be saved are sent (WIN-287)
    private(set) var online = true {
        didSet { if online && !oldValue { Task { await RatingOutbox.shared.flushAll() } } }
    }
    private var pathOnline = true
    var path: [Route] = [] { didSet { if path.isEmpty { tastingTab = .home } } }
    var tastingTab = TastingTab.home
    /// The menu open in the top bar or on the page (one at a time, as on the site)
    var openMenu: MenuID?
    /// The guest's tastings (for the switcher under the tasting's name) and the one open now
    var myTastings: [MyTasting] = []
    var currentTasting: String?
    /// The open tasting has a quiz: its tab shows
    var tastingHasQuiz = false
    /// The carts on this device, per tasting: wine → bottles (the test build keeps its own, as with the codes)
    private static let cartsKey = AppDatabase.isTest ? "carts_test" : "carts"
    var carts: [String: [Int: Int]] = {
        guard let data = UserDefaults.standard.data(forKey: AppModel.cartsKey), let c = try? JSONDecoder().decode([String: [Int: Int]].self, from: data) else { return [:] }
        return c
    }()
    func saveCarts() { UserDefaults.standard.set(try? JSONEncoder().encode(carts), forKey: AppModel.cartsKey) }
    /// The language shown; changing it redraws every screen in place (the stack of screens is kept)
    private(set) var language = AppLanguage.code
    private let monitor = NWPathMonitor()

    func setLanguage(_ code: String) {
        guard code != language else { return }
        UserDefaults.standard.set(code, forKey: AppLanguage.key)
        AppLanguage.chosen = code
        // The phone's own texts (dates, the keyboard) follow from the next start
        UserDefaults.standard.set([code], forKey: "AppleLanguages")
        language = code
    }

    init() {
        monitor.pathUpdateHandler = { [weak self] p in
            Task { @MainActor in self?.pathOnline = p.status == .satisfied; self?.updateOnline() }
        }
        monitor.start(queue: DispatchQueue(label: "network"))
        #if DEBUG
        // -offlineAfter / -onlineAfter (NetHook): the pretend flight mode follows the clock
        if UserDefaults.standard.object(forKey: "offlineAfter") != nil {
            _ = NetHook.started
            Task { @MainActor [weak self] in
                while let self { self.updateOnline(); try? await Task.sleep(for: .milliseconds(500)) }
            }
        }
        #endif
    }

    private func updateOnline() {
        var on = pathOnline
        #if DEBUG
        if NetHook.forcedOffline { on = false }
        #endif
        if on != online { online = on }
    }

    var isIn: Bool { signedInEmail != nil || hasCodes }

    func start() async {
        #if DEBUG
        if UserDefaults.standard.bool(forKey: "resetData") { CodeStore.save([:]); carts = [:]; saveCarts(); WineCache.clearAll(); RatingOutbox.shared.clearAll(); try? await supabase.auth.signOut(scope: .local) }
        if let code = UserDefaults.standard.string(forKey: "inviteCode"), let info = try? await Backend.tasting(code) {
            CodeStore.save([info.slug: code])
        }
        #endif
        signedInEmail = (try? await supabase.auth.session)?.user.email
        hasCodes = !CodeStore.all().isEmpty
        // Stars and notes left unsaved last time (WIN-287)
        Task { await RatingOutbox.shared.flushAll() }
        #if DEBUG
        if let r = UserDefaults.standard.string(forKey: "route"), ["wines", "wine", "blind"].contains(r) { tastingTab = .wines }
        if UserDefaults.standard.string(forKey: "route") == "quiz" { tastingTab = .quiz }
        if UserDefaults.standard.string(forKey: "route") == "chat" { tastingTab = .chat }
        #endif
        ready = true
    }

    func didSignIn(email: String) async {
        signedInEmail = email
        await Backend.linkMe()
    }

    func didAddCode(slug: String, code: String) {
        CodeStore.set(slug: slug, code: code)
        hasCodes = true
    }

    func signOut() async {
        // What is not saved yet gets one last try; then the guest's copy of the wines goes with the codes (WIN-287)
        await RatingOutbox.shared.flushAll()
        WineCache.clearAll(); RatingOutbox.shared.clearAll()
        CodeStore.save([:])
        try? await supabase.auth.signOut(scope: .local)
        signedInEmail = nil; hasCodes = false; path = []
    }

    /// Every tasting on this device: the signed-in email's invitations and the codes from pasted links.
    /// Without network: the list from what was stored last time (WIN-287), and tastingsStale says so; the call throws
    /// only when something was never stored
    func loadTastings() async throws -> [MyTasting] {
        do {
            let list = try await fetchTastings()
            tastingsStale = false
            return list
        } catch {
            guard let kept = keptTastings() else { throw error }
            tastingsStale = true
            return kept
        }
    }
    /// The tasting list came from the phone, not the database (WIN-287)
    private(set) var tastingsStale = false

    private func fetchTastings() async throws -> [MyTasting] {
        var list: [MyTasting] = []
        if let email = signedInEmail {
            list = try await Backend.myTastings(keepFor: email)
            for t in list { CodeStore.set(slug: t.slug, code: t.code) }
        }
        for (slug, code) in CodeStore.all() where !list.contains(where: { $0.slug == slug }) {
            guard let info = try await Backend.tasting(code, keep: true) else { continue }
            let invite = try await Backend.invite(code, keep: true)
            list.append(MyTasting(code: code, slug: info.slug, title: info.title, starts_at: info.starts_at, place: info.place, status: invite?.status))
        }
        return list
    }

    private func keptTastings() -> [MyTasting]? {
        var list: [MyTasting] = []
        if let email = signedInEmail {
            guard let kept = WineCache.myTastings(email) else { return nil }
            list = kept
        }
        for (slug, code) in CodeStore.all() where !list.contains(where: { $0.slug == slug }) {
            guard let info = WineCache.tasting(code) else { return nil }
            list.append(MyTasting(code: code, slug: info.slug, title: info.title, starts_at: info.starts_at, place: info.place, status: WineCache.invite(code)?.status))
        }
        return list
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        Group {
            if !model.ready {
                ZStack { Color.lodge.ignoresSafeArea(); LoadingState() }
            } else if model.isIn {
                HomeView()
            } else {
                LoginView()
            }
        }
        .id(model.language)
        .environment(\.locale, appLocale)
        .task {
            #if DEBUG
            await SelfTest.runIfAsked()
            #endif
            await model.start()
        }
        .overlay(alignment: .top) {
            // Signed in, the top bar has the strip (TopBar); before that, the note over the sign-in page
            if !model.online && !(model.ready && model.isIn) {
                Label(L("app.offline"), systemImage: "wifi.slash")
                    .font(.medium(13.6)).foregroundStyle(Color.white)
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .background(Color.paper, in: RoundedRectangle(cornerRadius: 8))
                    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                    .allowsHitTesting(false)
            }
        }
    }
}
