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

/// The faint map behind a heading: the wines' main region with its appellations filled (winesBackground() in
/// src/lib/ui/map-background.ts – the home screen's corner)
func winesHero(_ wines: [Wine]) async -> RegionDrawing? {
    guard let region = mainRegion(wines), let map = await MapStore.shared.map(region) else { return nil }
    let g = await groupForMap(map, wines)
    return RegionDrawing(map, mode: .background, counts: g.counts, wholeRegion: g.whole && g.counts.isEmpty)
}

/// The faint map behind the tasting's heading: the first region tab with a detailed map (drawHero() on the site)
func tabsHero(_ tabs: [RegionTab]) async -> RegionDrawing? {
    for tab in tabs {
        guard let id = mapIdFor(tab.name), let map = await MapStore.shared.map(id) else { continue }
        let g = await groupForMap(map, tab.wines)
        return RegionDrawing(map, mode: .background, counts: g.counts, wholeRegion: g.whole && g.counts.isEmpty)
    }
    return nil
}

private struct MapGroup { let key: String; let title: String; var ids: [Int]; let inMap: Bool; let whole: Bool }
private struct Grouped { let list: [MapGroup]; let counts: [String: Int]; let titles: [String: String]; let whole: Bool }

/// groupWines(): an area of the map, the whole region, or another region (most wines first)
private func groupForMap(_ map: RegionMap, _ wines: [Wine]) async -> Grouped {
    let names = Dictionary((await MapStore.shared.appellationList()).map { ($0.id, $0.name) }, uniquingKeysWith: { a, _ in a })
    var groups: [String: MapGroup] = [:]; var order: [String] = []
    func add(_ key: String, _ title: String, _ inMap: Bool, _ whole: Bool, _ w: Wine) {
        if groups[key] == nil { groups[key] = MapGroup(key: key, title: title, ids: [], inMap: inMap, whole: whole); order.append(key) }
        groups[key]!.ids.append(w.id)
    }
    for w in wines {
        let aid = w.appellation_id ?? ""
        if !aid.isEmpty, map.areas[aid] != nil { add(aid, names[aid] ?? map.areas[aid]?.title ?? aid, true, false, w) }
        else if mapIdFor(w.region) == map.id { add("whole:\(aid.isEmpty ? "region" : aid)", (aid.isEmpty ? nil : names[aid]) ?? w.appellation ?? map.name, false, true, w) }
        else { add("other:\(normOrigin(w.region ?? w.appellation ?? "?"))", w.region ?? w.appellation ?? "?", false, false, w) }
    }
    func rank(_ g: MapGroup) -> Int { g.inMap ? 0 : g.whole ? 1 : 2 }
    let list = order.map { groups[$0]! }.sorted {
        if rank($0) != rank($1) { return rank($0) < rank($1) }
        if $0.ids.count != $1.ids.count { return $0.ids.count > $1.ids.count }
        return $0.title.localizedCompare($1.title) == .orderedAscending
    }
    var counts: [String: Int] = [:]; var titles: [String: String] = [:]
    for g in list where g.inMap { counts[g.key] = g.ids.count; titles[g.key] = g.title }
    return Grouped(list: list, counts: counts, titles: titles, whole: list.contains { $0.whole })
}

