import SwiftUI

/// The wines tab: the site's carousel with one card per wine.
struct WinesView: View {
    @Environment(AppModel.self) private var model
    let tasting: MyTasting
    @State private var wines: [Wine] = []
    @State private var ratings: [Int: MyRating] = [:]
    @State private var loaded = false
    @State private var failed = false
    @State private var current: Int?
    @State private var debugDone = false
    @State private var ordersOpen = false

    private var index: Int { wines.firstIndex { $0.id == current } ?? 0 }

    var body: some View {
        Group {
            if failed && wines.isEmpty {
                ErrorState { Task { await load() } }
            } else if !loaded {
                LoadingState()
            } else if wines.isEmpty {
                Text(L("app.noWines")).font(.body()).foregroundStyle(Color.muted).padding(16)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            } else {
                content
            }
        }
        .overlay(alignment: .bottom) { CartBar(tasting: tasting, wines: wines) }
        .task { await load() }
        .onChange(of: model.online) { if model.online && failed { Task { await load() } } }
        .onChange(of: model.path) { Task { ratings = (try? await Backend.ratings(tasting.code)) ?? ratings } }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text(L("nav.wines")).font(.display(38, relativeTo: .largeTitle)).foregroundStyle(Color.paper).accessibilityAddTraits(.isHeader)
                Text(L(ordersOpen ? "wines.introOrder" : "wines.intro")).font(.body()).foregroundStyle(Color.muted)
            }
            .padding(.horizontal, 16).padding(.top, 14)

            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 12) {
                    ForEach(Array(wines.enumerated()), id: \.element.id) { i, wine in
                        NavigationLink(value: Route.wine(tasting, wine, i + 1)) {
                            WineCard(wine: wine, number: i + 1, stars: ratings[wine.id]?.rating)
                        }
                        .buttonStyle(.plain)
                        .containerRelativeFrame(.horizontal) { w, _ in w - 56 }
                    }
                }
                .scrollTargetLayout()
            }
            .contentMargins(.horizontal, 16, for: .scrollContent)
            .scrollTargetBehavior(.viewAligned)
            .scrollPosition(id: $current)

            HStack(spacing: 24) {
                pagerButton("left", L("app.previous"), enabled: index > 0) { go(index - 1) }
                Text(L("wines.position", ["n": "\(index + 1)", "total": "\(wines.count)"]))
                    .font(.body(15)).foregroundStyle(Color.muted).monospacedDigit()
                pagerButton("right", L("app.next"), enabled: index < wines.count - 1) { go(index + 1) }
            }
            .frame(maxWidth: .infinity).padding(.bottom, model.cartCount(tasting.slug) > 0 ? 84 : 10)
        }
    }

    private func go(_ i: Int) { withAnimation { current = wines[i].id } }

    private func pagerButton(_ icon: String, _ label: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            SiteIcon(icon, size: 20).foregroundStyle(enabled ? Color.paper : Color.fieldLine)
                .frame(width: 48, height: 48)
                .background(enabled ? Color.surface : Color.clear, in: Circle())
                .overlay(Circle().strokeBorder(Color.rule))
        }
        .disabled(!enabled).accessibilityLabel(label)
    }

    private func load() async {
        do {
            async let w = Backend.wines(tasting.code)
            async let r = Backend.ratings(tasting.code)
            (wines, ratings) = try await (w, r)
            ordersOpen = (try? await Backend.tasting(tasting.code))?.orders_open == true || debugOrdersOpen
            failed = false; loaded = true
            if current == nil { current = wines.first?.id }
            #if DEBUG
            if !debugDone {
                debugDone = true
                let route = UserDefaults.standard.string(forKey: "route")
                if route == "wine", let w = wines.first { model.path.append(.wine(tasting, w, 1)) }
                if route == "blind", let i = wines.firstIndex(where: \.isBlind) { model.path.append(.wine(tasting, wines[i], i + 1)) }
            }
            #endif
        } catch {
            failed = true; loaded = true
        }
    }
}

