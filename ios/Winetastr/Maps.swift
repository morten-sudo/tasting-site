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
    /// Appellations that cover the whole region (Porto, Bourgogne AOC …): the region is their lowest level
    let whole: [String]?
    /// area id → the areas it lies in (scripts/map-hierarchy.py), largest first – optional: older map files lack it
    let within: [String: [String]]?
}

struct Projection: Decodable {
    let lon0: Double; let lat1: Double; let k: Double; let s: Double
    func xy(_ lon: Double, _ lat: Double) -> CGPoint { CGPoint(x: (lon - lon0) * k * s, y: (lat1 - lat) * s) }
}

struct OverviewMap: Decodable { let id: String; let w: Double; let h: Double; let proj: Projection; let land: String; let border: String }

struct Appellation: Decodable { let id: String; let name: String; let region: String?; let country: String?; let aliases: [String]?; let lat: Double?; let lon: Double?; let subregion: String? }
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

/// detailFor(): the detailed tiles for a map of `focus` when it is a small area, with room around; else nil
func detailFor(_ focus: GeoBox) async -> Detail? {
    guard focus.lon1 - focus.lon0 < 20 && focus.lat1 - focus.lat0 < 14 else { return nil }
    let m = max(focus.lon1 - focus.lon0, focus.lat1 - focus.lat0) * 0.35
    return await loadDetail(GeoBox(lon0: focus.lon0 - m, lat0: focus.lat0 - m, lon1: focus.lon1 + m, lat1: focus.lat1 + m))
}

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
    var boxes = Set(places.compactMap(\.country)).compactMap { countries[$0]?.box }
    // The places themselves too: a country's box is its mainland, so an island (Madeira, the Canaries) would be outside
    for p in places where p.how != "country" { boxes.append([p.lon - 0.5, p.lat - 0.5, p.lon + 0.5, p.lat + 0.5]) }
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

// MARK: - The wine's levels on the map (levelOf() in region-map.ts, WIN-293)

/// areaName(): the appellation list's name, else the map's title, else the id written out
func areaName(_ map: RegionMap, _ id: String, _ apps: [Appellation]) -> String {
    if let a = apps.first(where: { $0.id == id }) { return a.name }
    if let t = map.areas[id]?.title { return t }
    let small: Set<String> = ["sur", "de", "du", "des", "la", "le", "les", "d", "en", "di", "del", "della"]
    return id.split(separator: "-").enumerated().map { i, p in i > 0 && small.contains(String(p)) ? String(p) : p.prefix(1).uppercased() + p.dropFirst() }.joined(separator: "-")
}

/// Where one wine goes on its region's map: an area, an appellation the map cannot fill (a pin), or the region itself
struct Level {
    enum Kind { case area, pin, region }
    let kind: Kind
    /// the area's id (.area), else the appellation's id or ""
    let id: String
    let name: String
    /// the areas between the region and the lowest level (lighter tone)
    var mid: [String] = []
    var midName: String? = nil
    var pin: (lon: Double, lat: Double)? = nil
}

