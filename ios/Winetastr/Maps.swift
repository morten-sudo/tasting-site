import SwiftUI

// The site's maps (src/lib/region-map.ts, overview-map.ts, wine-map.ts, ui/map-background.ts): the same map data
// from winetastr.com/maps/, drawn natively with the same colours (components.css, component 23).

// MARK: - Data

struct RegionMap: Decodable {
    struct Area: Decodable { let d: String; let label: [Double]; let title: String? }
    struct River: Decodable { let d: String }
    struct Town: Decodable { let name: String; let x: Double; let y: Double; let size: String }
    let id: String; let name: String; let w: Double; let h: Double
    let land: String; let coast: String; let border: String?
    let rivers: [River]; let areas: [String: Area]; let towns: [Town]?
    let sources: String?; let proj: Projection?
}

struct Projection: Decodable {
    let lon0: Double; let lat1: Double; let k: Double; let s: Double
    func xy(_ lon: Double, _ lat: Double) -> CGPoint { CGPoint(x: (lon - lon0) * k * s, y: (lat1 - lat) * s) }
}

struct OverviewMap: Decodable { let id: String; let w: Double; let h: Double; let proj: Projection; let land: String; let border: String }

struct Appellation: Decodable { let id: String; let name: String; let region: String?; let country: String?; let aliases: [String]?; let lat: Double?; let lon: Double? }
struct WineRegion: Decodable { let id: String; let name: String; let country: String; let aliases: [String]?; let lat: Double?; let lon: Double? }
struct PlaceGuess: Decodable { let key: String; let name: String; let country: String; let lat: Double; let lon: Double }
struct CountryBox: Decodable { let box: [Double]; let centre: [Double] }

/// Where a wine goes on an overview map
struct Place { let lon: Double; let lat: Double; let how: String; let label: String; let country: String? }

/// The wine fields the maps use
protocol MapWine {
    var id: Int { get }
    var region: String? { get }
    var appellation: String? { get }
    var appellation_id: String? { get }
    var country: String? { get }
    var producer: String? { get }
    var producer_lat: Double? { get }
    var producer_lon: Double? { get }
}
extension Wine: MapWine {}

/// Lower case, no accents or punctuation, "st"/"ste" written out – normOrigin() on the site and in the database.
func normOrigin(_ t: String?) -> String {
    let folded = (t ?? "").lowercased().folding(options: .diacriticInsensitive, locale: nil)
        .replacingOccurrences(of: "ø", with: "o").replacingOccurrences(of: "ß", with: "s")
    let plain = folded.replacingOccurrences(of: "[^a-z0-9]+", with: " ", options: .regularExpression)
    return " \(plain) ".replacingOccurrences(of: " st ", with: " saint ").replacingOccurrences(of: " ste ", with: " sainte ")
        .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression).trimmingCharacters(in: .whitespaces)
}

// Regions that have a map, by the region name stored on wines (MAPS in region-map.ts)
private let mapIds: [String: String] = [
    "bordeaux": "bordeaux", "douro": "douro", "bourgogne": "bourgogne", "burgundy": "bourgogne", "champagne": "champagne",
    "roussillon": "roussillon", "rhone": "rhone", "rhone valley": "rhone", "vallee du rhone": "rhone", "toscana": "toscana",
    "tuscany": "toscana", "piemonte": "piemonte", "piedmont": "piemonte", "rioja": "rioja", "la rioja": "rioja",
    "mosel": "mosel", "mosel saar ruwer": "mosel",
]
/// DETAILED_MAPS: for the page backgrounds
let detailedMaps = ["bordeaux", "bourgogne", "champagne", "rhone", "roussillon", "toscana", "piemonte", "rioja", "douro", "mosel"]

func mapIdFor(_ region: String?) -> String? { region.flatMap { mapIds[normOrigin($0)] } }

/// The tasting's main region with a map: the one most of its wines come from.
func mainRegion(_ wines: [some MapWine]) -> String? {
    var counts: [String: Int] = [:]
    var order: [String] = []
    for w in wines { if let id = mapIdFor(w.region) { if counts[id] == nil { order.append(id) }; counts[id, default: 0] += 1 } }
    var best: String?
    for id in order where best == nil || counts[id]! > counts[best!]! { best = id }
    return best
}

