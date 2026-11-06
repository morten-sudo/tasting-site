import Supabase
import SwiftUI

/// The guest's home (the site's /home/ with src/lib/guest-home.ts): the next tasting large, what is waiting, the other
/// tastings on the way, the wine book in short, where the wines come from, and the tastings they have been to.
struct HomeView: View {
    @Environment(AppModel.self) private var model
    @State private var tastings: [MyTasting] = []
    @State private var loaded = false
    @State private var failed = false
    @State private var showAddLink = false
    @State private var firstName = ""
    @State private var infos: [String: TastingInfo] = [:]
    @State private var nextWines: [Wine] = []
    @State private var nextMap: RegionDrawing?
    @State private var waiting: [WaitingItem] = []
    @State private var book: [BookWine] = []
    @State private var orders: [OrderLine] = []
    @State private var map: OverviewDrawing?

    struct WaitingItem: Identifiable {
        let id = UUID()
        let icon: String, title: String, meta: String?, label: String
        let go: () -> Void
    }

    private var upcoming: [MyTasting] { tastings.filter { !$0.isPast }.sorted { ($0.starts_at ?? "9999") < ($1.starts_at ?? "9999") } }
    private var past: [MyTasting] { tastings.filter(\.isPast).sorted { ($0.starts_at ?? "") > ($1.starts_at ?? "") } }