struct WineImage: View {
    let wine: Wine
    var body: some View {
        ZStack {
            if wine.isBlind {
                Image("Glass").resizable().scaledToFit().frame(width: 72, height: 72).foregroundStyle(Color.rule)
            } else if let url = wine.imageURL {
                AsyncImage(url: url) { phase in
                    if let image = phase.image { image.resizable().scaledToFit() }
                    else if phase.error != nil { placeholder }
                    else { ProgressView().tint(Color.bordeaux) }
                }
            } else { placeholder }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.surface)
        .accessibilityHidden(true)
    }
    private var placeholder: some View { Image("Glass").resizable().scaledToFit().frame(width: 72, height: 72).foregroundStyle(Color.rule) }
}

func wineTitle(_ wine: Wine, number: Int?) -> String {
    wine.name ?? L("app.blindName", ["n": number.map(String.init) ?? ""])
}

func twoDigits(_ n: Int) -> String { String(format: "%02d", n) }

struct PriceLine: View {
    let wine: Wine
    var size: CGFloat = 16
    var big = false
    var body: some View {
        if let price = wine.price_dkk {
            // The tasting's price on its own line, the struck-through regular price on the line below
            VStack(alignment: .leading, spacing: 2) {
                Text(krText(price)).font(big ? .display(34, light: false, relativeTo: .title) : .medium(size)).foregroundStyle(Color.paper)
                if let r = wine.retail_price_dkk, r > price {
                    Text(krText(r)).font(.body(14.4)).strikethrough().foregroundStyle(Color.muted)
                }
            }
        }
    }
}

/// One card in the carousel
struct WineCard: View {
    let wine: Wine
    let number: Int
    let stars: Int?
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .topLeading) {
                WineImage(wine: wine).padding(.top, 20).padding(.bottom, 12)
                Text(twoDigits(number)).font(.display(17, light: false, relativeTo: .caption)).tracking(2).foregroundStyle(Color.muted).padding(14)
            }
            .frame(maxHeight: .infinity)
            VStack(alignment: .leading, spacing: 6) {
                StyleEyebrow(wine: wine)
                Text(wineTitle(wine, number: number)).font(.display(26, light: false, relativeTo: .title2)).foregroundStyle(Color.paper)
                    .lineLimit(2).multilineTextAlignment(.leading)
                Text(wine.isBlind ? L("blind.hint") : [vintageText(wine.vintage), wine.originLine].compactMap { $0 }.joined(separator: " · "))
                    .font(.body(14.4)).foregroundStyle(Color.muted).lineLimit(2)
                HStack(alignment: .firstTextBaseline) {
                    if wine.isBlind { Chip(text: L("blind.blind")) } else { PriceLine(wine: wine) }
                    Spacer(minLength: 4)
                    if let stars, stars > 0 { SmallStars(value: stars) }
                    else {
                        HStack(spacing: 5) { Text(L("wines.readMore")); SiteIcon("right", size: 15) }
                            .font(.medium(14.4)).foregroundStyle(Color.bordeaux)
                    }
                }
                .padding(.top, 10)
            }
            .padding(16)
        }
        .background(Color.surface, in: RoundedRectangle(cornerRadius: 8))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.rule))
        .accessibilityElement(children: .combine)
    }
}

struct SmallStars: View {
    let value: Int
    var body: some View {
        HStack(spacing: 1) {
            ForEach(1...5, id: \.self) { n in
                Image(systemName: "star.fill").font(.caption2).foregroundStyle(n <= value ? Color.tawny : Color.rule)
            }
        }
        .accessibilityElement().accessibilityLabel(L("app.starsLabel", ["n": "\(value)"]))
    }
}