/// Loads and keeps the map data and the shared place lists, as the site does.
actor MapStore {
    static let shared = MapStore()
    private var maps: [String: Task<RegionMap?, Never>] = [:]
    private var overviews: [String: Task<OverviewMap?, Never>] = [:]
    private var appellations: Task<[Appellation], Never>?
    private var regions: Task<[WineRegion], Never>?
    private var guesses: Task<[String: PlaceGuess], Never>?
    private var countries: Task<[String: CountryBox], Never>?
    private var tileIndex: Task<TileIndex?, Never>?
    private var tiles: [String: Task<Tile?, Never>] = [:]

    private static func json<T: Decodable>(_ path: String) async -> T? {
        guard let url = URL(string: "https://winetastr.com" + path),
              let (data, response) = try? await URLSession.shared.data(from: url),
              (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }
    func map(_ id: String) async -> RegionMap? {
        if maps[id] == nil { maps[id] = Task { await Self.json("/maps/\(id).json") } }
        return await maps[id]!.value
    }
    func overview(_ id: String) async -> OverviewMap? {
        if overviews[id] == nil { overviews[id] = Task { await Self.json("/maps/\(id).json") } }
        return await overviews[id]!.value
    }
    func appellationList() async -> [Appellation] {
        if appellations == nil { appellations = Task { (try? await Backend.table("appellations", "*")) ?? [] } }
        return await appellations!.value
    }
    func regionList() async -> [WineRegion] {
        if regions == nil { regions = Task { (try? await Backend.table("wine_regions", "id, name, country, aliases, lat, lon")) ?? [] } }
        return await regions!.value
    }
    func guessList() async -> [String: PlaceGuess] {
        if guesses == nil {
            guesses = Task {
                let rows: [PlaceGuess] = (try? await Backend.table("appellation_guesses", "key, name, country, lat, lon")) ?? []
                return Dictionary(rows.map { ($0.key, $0) }, uniquingKeysWith: { a, _ in a })
            }
        }
        return await guesses!.value
    }
    func countryList() async -> [String: CountryBox] {
        if countries == nil { countries = Task { await Self.json("/maps/countries.json") ?? [:] } }
        return await countries!.value
    }
    func index() async -> TileIndex? {
        if tileIndex == nil { tileIndex = Task { await Self.json("/maps/tiles/index.json") } }
        return await tileIndex!.value
    }
    func tile(_ key: String) async -> Tile? {
        if tiles[key] == nil { tiles[key] = Task { await Self.json("/maps/tiles/\(key).json") } }
        return await tiles[key]!.value
    }
}

struct TileIndex: Decodable { let size: Double; let tiles: [[Double]] }
struct Tile: Decodable { let land: [[Double]]; let lakes: [[Double]]; let rivers: [[Double]]; let coast: [[Double]]; let border: [[Double]] }
/// Natural Earth's detailed shapes for a small area (loadDetail in overview-map.ts), in longitude/latitude
struct Detail { var land: [[[CGPoint]]]; var lakes: [[CGPoint]]; var rivers: [[CGPoint]]; var coast: [[CGPoint]]; var border: [[CGPoint]] }

private func decodeTile(_ flat: [Double]) -> [CGPoint] {
    var out: [CGPoint] = []; var x = 0.0, y = 0.0
    var i = 0
    while i + 1 < flat.count {
        x = i == 0 ? flat[i] : x + flat[i]; y = i == 0 ? flat[i + 1] : y + flat[i + 1]
        out.append(CGPoint(x: x / 1000, y: y / 1000)); i += 2
    }
    return out
}

struct GeoBox { var lon0: Double; var lat0: Double; var lon1: Double; var lat1: Double }

func loadDetail(_ area: GeoBox) async -> Detail? {
    guard let index = await MapStore.shared.index() else { return nil }
    let size = index.size
    let have = Set(index.tiles.map { "\(Int($0[0]))_\(Int($0[1]))" })
    var keys: [String] = []
    var x = (area.lon0 / size).rounded(.down) * size
    while x < area.lon1 {
        var y = (area.lat0 / size).rounded(.down) * size
        while y < area.lat1 { let k = "\(Int(x))_\(Int(y))"; if have.contains(k) { keys.append(k) }; y += size }
        x += size
    }
    guard !keys.isEmpty, keys.count <= 16 else { return nil }
    var got: [Tile] = []
    for k in keys { if let t = await MapStore.shared.tile(k) { got.append(t) } }
    guard !got.isEmpty else { return nil }
    return Detail(land: got.map { $0.land.map(decodeTile) }, lakes: got.flatMap { $0.lakes.map(decodeTile) },
                  rivers: got.flatMap { $0.rivers.map(decodeTile) }, coast: got.flatMap { $0.coast.map(decodeTile) },
                  border: got.flatMap { $0.border.map(decodeTile) })
}

func matchRegion(_ list: [WineRegion], _ text: String?, _ country: String?) -> WineRegion? {
    let n = normOrigin(text)
    guard !n.isEmpty else { return nil }
    return list.first { (country == nil || $0.country == country) && ([$0.name] + ($0.aliases ?? [])).contains { normOrigin($0) == n } }
}

/// The known appellation in a piece of text: the longest name or alias it contains.
func matchAppellation(_ list: [Appellation], _ text: String?) -> Appellation? {
    let hay = " \(normOrigin(text)) "
    guard !hay.trimmingCharacters(in: .whitespaces).isEmpty else { return nil }
    var best: Appellation?; var bestLen = 0
    for a in list {
        for name in [a.name] + (a.aliases ?? []) {
            let n = normOrigin(name)
            if !n.isEmpty, n.count > bestLen, hay.contains(" \(n) ") { best = a; bestLen = n.count }
        }
    }
    return best
}

/// placeOf() in overview-map.ts
func placeOf(_ w: some MapWine, appellationId: String? = nil) async -> Place? {
    if let lat = w.producer_lat, let lon = w.producer_lon {
        return Place(lon: lon, lat: lat, how: "producer", label: w.producer ?? w.appellation ?? "", country: w.country)
    }
    let apps = await MapStore.shared.appellationList()
    let aid = appellationId ?? w.appellation_id
    if let aid, let a = apps.first(where: { $0.id == aid }), let lat = a.lat, let lon = a.lon {
        return Place(lon: lon, lat: lat, how: "appellation", label: a.name, country: a.country)
    }
    if let app = w.appellation, let c = w.country, let g = await MapStore.shared.guessList()["\(normOrigin(app))|\(c)"] {
        return Place(lon: g.lon, lat: g.lat, how: "guess", label: g.name, country: g.country)
    }
    if let c = w.country, let r = matchRegion(await MapStore.shared.regionList(), w.region, c), let lat = r.lat, let lon = r.lon {
        return Place(lon: lon, lat: lat, how: "regionCentre", label: r.name, country: r.country)
    }
    if let c = w.country, let box = await MapStore.shared.countryList()[c] {
        return Place(lon: box.centre[0], lat: box.centre[1], how: "country", label: w.region ?? countryName(c) ?? c, country: c)
    }
    return nil
}

private let europe = GeoBox(lon0: -11, lat0: 34.5, lon1: 32, lat1: 60.5)
func overviewFor(_ places: [Place]) -> String {
    places.allSatisfy { $0.lon > europe.lon0 && $0.lon < europe.lon1 && $0.lat > europe.lat0 && $0.lat < europe.lat1 } ? "europe" : "world"
}

/// focusFor() in overview-map.ts: the countries of the places, or for exact places the land around them.
func focusFor(_ places: [Place], close: Bool = false) async -> GeoBox {
    if close, !places.isEmpty, places.allSatisfy({ $0.how != "country" }) {
        let lon = places.map(\.lon), lat = places.map(\.lat)
        let cx = (lon.min()! + lon.max()!) / 2, cy = (lat.min()! + lat.max()!) / 2
        let dx = max(2.6, (lon.max()! - lon.min()!) * 0.8), dy = max(1.7, (lat.max()! - lat.min()!) * 0.8)
        return GeoBox(lon0: cx - dx, lat0: cy - dy, lon1: cx + dx, lat1: cy + dy)
    }
    let countries = await MapStore.shared.countryList()
    let boxes = Set(places.compactMap(\.country)).compactMap { countries[$0]?.box }
    guard !boxes.isEmpty else { return GeoBox(lon0: -10, lat0: 36, lon1: 20, lat1: 55) }
    return GeoBox(lon0: boxes.map { $0[0] }.min()!, lat0: boxes.map { $0[1] }.min()!, lon1: boxes.map { $0[2] }.max()!, lat1: boxes.map { $0[3] }.max()!)
}

// MARK: - SVG paths (the map data uses M, L and Z only)

enum SVGPath {
    static func parse(_ d: String) -> Path {
        var path = Path()
        var cmd: UInt8 = 77
        var nums: [Double] = []
        var num: [UInt8] = []
        func flushNumber() { if !num.isEmpty { nums.append(Double(String(decoding: num, as: UTF8.self)) ?? 0); num.removeAll(keepingCapacity: true) } }
        func apply() {
            var i = 0
            while i + 1 < nums.count {
                let p = CGPoint(x: nums[i], y: nums[i + 1])
                if (cmd == 77 || cmd == 109) && i == 0 { path.move(to: p) } else { path.addLine(to: p) }
                i += 2
            }
            nums.removeAll(keepingCapacity: true)
        }
        for b in d.utf8 {
            switch b {
            case 77, 76, 90, 109, 108, 122:
                flushNumber(); apply()
                if b == 90 || b == 122 { path.closeSubpath() }
                cmd = b
            case 32, 44, 10, 9: flushNumber()
            case 45: flushNumber(); num.append(b)
            default: num.append(b)
            }
        }
        flushNumber(); apply()
        return path
    }
}

// MARK: - The region map (drawMap)

/// A map drawn once: paths parsed and the labels placed, as drawMap() does.
struct RegionDrawing {
    enum Mode { case full, background }
    struct Label { let text: String; let at: CGPoint; let anchor: UnitPoint; let kind: Kind; enum Kind { case badgeTitle, town(String), part } }
    struct Badge { let n: Int; let at: CGPoint }
    let map: RegionMap
    let mode: Mode
    let land: Path, coast: Path, border: Path?
    let rivers: [Path]
    let areas: [(path: Path, opacity: Double, on: Bool)]
    var labels: [Label] = []
    var badges: [Badge] = []
    var towns: [(at: CGPoint, r: Double)] = []
    var pins: [CGPoint] = []
    var view: CGRect

    init(_ map: RegionMap, mode: Mode = .full, counts: [String: Int] = [:], titles: [String: String] = [:], wholeRegion: Bool = false,
         numbered: Bool = true, pins pinList: [(lon: Double, lat: Double)] = []) {
        self.map = map; self.mode = mode
        land = SVGPath.parse(map.land); coast = SVGPath.parse(map.coast)
        border = (map.border ?? "").isEmpty ? nil : SVGPath.parse(map.border!)
        rivers = map.rivers.map { SVGPath.parse($0.d) }
        let maxN = Double(max(1, counts.values.max() ?? 1))
        areas = map.areas.sorted { $0.key < $1.key }.map { id, a in
            let n = Double(counts[id] ?? 0)
            let op = n > 0 ? 0.35 + 0.45 * (n / maxN) : wholeRegion ? 0.28 : 0
            return (SVGPath.parse(a.d), op, n > 0 || wholeRegion)
        }
        view = CGRect(x: 0, y: 0, width: map.w, height: map.h)
        guard mode == .full else { return }

        struct Box { var x0, y0, x1, y1: Double }
        var taken: [Box] = []
        func hits(_ b: Box) -> Bool { taken.contains { b.x0 < $0.x1 && b.x1 > $0.x0 && b.y0 < $0.y1 && b.y1 > $0.y0 } }
        let list = counts.filter { $0.value > 0 && map.areas[$0.key] != nil }.sorted { $0.key < $1.key }
            .map { (id: $0.key, n: $0.value, x: map.areas[$0.key]!.label[0], y: map.areas[$0.key]!.label[1]) }
        if numbered { for b in list { taken.append(Box(x0: b.x - 15, y0: b.y - 15, x1: b.x + 15, y1: b.y + 15)) } }
        var titleLabels: [Label] = []
        for b in list {
            let title = titles[b.id] ?? map.areas[b.id]?.title ?? ""
            guard !title.isEmpty else { continue }
            let w = Double(title.count) * 8.6, h = 18.0
            let spots: [(Double, Double, String)] = numbered ? [
                (b.x + 18, b.y + 6, "start"), (b.x - 18, b.y + 6, "end"), (b.x, b.y + 32, "middle"), (b.x, b.y - 22, "middle"),
                (b.x + 18, b.y + 30, "start"), (b.x - 18, b.y - 18, "end"),
            ] : [(b.x, b.y + 6, "middle")]
            func box(_ s: (Double, Double, String)) -> Box {
                let x0 = s.2 == "start" ? s.0 : s.2 == "end" ? s.0 - w : s.0 - w / 2
                return Box(x0: x0, y0: s.1 - h + 4, x1: x0 + w, y1: s.1 + 4)
            }
            let spot = spots.first { !hits(box($0)) && box($0).x0 >= 0 && box($0).x1 <= map.w } ?? spots[0]
            taken.append(box(spot))
            titleLabels.append(Label(text: title, at: CGPoint(x: spot.0, y: spot.1),
                                     anchor: spot.2 == "start" ? .leading : spot.2 == "end" ? .trailing : .center, kind: .badgeTitle))
        }
        let named = titles.values.map { normOrigin($0) }
        for t in map.towns ?? [] {
            let r = t.size == "big" ? 4.5 : t.size == "mid" ? 3.5 : 2.6
            let fs = t.size == "big" ? 22.0 : t.size == "mid" ? 17.0 : 14.0
            let tb = Box(x0: t.x - 4, y0: t.y - 6 - fs, x1: t.x + 7 + Double(t.name.count) * fs * 0.48, y1: t.y + 4)
            let first = normOrigin(t.name).split(separator: " ").first.map(String.init) ?? ""
            if t.size != "big" && (hits(tb) || named.contains { $0.contains(first) }) { continue }
            taken.append(tb)
            towns.append((CGPoint(x: t.x, y: t.y), r))
            labels.append(Label(text: t.name, at: CGPoint(x: t.x + 7, y: t.y - 6), anchor: .leading, kind: .town(t.size)))
        }
        if wholeRegion && list.isEmpty {
            for a in map.areas.values { if let title = a.title { labels.append(Label(text: title.uppercased(), at: CGPoint(x: a.label[0], y: a.label[1]), anchor: .center, kind: .part)) } }
        }
        labels += titleLabels
        if numbered { badges = list.map { Badge(n: $0.n, at: CGPoint(x: $0.x, y: $0.y)) } }
        if let proj = map.proj {
            for p in pinList {
                let at = proj.xy(p.lon, p.lat)
                if at.x >= 0 && at.x <= map.w && at.y >= 0 && at.y <= map.h { pins.append(at) }
            }
        }
    }

    /// fitToAreas(): zoom to the filled areas when they cover a small part of the map.
    mutating func fitToAreas(minShare: Double = 0.55) {
        let on = areas.filter { $0.on && $0.opacity > 0 }.map { $0.path.boundingRect }
        guard let first = on.first else { return }
        let b = on.dropFirst().reduce(first) { $0.union($1) }
        let ratio = map.w / map.h
        var w = max(b.width * 1.5, map.w * minShare)
        let h = max(b.height * 1.5, w / ratio)
        w = max(w, h * ratio)
        guard w < map.w * 0.95 else { return }
        let hh = w / ratio
        let x = min(max(b.midX - w / 2, 0), map.w - w), y = min(max(b.midY - hh / 2, 0), map.h - hh)
        view = CGRect(x: x, y: y, width: w, height: hh)
    }
}

private enum MapColor {
    static func hex(_ v: UInt32, _ a: Double = 1) -> Color { Color(red: Double((v >> 16) & 255) / 255, green: Double((v >> 8) & 255) / 255, blue: Double(v & 255) / 255).opacity(a) }
    static let sea = hex(0xE6ECEC), wave = hex(0x7D97A3), land = hex(0xFBF6EE), areaLine = hex(0x8A6A55), bordeaux = hex(0x6E0F1F)
    static let border = hex(0x8A7A70), water = hex(0x6F93A8), town = hex(0x3D2A22), coastLine = hex(0xC9B9A8)
}

/// Draws text with the halo the site gets from paint-order: stroke
private func haloText(_ ctx: inout GraphicsContext, _ text: Text, _ halo: Text, at p: CGPoint, anchor: UnitPoint, width: Double) {
    let r = width / 2
    for (dx, dy) in [(-r, 0), (r, 0), (0, -r), (0, r), (-r * 0.7, -r * 0.7), (r * 0.7, -r * 0.7), (-r * 0.7, r * 0.7), (r * 0.7, r * 0.7)] {
        ctx.draw(halo, at: CGPoint(x: p.x + dx, y: p.y + dy), anchor: anchor)
    }
    ctx.draw(text, at: p, anchor: anchor)
}

/// The text baseline in SVG is at y; Canvas anchors the text box, so the box is moved up by about the cap height.
private func baseline(_ p: CGPoint, _ size: Double) -> CGPoint { CGPoint(x: p.x, y: p.y - size * 0.36) }

extension RegionDrawing {
    func draw(_ ctx: inout GraphicsContext, view v: CGRect, size: CGSize) {
        let k = min(size.width / v.width, size.height / v.height)
        ctx.translateBy(x: (size.width - v.width * k) / 2, y: (size.height - v.height * k) / 2)
        ctx.scaleBy(x: k, y: k)
        ctx.translateBy(x: -v.minX, y: -v.minY)
        let bg = mode == .background
        if !bg {
            ctx.fill(Path(CGRect(x: 0, y: 0, width: map.w, height: map.h)), with: .color(MapColor.sea))
            for i in 1...4 {
                var c = ctx; c.translateBy(x: Double(-5 * i), y: 0)
                c.stroke(coast, with: .color(MapColor.wave.opacity(0.5 - Double(i) * 0.1)), lineWidth: 0.7)
            }
            ctx.fill(land, with: .color(MapColor.land))
        }
        let tone = bg ? MapColor.bordeaux : MapColor.bordeaux
        for a in areas {
            if a.opacity > 0 { ctx.fill(a.path, with: .color(tone.opacity(a.opacity))) }
            if bg { ctx.stroke(a.path, with: .color(tone), lineWidth: 1.1) }
            else if a.on && a.opacity > 0 { ctx.stroke(a.path, with: .color(MapColor.bordeaux), style: StrokeStyle(lineWidth: 1.2, lineJoin: .round)) }
            else { ctx.stroke(a.path, with: .color(MapColor.areaLine), style: StrokeStyle(lineWidth: 0.7, lineJoin: .round, dash: [3, 3])) }
        }
        if let border { ctx.stroke(border, with: .color(bg ? tone : MapColor.border), style: StrokeStyle(lineWidth: 1, dash: bg ? [] : [8, 4, 2, 4])) }
        for r in rivers { ctx.stroke(r, with: .color(bg ? tone : MapColor.water), style: StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round)) }
        ctx.stroke(coast, with: .color(bg ? tone : MapColor.water), lineWidth: 1.2)
        guard !bg else { return }
        for t in towns { ctx.fill(Path(ellipseIn: CGRect(x: t.at.x - t.r, y: t.at.y - t.r, width: t.r * 2, height: t.r * 2)), with: .color(MapColor.town)) }
        for l in labels {
            switch l.kind {
            case .town(let s):
                let fs = s == "big" ? 22.0 : s == "mid" ? 17.0 : 14.0
                haloText(&ctx, Text(l.text).font(.custom("CormorantGaramond-Regular", fixedSize: fs)).italic().foregroundStyle(MapColor.town),
                         Text(l.text).font(.custom("CormorantGaramond-Regular", fixedSize: fs)).italic().foregroundStyle(MapColor.land),
                         at: baseline(l.at, fs), anchor: l.anchor == .leading ? .leading : l.anchor, width: 3)
            case .part:
                haloText(&ctx, Text(l.text).font(.custom("Inter-SemiBold", fixedSize: 15)).tracking(3.75).foregroundStyle(MapColor.bordeaux.opacity(0.75)),
                         Text(l.text).font(.custom("Inter-SemiBold", fixedSize: 15)).tracking(3.75).foregroundStyle(MapColor.land),
                         at: baseline(l.at, 15), anchor: .center, width: 3)
            case .badgeTitle:
                haloText(&ctx, Text(l.text).font(.custom("CormorantGaramond-Regular", fixedSize: 17)).fontWeight(.semibold).italic().foregroundStyle(MapColor.bordeaux),
                         Text(l.text).font(.custom("CormorantGaramond-Regular", fixedSize: 17)).fontWeight(.semibold).italic().foregroundStyle(MapColor.land),
                         at: baseline(l.at, 17), anchor: l.anchor, width: 4)
            }
        }
        for b in badges {
            let c = Path(ellipseIn: CGRect(x: b.at.x - 13, y: b.at.y - 13, width: 26, height: 26))
            ctx.fill(c, with: .color(MapColor.bordeaux)); ctx.stroke(c, with: .color(.white), lineWidth: 2)
            ctx.draw(Text("\(b.n)").font(.custom("Inter-SemiBold", fixedSize: 14)).foregroundStyle(.white), at: b.at, anchor: .center)
        }
        for p in pins { drawPin(&ctx, at: p, scale: 1.2) }
    }
}