    var body: some View {
        @Bindable var model = model
        NavigationStack(path: $model.path) {
            VStack(spacing: 0) {
                TopBar()
                Rectangle().fill(Color.rule).frame(height: 1)
                ZStack(alignment: .top) {
                    PageBackground(path: "/home/")
                    content
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .background(Color.lodge)
            .siteMenus()
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $showAddLink) { AddInviteSheet { Task { await load() } } }
            .navigationDestination(for: Route.self) { route in
                switch route {
                case .tasting(let t): TastingView(tasting: t)
                case .wine(let t, let w, let n): WineDetailView(tasting: t, wine: w, position: n)
                case .book: BookView()
                case .profile: ProfileView()
                case .cart(let t): CartView(tasting: t)
                }
            }
        }
        .task { await load() }
        .onChange(of: model.online) { if model.online && failed { Task { await load() } } }
        .onChange(of: model.path) { if model.path.isEmpty && loaded { Task { await load() } } }
    }

    @ViewBuilder private var content: some View {
        if failed && tastings.isEmpty {
            ErrorState { Task { await load() } }
        } else if !loaded {
            LoadingState()
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: 40) {
                    PageTitle(text: L("home2.hello") + (firstName.isEmpty ? "" : ", \(firstName)"))
                    if tastings.isEmpty {
                        Card {
                            Text(L("app.noTastingsTitle")).font(.semibold(17)).foregroundStyle(Color.paper)
                            Text(L("tastings.noneHint")).font(.body()).foregroundStyle(Color.muted)
                            Button(L("app.addInvitation")) { showAddLink = true }.buttonStyle(PrimaryButton())
                        }
                        .padding(.top, -24)
                    } else {
                        if let next = upcoming.first { nextCard(next).padding(.top, -24) }
                        if !waiting.isEmpty { waitingBlock }
                        if upcoming.count > 1 {
                            section(L("home3.otherUpcoming")) {
                                ForEach(upcoming.dropFirst()) { t in NavigationLink(value: Route.tasting(t)) { TastingRow(tasting: t) }.buttonStyle(.plain) }
                            }
                        }
                        bookBlock
                        if let map {
                            section(L("home3.mapTitle")) {
                                VStack(alignment: .trailing, spacing: 4.8) {
                                    MapBox(drawing: .overview(map), label: L("home3.mapTitle"))
                                    MapCredit(sources: "Natural Earth")
                                }
                            }
                        }
                        if !past.isEmpty {
                            section(L("home3.memories")) {
                                ForEach(past) { t in
                                    NavigationLink(value: Route.tasting(t)) { TastingRow(tasting: t, showStatus: false, memory: memory(t)) }.buttonStyle(.plain)
                                }
                            }
                        }
                        // Another invitation: quietly at the end (the empty page has it as its one button)
                        Button(L("app.addInvitation")) { showAddLink = true }.buttonStyle(TextButton(size: 14.4, quiet: true)).padding(.top, -16)
                    }
                }
                .padding(16).padding(.bottom, 16)
            }
            #if DEBUG
            .defaultScrollAnchor(UserDefaults.standard.bool(forKey: "scrollBottom") ? .bottom : .top)
            #endif
            .refreshable { await load() }
        }
    }

    private func section<C: View>(_ title: String, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 12.8) {
            Eyebrow(text: title)
            content()
        }
    }

    // MARK: 1. The next tasting, large: the map of its wines behind, the countdown and answer, one way on

    private func nextCard(_ t: MyTasting) -> some View {
        let info = infos[t.slug]
        let invited = !["yes", "no", "waitlist"].contains(t.status ?? "")
        let quiz = info?.quiz_open == true && (info?.quiz_count ?? 0) > 0
        let (label, tab): (String, TastingTab) = invited && info?.signup_open != false ? (L("home3.answer"), .home)
            : quiz ? (L("home3.openQuiz"), .quiz) : (L("home3.seeWines"), .wines)
        return VStack(alignment: .leading, spacing: 11.2) {
            Eyebrow(text: L("dash.next"))
            let countdown = t.start.flatMap(countdownText)
            if countdown != nil || !invited {
                FlowRow(spacing: 5.6) {
                    if let countdown { Chip(text: countdown, tone: .wait) }
                    if !invited, let s = statusText(t.status) { Chip(text: s, tone: statusTone(t.status), dashed: t.status == "no") }
                }
            }
            Button { open(t, .home) } label: {
                Text(t.title).font(.display(34, relativeTo: .largeTitle)).foregroundStyle(Color.paper).multilineTextAlignment(.leading).lineSpacing(-2)
            }
            .buttonStyle(.plain)
            VStack(alignment: .leading, spacing: 7.2) {
                if let d = t.start { line("calendar", whenText(d)) }
                if let p = t.place, !p.isEmpty { line("pin", p) }
            }
            Button(label) { open(t, tab) }.buttonStyle(PrimaryButton(wide: false)).padding(.top, 4.8)
        }
        .padding(22.4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(alignment: .bottomTrailing) {
            // winesBackground(corner): the whole map in the card's lower right, faint and fading to the left
            if let nextMap {
                Canvas { ctx, size in nextMap.draw(&ctx, view: nextMap.view, size: size) }
                    .aspectRatio(nextMap.view.width / nextMap.view.height, contentMode: .fit)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                    .mask(LinearGradient(stops: [.init(color: .clear, location: 0.25), .init(color: .black, location: 0.8)], startPoint: .leading, endPoint: .trailing))
                    .opacity(0.3).allowsHitTesting(false).accessibilityHidden(true)
            }
        }
        .background(Color.surface)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.rule))
    }

    private func line(_ icon: String, _ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 9.6) {
            SiteIcon(icon, size: 19).foregroundStyle(Color.bordeaux).alignmentGuide(.firstTextBaseline) { $0[.bottom] - 4 }
            Text(text).font(.body(15.7)).foregroundStyle(Color.paper)
        }
    }

    private func open(_ t: MyTasting, _ tab: TastingTab) {
        model.path = [.tasting(t)]
        model.tastingTab = tab
    }

    // MARK: 2. Waiting for you

    private var waitingBlock: some View {
        section(L("home3.waiting")) {
            VStack(spacing: 0) {
                ForEach(Array(waiting.enumerated()), id: \.element.id) { i, item in
                    HStack(spacing: 12) {
                        SiteIcon(item.icon, size: 17).foregroundStyle(Color.bordeaux)
                            .frame(width: 32, height: 32).background(Color.lodge, in: Circle()).overlay(Circle().strokeBorder(Color.rule))
                        VStack(alignment: .leading, spacing: 1.6) {
                            Text(item.title).font(.medium(15.2)).foregroundStyle(Color.paper)
                            if let m = item.meta { Text(m).font(.body(14.4)).foregroundStyle(Color.muted) }
                        }
                        Spacer(minLength: 8)
                        Button(item.label, action: item.go).buttonStyle(SecondaryButton()).fixedSize()
                    }
                    .padding(.vertical, 11.2)
                    .overlay(alignment: .top) { if i > 0 { Rectangle().fill(Color.rule).frame(height: 1) } }
                }
            }
        }
    }

    // MARK: 3. The wine book in short: the numbers and the favourites

    private var favourites: [BookWine] {
        var seen = Set<Int>()
        return book.filter { ($0.rating ?? 0) >= 4 }
            .sorted { ($0.rating ?? 0) != ($1.rating ?? 0) ? ($0.rating ?? 0) > ($1.rating ?? 0) : ($0.rated_at ?? "") > ($1.rated_at ?? "") }
            .filter { seen.insert($0.wine_id).inserted }.prefix(3).map { $0 }
    }

    private var bookBlock: some View {
        let tasted = book.filter { $0.rating != nil || (parseDate($0.starts_at).map { $0 <= .now } ?? false) }
        return section(L("book.title")) {
            StatTiles(wines: Set(tasted.map(\.wine_id)).count, tastings: tastings.count, bottles: orders.reduce(0) { $0 + $1.quantity })
            let favs = favourites
            if !favs.isEmpty {
                Text(L("home3.favourites")).font(.semibold(16)).foregroundStyle(Color.paper).padding(.top, 9.6)
                ForEach(favs) { w in Button { Task { await model.openBookWine(w, in: tastings) } } label: { BookWineCard(wine: w) }.buttonStyle(.plain) }
            }
            Button { model.path = [.book] } label: { HStack(spacing: 5) { Text(L("home3.allBook")); SiteIcon("right", size: 15) } }
                .buttonStyle(TextButton())
        }
    }

    // MARK: 6. Memories: how many wines and the favourite

    private func memory(_ t: MyTasting) -> String? {
        let wines = book.filter { $0.slug == t.slug }
        guard !wines.isEmpty else { return nil }
        let n = Set(wines.map(\.wine_id)).count
        let fav = wines.filter { ($0.rating ?? 0) >= 4 }.max { ($0.rating ?? 0) < ($1.rating ?? 0) }
        return [n == 1 ? L("home3.winesOne") : L("home3.winesMany", ["n": "\(n)"]), fav.map { L("home3.favourite", ["name": nameWithSize($0.name, $0.bottle_cl?.value)]) }].compactMap { $0 }.joined(separator: " · ")
    }

    // MARK: Loading

    private func load() async {
        do {
            let list = try await model.loadTastings()
            tastings = list; failed = false
            model.myTastings = list
            let codes = Array(CodeStore.all().values)
            async let b = try? Backend.wineBook(codes)
            async let o = model.loadOrders(list)
            async let name = firstNameNow()
            var info: [String: TastingInfo] = [:]
            for t in upcoming { if let i = try? await Backend.tasting(t.code) { info[t.slug] = i } }
            infos = info
            book = await b ?? []; orders = await o; firstName = await name
            loaded = true
            #if DEBUG
            let route = UserDefaults.standard.string(forKey: "route")
            let test = list.first(where: { $0.slug == "app-test" }) ?? list.first
            if model.path.isEmpty, let route, let t = test {
                switch route {
                case "book": model.path = [.book]
                case "profile": model.path = [.profile]
                case "cart": model.path = [.tasting(t), .cart(t)]
                case "home": break
                default: model.path = [.tasting(t)]
                }
            }
            #endif
            await loadWaiting()
            #if DEBUG
            // Screenshots with a full page: what is waiting, favourites and memories, without changing the test data
            if UserDefaults.standard.bool(forKey: "homeMock") {
                let past = MyTasting(code: "x", slug: "barolo-and-friends", title: "Barolo and friends", starts_at: "2026-10-02T17:00:00Z", place: "Gl. Holte Gade 31, 2840 Holte", status: "yes")
                tastings.append(past); model.myTastings = tastings
                func bw(_ id: Int, _ name: String, _ prod: String, _ app: String, _ reg: String, _ c: String, _ r: Int) -> BookWine {
                    BookWine(wine_id: id, name: name, producer: prod, vintage: "2019", style: "Red", image_url: nil, appellation: app, region: reg, country: c,
                             slug: past.slug, title: past.title, starts_at: past.starts_at, sort_order: id, rating: r, note: nil, rated_at: nil, bought: id == 1 ? 2 : 0)
                }
                book = [bw(1, "Barolo Bussia", "Parusso", "Barolo", "Piemonte", "IT", 5), bw(2, "Barbaresco Asili", "Ceretto", "Barbaresco", "Piemonte", "IT", 4),
                        bw(3, "Château Fombrauge", "Fombrauge", "Saint-Émilion Grand Cru", "Bordeaux", "FR", 4), bw(4, "Langhe Nebbiolo", "Vajra", "Langhe", "Piemonte", "IT", 3)]
                waiting.append(WaitingItem(icon: "chat", title: L("home3.chatMany", ["n": "3", "title": "App-test"]), meta: nil, label: L("home3.read")) {})
                waiting.append(WaitingItem(icon: "cart", title: L("home3.payOrder", ["title": "Barolo and friends"]), meta: L("home3.toPay", ["total": krText(812.5)]), label: L("home3.pay")) {})
            }
            #endif
            if let next = upcoming.first, let wines = try? await Backend.wines(next.code), !wines.isEmpty {
                nextWines = wines
                nextMap = await cornerMap(wines)
            } else { nextMap = nil }
            map = await bookMap()
            #if DEBUG
            if let m = UserDefaults.standard.string(forKey: "openMenu") { model.openMenu = m == "tasting" ? .custom("tasting") : m == "language" ? .language : .account }
            #endif
        } catch {
            failed = true; loaded = true
        }
    }

    private func firstNameNow() async -> String {
        var name: String?
        if model.signedInEmail != nil {
            let user = try? await supabase.auth.session.user
            if case .string(let n)? = user?.userMetadata["name"], !n.isEmpty { name = n }
            if name == nil { name = (try? await Backend.profile())?.name }
        } else if let code = CodeStore.all().values.first {
            name = (try? await Backend.invite(code))?.name
        }
        return name.map { String($0.split(separator: " ").first ?? "") } ?? ""
    }

    /// What is waiting for the guest: answers, an open quiz, payments, new chat messages (as showWaiting on the site)
    private func loadWaiting() async {
        var rows: [WaitingItem] = []
        let soon: (MyTasting) -> Bool = { t in t.start.map { $0.timeIntervalSinceNow < 14 * 86_400 } ?? true }
        for t in upcoming {
            let i = infos[t.slug]
            if !["yes", "no", "waitlist"].contains(t.status ?? ""), i?.signup_open != false {
                rows.append(WaitingItem(icon: "mail", title: L("home3.answerQ", ["title": t.title]), meta: t.start.map(whenText), label: L("home3.answer")) { open(t, .home) })
            }
            if i?.quiz_open == true && (i?.quiz_count ?? 0) > 0 {
                rows.append(WaitingItem(icon: "question", title: L("home3.quizNow", ["title": t.title]), meta: nil, label: L("home3.openQuiz")) { open(t, .quiz) })
            }
        }
        // Orders not paid yet, one line per tasting with the total
        var unpaid: [(slug: String, title: String, total: Double)] = []
        for l in orders where !l.paid {
            let slug = l.slug ?? ""
            if let k = unpaid.firstIndex(where: { $0.slug == slug }) { unpaid[k].total += Double(l.quantity) * l.unit_price }
            else { unpaid.append((slug, l.title ?? slug, Double(l.quantity) * l.unit_price)) }
        }
        for u in unpaid {
            guard let t = tastings.first(where: { $0.slug == u.slug }) else { continue }
            rows.append(WaitingItem(icon: "cart", title: L("home3.payOrder", ["title": u.title]), meta: L("home3.toPay", ["total": krText(u.total)]), label: L("home3.pay")) {
                model.path = [.tasting(t), .cart(t)]
            })
        }
        // The evening's price, and new messages – only for the tastings near now
        let recent = upcoming.filter(soon) + past.filter { $0.start.map { -$0.timeIntervalSinceNow < 30 * 86_400 } ?? false }
        for t in recent {
            if let f = try? await Backend.payment(t.code), f.amount > 0, !f.paid {
                rows.append(WaitingItem(icon: "cart", title: L("home3.payFee", ["title": t.title]), meta: L("home3.toPay", ["total": krText(f.amount)]), label: L("home3.pay")) { open(t, .home) })
            }
            if soon(t) {
                let seen = UserDefaults.standard.integer(forKey: "wt-chat-seen:\(t.slug)")
                let n = ((try? await Backend.chat(t.code, after: seen)) ?? []).filter { !$0.mine }.count
                if n > 0 {
                    rows.append(WaitingItem(icon: "chat", title: n == 1 ? L("home3.chatOne", ["title": t.title]) : L("home3.chatMany", ["n": "\(n)", "title": t.title]),
                                            meta: nil, label: L("home3.read")) { open(t, .chat) })
                }
            }
        }
        waiting = rows
    }

    /// winesBackground(corner): the region of the next tasting's wines, the appellations with wines filled
    private func cornerMap(_ wines: [Wine]) async -> RegionDrawing? {
        guard let origins = await buildOrigins(wines, phone: false) else { return nil }
        return origins.hero
    }

    /// Where the wines come from: one numbered pin per place (the number of different wines), on the overview map
    private func bookMap() async -> OverviewDrawing? {
        struct Spot: MapWine {
            let id: Int; let region: String?; let appellation: String?; let appellation_id: String?; let country: String?
            let producer: String?; let producer_lat: Double?; let producer_lon: Double?
        }
        var byWine: [Int: BookWine] = [:]
        for w in book where byWine[w.wine_id] == nil { byWine[w.wine_id] = w }
        var groups: [String: (p: Place, n: Int)] = [:]; var order: [String] = []
        for w in byWine.values.sorted(by: { $0.wine_id < $1.wine_id }) {
            let spot = Spot(id: w.wine_id, region: w.region, appellation: w.appellation, appellation_id: nil, country: w.country, producer: w.producer, producer_lat: nil, producer_lon: nil)
            guard let p = await placeOf(spot) else { continue }
            let key = String(format: "%.1f,%.1f", p.lon, p.lat)
            if groups[key] == nil { groups[key] = (p, 0); order.append(key) }
            groups[key]!.n += 1
        }
        guard !order.isEmpty else { return nil }
        let list = order.map { groups[$0]! }
        let places = list.map(\.p)
        guard let ov = await MapStore.shared.overview(overviewFor(places)) else { return nil }
        return OverviewDrawing(ov, pins: list.map { .init(lon: $0.p.lon, lat: $0.p.lat, label: $0.p.label, n: $0.n) }, focus: await focusFor(places))
    }
}

