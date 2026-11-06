import SwiftUI
import EventKit
import EventKitUI

// The parts of the site's tasting page (src/pages/tasting/index.astro) beyond the heading and the answer:
// where the wines come from (the region's map with its legend), the calendar, and the payment box (src/lib/pay.ts).

// MARK: - Where the wines come from (showOrigins / showOverviewOrigins)

struct LegendItem: Identifiable {
    enum Kind { case inMap, whole, other }
    let id = UUID()
    let kind: Kind
    let count: Int
    let title: String
    let sub: String
}

struct Origins {
    /// nil: the region cannot be placed at all – its wines are listed (the legend) without a map
    let map: MapDrawing?
    let legend: [LegendItem]
    let sources: String?
    let osm: Bool
    /// The faint map behind the heading (none when the region has no detailed map)
    let hero: RegionDrawing?
}

/// One tab on the tasting's map (WIN-256, regionTabs() in src/lib/tasting-origins.ts): a value of the wines' region
/// field (compared without case and accents), its wines in the evening's order
struct RegionTab: Identifiable, Equatable {
    let id: String
    let name: String
    let wines: [Wine]
}

/// The tabs in the order of each region's first wine. Blind wines that are not revealed (the database sends no origin
/// for them) and wines without a region get none, so neither the counts nor the order give a blind wine away.
func regionTabs(_ wines: [Wine]) -> [RegionTab] {
    var order: [String] = []; var names: [String: String] = [:]; var list: [String: [Wine]] = [:]
    for w in wines where !w.isBlind {
        guard let r = w.region?.trimmingCharacters(in: .whitespaces), !r.isEmpty else { continue }
        let key = normOrigin(r)
        if list[key] == nil { order.append(key); names[key] = r; list[key] = [] }
        list[key]!.append(w)
    }
    return order.map { RegionTab(id: $0, name: names[$0]!, wines: list[$0]!) }
}

/// The faint map behind a heading: the wines' main region with their lowest areas filled (winesBackground() in
/// src/lib/ui/map-background.ts – the home screen's corner)
func winesHero(_ wines: [Wine]) async -> RegionDrawing? {
    guard let region = mainRegion(wines), let map = await MapStore.shared.map(region) else { return nil }
    let g = await groupForMap(map, wines)
    return RegionDrawing(map, mode: .background, counts: g.counts, wholeRegion: g.wholeRegion)
}

/// The faint map behind the tasting's heading: the first region tab with a detailed map (drawHero() on the site)
func tabsHero(_ tabs: [RegionTab]) async -> RegionDrawing? {
    for tab in tabs {
        guard let id = mapIdFor(tab.name), let map = await MapStore.shared.map(id) else { continue }
        let g = await groupForMap(map, tab.wines)
        return RegionDrawing(map, mode: .background, counts: g.counts, wholeRegion: g.wholeRegion)
    }
    return nil
}

private struct MapGroup { let key: String; let title: String; var ids: [Int]; let level: Level; var inMap: Bool { level.kind != .region } }
/// markings() on the site: strongest wins (an area that is one wine's lowest and another's level between is strong);
/// the whole region is marked only when no wine has a lower level
private struct Grouped {
    let list: [MapGroup]; let counts: [String: Int]; let titles: [String: String]; let mid: Set<String>
    let named: [(lon: Double, lat: Double, title: String)]; let wholeRegion: Bool
}

/// groupWines(): each wine's lowest level on the map (WIN-293, levelOf()) – an area, an appellation's pin or the region
private func groupForMap(_ map: RegionMap, _ wines: [Wine]) async -> Grouped {
    let apps = await MapStore.shared.appellationList()
    var groups: [String: MapGroup] = [:]; var order: [String] = []
    for w in wines {
        let level = levelOf(map, appellation: w.appellation, appellationId: w.appellation_id, apps)
        let key = level.kind == .area ? level.id : "\(level.kind):\(level.id.isEmpty ? "region" : level.id)"
        if groups[key] == nil { groups[key] = MapGroup(key: key, title: level.name, ids: [], level: level); order.append(key) }
        groups[key]!.ids.append(w.id)
    }
    let list = order.map { groups[$0]! }.sorted {
        if $0.inMap != $1.inMap { return $0.inMap }
        if $0.ids.count != $1.ids.count { return $0.ids.count > $1.ids.count }
        return $0.title.localizedCompare($1.title) == .orderedAscending
    }
    var counts: [String: Int] = [:]; var titles: [String: String] = [:]; var mid = Set<String>(); var named: [(lon: Double, lat: Double, title: String)] = []
    for g in list {
        if g.level.kind == .area { counts[g.level.id] = g.ids.count; titles[g.level.id] = g.level.name }
        if g.level.kind == .pin, let p = g.level.pin { named.append((lon: p.lon, lat: p.lat, title: g.level.name)) }
        mid.formUnion(g.level.mid)
    }
    mid.subtract(counts.keys)
    return Grouped(list: list, counts: counts, titles: titles, mid: mid, named: named,
                   wholeRegion: counts.isEmpty && named.isEmpty && list.contains { !$0.inMap })
}