/// pinSvg(): a map pin whose tip is at the point
private func drawPin(_ ctx: inout GraphicsContext, at p: CGPoint, scale s: Double) {
    var pin = Path()
    pin.move(to: CGPoint(x: 0, y: 0))
    pin.addCurve(to: CGPoint(x: -11, y: -22), control1: CGPoint(x: -3, y: -9), control2: CGPoint(x: -11, y: -13))
    pin.addArc(center: CGPoint(x: 0, y: -22), radius: 11, startAngle: .degrees(180), endAngle: .degrees(0), clockwise: false)
    pin.addCurve(to: CGPoint(x: 0, y: 0), control1: CGPoint(x: 11, y: -13), control2: CGPoint(x: 3, y: -9))
    pin.closeSubpath()
    let t = CGAffineTransform(translationX: p.x, y: p.y).scaledBy(x: s, y: s)
    let shape = pin.applying(t)
    ctx.fill(shape, with: .color(MapColor.bordeaux)); ctx.stroke(shape, with: .color(.white), lineWidth: 2)
    ctx.fill(Path(ellipseIn: CGRect(x: -4, y: -26, width: 8, height: 8)).applying(t), with: .color(.white))
}

// MARK: - The overview map (drawOverview)

struct OverviewDrawing {
    struct Pin { let lon: Double; let lat: Double; var label: String? = nil; var n: Int? = nil }
    let map: OverviewMap
    let land: Path, border: Path
    let pins: [Pin]
    let view: CGRect
    let inset: Bool
    var detail: (land: [Path], lakes: Path?, rivers: Path?, coast: Path?, border: Path?)?

