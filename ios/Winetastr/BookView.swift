import SwiftUI

/// The site's /my/: "My wine book" – the wines tasted, the tastings and the purchases, over all tastings.
struct BookView: View {
    @Environment(AppModel.self) private var model
    enum Tab: Hashable { case wines, tastings, orders }
    enum Sort: String { case recent, rating, name }
    @State private var tab = Tab.wines
    @State private var sort = Sort.recent
    @State private var search = ""
    @State private var wines: [BookWine] = []
    @State private var tastings: [MyTasting] = []
    @State private var orders: [OrderLine] = []
    @State private var loaded = false
    @State private var failed = false
    @State private var signIn = false

    var body: some View {
        VStack(spacing: 0) {
            TopBar()
            Rectangle().fill(Color.rule).frame(height: 1)
            ZStack(alignment: .top) {
                // The faint map stays put while the page scrolls
                PageBackground(path: "/my/")
                content
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(Color.lodge)
        .siteMenus { id in
            guard id == .custom("book-sort") else { return nil }
            return [(Sort.recent, "book.sortRecent"), (.rating, "book.sortRating"), (.name, "book.sortName")].map { s, key in
                SiteMenuItem(title: L(key), checked: sort == s) { sort = s }
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .task { await load() }
        .sheet(isPresented: $signIn) { LoginView(onClose: { signIn = false }) }
        .onChange(of: model.signedInEmail) { if model.signedInEmail != nil { signIn = false; Task { await load() } } }
    }

    @ViewBuilder private var content: some View {
        if failed && wines.isEmpty && tastings.isEmpty {
            ErrorState { Task { await load() } }
        } else if !loaded {
            LoadingState()
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    PageTitle(text: L("book.title"))
                    stats
                    if model.signedInEmail == nil {
                        NoticeBox(text: L("book.linkOnly")) {
                            Button(L("login.submit")) { signIn = true }.buttonStyle(SecondaryButton())
                        }
                    }
                    UnderlineTabs(tabs: [(Tab.wines, L("book.tabWines")), (.tastings, L("book.tabTastings")), (.orders, L("book.tabOrders"))], selection: $tab)
                    switch tab {
                    case .wines: winesPanel
                    case .tastings: tastingsPanel
                    case .orders: ordersPanel
                    }
                }
                .padding(16)
            }
            .scrollDismissesKeyboard(.interactively)
            .refreshable { await load() }
        }
    }

    // MARK: Stats

    /// Tasted: rated, or from a tasting that has begun – not wines of a tasting still to come
    private var tasted: [BookWine] { wines.filter { $0.rating != nil || (parseDate($0.starts_at).map { $0 <= .now } ?? false) } }

    private var stats: some View {
        HStack(spacing: 9.6) {
            stat(Set(tasted.map(\.wine_id)).count, L("book.statWines"))
            stat(tastings.count, L("book.statTastings"))
            stat(orders.reduce(0) { $0 + $1.quantity }, L("book.statBottles"))
        }
        .fixedSize(horizontal: false, vertical: true)
    }
    private func stat(_ n: Int, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(n)").font(.display(32, light: false)).foregroundStyle(Color.bordeaux)
            Text(label).font(.body(13.6)).foregroundStyle(Color.muted).lineLimit(2).minimumScaleFactor(0.85)
        }
        .padding(.vertical, 12.8).padding(.horizontal, 14.4)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.rule))
        .accessibilityElement(children: .combine)
    }

    // MARK: Wines

    private var shownWines: [BookWine] {
        let q = normOrigin(search)
        var rows = wines.filter { w in q.isEmpty || normOrigin([w.name, w.producer, w.appellation, w.region, w.title].compactMap { $0 }.joined(separator: " ")).contains(q) }
        switch sort {
        case .rating: rows.sort { ($0.rating ?? 0, $1.name) > ($1.rating ?? 0, $0.name) }
        case .name: rows.sort { $0.name.localizedCompare($1.name) == .orderedAscending }
        case .recent: break
        }
        return rows
    }

    @ViewBuilder private var winesPanel: some View {
        if wines.isEmpty {
            empty("glass", L("book.noWinesTitle"), L("book.noWines")) {
                Button(L("nav.myTastings")) { model.path = [] }.buttonStyle(SecondaryButton())
            }
        } else {
            if wines.count >= 2 {
                HStack(spacing: 9.6) {
                    if wines.count >= 4 { SearchBox(label: L("adminTasting.search"), text: $search) }
                    else { Spacer() }
                    MenuButton(id: .custom("book-sort"), accessibilityLabel: L("book.sort")) {
                        Text("\(L("book.sort")): \(L("book.sort" + sort.rawValue.prefix(1).uppercased() + sort.rawValue.dropFirst()))")
                            .font(.body(14.4)).foregroundStyle(Color.paper).lineLimit(1)
                    }
                    .padding(.leading, 12).padding(.trailing, 4)
                    .background(Color.surface, in: RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.fieldLine))
                }
            }
            let rows = shownWines
            if rows.isEmpty {
                empty("search", L("book.noMatch"), nil) { Button(L("book.showAll")) { search = "" }.buttonStyle(SecondaryButton()) }
            }
            ForEach(rows) { w in
                Button { Task { await open(w) } } label: { wineCard(w) }.buttonStyle(.plain)
            }
        }
    }

    private func wineCard(_ w: BookWine) -> some View {
        let start = parseDate(w.starts_at)
        let what = [styleName(w.style), w.vintage, w.producer].compactMap { $0 }.filter { !$0.isEmpty }
        var uniq: [String] = []; for x in what where !uniq.contains(x) { uniq.append(x) }
        let origin = originLine(w.appellation, w.region, w.country)
        let note = (w.note ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let meta = [uniq.isEmpty ? nil : uniq.joined(separator: " · "), origin].compactMap { $0 }
        let whereText = start.map { L("book.tastedAt", ["tasting": w.title, "when": dateText($0)]) } ?? w.title
        return ListCard(title: w.name, meta: meta, note: note.isEmpty ? nil : "“\(note)”") {
            WineThumb(url: w.imageURL)
        } aside: {
            VStack(alignment: .trailing, spacing: 6) {
                if let r = w.rating, r > 0 { SmallStars(value: r) }
                if w.bought > 0 { Chip(text: L("book.bought", ["n": "\(w.bought)"])) }
            }
        } content: {
            Text(whereText).font(.body(14.4)).foregroundStyle(Color.muted)
        }
    }

    /// The card opens the wine's page in its tasting
    private func open(_ w: BookWine) async {
        guard let t = tastings.first(where: { $0.slug == w.slug }) ?? CodeStore.all()[w.slug].map({ MyTasting(code: $0, slug: w.slug, title: w.title, starts_at: w.starts_at, place: nil, status: nil) }),
              let list = try? await Backend.wines(t.code), let i = list.firstIndex(where: { $0.id == w.wine_id }) else { return }
        model.path.append(.wine(t, list[i], i + 1))
    }

    // MARK: Tastings

    @ViewBuilder private var tastingsPanel: some View {
        let upcoming = tastings.filter { !$0.isPast }.sorted { ($0.starts_at ?? "9999") < ($1.starts_at ?? "9999") }
        let past = tastings.filter(\.isPast).sorted { ($0.starts_at ?? "") > ($1.starts_at ?? "") }
        if tastings.isEmpty {
            empty("calendar", L("tastings.none"), L("tastings.noneHint")) { EmptyView() }
        }
        if !upcoming.isEmpty && !past.isEmpty { Eyebrow(text: L("home.upcomingMany")) }
        ForEach(upcoming) { t in NavigationLink(value: Route.tasting(t)) { TastingRow(tasting: t) }.buttonStyle(.plain) }
        if !past.isEmpty { Eyebrow(text: L("tastings.past")).padding(.top, upcoming.isEmpty ? 0 : 8) }
        ForEach(past) { t in NavigationLink(value: Route.tasting(t)) { TastingRow(tasting: t) }.buttonStyle(.plain) }
    }

    // MARK: Purchases

    @ViewBuilder private var ordersPanel: some View {
        if orders.isEmpty {
            empty("cart", L("profile.noOrders"), L("book.noOrdersText")) { EmptyView() }
        } else {
            let bottles = orders.reduce(0) { $0 + $1.quantity }
            let total = orders.reduce(0.0) { $0 + Double($1.quantity) * $1.unit_price }
            Text(L("book.ordersSum", ["n": "\(bottles)", "total": krText(total)])).font(.body(15.2)).foregroundStyle(Color.muted)
            ForEach(groupOrders(orders), id: \.first!.order_id) { lines in
                orderCard(lines, withTasting: true)
            }
        }
    }

    // MARK: Shared

    private func empty<A: View>(_ icon: String, _ title: String, _ text: String?, @ViewBuilder action: () -> A) -> some View {
        EmptyBox(icon: icon, title: title, text: text) { action() }
    }

    private func load() async {
        do {
            let codes = Array(CodeStore.all().values)
            async let t = model.loadTastings()
            async let w = Backend.wineBook(codes)
            let (list, book) = try await (t, w)
            tastings = list; wines = book
            if model.signedInEmail != nil {
                orders = (try? await Backend.allMyOrders()) ?? []
            } else {
                var out: [OrderLine] = []
                for (slug, code) in CodeStore.all() {
                    let title = list.first { $0.slug == slug }?.title ?? slug
                    for var l in (try? await Backend.myOrders(code)) ?? [] { l.slug = slug; l.title = title; out.append(l) }
                }
                orders = out.sorted { $0.created_at > $1.created_at }
            }
            failed = false; loaded = true
        } catch {
            failed = true; loaded = true
        }
    }
}