struct WineDetailView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let tasting: MyTasting
    @State var wine: Wine
    let position: Int?
    @State private var wines: [Wine] = []
    @State private var info: TastingInfo?
    @State private var stars: Int?
    @State private var note = ""
    @State private var didLoad = false
    @State private var saveTask: Task<Void, Never>?
    @State private var needsFlush = false
    @State private var toast: String?
    @State private var descOpen = false
    @State private var descLong = false
    @State private var map: WineMap?
    @State private var qty = 1

    init(tasting: MyTasting, wine: Wine, position: Int?) {
        self.tasting = tasting; self._wine = State(initialValue: wine); self.position = position
    }

    private var index: Int? { wines.firstIndex { $0.id == wine.id } }

    var body: some View {
        VStack(spacing: 0) {
            TopBar(tasting: tasting)
            TastingBar(title: tasting.title, tab: .wines) { tab in
                model.tastingTab = tab; dismiss()
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Button { dismiss() } label: {
                        HStack(spacing: 6) { SiteIcon("left", size: 17); Text(L("wine.all")) }
                    }
                    .buttonStyle(TextButton()).padding(.horizontal, 16).padding(.vertical, 2)

                    // The picture on white, edge to edge, with the wine's number in the corner
                    ZStack(alignment: .topLeading) {
                        WineImage(wine: wine).padding(24).frame(height: 300)
                        if let position { Text(twoDigits(index.map { $0 + 1 } ?? position)).font(.display(17, light: false, relativeTo: .caption)).tracking(2).foregroundStyle(Color.muted).padding(14) }
                    }
                    .frame(maxWidth: .infinity)
                    .background(Color.surface)

                    VStack(alignment: .leading, spacing: 0) {
                        StyleEyebrow(wine: wine).padding(.top, 22).padding(.bottom, 8)
                        Text(wineTitle(wine, number: index.map { $0 + 1 } ?? position)).font(.display(38, relativeTo: .largeTitle)).foregroundStyle(Color.paper).accessibilityAddTraits(.isHeader)
                        if wine.isBlind {
                            Text(L("blind.hint")).font(.body()).foregroundStyle(Color.muted).padding(.top, 8)
                        } else {
                            let meta = [vintageText(wine.vintage), wine.producer, wine.abv.map { "\($0.formatted(.number.locale(appLocale))) %" }].compactMap { $0 }.filter { !$0.isEmpty }
                            if !meta.isEmpty { Text(meta.joined(separator: " · ")).font(.body()).foregroundStyle(Color.muted).padding(.top, 8) }
                            if let o = originFull(wine) {
                                HStack(spacing: 6.4) {
                                    SiteIcon("pin", size: 16).foregroundStyle(Color.muted)
                                    Text(o).font(.body()).foregroundStyle(Color.muted)
                                }
                                .padding(.top, 4.8)
                            }
                            if wine.price_dkk != nil { buy.padding(.top, 20) }
                        }
                        ratingBox.padding(.top, wine.price_dkk != nil && !wine.isBlind ? 4 : 20)
                        if !wine.isBlind { reading }
                        if wines.count > 1, let index { pager(index).padding(.top, 32) }
                    }
                    // Room for the cart bar at the bottom while it shows
                    .padding(.horizontal, 16).padding(.bottom, model.cartCount(tasting.slug) > 0 ? 110 : 48)
                }
            }
            .scrollDismissesKeyboard(.interactively)
            #if DEBUG
            .defaultScrollAnchor(UserDefaults.standard.bool(forKey: "scrollBottom") ? .bottom : .top)
            #endif
        }
        .background(Color.lodge)
        .overlay(alignment: .bottom) { CartBar(tasting: tasting, wines: wines).animation(.easeOut(duration: 0.2), value: model.cartCount(tasting.slug)) }
        .siteMenus()
        .toolbar(.hidden, for: .navigationBar)
        .toast($toast)
        .task(id: wine.id) { await load() }
        .task(id: wine.id) { await watchBlind() }
        .onDisappear { flush() }
    }

    // MARK: Price (component 21): ours, the regular one struck through, the quantity prices and how far the guests are

    private var buy: some View {
        let inCart = model.cart(tasting.slug)[wine.id] ?? 0
        return VStack(alignment: .leading, spacing: 4) {
            PriceLine(wine: wine, big: true)
            ForEach(tierLabels(wine) + [bulkNote(wine, mode: info?.bulk_mode)].compactMap { $0 }, id: \.self) {
                Text($0).font(.body(14.4)).foregroundStyle(Color.bordeaux)
            }
            // Ordering: how many and "Læg i kurv"; the cart bar at the bottom follows
            if (info?.orders_open == true || debugOrdersOpen) && wine.orderable == true {
                HStack(spacing: 9.6) {
                    Stepper17(value: $qty, max: max(1, maxPerWine - inCart), label: L("wine.qty"))
                    if inCart > 0 {
                        Button(L("wine.addMore", ["n": "\(inCart)"])) { add() }.buttonStyle(SecondaryButton(small: false, wide: true))
                            .disabled(inCart >= maxPerWine)
                    } else {
                        Button(L("wine.add")) { add() }.buttonStyle(PrimaryButton())
                    }
                }
                .padding(.top, 10)
            }
        }
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { Rectangle().fill(Color.rule).frame(height: 1) }
        .overlay(alignment: .bottom) { Rectangle().fill(Color.rule).frame(height: 1) }
    }

    private func add() {
        model.addToCart(tasting.slug, wine.id, qty)
        qty = 1
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        toast = L("wine.added")
    }

    // MARK: The guest's own rating (ratingBox in src/lib/rating.ts): saved by itself, the toast says so

    private var ratingBox: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(L("rating.title")).font(.semibold(17)).foregroundStyle(Color.paper).accessibilityAddTraits(.isHeader)
            HStack(spacing: 0) {
                ForEach(1...5, id: \.self) { n in
                    Button {
                        stars = stars == n ? nil : n
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        scheduleSave(after: 0)
                    } label: {
                        Image(systemName: "star.fill").font(.title3).foregroundStyle(n <= (stars ?? 0) ? Color.tawny : Color.rule)
                            .frame(width: 46, height: 44).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L("app.starsLabel", ["n": "\(n)"]))
                    .accessibilityAddTraits(n == stars ? .isSelected : [])
                }
            }
            .padding(.leading, -9)
            FieldLabel(text: L("rating.note")).padding(.top, 6)
            TextField("", text: $note, prompt: Text(L("rating.notePlaceholder")).foregroundStyle(Color.placeholder), axis: .vertical)
                .accessibilityLabel(L("rating.note")).lineLimit(2...6).padding(.vertical, 10).wtField()
                .onChange(of: note) { if didLoad { scheduleSave(after: 0.8) } }
            Text(L("rating.private")).font(.body(13.6)).foregroundStyle(Color.muted)
        }
        .padding(.top, 16)
    }

    // MARK: Reading: the description (folded when long), grapes, food and serving, the map, more about the producer

    @ViewBuilder private var reading: some View {
        if let d = wine.description, !d.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Text(d).font(.body(16.3)).foregroundStyle(Color.paper).lineSpacing(8)
                    .lineLimit(descOpen ? nil : 5)
                    .background(GeometryReader { g in Color.clear.onAppear { descLong = d.count > 320 || g.size.height > 150 } })
                if descLong {
                    Button(L(descOpen ? "wine.readLess" : "wine.readMore")) { withAnimation { descOpen.toggle() } }.buttonStyle(TextButton())
                }
            }
            .padding(.top, 26)
        }
        WineFactsList(wine: wine).padding(.top, 20)
        if let map {
            VStack(alignment: .trailing, spacing: 4.8) {
                MapBox(drawing: map.drawing, label: originFull(wine))
                MapCredit(sources: map.sources, osm: map.osm)
            }
            .padding(.top, 20)
        }
        let rows = moreRows
        if !rows.isEmpty {
            Disclosure(summary: L("wine.moreAbout")) { FactsRows(rows: rows) }.padding(.top, 24)
        }
    }

    private var moreRows: [(label: String?, value: AnyView)] {
        var rows: [(label: String?, value: AnyView)] = []
        if let site = wine.producer_website, let url = URL(string: site), ["http", "https"].contains(url.scheme ?? "") {
            rows.append((L("producer.websiteShort"), AnyView(Link(url.host?.replacingOccurrences(of: "www.", with: "") ?? site, destination: url).font(.body(15.2)).foregroundStyle(Color.bordeaux))))
        }
        if let a = wine.producer_address, !a.isEmpty { rows.append((L("producer.addressShort"), AnyView(Text(a).font(.body(15.2)).foregroundStyle(Color.paper)))) }
        for l in wine.detailLines { rows.append((l.label, AnyView(Text(l.text).font(.body(15.2)).foregroundStyle(Color.paper)))) }
        return rows
    }

    // MARK: Previous and next around "2 af 11"

    private func pager(_ i: Int) -> some View {
        HStack(spacing: 24) {
            pagerButton("left", L("wine.prev"), i > 0 ? wines[i - 1] : nil, i)
            Text(L("wines.position", ["n": "\(i + 1)", "total": "\(wines.count)"])).font(.body(15)).foregroundStyle(Color.muted).monospacedDigit()
            pagerButton("right", L("wine.next"), i + 1 < wines.count ? wines[i + 1] : nil, i + 2)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .contain).accessibilityLabel(L("wine.others"))
    }

    private func pagerButton(_ icon: String, _ dir: String, _ w: Wine?, _ n: Int) -> some View {
        Button {
            guard let w else { return }
            flush()
            if !model.path.isEmpty { model.path[model.path.count - 1] = .wine(tasting, w, n) }
        } label: {
            SiteIcon(icon, size: 20).foregroundStyle(w != nil ? Color.paper : Color.fieldLine)
                .frame(width: 48, height: 48)
                .background(w != nil ? Color.surface : Color.clear, in: Circle())
                .overlay(Circle().strokeBorder(Color.rule))
        }
        .disabled(w == nil)
        .accessibilityLabel(w.map { "\(dir): \(wineTitle($0, number: n))" } ?? dir)
    }

    // MARK: Loading and saving

    private func load() async {
        async let all = try? Backend.wines(tasting.code)
        async let t = try? Backend.tasting(tasting.code)
        async let r = try? Backend.ratings(tasting.code)
        let (list, settings, mine) = await (all, t, r)
        if let list { wines = list; if let fresh = list.first(where: { $0.id == wine.id }) { wine = fresh } }
        info = settings ?? info
        if !didLoad, let m = mine?[wine.id] { stars = m.rating; note = m.note ?? "" }
        didLoad = true
        if !wine.isBlind { map = await wineMap(wine) }
    }

    /// A blind wine: when the host reveals it, the whole wine shows (checked every 15 seconds, as on the site)
    private func watchBlind() async {
        while !Task.isCancelled && wine.isBlind {
            try? await Task.sleep(for: .seconds(15))
            if let list = try? await Backend.wines(tasting.code), let fresh = list.first(where: { $0.id == wine.id }), fresh.isBlind != wine.isBlind {
                wines = list; wine = fresh
                map = await wineMap(fresh)
            }
        }
    }

    private func flush() {
        saveTask?.cancel()
        if needsFlush { needsFlush = false; Task { [stars, note, code = tasting.code, id = wine.id] in try? await Backend.rate(code, wine: id, stars: stars, note: note) } }
    }

    private func scheduleSave(after seconds: Double) {
        saveTask?.cancel(); needsFlush = true
        saveTask = Task {
            if seconds > 0 { try? await Task.sleep(for: .seconds(seconds)) }
            guard !Task.isCancelled else { return }
            do {
                try await Backend.rate(tasting.code, wine: wine.id, stars: stars, note: note)
                guard !Task.isCancelled else { return }
                needsFlush = false; toast = L("rating.saved")
            } catch {
                toast = L("rating.notSaved")
            }
        }
    }
}