    init(_ map: OverviewMap, pins: [Pin], focus: GeoBox, inset: Bool = false, detail: Detail? = nil) {
        self.map = map; self.pins = pins; self.inset = inset
        land = SVGPath.parse(map.land); border = SVGPath.parse(map.border)
        let a = map.proj.xy(focus.lon0, focus.lat1), b = map.proj.xy(focus.lon1, focus.lat0)
        var x0 = a.x, y0 = a.y, x1 = b.x, y1 = b.y
        let pad = max(x1 - x0, y1 - y0) * 0.08
        x0 -= pad; y0 -= pad; x1 += pad; y1 += pad
        let want = inset ? 1.15 : 1.45
        var w = x1 - x0, h = y1 - y0
        if w / h < want { let nw = h * want; x0 -= (nw - w) / 2; w = nw } else { let nh = w / want; y0 -= (nh - h) / 2; h = nh }
        view = CGRect(x: x0, y: y0, width: w, height: h)
        if let detail {
            let proj = map.proj
            func path(_ shapes: [[CGPoint]], close: Bool) -> Path {
                var p = Path()
                for s in shapes where !s.isEmpty {
                    p.move(to: proj.xy(s[0].x, s[0].y))
                    for q in s.dropFirst() { p.addLine(to: proj.xy(q.x, q.y)) }
                    if close { p.closeSubpath() }
                }
                return p
            }
            self.detail = (detail.land.map { path($0, close: true) }, detail.lakes.isEmpty ? nil : path(detail.lakes, close: true),
                           detail.rivers.isEmpty ? nil : path(detail.rivers, close: false), detail.coast.isEmpty ? nil : path(detail.coast, close: false),
                           detail.border.isEmpty ? nil : path(detail.border, close: false))
        }
    }