/// Order lines grouped per order, newest first, as orderCards() does
func groupOrders(_ lines: [OrderLine]) -> [[OrderLine]] {
    var order: [Int] = []; var by: [Int: [OrderLine]] = [:]
    for l in lines { if by[l.order_id] == nil { order.append(l.order_id) }; by[l.order_id, default: []].append(l) }
    return order.map { by[$0]! }
}

/// One card per order: tasting and number, paid or not, the date, the lines and the total
func orderCard(_ lines: [OrderLine], withTasting: Bool) -> some View {
    let first = lines[0]
    let total = lines.reduce(0.0) { $0 + Double($1.quantity) * $1.unit_price }
    let number = L("pay.orderComment", ["id": "\(first.order_id)"])
    return ListCard(title: withTasting && first.title != nil ? "\(first.title!) · \(number)" : number,
                    chips: [first.paid ? Chip(text: L("cart.paid"), tone: .ok) : Chip(text: L("cart.awaiting"), tone: .err)],
                    meta: parseDate(first.created_at).map { [dateText($0)] } ?? [],
                    foot: (L("cart.total"), krText(total))) {
        EmptyView()
    } aside: {
        EmptyView()
    } content: {
        VStack(alignment: .leading, spacing: 2) {
            ForEach(Array(lines.enumerated()), id: \.offset) { _, l in
                Text("\(l.quantity) × \(l.wine_name)").font(.body(14.4)).foregroundStyle(Color.paper)
            }
        }
        .padding(.top, 4)
    }
}

/// The empty state (EmptyState.astro): an icon, what is missing and the way forward
struct EmptyBox<Action: View>: View {
    let icon: String
    let title: String
    var text: String? = nil
    @ViewBuilder var action: Action
    var body: some View {
        VStack(spacing: 8) {
            SiteIcon(icon, size: 30).foregroundStyle(Color.muted.opacity(0.7))
            Text(title).font(.semibold(16)).foregroundStyle(Color.paper).multilineTextAlignment(.center)
            if let text { Text(text).font(.body(14.4)).foregroundStyle(Color.muted).multilineTextAlignment(.center) }
            action.padding(.top, 4)
        }
        .padding(24).frame(maxWidth: .infinity)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.rule, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
    }
}

/// originLine(): "Porto · Douro", or the country when nothing else is known
func originLine(_ appellation: String?, _ region: String?, _ country: String?) -> String? {
    var parts: [String] = []
    for p in [appellation, region].compactMap({ $0 }) where !p.isEmpty && !parts.contains(where: { normOrigin($0) == normOrigin(p) }) { parts.append(p) }
    return parts.isEmpty ? countryName(country) : parts.joined(separator: " · ")
}