/// One region tab, the same as the site's drawTab(): the whole region's detailed map, each wine's lowest known area
/// strongest and numbered, the levels between lighter – or, with no detailed map, the overview map with a numbered pin
/// per place, or, when the region cannot be placed at all, its wines listed by name. all: every wine of the tasting
/// (their numbers in the evening). width: the map box's width (the names are drawn bigger in a narrow box).
func buildOrigins(_ tab: RegionTab, all: [Wine], width: Double = 358) async -> Origins? {
    let numbers = Dictionary(uniqueKeysWithValues: all.enumerated().map { ($0.element.id, $0.offset + 1) })
    func nums(_ ids: [Int]) -> String { L("map.wineNumbers", ["list": numberRanges(ids.compactMap { numbers[$0] })]) }
    guard let id = mapIdFor(tab.name), let map = await MapStore.shared.map(id) else { return await overviewOrigins(tab, nums) }
    let g = await groupForMap(map, tab.wines)
    let hero = RegionDrawing(map, mode: .background, counts: g.counts, wholeRegion: g.wholeRegion)
    // Producers with an exact place get a pin (one per producer)
    var seen = Set<String>(); var pins: [(lon: Double, lat: Double)] = []
    for w in tab.wines { if let lat = w.producer_lat, let lon = w.producer_lon, seen.insert("\(lat),\(lon)").inserted { pins.append((lon, lat)) } }
    // The same view on every screen: the whole region (not zoomed to the wines' areas)
    let full = RegionDrawing(map, counts: g.counts, titles: g.titles, mid: g.mid, wholeRegion: g.wholeRegion, named: g.named, pins: pins, scale: labelScale(map, width: width), boxWidth: width)
    let whole = L("map.wholeRegion", ["region": map.name])
    let legend = g.list.map { x -> LegendItem in
        // Only the region: "Hele Bordeaux"; an appellation covering it: "Porto", "Hele Douro"; else the level between ("Médoc")
        if !x.inMap && normOrigin(x.title) == normOrigin(map.name) { return LegendItem(kind: .whole, count: x.ids.count, title: whole, sub: nums(x.ids)) }
        let between = x.level.midName.flatMap { normOrigin($0) == normOrigin(x.title) ? nil : $0 }
        let where_ = x.inMap ? between : whole
        return LegendItem(kind: x.inMap ? .inMap : .whole, count: x.ids.count, title: x.title, sub: [where_, nums(x.ids)].compactMap { $0 }.joined(separator: " · "))
    }
    return Origins(map: .region(full), legend: legend, sources: map.sources, osm: !pins.isEmpty, hero: hero)
}