    func draw(_ ctx: inout GraphicsContext, view v: CGRect, size: CGSize) {
        let k = min(size.width / v.width, size.height / v.height)
        ctx.translateBy(x: (size.width - v.width * k) / 2, y: (size.height - v.height * k) / 2)
        ctx.scaleBy(x: k, y: k)
        ctx.translateBy(x: -v.minX, y: -v.minY)
        let u = view.width / 100
        ctx.fill(Path(view), with: .color(MapColor.sea))
        let dash = StrokeStyle(lineWidth: u * 0.18, dash: [u * 1.2, u * 0.6])
        if let d = detail {
            for l in d.land { ctx.fill(l, with: .color(MapColor.land), style: FillStyle(eoFill: true)) }
            if let lakes = d.lakes { ctx.fill(lakes, with: .color(MapColor.sea), style: FillStyle(eoFill: true)) }
            if let r = d.rivers { ctx.stroke(r, with: .color(MapColor.water.opacity(0.55)), style: StrokeStyle(lineWidth: u * 0.22, lineCap: .round, lineJoin: .round)) }
            if let c = d.coast { ctx.stroke(c, with: .color(MapColor.coastLine), lineWidth: u * 0.16) }
            if let b = d.border { ctx.stroke(b, with: .color(MapColor.border), style: dash) }
        } else {
            ctx.fill(land, with: .color(MapColor.land))
            ctx.stroke(land, with: .color(MapColor.coastLine), lineWidth: u * 0.12)
            ctx.stroke(border, with: .color(MapColor.border), style: dash)
        }
        for p in pins {
            let at = map.proj.xy(p.lon, p.lat)
            let r = inset ? u * 3.2 : u * 1.6
            ctx.fill(Path(ellipseIn: CGRect(x: at.x - r * 2.6, y: at.y - r * 2.6, width: r * 5.2, height: r * 5.2)), with: .color(MapColor.bordeaux.opacity(0.14)))
            if let n = p.n {
                let rr = u * 2.6
                let c = Path(ellipseIn: CGRect(x: at.x - rr, y: at.y - rr, width: rr * 2, height: rr * 2))
                ctx.fill(c, with: .color(MapColor.bordeaux)); ctx.stroke(c, with: .color(.white), lineWidth: u * 0.4)
                ctx.draw(Text("\(n)").font(.custom("Inter-SemiBold", fixedSize: u * 3)).foregroundStyle(.white), at: at, anchor: .center)
            } else {
                let c = Path(ellipseIn: CGRect(x: at.x - r, y: at.y - r, width: r * 2, height: r * 2))
                ctx.fill(c, with: .color(MapColor.bordeaux)); ctx.stroke(c, with: .color(.white), lineWidth: u * 0.5)
            }
            if let label = p.label, !inset {
                let fs = u * 3.4
                haloText(&ctx, Text(label).font(.custom("CormorantGaramond-Regular", fixedSize: fs)).fontWeight(.semibold).italic().foregroundStyle(MapColor.bordeaux),
                         Text(label).font(.custom("CormorantGaramond-Regular", fixedSize: fs)).fontWeight(.semibold).italic().foregroundStyle(MapColor.land),
                         at: baseline(CGPoint(x: at.x + u * 3.4, y: at.y - u * 1.2), fs), anchor: .leading, width: fs * 0.25)
            }
        }
    }
}

