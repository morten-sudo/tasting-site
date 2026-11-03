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
        .task { await load() }
        .onChange(of: model.online) { if model.online && failed { Task { await load() } } }
        .onChange(of: model.path) { Task { ratings = (try? await Backend.ratings(tasting.code)) ?? ratings } }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text(L("nav.wines")).font(.display(38, relativeTo: .largeTitle)).foregroundStyle(Color.paper).accessibilityAddTraits(.isHeader)
                Text(L("wines.intro")).font(.body()).foregroundStyle(Color.muted)
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
            .frame(maxWidth: .infinity).padding(.bottom, 10)
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
    let wine: Wine
    let position: Int?
    @State private var stars: Int?
    @State private var note = ""
    @State private var didLoad = false
    @State private var saveTask: Task<Void, Never>?
    @State private var status: String?
    @State private var failed = false
    @State private var needsFlush = false

    var body: some View {
        VStack(spacing: 0) {
            TopBar()
            TastingBar(title: tasting.title, tab: .wines) { tab in
                model.tastingTab = tab; dismiss()
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Button { dismiss() } label: {
                        HStack(spacing: 6) { SiteIcon("left", size: 17); Text(L("wine.all")) }
                    }
                    .buttonStyle(TextButton()).padding(.horizontal, 16).padding(.vertical, 2)

                    ZStack(alignment: .topLeading) {
                        WineImage(wine: wine).frame(height: 300).padding(.vertical, 16)
                        if let position { Text(twoDigits(position)).font(.display(17, light: false, relativeTo: .caption)).tracking(2).foregroundStyle(Color.muted).padding(14) }
                    }
                    .background(Color.surface)

                    VStack(alignment: .leading, spacing: 8) {
                        StyleEyebrow(wine: wine)
                        Text(wineTitle(wine, number: position)).font(.display(38, relativeTo: .largeTitle)).foregroundStyle(Color.paper).accessibilityAddTraits(.isHeader)
                        if wine.isBlind {
                            Text(L("blind.hint")).font(.body()).foregroundStyle(Color.muted)
                        } else {
                            let line = [vintageText(wine.vintage), wine.producer].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                            if !line.isEmpty { Text(line).font(.body()).foregroundStyle(Color.muted) }
                            if let o = wine.fullOrigin {
                                HStack(spacing: 8) {
                                    SiteIcon("pin", size: 18).foregroundStyle(Color.muted)
                                    Text(o).font(.body()).foregroundStyle(Color.muted)
                                }
                            }
                        }
                        if wine.price_dkk != nil {
                            Rectangle().fill(Color.rule).frame(height: 1).padding(.top, 8)
                            PriceLine(wine: wine, big: true).padding(.vertical, 4)
                            Rectangle().fill(Color.rule).frame(height: 1)
                        }
                        ratingBox.padding(.top, 12)
                        if let d = wine.description, !d.isEmpty { Text(d).font(.body()).foregroundStyle(Color.paper).lineSpacing(3).padding(.top, 18) }
                        facts.padding(.top, 18)
                    }
                    .padding(16)
                }
            }
            .scrollDismissesKeyboard(.interactively)
            #if DEBUG
            .defaultScrollAnchor(UserDefaults.standard.bool(forKey: "scrollBottom") ? .bottom : .top)
            #endif
        }
        .background(Color.lodge)
        .siteMenus()
        .toolbar(.hidden, for: .navigationBar)
        .task {
            guard !didLoad else { return }
            if let r = try? await Backend.ratings(tasting.code)[wine.id] { stars = r.rating; note = r.note ?? "" }
            didLoad = true
        }
        .onDisappear {
            saveTask?.cancel()
            if needsFlush { Task { [stars, note] in try? await Backend.rate(tasting.code, wine: wine.id, stars: stars, note: note) } }
        }
    }

    private var ratingBox: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(L("rating.title")).font(.semibold(17)).foregroundStyle(Color.paper).accessibilityAddTraits(.isHeader)
                Spacer()
                if let status { Text(status).font(.body(13.6)).foregroundStyle(failed ? Color.errorText : Color.okText) }
            }
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
            FieldLabel(text: L("rating.note")).padding(.top, 6)
            TextField("", text: $note, prompt: Text(L("rating.notePlaceholder")).foregroundStyle(Color.placeholder), axis: .vertical)
                .accessibilityLabel(L("rating.note")).lineLimit(2...6).padding(.vertical, 10).wtField()
                .onChange(of: note) { if didLoad { scheduleSave(after: 0.8) } }
        }
    }

    /// .facts: label and value side by side
    @ViewBuilder private var facts: some View {
        let extra: [(String, String?)] = [
            (L("app.grapes"), wine.grapes), (L("app.foodPairing"), wine.food_pairing),
            (L("app.serving"), wine.serving), (L("app.abv"), wine.abv.map { "\($0.formatted(.number.locale(appLocale))) %" }),
        ]
        let rows = extra.filter { !($0.1 ?? "").isEmpty }
        let lines = wine.detailLines
        if !lines.isEmpty || !rows.isEmpty || wine.producer_website != nil {
            VStack(alignment: .leading, spacing: 12) {
                Eyebrow(text: L("app.aboutWine"))
                ForEach(rows, id: \.0) { row in fact(row.0, row.1 ?? "") }
                ForEach(Array(lines.enumerated()), id: \.offset) { _, l in fact(l.label, l.text) }
                if let site = wine.producer_website, let url = URL(string: site), ["http", "https"].contains(url.scheme ?? "") {
                    Link(url.host?.replacingOccurrences(of: "www.", with: "") ?? site, destination: url).font(.medium(15.2)).foregroundStyle(Color.bordeaux)
                }
            }
        }
    }

    private func fact(_ label: String?, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            if let label { Text(label).font(.body(15.2)).foregroundStyle(Color.muted) }
            Text(text).font(.body(15.2)).foregroundStyle(Color.paper)
        }
        .accessibilityElement(children: .combine)
    }

    private func scheduleSave(after seconds: Double) {
        saveTask?.cancel(); needsFlush = true
        saveTask = Task {
            if seconds > 0 { try? await Task.sleep(for: .seconds(seconds)) }
            guard !Task.isCancelled else { return }
            do {
                try await Backend.rate(tasting.code, wine: wine.id, stars: stars, note: note)
                guard !Task.isCancelled else { return }
                needsFlush = false; failed = false; status = L("common.saved")
            } catch {
                failed = true; status = L("app.notSaved")
            }
        }
    }
}
