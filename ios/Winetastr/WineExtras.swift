import SwiftUI

// The parts of the site's wine page (src/pages/tasting/wine.astro) beyond the heading and the rating.

/// wineMap() in src/lib/wine-map.ts: the wine's region on the detailed map with its lowest known area strongest and named,
/// the levels between lighter (or the whole region marked), its producer's pin; otherwise a pin on the overview map – with the detailed tiles when zoomed in close.
struct WineMap { let drawing: MapDrawing; let sources: String; let osm: Bool }

func wineMap(_ w: Wine, width: Double = 358) async -> WineMap? {
    let apps = await MapStore.shared.appellationList()
    var aid = w.appellation_id
    if aid == nil, let a = w.appellation { aid = matchAppellation(apps, a)?.id }
    if let mapId = mapIdFor(w.region), let map = await MapStore.shared.map(mapId) {
        // The same rule as the tasting's map (WIN-293): the whole region, the wine's lowest known area strongest and named
        // (no number), the levels between lighter; an appellation the map cannot fill as a pin with its name
        let level = levelOf(map, appellation: w.appellation, appellationId: aid, apps)
        var pins: [(lon: Double, lat: Double)] = []
        if let lat = w.producer_lat, let lon = w.producer_lon, let proj = map.proj {
            let p = proj.xy(lon, lat)
            if p.x >= 0 && p.x <= map.w && p.y >= 0 && p.y <= map.h { pins = [(lon, lat)] }
        }
        let area = level.kind == .area
        var named: [(lon: Double, lat: Double, title: String)] = []
        if level.kind == .pin, let p = level.pin { named = [(lon: p.lon, lat: p.lat, title: level.name)] }
        let d = RegionDrawing(map, counts: area ? [level.id: 1] : [:], titles: area ? [level.id: level.name] : [:], mid: Set(level.mid),
                              wholeRegion: level.kind == .region, numbered: false, named: named, pins: pins, scale: labelScale(map, width: width))
        return WineMap(drawing: .region(d), sources: map.sources ?? "", osm: !pins.isEmpty)
    }
    guard let place = await placeOf(w, appellationId: aid), let ov = await MapStore.shared.overview(overviewFor([place])) else { return nil }
    let focus = await focusFor([place], close: true)
    let detail = await detailFor(focus)
    let d = OverviewDrawing(ov, pins: [.init(lon: place.lon, lat: place.lat, label: place.label)], focus: focus, detail: detail)
    return WineMap(drawing: .overview(d), sources: "Natural Earth", osm: place.how == "producer")
}

/// originFull(): "Saint-Émilion Grand Cru, Bordeaux, Frankrig"
func originFull(_ w: Wine) -> String? {
    var parts: [String] = []
    for p in [w.appellation, w.region, countryName(w.country)].compactMap({ $0 }) where !p.isEmpty && !parts.contains(where: { normOrigin($0) == normOrigin(p) }) {
        parts.append(p)
    }
    return parts.isEmpty ? nil : parts.joined(separator: ", ")
}

/// The facts list (component 22) with an icon per line: grapes, what it goes with and how to serve it (wineFacts)
struct WineFactsList: View {
    let wine: Wine
    var body: some View {
        let rows: [(String, String, String?)] = [("grapes", L("label.grapes"), wine.grapes), ("food", L("wineFields.food"), wine.food_pairing), ("serving", L("wineFields.serving"), wine.serving)]
        let shown = rows.filter { !($0.2 ?? "").isEmpty }
        if !shown.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(shown, id: \.0) { icon, label, value in
                    HStack(alignment: .top, spacing: 10) {
                        SiteIcon(icon, size: 18.4).foregroundStyle(Color.muted).padding(.top, 1.6)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(label).font(.body(14.4)).foregroundStyle(Color.muted)
                            Text(value ?? "").font(.body(15.2)).foregroundStyle(Color.paper)
                        }
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }
}

/// The disclosure (Disclosure.astro): its summary with a chevron, the content under it when open
struct Disclosure<Content: View>: View {
    let summary: String
    @State var open = false
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { withAnimation(.easeOut(duration: 0.18)) { open.toggle() } } label: {
                HStack {
                    Text(summary).font(.medium(15.2)).foregroundStyle(Color.paper).multilineTextAlignment(.leading)
                    Spacer()
                    SiteIcon("chev", size: 16).foregroundStyle(Color.muted).rotationEffect(.degrees(open ? 180 : 0))
                }
                .frame(minHeight: 48).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(open ? .isSelected : [])
            if open { content.padding(.bottom, 12) }
        }
        .overlay(alignment: .top) { Rectangle().fill(Color.rule).frame(height: 1) }
        .overlay(alignment: .bottom) { Rectangle().fill(Color.rule).frame(height: 1) }
    }
}