// MARK: - Views

/// Either kind of map, ready to draw
enum MapDrawing {
    case region(RegionDrawing)
    case overview(OverviewDrawing)
    var view: CGRect { switch self { case .region(let r): r.view; case .overview(let o): o.view } }
    func draw(_ ctx: inout GraphicsContext, view: CGRect, size: CGSize) {
        switch self { case .region(let r): r.draw(&ctx, view: view, size: size); case .overview(let o): o.draw(&ctx, view: view, size: size) }
    }
}

/// .map-box with the zoom of map-zoom.ts: + and − in the corner, pinch, double-tap, and drag once zoomed.
struct MapBox: View {
    let drawing: MapDrawing
    var zoomable = true
    var label: String? = nil
    @State private var zoom: Double = 1
    @State private var center: CGPoint?
    @GestureState private var pinch: Double = 1
    @GestureState private var drag: CGSize = .zero

    private let maxZoom = 6.0, step = 1.6

    var body: some View {
        let home = drawing.view
        GeometryReader { geo in
            let z = min(maxZoom, max(1, zoom * pinch))
            let v = visible(home, z, geo.size)
            Canvas { ctx, size in drawing.draw(&ctx, view: v, size: size) }
                .contentShape(Rectangle())
                .gesture(zoomable ? MagnifyGesture().updating($pinch) { g, s, _ in s = g.magnification }
                    .onEnded { g in zoom = min(maxZoom, max(1, zoom * g.magnification)); if zoom <= 1.01 { center = nil } } : nil)
                .simultaneousGesture(zoomable && zoom > 1 ? DragGesture().updating($drag) { g, s, _ in s = g.translation }
                    .onEnded { g in center = shifted(v, g.translation, geo.size) } : nil)
                .onTapGesture(count: 2) { if zoomable { withAnimation(.easeOut(duration: 0.2)) { zoom = min(maxZoom, zoom * step) } } }
                .overlay(alignment: .topTrailing) {
                    if zoomable {
                        VStack(spacing: 6) {
                            zoomButton("plus", L("map.zoomIn"), enabled: zoom < maxZoom - 0.01) { withAnimation(.easeOut(duration: 0.2)) { zoom = min(maxZoom, zoom * step) } }
                            zoomButton("minus", L("map.zoomOut"), enabled: zoom > 1.01) {
                                withAnimation(.easeOut(duration: 0.2)) { zoom = zoom / step <= 1.01 ? 1 : zoom / step; if zoom == 1 { center = nil } }
                            }
                        }
                        .padding(8)
                    }
                }
        }
        .aspectRatio(home.width / home.height, contentMode: .fit)
        .background(MapColor.land)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.rule))
        .accessibilityElement().accessibilityLabel(label ?? "").accessibilityAddTraits(.isImage)
    }

    /// The part of the map in view at zoom z (kept inside the starting view), moved by the current drag
    private func visible(_ home: CGRect, _ z: Double, _ size: CGSize) -> CGRect {
        let w = home.width / z, h = home.height / z
        var c = center ?? CGPoint(x: home.midX, y: home.midY)
        if drag != .zero, size.width > 0 { c.x -= drag.width * w / size.width; c.y -= drag.height * h / size.height }
        let x = min(max(c.x - w / 2, home.minX), home.maxX - w), y = min(max(c.y - h / 2, home.minY), home.maxY - h)
        return CGRect(x: x, y: y, width: w, height: h)
    }
    private func shifted(_ v: CGRect, _ t: CGSize, _ size: CGSize) -> CGPoint {
        CGPoint(x: v.midX - t.width * v.width / max(size.width, 1), y: v.midY - t.height * v.height / max(size.height, 1))
    }
    private func zoomButton(_ icon: String, _ label: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            SiteIcon(icon, size: 18).foregroundStyle(enabled ? Color.paper : Color.fieldLine)
                .frame(width: 36, height: 36)
                .background(Color.surface, in: RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.rule))
        }
        .disabled(!enabled).accessibilityLabel(label)
        .frame(width: 44, height: 44)
    }
}