/// One region tab, the same as the site's drawTab(): the region's detailed map with the appellations of its wines filled
/// and numbered, or – with no detailed map – the overview map with a numbered pin per place, or, when the region cannot
/// be placed at all, its wines listed by name. all: every wine of the tasting (their numbers in the evening).
func buildOrigins(_ tab: RegionTab, all: [Wine], phone: Bool = true) async -> Origins? {
    let numbers = Dictionary(uniqueKeysWithValues: all.enumerated().map { ($0.element.id, $0.offset + 1) })
    func nums(_ ids: [Int]) -> String { L("map.wineNumbers", ["list": numberRanges(ids.compactMap { numbers[$0] })]) }
    guard let id = mapIdFor(tab.name), let map = await MapStore.shared.map(id) else { return await overviewOrigins(tab, nums) }
    let g = await groupForMap(map, tab.wines)
    let hero = RegionDrawing(map, mode: .background, counts: g.counts, wholeRegion: g.whole && g.counts.isEmpty)
    // Producers with an exact place get a pin (one per producer)
    var seen = Set<String>(); var pins: [(lon: Double, lat: Double)] = []
    for w in tab.wines { if let lat = w.producer_lat, let lon = w.producer_lon, seen.insert("\(lat),\(lon)").inserted { pins.append((lon, lat)) } }
    var full = RegionDrawing(map, counts: g.counts, titles: g.titles, wholeRegion: g.whole && g.counts.isEmpty, pins: pins)
    if phone { full.fitToAreas() }
    let legend = g.list.map { x in
        x.inMap ? LegendItem(kind: .inMap, count: x.ids.count, title: x.title, sub: nums(x.ids))
            : LegendItem(kind: .whole, count: x.ids.count, title: x.title, sub: "\(L("map.wholeRegion", ["region": map.name])) · \(nums(x.ids))")
    }
    return Origins(map: .region(full), legend: legend, sources: map.sources, osm: !full.pins.isEmpty, hero: hero)
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
        drawing = OverviewDrawing(ov, pins: list.map { .init(lon: $0.p.lon, lat: $0.p.lat, label: $0.p.label, n: $0.wines.count) }, focus: await focusFor(places))
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
            .background(kind == .inMap ? Color.bordeaux : kind == .whole ? Color(red: 0xB0 / 255, green: 0x7A / 255, blue: 0x85 / 255) : Color.clear, in: Circle())
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

/// How to pay in one line, then the number, the amount and the message with a copy button each. No button into
/// MobilePay: its mobilepay://send link is refused on real phones (the site took it out too, src/lib/pay.ts).
struct PayBox: View {
    let mobilepay: String?
    let amount: Double
    let comment: String
    @Binding var toast: String?

    private var number: String { (mobilepay ?? "").replacingOccurrences(of: " ", with: "") }
    private var pretty: String {
        var out = ""; for (i, c) in number.enumerated() { if i > 0 && i % 2 == 0 { out.append(" ") }; out.append(c) }
        return out
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12.8) {
            if number.isEmpty {
                Text(L("pay.noNumber", ["amount": krText(amount)])).font(.body()).foregroundStyle(Color.paper)
            } else {
                Text(L("pay.lead", ["amount": krText(amount)])).font(.medium()).foregroundStyle(Color.paper)
                Text(L("pay.how")).font(.body(13.6)).foregroundStyle(Color.muted).fixedSize(horizontal: false, vertical: true)
                VStack(spacing: 0) {
                    copyRow(L("pay.number"), pretty, number)
                    copyRow(L("pay.amount"), krText(amount), String(format: "%.2f", amount).replacingOccurrences(of: ".", with: ","))
                    copyRow(L("pay.message"), comment, comment, last: true)
                }
                .accessibilityIdentifier("payFacts")
            }
        }
    }

    /// .facts with a copy button: the label, the value and the quiet copy icon
    private func copyRow(_ label: String, _ shown: String, _ copy: String, last: Bool = false) -> some View {
        HStack(spacing: 12) {
            Text(label).font(.body(14.4)).foregroundStyle(Color.muted).frame(width: 90, alignment: .leading)
            Text(shown).font(.medium(15.2)).foregroundStyle(Color.paper).frame(maxWidth: .infinity, alignment: .leading)
            Button {
                UIPasteboard.general.string = copy
                toast = "\(L("pay.copied")): \(shown)"
            } label: {
                SiteIcon("copy", size: 18).foregroundStyle(Color.muted).frame(width: 44, height: 44)
            }
            .accessibilityLabel(L("pay.copyLabel", ["what": label.lowercased()]))
        }
        .overlay(alignment: .bottom) { if !last { Rectangle().fill(Color.rule).frame(height: 1) } }
    }
}

/// The tasting's own price for the guest (the fee card)
struct FeeCard: View {
    let amount: Double
    let paid: Bool
    let mobilepay: String?
    let name: String
    @Binding var toast: String?
    var body: some View {
        Card {
            Text(L("guest.feeTitle")).font(.semibold(17)).foregroundStyle(Color.paper).accessibilityAddTraits(.isHeader)
            if paid {
                NoticeBox(text: L("guest.feePaid"), tone: .ok)
            } else {
                Text(L("guest.feeText")).font(.body(14.7)).foregroundStyle(Color.muted)
                PayBox(mobilepay: mobilepay, amount: amount, comment: L("pay.feeComment", ["name": name]), toast: $toast)
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