private func overviewOrigins(_ tab: RegionTab, _ nums: ([Int]) -> String) async -> Origins? {
    var groups: [String: (p: Place, wines: [Wine])] = [:]; var order: [String] = []; var unplaced: [Wine] = []
    for w in tab.wines {
        guard let p = await placeOf(w) else { unplaced.append(w); continue }
        let key = String(format: "%.2f,%.2f", p.lon, p.lat)
        if groups[key] == nil { groups[key] = (p, []); order.append(key) }
        groups[key]!.wines.append(w)
    }
    let list = order.map { groups[$0]! }.sorted { $0.wines.count > $1.wines.count }
    let places = list.map(\.p)
    var drawing: OverviewDrawing?
    if !places.isEmpty, let ov = await MapStore.shared.overview(overviewFor(places)) {
        let focus = await focusFor(places)
        // A small area (one country, an island): the detailed tiles, so Madeira is land under its pin
        drawing = OverviewDrawing(ov, pins: list.map { .init(lon: $0.p.lon, lat: $0.p.lat, label: $0.p.label, n: $0.wines.count) }, focus: focus, detail: await detailFor(focus))
    }
    var legend: [LegendItem] = []
    if drawing != nil {
        legend = list.map { g -> LegendItem in
            var parts: [String] = []
            for x in [g.wines[0].region, countryName(g.p.country)].compactMap({ $0 }) where !x.isEmpty && !parts.contains(x) { parts.append(x) }
            let sub = [parts.isEmpty ? nil : parts.joined(separator: ", "), nums(g.wines.map(\.id))].compactMap { $0 }.joined(separator: " · ")
            return LegendItem(kind: .inMap, count: g.wines.count, title: g.p.label, sub: sub)
        }
    } else { unplaced = tab.wines }
    // Nothing to place them by: the wine by name, with the region, so no wine is left out
    for w in unplaced {
        var parts: [String] = []
        for x in [w.appellation, tab.name, countryName(w.country)].compactMap({ $0 }) where !x.isEmpty && !parts.contains(x) { parts.append(x) }
        let sub = [parts.isEmpty ? nil : parts.joined(separator: ", "), nums([w.id])].compactMap { $0 }.joined(separator: " · ")
        legend.append(LegendItem(kind: .other, count: 1, title: w.name ?? tab.name, sub: sub))
    }
    return Origins(map: drawing.map { MapDrawing.overview($0) }, legend: legend, sources: drawing == nil ? nil : "Natural Earth", osm: false, hero: nil)
}

/// The map card with the region tabs (component 42, scrolling sideways when there are many) and its legend (component 23)
struct OriginsBlock: View {
    let tabs: [RegionTab]
    @Binding var selection: String
    let origins: Origins?
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Eyebrow(text: L("map.title"))
            if tabs.count > 1 {
                ScrollingTabs(tabs: tabs.map { ($0.id, $0.name, $0.wines.count) }, selection: $selection, label: L("map.regions"))
                    .padding(.bottom, 4)
            }
            if let origins {
                if let map = origins.map {
                    VStack(alignment: .trailing, spacing: 4.8) {
                        MapBox(drawing: map, label: tabs.first(where: { $0.id == selection })?.name ?? L("map.title"))
                            .id(selection)
                        MapCredit(sources: origins.sources, osm: origins.osm)
                    }
                }
                VStack(alignment: .leading, spacing: 7.2) {
                    ForEach(origins.legend) { item in
                        HStack(alignment: .top, spacing: 9.6) {
                            LegendNumber(kind: item.kind, n: item.count)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(item.title).font(.semibold(15.2)).foregroundStyle(Color.paper)
                                Text(item.sub).font(.body(13.1)).foregroundStyle(Color.muted)
                            }
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
                .padding(.top, 4.4)
            }
        }
    }
}

/// .map-legend .no: the number of wines in a circle (filled; lighter for the whole region; a ring for other regions)
struct LegendNumber: View {
    let kind: LegendItem.Kind
    let n: Int
    var body: some View {
        Text("\(n)").font(.semibold(12.5)).foregroundStyle(kind == .other ? Color.bordeaux : Color.white)
            .frame(width: 25.6, height: 25.6)
            .background(kind == .inMap ? Color.bordeaux : kind == .whole ? Color(red: 0x9A / 255, green: 0x5F / 255, blue: 0x6C / 255) : Color.clear, in: Circle())
            .overlay(Circle().strokeBorder(kind == .other ? Color.bordeaux : Color.clear, lineWidth: 1.5))
    }
}

// MARK: - Add to calendar (the site makes an .ics file; the app opens the calendar's own form)

struct CalendarSheet: UIViewControllerRepresentable {
    let title: String
    let start: Date
    let end: Date?
    let place: String?
    let url: URL?
    let done: () -> Void
    private let store = EKEventStore()