/// .lcard
struct TastingRow: View {
    let tasting: MyTasting
    /// A tasting they have been to: the answer no longer says anything
    var showStatus = true
    /// The memory line in bordeaux: "6 vine · din favorit: Kopke Vintage"
    var memory: String? = nil
    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 5) {
                Text(tasting.title).font(.display(26, light: false, relativeTo: .title2)).foregroundStyle(Color.paper).multilineTextAlignment(.leading)
                if let d = tasting.start { Text(whenText(d)).font(.body(14.4)).foregroundStyle(Color.muted) }
                if let p = tasting.place, !p.isEmpty { Text(p).font(.body(14.4)).foregroundStyle(Color.muted) }
                if showStatus, let s = statusText(tasting.status) { Chip(text: s, tone: statusTone(tasting.status), dashed: tasting.status == "no").padding(.top, 4) }
                if let memory { Text(memory).font(.body(14.4)).foregroundStyle(Color.bordeaux).padding(.top, 2) }
            }
            Spacer()
            SiteIcon("right", size: 18).foregroundStyle(Color.muted).padding(.top, 8)
        }
        .padding(16)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.rule))
        .accessibilityElement(children: .combine)
    }
}

func statusText(_ status: String?) -> String? {
    switch status {
    case "yes": return L("status.yes")
    case "no": return L("status.no")
    case "waitlist": return L("status.waitlist")
    default: return L("app.notAnswered")
    }
}