func levelOf(_ map: RegionMap, appellation: String?, appellationId: String?, _ apps: [Appellation]) -> Level {
    let byId = Dictionary(apps.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    var aid = appellationId ?? ""
    if aid.isEmpty, let t = appellation { aid = matchAppellation(apps, t)?.id ?? "" }
    let app = aid.isEmpty ? nil : byId[aid]
    let whole = map.whole ?? []
    func between(_ me: String, _ sub: String?) -> ([String], String?) {
        var mid = Set(map.within?[me] ?? [])
        let s = normOrigin(sub)
        if !s.isEmpty { for id in map.areas.keys where normOrigin(byId[id]?.subregion) == s || normOrigin(areaName(map, id, apps)) == s { mid.insert(id) } }
        mid.remove(me)
        let trimmed = sub?.trimmingCharacters(in: .whitespaces) ?? ""
        let name = !trimmed.isEmpty ? trimmed : map.within?[me]?.first.map { areaName(map, $0, apps) }
        return (mid.sorted(), mid.isEmpty ? nil : name)
    }
    // The area: the appellation's own, else an area whose name is in the text (areas that are not on the list)
    var area: String? = !aid.isEmpty && map.areas[aid] != nil ? aid : nil
    if area == nil {
        let hay = " \(normOrigin(appellation)) "
        var len = 0
        if !hay.trimmingCharacters(in: .whitespaces).isEmpty {
            for id in map.areas.keys.sorted() {
                for n in Set([normOrigin(areaName(map, id, apps)), normOrigin(id)]) where !n.isEmpty && n.count > len && hay.contains(" \(n) ") { area = id; len = n.count }
            }
        }
    }
    if let area {
        let (mid, midName) = between(area, byId[area]?.subregion)
        return Level(kind: .area, id: area, name: areaName(map, area, apps), mid: mid, midName: midName)
    }
    if let app, !whole.contains(app.id), mapIdFor(app.region) == map.id, let lat = app.lat, let lon = app.lon, let proj = map.proj {
        let p = proj.xy(lon, lat)
        if p.x >= 0 && p.x <= map.w && p.y >= 0 && p.y <= map.h {
            let (mid, midName) = between("", app.subregion)
            return Level(kind: .pin, id: app.id, name: app.name, mid: mid, midName: midName, pin: (lon, lat))
        }
    }
    let typed = appellation?.trimmingCharacters(in: .whitespaces) ?? ""
    return Level(kind: .region, id: app?.id ?? "", name: app?.name ?? (typed.isEmpty ? map.name : typed))
}

/// labelScale(): names, numbers and pins drawn bigger in a narrow box, so an area's name is about 12.5 pt on screen
func labelScale(_ map: RegionMap, width: Double) -> Double { width > 0 ? max(1, 12.5 / (17 * (width / map.w))) : 1 }

// MARK: - The region map (drawMap)

/// A map drawn once: paths parsed and the labels placed, as drawMap() does. The whole region in three tones: the wines'
/// lowest known areas strongest, the levels between lighter, the rest light – all fills, then all outlines.
struct RegionDrawing {
    enum Mode { case full, background }
    enum Tone { case light, mid, strong }
    struct Label {
        let text: String; let at: CGPoint; let anchor: UnitPoint; let kind: Kind
        /// The point the label belongs to (badge, town): zooming keeps the label beside it at the same on-screen distance
        var base: CGPoint? = nil
        enum Kind { case badgeTitle, town(String), part }
    }
    struct Badge { let n: Int; let at: CGPoint }
    let map: RegionMap
    let mode: Mode
    let land: Path, coast: Path, border: Path?
    let rivers: [Path]
    /// Light first, then the lighter tone, then the strongest (the larger areas first within a tone)
    let areas: [(path: Path, tone: Tone)]
    var labels: [Label] = []
    var badges: [Badge] = []
    var towns: [(at: CGPoint, r: Double)] = []
    var pins: [CGPoint] = []
    var view: CGRect
    /// the labels' own scale at the starting view (labelScale())
    var s: Double = 1

    init(_ map: RegionMap, mode: Mode = .full, counts: [String: Int] = [:], titles: [String: String] = [:], mid: Set<String> = [], wholeRegion: Bool = false,
         numbered: Bool = true, named: [(lon: Double, lat: Double, title: String)] = [], pins pinList: [(lon: Double, lat: Double)] = [], scale S: Double = 1, boxWidth: Double = 0) {
        self.map = map; self.mode = mode; self.s = S
        land = SVGPath.parse(map.land); coast = SVGPath.parse(map.coast)
        border = (map.border ?? "").isEmpty ? nil : SVGPath.parse(map.border!)
        rivers = map.rivers.map { SVGPath.parse($0.d) }
        func tone(_ id: String) -> Tone { wholeRegion || (counts[id] ?? 0) > 0 ? .strong : mid.contains(id) ? .mid : .light }
        func rank(_ t: Tone) -> Int { t == .strong ? 2 : t == .mid ? 1 : 0 }
        areas = map.areas.sorted { a, b in
            let ra = rank(tone(a.key)), rb = rank(tone(b.key))
            return ra != rb ? ra < rb : a.value.d.count != b.value.d.count ? a.value.d.count > b.value.d.count : a.key < b.key
        }.map { (SVGPath.parse($0.value.d), tone($0.key)) }
        view = CGRect(x: 0, y: 0, width: map.w, height: map.h)
        guard mode == .full else { return }

        struct Box { var x0, y0, x1, y1: Double }
        var taken: [Box] = []
        func meets(_ b: Box, _ t: Box) -> Bool { b.x0 < t.x1 && b.x1 > t.x0 && b.y0 < t.y1 && b.y1 > t.y0 }
        func hits(_ b: Box) -> Bool { taken.contains { meets(b, $0) } }
        func around(_ x: Double, _ y: Double, _ x0: Double, _ y0: Double, _ x1: Double, _ y1: Double) -> Box { Box(x0: x + x0 * S, y0: y + y0 * S, x1: x + x1 * S, y1: y + y1 * S) }
        struct Mark { let n: Int; var x: Double; var y: Double; let pin: Bool; let title: String }
        var marks = counts.filter { $0.value > 0 && map.areas[$0.key] != nil }.sorted { $0.key < $1.key }
            .map { Mark(n: $0.value, x: map.areas[$0.key]!.label[0], y: map.areas[$0.key]!.label[1], pin: false, title: titles[$0.key] ?? map.areas[$0.key]?.title ?? "") }
        var pinned: [Mark] = []
        if let proj = map.proj {
            for p in named {
                let at = proj.xy(p.lon, p.lat)
                if at.x >= 0 && at.x <= map.w && at.y >= 0 && at.y <= map.h { pinned.append(Mark(n: 0, x: at.x, y: at.y, pin: true, title: p.title)) }
            }
        }
        // Badges of neighbouring areas moved apart until they are free (most wines first)
        if numbered {
            let R = 15 * S
            var placed: [CGPoint] = []
            let order = marks.indices.sorted { marks[$0].n != marks[$1].n ? marks[$0].n > marks[$1].n : marks[$0].y < marks[$1].y }
            for i in order {
                func free(_ x: Double, _ y: Double) -> Bool { placed.allSatisfy { hypot($0.x - x, $0.y - y) >= 2 * R } }
                var at = (marks[i].x, marks[i].y)
                var ring = 1
                search: while ring <= 4 && !free(at.0, at.1) {
                    for k in 0..<(8 * ring) {
                        let a = Double(k) / Double(8 * ring) * 2 * .pi + .pi / 2
                        let x = marks[i].x + cos(a) * R * 1.1 * Double(ring), y = marks[i].y + sin(a) * R * 1.1 * Double(ring)
                        if free(x, y) && x > R && x < map.w - R && y > R && y < map.h - R { at = (x, y); break search }
                    }
                    ring += 1
                }
                marks[i].x = at.0; marks[i].y = at.1
                placed.append(CGPoint(x: at.0, y: at.1))
                taken.append(around(at.0, at.1, -15, -15, 15, 15))
            }
        }
        for p in pinned { taken.append(around(p.x, p.y, -14 * 1.2, -34 * 1.2, 14 * 1.2, 0)) }
        // The zoom buttons (MapBox: 2 × 44 pt plus padding, top right) at the starting view: no name under them
        if boxWidth > 0 { let k = boxWidth / map.w; taken.append(Box(x0: map.w - 56 / k, y0: 0, x1: map.w, y1: 106 / k)) }
        // The big towns: their names reserved before the wines' names, which win when there is no other room
        func townBox(_ t: RegionMap.Town, _ fs: Double, _ left: Bool) -> Box {
            left ? around(t.x, t.y, -7 - Double(t.name.count) * fs * 0.48, -6 - fs, 4, 4) : around(t.x, t.y, -4, -6 - fs, 7 + Double(t.name.count) * fs * 0.48, 4)
        }
        var bigBox: [String: (box: Box, left: Bool)] = [:]
        for t in map.towns ?? [] where t.size == "big" { let left = townBox(t, 22, false).x1 > map.w; bigBox[t.name] = (townBox(t, 22, left), left) }
        var titleLabels: [Label] = []
        for b in marks + pinned where !b.title.isEmpty {
            let w = Double(b.title.count) * 8.6, h = 18.0
            let spots: [(Double, Double, String)] = b.pin ? [(18, -22, "start"), (-18, -22, "end"), (0, 20, "middle"), (0, -48, "middle")]
                : numbered ? [(18, 6, "start"), (-18, 6, "end"), (0, 32, "middle"), (0, -22, "middle"), (18, 30, "start"), (-18, -18, "end"), (-18, 30, "end"), (18, -18, "start")]
                : [(0, 6, "middle")]
            func box(_ s: (Double, Double, String)) -> Box {
                let x0 = s.2 == "start" ? s.0 : s.2 == "end" ? s.0 - w : s.0 - w / 2
                return around(b.x, b.y, x0, s.1 - h + 4, x0 + w, s.1 + 4)
            }
            func onBig(_ q: Box) -> Bool { bigBox.values.contains { meets(q, $0.box) } }
            let inside = spots.filter { box($0).x0 >= 0 && box($0).x1 <= map.w }
            let spot = inside.first { !hits(box($0)) && !onBig(box($0)) } ?? inside.first { !hits(box($0)) }
                ?? inside.min { a, c in taken.filter { meets(box(a), $0) }.count < taken.filter { meets(box(c), $0) }.count } ?? spots[0]
            taken.append(box(spot))
            for (k, v) in bigBox where meets(box(spot), v.box) { bigBox[k] = nil }
            titleLabels.append(Label(text: b.title, at: CGPoint(x: b.x + spot.0 * S, y: b.y + spot.1 * S),
                                     anchor: spot.2 == "start" ? .leading : spot.2 == "end" ? .trailing : .center, kind: .badgeTitle, base: CGPoint(x: b.x, y: b.y)))
        }
        let named2 = (marks + pinned).map { normOrigin($0.title) }
        // The whole region marked (e.g. port from the Douro): its parts named quietly, after the big and mid towns
        // (Peso da Régua, Pinhão) and before the small ones. Each name at its area's point, else moved a little within
        // its area, so it never covers a town, a wine's name, the zoom buttons or the map's edge; with no free spot it
        // is left out
        var partLabels: [Label] = []
        func placeParts() {
            let fs = 15 * S
            for (_, a) in map.areas.sorted(by: { $0.key < $1.key }) {
                guard let title = a.title?.uppercased() else { continue }
                let area = SVGPath.parse(a.d)
                let w = Double(title.count) * fs * 0.95, h = fs * 1.3
                func box(_ x: Double, _ y: Double) -> Box { Box(x0: x - w / 2, y0: y - fs * 0.36 - h / 2, x1: x + w / 2, y1: y - fs * 0.36 + h / 2) }
                var spots: [(Double, Double)] = []
                for dy in [0.0, -0.5, 0.5, -1, 1, -1.5, 1.5, -2, 2, -2.5, 2.5, -3, 3] {
                    for dx in [0.0, -0.15, 0.15, -0.3, 0.3] {
                        // Kept inside the map's edges
                        let x = min(max(a.label[0] + dx * w, w / 2 + 4), map.w - w / 2 - 4), y = a.label[1] + dy * fs
                        spots.append((x, y))
                    }
                }
                spots.sort { hypot($0.0 - a.label[0], $0.1 - a.label[1]) < hypot($1.0 - a.label[0], $1.1 - a.label[1]) }
                let spot = spots.first { s in
                    let q = box(s.0, s.1)
                    return q.x0 >= 0 && q.x1 <= map.w && q.y0 >= 0 && q.y1 <= map.h && !hits(q) && area.contains(CGPoint(x: s.0, y: s.1 - fs * 0.36))
                }
                guard let spot else { continue }
                taken.append(box(spot.0, spot.1))
                partLabels.append(Label(text: title, at: CGPoint(x: spot.0, y: spot.1), anchor: .center, kind: .part))
            }
        }
        let sizeRank = ["big": 0, "mid": 1]
        var partsPlaced = !wholeRegion
        for t in (map.towns ?? []).enumerated().sorted(by: { (sizeRank[$0.element.size] ?? 2, $0.offset) < (sizeRank[$1.element.size] ?? 2, $1.offset) }).map(\.element) {
            if !partsPlaced && t.size != "big" && t.size != "mid" { placeParts(); partsPlaced = true }
            let r = t.size == "big" ? 4.5 : t.size == "mid" ? 3.5 : 2.6
            let fs = t.size == "big" ? 22.0 : t.size == "mid" ? 17.0 : 14.0
            var left = false
            if t.size == "big" {
                guard let q = bigBox[t.name] else { continue }
                taken.append(q.box); left = q.left
            } else {
                let first = normOrigin(t.name).split(separator: " ").first.map(String.init) ?? ""
                if named2.contains(where: { $0.contains(first) }) { continue }
                func ok(_ l: Bool) -> Bool { let q = townBox(t, fs, l); return !hits(q) && q.x0 >= 0 && q.x1 <= map.w }
                if ok(false) { left = false } else if ok(true) { left = true } else { continue }
                taken.append(townBox(t, fs, left))
            }
            towns.append((CGPoint(x: t.x, y: t.y), r))
            labels.append(Label(text: t.name, at: CGPoint(x: t.x + (left ? -7 : 7) * S, y: t.y - 6 * S), anchor: left ? .trailing : .leading, kind: .town(t.size), base: CGPoint(x: t.x, y: t.y)))
        }
        if !partsPlaced { placeParts() }
        labels += partLabels + titleLabels
        if numbered { badges = marks.map { Badge(n: $0.n, at: CGPoint(x: $0.x, y: $0.y)) } }
        pins = pinned.map { CGPoint(x: $0.x, y: $0.y) }
        if let proj = map.proj {
            for p in pinList {
                let at = proj.xy(p.lon, p.lat)
                if at.x >= 0 && at.x <= map.w && at.y >= 0 && at.y <= map.h { pins.append(at) }
            }
        }
    }
}

private enum MapColor {
    static func hex(_ v: UInt32, _ a: Double = 1) -> Color { Color(red: Double((v >> 16) & 255) / 255, green: Double((v >> 8) & 255) / 255, blue: Double(v & 255) / 255).opacity(a) }
    static let sea = hex(0xE6ECEC), wave = hex(0x7D97A3), land = hex(0xFBF6EE), areaLine = hex(0x8A6A55), bordeaux = hex(0x6E0F1F)
    static let border = hex(0x8A7A70), water = hex(0x6F93A8), town = hex(0x3D2A22), coastLine = hex(0xC9B9A8)
    /// The three tones (components.css: --tone-strong, --tone-mid, --tone-light and their lines)
    static let strong = hex(0x8E2C3A), strongLine = hex(0x5E0C19), mid = hex(0xDFB3B6), midLine = hex(0x9A4A55), light = hex(0xF3E9E3), lightLine = hex(0xC4A597)
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
    /// Zooming makes only the geography bigger: names, numbers, dots, pins and line widths keep their size on screen.
    func draw(_ ctx: inout GraphicsContext, view v: CGRect, size: CGSize) {
        let zoom = max(1, view.width / v.width)
        // Labels: their own scale (bigger in a narrow box), kept the same size on screen when zooming
        let z = zoom / s
        let k = min(size.width / v.width, size.height / v.height)
        ctx.translateBy(x: (size.width - v.width * k) / 2, y: (size.height - v.height * k) / 2)
        ctx.scaleBy(x: k, y: k)
        ctx.translateBy(x: -v.minX, y: -v.minY)
        func w(_ x: Double) -> Double { x / z }
        let bg = mode == .background
        if !bg {
            ctx.fill(Path(CGRect(x: 0, y: 0, width: map.w, height: map.h)), with: .color(MapColor.sea))
            for i in 1...4 {
                var c = ctx; c.translateBy(x: Double(-5 * i), y: 0)
                c.stroke(coast, with: .color(MapColor.wave.opacity(0.5 - Double(i) * 0.1)), lineWidth: 0.7 / zoom)
            }
            ctx.fill(land, with: .color(MapColor.land))
        }
        let tone = MapColor.bordeaux
        // Line widths follow the zoom only (not the labels' scale)
        func lw(_ x: Double) -> Double { x / zoom }
        if bg {
            for a in areas {
                if a.tone == .strong { ctx.fill(a.path, with: .color(tone)) }
                ctx.stroke(a.path, with: .color(tone), lineWidth: 1.1)
            }
        } else {
            for a in areas { ctx.fill(a.path, with: .color(a.tone == .strong ? MapColor.strong : a.tone == .mid ? MapColor.mid : MapColor.light)) }
            for a in areas {
                let (c, width): (Color, Double) = a.tone == .strong ? (MapColor.strongLine, 1.6) : a.tone == .mid ? (MapColor.midLine, 1) : (MapColor.lightLine, 0.8)
                ctx.stroke(a.path, with: .color(c), style: StrokeStyle(lineWidth: lw(width), lineJoin: .round))
            }
        }
        if let border { ctx.stroke(border, with: .color(bg ? tone : MapColor.border), style: StrokeStyle(lineWidth: lw(1), dash: bg ? [] : [lw(8), lw(4), lw(2), lw(4)])) }
        for r in rivers { ctx.stroke(r, with: .color(bg ? tone : MapColor.water), style: StrokeStyle(lineWidth: lw(2.2), lineCap: .round, lineJoin: .round)) }
        ctx.stroke(coast, with: .color(bg ? tone : MapColor.water), lineWidth: lw(1.2))
        guard !bg else { return }
        for t in towns { let r = w(t.r); ctx.fill(Path(ellipseIn: CGRect(x: t.at.x - r, y: t.at.y - r, width: r * 2, height: r * 2)), with: .color(MapColor.town)) }
        for l in labels {
            // Kept beside its point at the same distance on screen
            let p = l.base.map { CGPoint(x: $0.x + (l.at.x - $0.x) / zoom, y: $0.y + (l.at.y - $0.y) / zoom) } ?? l.at
            switch l.kind {
            case .town(let sz):
                let fs = w(sz == "big" ? 22.0 : sz == "mid" ? 17.0 : 14.0)
                haloText(&ctx, Text(l.text).font(.custom("CormorantGaramond-Regular", fixedSize: fs)).italic().foregroundStyle(MapColor.town),
                         Text(l.text).font(.custom("CormorantGaramond-Regular", fixedSize: fs)).italic().foregroundStyle(MapColor.land),
                         at: baseline(p, fs), anchor: l.anchor, width: w(3))
            case .part:
                let fs = w(15)
                haloText(&ctx, Text(l.text).font(.custom("Inter-SemiBold", fixedSize: fs)).tracking(fs / 4).foregroundStyle(MapColor.bordeaux.opacity(0.75)),
                         Text(l.text).font(.custom("Inter-SemiBold", fixedSize: fs)).tracking(fs / 4).foregroundStyle(MapColor.land),
                         at: baseline(p, fs), anchor: .center, width: w(3))
            case .badgeTitle:
                let fs = w(17)
                haloText(&ctx, Text(l.text).font(.custom("CormorantGaramond-Regular", fixedSize: fs)).fontWeight(.semibold).italic().foregroundStyle(MapColor.bordeaux),
                         Text(l.text).font(.custom("CormorantGaramond-Regular", fixedSize: fs)).fontWeight(.semibold).italic().foregroundStyle(MapColor.land),
                         at: baseline(p, fs), anchor: l.anchor, width: w(4))
            }
        }
        for b in badges {
            let r = w(13)
            let c = Path(ellipseIn: CGRect(x: b.at.x - r, y: b.at.y - r, width: r * 2, height: r * 2))
            ctx.fill(c, with: .color(MapColor.bordeaux)); ctx.stroke(c, with: .color(.white), lineWidth: w(2))
            ctx.draw(Text("\(b.n)").font(.custom("Inter-SemiBold", fixedSize: w(14))).foregroundStyle(.white), at: b.at, anchor: .center)
        }
        for p in pins { drawPin(&ctx, at: p, scale: 1.2 / z, line: w(2)) }
    }
}

/// pinSvg(): a map pin whose tip is at the point
private func drawPin(_ ctx: inout GraphicsContext, at p: CGPoint, scale s: Double, line: Double = 2) {
    var pin = Path()
    pin.move(to: CGPoint(x: 0, y: 0))
    pin.addCurve(to: CGPoint(x: -11, y: -22), control1: CGPoint(x: -3, y: -9), control2: CGPoint(x: -11, y: -13))
    pin.addArc(center: CGPoint(x: 0, y: -22), radius: 11, startAngle: .degrees(180), endAngle: .degrees(0), clockwise: false)
    pin.addCurve(to: CGPoint(x: 0, y: 0), control1: CGPoint(x: 11, y: -13), control2: CGPoint(x: 3, y: -9))
    pin.closeSubpath()
    let t = CGAffineTransform(translationX: p.x, y: p.y).scaledBy(x: s, y: s)
    let shape = pin.applying(t)
    ctx.fill(shape, with: .color(MapColor.bordeaux)); ctx.stroke(shape, with: .color(.white), lineWidth: line)
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
        // One unit ≈ 1 % of the width on screen, so pins, text and lines keep their size at any zoom
        let u = v.width / 100
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

/// clusterPins() in overview-map.ts: places that would lie on top of each other on the map (closer than a numbered pin is
/// wide, at the view OverviewDrawing gives `focus`) as one pin – the wines added up, named after the region they share
/// (else the place with the most wines), at their middle.
func clusterPins(_ map: OverviewMap, _ places: [(lon: Double, lat: Double, n: Int, label: String, region: String?)], focus: GeoBox) -> [OverviewDrawing.Pin] {
    let a = map.proj.xy(focus.lon0, focus.lat1), b = map.proj.xy(focus.lon1, focus.lat0)
    let pad = max(b.x - a.x, b.y - a.y) * 0.08
    let u = max(b.x - a.x + 2 * pad, (b.y - a.y + 2 * pad) * 1.45) / 100
    var out: [(items: [(lon: Double, lat: Double, n: Int, label: String, region: String?)], at: CGPoint)] = []
    for p in places.sorted(by: { $0.n > $1.n }) {
        let at = map.proj.xy(p.lon, p.lat)
        if let i = out.firstIndex(where: { hypot($0.at.x - at.x, $0.at.y - at.y) < u * 5.6 }) {
            out[i].items.append(p)
            let n = Double(out[i].items.reduce(0) { $0 + $1.n })
            out[i].at = CGPoint(x: out[i].at.x + (at.x - out[i].at.x) * Double(p.n) / n, y: out[i].at.y + (at.y - out[i].at.y) * Double(p.n) / n)
        } else { out.append((items: [p], at: at)) }
    }
    return out.map { c in
        let n = c.items.reduce(0) { $0 + $1.n }
        let lon = c.items.reduce(0.0) { $0 + $1.lon * Double($1.n) } / Double(n), lat = c.items.reduce(0.0) { $0 + $1.lat * Double($1.n) } / Double(n)
        let regions = Set(c.items.map { normOrigin($0.region) })
        let shared = c.items[0].region?.trimmingCharacters(in: .whitespaces) ?? ""
        return OverviewDrawing.Pin(lon: lon, lat: lat, label: c.items.count > 1 && regions.count == 1 && !shared.isEmpty ? shared : c.items[0].label, n: n)
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