/// The faint map behind a heading (.hero-bg): the region in the bordeaux colour, faded at the edges.
struct MapBackdrop: View {
    let drawing: RegionDrawing
    var opacity = 0.22
    var body: some View {
        Canvas { ctx, size in drawing.draw(&ctx, view: drawing.view, size: size) }
            .aspectRatio(drawing.view.width / drawing.view.height, contentMode: .fit)
            .mask(RadialGradient(colors: [.black, .black, .clear], center: .center, startRadius: 0, endRadius: 260))
            .opacity(opacity)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

/// pageBackground(): every screen gets a faint region map in the top right corner, picked from the site page's address,
/// so a page always gets the same one as on the site.
struct PageBackground: View {
    let path: String
    @State private var drawing: RegionDrawing?
    var body: some View {
        GeometryReader { geo in
            if let drawing {
                MapBackdrop(drawing: drawing, opacity: 0.16)
                    .frame(width: geo.size.width * 0.8, height: 320, alignment: .topTrailing)
                    .frame(maxWidth: .infinity, alignment: .topTrailing)
                    .offset(y: -16)
            }
        }
        .allowsHitTesting(false)
        .task {
            var h: UInt32 = 0
            for c in path.unicodeScalars { h = h &* 31 &+ UInt32(c.value) }
            if let m = await MapStore.shared.map(detailedMaps[Int(h % UInt32(detailedMaps.count))]) {
                drawing = RegionDrawing(m, mode: .background, wholeRegion: true)
            }
        }
    }
}

/// "Kort: Natural Earth; IGN" under a map, at the right (setMapCredit)
struct MapCredit: View {
    let sources: String?
    var osm = false
    var body: some View {
        let parts = [sources.map { L("map.source", ["sources": $0]) }, osm ? "© OpenStreetMap" : nil].compactMap { $0 }
        if !parts.isEmpty {
            Text(parts.joined(separator: sources != nil && osm ? "; " : ""))
                .font(.body(11.5)).foregroundStyle(Color.muted).frame(maxWidth: .infinity, alignment: .trailing)
        }
    }
}

/// [1, 2, 3, 5, 9, 10] → "1–3, 5, 9–10"
func numberRanges(_ nums: [Int]) -> String {
    let n = Array(Set(nums.filter { $0 > 0 })).sorted()
    var out: [String] = []; var i = 0
    while i < n.count {
        var j = i
        while j + 1 < n.count && n[j + 1] == n[j] + 1 { j += 1 }
        out.append(j > i + 1 ? "\(n[i])–\(n[j])" : j == i + 1 ? "\(n[i]), \(n[j])" : "\(n[i])")
        i = j + 1
    }
    return out.joined(separator: ", ")
}