func statusTone(_ status: String?) -> Chip.Tone {
    switch status { case "yes": return .ok; case "waitlist": return .wait; default: return .neutral }
}

struct AddInviteSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let done: () -> Void
    @State private var link = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        SheetFrame(title: L("app.addInvitation")) {
            Text(L("login.inviteHelp")).font(.body()).foregroundStyle(Color.muted)
            FieldLabel(text: L("login.inviteLabel"))
            TextField("", text: $link)
                .accessibilityLabel(L("login.inviteLabel"))
                .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL).wtField(invalid: error != nil)
            FieldError(text: error)
            Button { Task { await add() } } label: { Text(L("common.continue")) }.buttonStyle(PrimaryButton()).disabled(busy)
        }
        .presentationDetents([.medium])
    }

    private func add() async {
        guard let code = extractInviteCode(link) else { error = L("login.pasteCode"); return }
        busy = true; error = nil; defer { busy = false }
        do {
            guard try await Backend.invite(code) != nil, let info = try await Backend.tasting(code) else {
                error = L("login.codeNotFound"); return
            }
            if model.signedInEmail != nil, !(await Backend.inviteIsMine(code)) {
                error = L("login.otherInvite"); return
            }
            model.didAddCode(slug: info.slug, code: code)
            done(); dismiss()
        } catch {
            self.error = L("app.loadFailedText")
        }
    }
}

/// The site's bottom sheet: a title, a close button and its content.
struct SheetFrame<Content: View>: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    @ViewBuilder var content: Content
    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(title).font(.display(30, relativeTo: .title)).foregroundStyle(Color.paper).accessibilityAddTraits(.isHeader)
                Spacer()
                Button { dismiss() } label: {
                    SiteIcon("x", size: 20).foregroundStyle(Color.muted).frame(width: 44, height: 44)
                }
                .accessibilityLabel(L("common.cancel"))
            }
            .padding(.leading, 20).padding(.trailing, 10).padding(.top, 12)
            ScrollView {
                VStack(alignment: .leading, spacing: 10) { content }.padding(.horizontal, 20).padding(.bottom, 20).padding(.top, 4)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(Color.lodge)
        .preferredColorScheme(.light)
    }
}
