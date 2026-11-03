import SwiftUI
import Network
import Supabase

@main
struct WinetastrApp: App {
    @State private var model = AppModel()

    init() { WTFonts.register() }

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
}

@MainActor @Observable
final class AppModel {
    private(set) var ready = false
    private(set) var signedInEmail: String?
    private(set) var hasCodes = false
    private(set) var online = true
    var path: [Route] = [] { didSet { if path.isEmpty { tastingTab = .home } } }
    var tastingTab = TastingTab.home
    /// The menu open in the top bar or on the page (one at a time, as on the site)
    var openMenu: MenuID?
    /// The open tasting has a quiz: its tab shows
    var tastingHasQuiz = false
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
            Task { @MainActor in self?.online = p.status == .satisfied }
        }
        monitor.start(queue: DispatchQueue(label: "network"))
    }

    var isIn: Bool { signedInEmail != nil || hasCodes }

    func start() async {
        #if DEBUG
        if UserDefaults.standard.bool(forKey: "resetData") { CodeStore.save([:]); try? await supabase.auth.signOut(scope: .local) }
        if let code = UserDefaults.standard.string(forKey: "inviteCode"), let info = try? await Backend.tasting(code) {
            CodeStore.save([info.slug: code])
        }
        #endif
        signedInEmail = (try? await supabase.auth.session)?.user.email
        hasCodes = !CodeStore.all().isEmpty
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
        CodeStore.save([:])
        try? await supabase.auth.signOut(scope: .local)
        signedInEmail = nil; hasCodes = false; path = []
    }

    /// Every tasting on this device: the signed-in email's invitations and the codes from pasted links.
    func loadTastings() async throws -> [MyTasting] {
        var list: [MyTasting] = []
        if signedInEmail != nil {
            list = try await Backend.myTastings()
            for t in list { CodeStore.set(slug: t.slug, code: t.code) }
        }
        for (slug, code) in CodeStore.all() where !list.contains(where: { $0.slug == slug }) {
            guard let info = try await Backend.tasting(code) else { continue }
            let invite = try await Backend.invite(code)
            list.append(MyTasting(code: code, slug: info.slug, title: info.title, starts_at: info.starts_at, place: info.place, status: invite?.status))
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
            if !model.online {
                Label(L("app.offline"), systemImage: "wifi.slash")
                    .font(.medium(13.6)).foregroundStyle(Color.white)
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .background(Color.paper, in: RoundedRectangle(cornerRadius: 8))
            }
        }
    }
}