/// detailIcon() in src/lib/ui/detail-icon.ts: the icon for a heading in a wine's details, from the heading's words
/// (Danish, English, Icelandic), info when none fits. The same rules in the same order – the first match wins.
private let detailIconRules: [(String, String)] = [
    (#"hjemmeside|website|vefs"#, "globe"),
    (#"adresse|address|heimilisfang"#, "pin"),
    (#"smag|taste|palate|finish|bragð"#, "taste"),
    (#"duft|næse|aroma|nose|bouquet|ilm"#, "wind"),
    (#"drue|grape|þrúg"#, "grapes"),
    (#"vinmark|mark\b|vineyard|parcel|terroir|jordbund|soil|víngarð"#, "vineyard"),
    (#"producent|huset|producer|house|winery|quinta|framleiðand"#, "winery"),
    (#"oprindelse|område|region|origin|appellation|uppruni|svæði"#, "map"),
    (#"året|årgang|\byear\b|vintage|høst|harvest|klima|weather|árgang"#, "sun"),
    (#"farve|colou?r|litur"#, "drop"),
    (#"balance|struktur|structure|syre|acid|tannin|sødme|sweetness"#, "scale"),
    (#"fremstilling|produktion|vinifi|production|making|framleiðsl"#, "barrel-grapes"),
    (#"lagring|holdbar|modning|ageing|aging|cellar|drikkevindue|geymsl"#, "barrel"),
    (#"udvikling|potentiale|development|potential|þróun"#, "trend"),
    (#"alkohol|alcohol|abv|áfengi"#, "percent"),
    (#"flaske|bottle|flask"#, "bottle"),
    (#"anmeldelse|point|score|review|rating|bedømmelse|umsögn"#, "star"),
    (#"sammenlign|compared|comparison|samanbur"#, "compare"),
    (#"sjælden|rarity|\brare\b|fágæt"#, "gem"),
    (#"\bmad\b|food|pairing|matur"#, "food"),
    (#"servering|serving|serve|temperatur|framreiðsl"#, "serving"),
    (#"stil|hvad er det|style|\btype\b|what it is|tegund"#, "glass"),
].map { pattern, icon in
    // JavaScript's \b only knows ASCII word characters (æ, ø, å are not), ICU's knows all letters: spell out JavaScript's
    let js = pattern.replacingOccurrences(of: #"\b"#, with: #"(?:(?<![A-Za-z0-9_])(?=[A-Za-z0-9_])|(?<=[A-Za-z0-9_])(?![A-Za-z0-9_]))"#)
    return (js, icon)
}
private let detailIconRegexes: [(NSRegularExpression, String)] = detailIconRules.map { (try! NSRegularExpression(pattern: $0.0), $0.1) }

func detailIcon(_ label: String) -> String {
    let l = label.lowercased()
    let range = NSRange(l.startIndex..., in: l)
    for (re, icon) in detailIconRegexes where re.firstMatch(in: l, range: range) != nil { return icon }
    return "info"
}

/// A facts list of label and value (the details "Label: text", the producer's website and address); an icon before
/// the label when it has one (.facts dt svg), in the label's muted colour
struct FactsRows: View {
    let rows: [(label: String?, icon: String?, value: AnyView)]
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { i, r in
                VStack(alignment: .leading, spacing: 1.6) {
                    if let l = r.label, !l.isEmpty {
                        HStack(alignment: .center, spacing: 8) {
                            if let icon = r.icon { SiteIcon(icon, size: 18.4) }
                            Text(l).font(.body(13.6))
                        }
                        .foregroundStyle(Color.muted)
                    }
                    r.value
                }
                .padding(.vertical, 9.6)
                .frame(maxWidth: .infinity, alignment: .leading)
                .overlay(alignment: .top) { if i > 0 { Rectangle().fill(Color.rule).frame(height: 1) } }
                .accessibilityElement(children: .combine)
            }
        }
    }
}

/// "From 6 bottles: 80,00 kr. each" (tierLabels) and how far the guest – or all the guests – is (bulkNote)
func tierLabels(_ w: Wine) -> [String] {
    (w.price_tiers ?? []).filter { $0.qty >= 2 }.sorted { $0.qty < $1.qty }.map { L("price.bulk", ["n": "\($0.qty)", "price": krText($0.price)]) }
}

func bulkNote(_ w: Wine, mode: String?, inCart: Int = 0) -> String? {
    let tiers = (w.price_tiers ?? []).filter { $0.qty >= 2 }.sorted { $0.qty < $1.qty }
    guard let last = tiers.last else { return nil }
    let have = (w.ordered ?? 0) + inCart
    let pooled = mode == "pooled"
    guard let next = tiers.first(where: { $0.qty > have }) else {
        return L(pooled ? "bulk.reachedAll" : "bulk.reached", ["price": krText(last.price)])
    }
    let vars = ["have": "\(have)", "need": "\(next.qty)", "more": "\(next.qty - have)", "price": krText(next.price)]
    if pooled { return L("bulk.togetherMore", vars) }
    return (w.ordered ?? 0) > 0 ? L("bulk.youMore", vars) : nil
}

/// Price per bottle for n bottles: the highest quantity tier n reaches, else the guest price (unitPrice)
func unitPrice(_ w: Wine, _ n: Int) -> Double {
    (w.price_tiers ?? []).filter { $0.qty >= 2 && n >= $0.qty }.sorted { $0.qty < $1.qty }.last?.price ?? w.price_dkk ?? 0
}

/// The next quantity price the guest can reach from n bottles (nextTierLabel)
func nextTierLabel(_ w: Wine, _ n: Int) -> String? {
    (w.price_tiers ?? []).filter { $0.qty >= 2 }.sorted { $0.qty < $1.qty }.first { $0.qty > n }.map { L("price.bulk", ["n": "\($0.qty)", "price": krText($0.price)]) }
}