    func makeUIViewController(context: Context) -> EKEventEditViewController {
        let vc = EKEventEditViewController()
        vc.eventStore = store
        let e = EKEvent(eventStore: store)
        e.title = title
        e.startDate = start
        // Without an end time the calendar gets four hours, as on the site
        e.endDate = end ?? start.addingTimeInterval(4 * 3600)
        e.location = place
        e.url = url
        vc.event = e
        vc.editViewDelegate = context.coordinator
        return vc
    }
    func updateUIViewController(_ vc: EKEventEditViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(done: done) }
    final class Coordinator: NSObject, EKEventEditViewDelegate {
        let done: () -> Void
        init(done: @escaping () -> Void) { self.done = done }
        func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) { done() }
    }
}

// MARK: - The payment box (component 51, payBox in src/lib/pay.ts)

/// The MobilePay number (with the one copy button), the recipient's name and the amount – nothing else (WIN-278).
/// The database gives the number only with the recipient's name (get_tasting: mobilepay and mobilepay_name); without
/// both the guest sees the amount and that the host tells how to pay. No button into MobilePay: its mobilepay://send
/// link is refused on real phones (the site took it out too, src/lib/pay.ts).
struct PayBox: View {
    let mobilepay: String?
    let recipient: String?
    let amount: Double
    @Binding var toast: String?

    private var number: String { (mobilepay ?? "").replacingOccurrences(of: " ", with: "") }
    private var name: String { (recipient ?? "").trimmingCharacters(in: .whitespacesAndNewlines) }
    private var pretty: String {
        var out = ""; for (i, c) in number.enumerated() { if i > 0 && i % 2 == 0 { out.append(" ") }; out.append(c) }
        return out
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12.8) {
            // Never a number without the recipient's name
            if number.isEmpty || name.isEmpty {
                Text(L("pay.noNumber", ["amount": krText(amount)])).font(.body()).foregroundStyle(Color.paper)
            } else {
                VStack(spacing: 0) {
                    factRow(L("pay.number"), pretty) {
                        Button {
                            UIPasteboard.general.string = number
                            toast = "\(L("pay.copied")): \(pretty)"
                        } label: {
                            SiteIcon("copy", size: 18).foregroundStyle(Color.muted).frame(width: 44, height: 44)
                        }
                        .accessibilityLabel(L("pay.copyNumber"))
                    }
                    factRow(L("pay.recipient"), name) { EmptyView() }
                    factRow(L("pay.amount"), krText(amount), last: true) { EmptyView() }
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("payFacts")
            }
        }
    }

    /// .facts: the label and the value (the number has its quiet copy icon after it)
    private func factRow<Trailing: View>(_ label: String, _ shown: String, last: Bool = false, @ViewBuilder trailing: () -> Trailing) -> some View {
        HStack(spacing: 12) {
            Text(label).font(.body(14.4)).foregroundStyle(Color.muted).frame(width: 130, alignment: .leading)
            Text(shown).font(.medium(15.2)).foregroundStyle(Color.paper).frame(maxWidth: .infinity, alignment: .leading)
            trailing()
        }
        .frame(minHeight: 44)
        .accessibilityElement(children: .contain)
        .overlay(alignment: .bottom) { if !last { Rectangle().fill(Color.rule).frame(height: 1) } }
    }
}

/// The tasting's own price for the guest (the fee card)
struct FeeCard: View {
    let amount: Double
    let paid: Bool
    let mobilepay: String?
    let recipient: String?
    @Binding var toast: String?
    var body: some View {
        Card {
            Text(L("guest.feeTitle")).font(.semibold(17)).foregroundStyle(Color.paper).accessibilityAddTraits(.isHeader)
            if paid {
                NoticeBox(text: L("guest.feePaid"), tone: .ok)
            } else {
                Text(L("guest.feeText")).font(.body(14.7)).foregroundStyle(Color.muted)
                PayBox(mobilepay: mobilepay, recipient: recipient, amount: amount, toast: $toast)
            }
        }
    }
}

/// A tile for the evening (the site's .tile): an icon, the name and a line under it
struct EveningTile: View {
    let icon: String
    let title: String
    let sub: String?
    var body: some View {
        HStack(spacing: 14.4) {
            SiteIcon(icon, size: 27).foregroundStyle(Color.bordeaux)
            VStack(alignment: .leading, spacing: 1.6) {
                Text(title).font(.semibold(16)).foregroundStyle(Color.paper)
                if let sub, !sub.isEmpty { Text(sub).font(.body(13.6)).foregroundStyle(Color.muted).multilineTextAlignment(.leading) }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 16).padding(.horizontal, 17.6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.rule))
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}
