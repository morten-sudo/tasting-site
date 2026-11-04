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
    var inset: OverviewDrawing? = nil
}

struct Origins {
    let map: MapDrawing
    let legend: [LegendItem]
    let sources: String?
    let osm: Bool
    /// The faint map behind the heading (none when the wines have no detailed map)
    let hero: RegionDrawing?
}

/// The same as the site: the main region's map with the appellations of the wines filled and numbered, or – with no
/// detailed map – the overview map with a numbered pin per place.
func buildOrigins(_ wines: [Wine], phone: Bool = true) async -> Origins? {
    let numbers = Dictionary(uniqueKeysWithValues: wines.enumerated().map { ($0.element.id, $0.offset + 1) })
    func nums(_ ids: [Int]) -> String { L("map.wineNumbers", ["list": numberRanges(ids.compactMap { numbers[$0] })]) }
    guard let region = mainRegion(wines), let map = await MapStore.shared.map(region) else { return await overviewOrigins(wines, nums) }

    // groupWines(): an area of the map, the whole region, or another region
    let names = Dictionary((await MapStore.shared.appellationList()).map { ($0.id, $0.name) }, uniquingKeysWith: { a, _ in a })
    struct Group { let key: String; let title: String; var ids: [Int]; let inMap: Bool; let whole: Bool }
    var groups: [String: Group] = [:]; var order: [String] = []
    func add(_ key: String, _ title: String, _ inMap: Bool, _ whole: Bool, _ w: Wine) {
        if groups[key] == nil { groups[key] = Group(key: key, title: title, ids: [], inMap: inMap, whole: whole); order.append(key) }
        groups[key]!.ids.append(w.id)
    }
    for w in wines {
        let aid = w.appellation_id ?? ""
        if !aid.isEmpty, map.areas[aid] != nil { add(aid, names[aid] ?? map.areas[aid]?.title ?? aid, true, false, w) }
        else if mapIdFor(w.region) == map.id { add("whole:\(aid.isEmpty ? "region" : aid)", (aid.isEmpty ? nil : names[aid]) ?? w.appellation ?? map.name, false, true, w) }
        else { add("other:\(normOrigin(w.region ?? w.appellation ?? "?"))", w.region ?? w.appellation ?? "?", false, false, w) }
    }
    func rank(_ g: Group) -> Int { g.inMap ? 0 : g.whole ? 1 : 2 }
    func before(_ a: Group, _ b: Group) -> Bool {
        if rank(a) != rank(b) { return rank(a) < rank(b) }
        if a.ids.count != b.ids.count { return a.ids.count > b.ids.count }
        return a.title.localizedCompare(b.title) == .orderedAscending
    }
    let list = order.map { groups[$0]! }.sorted(by: before)
    var counts: [String: Int] = [:]; var titles: [String: String] = [:]
    for g in list where g.inMap { counts[g.key] = g.ids.count; titles[g.key] = g.title }
    let whole = list.contains { $0.whole }
    let hero = RegionDrawing(map, mode: .background, counts: counts, wholeRegion: whole && counts.isEmpty)
    // Producers with an exact place get a pin (one per producer)
    var seen = Set<String>(); var pins: [(lon: Double, lat: Double)] = []
    for w in wines { if let lat = w.producer_lat, let lon = w.producer_lon, seen.insert("\(lat),\(lon)").inserted { pins.append((lon, lat)) } }
    var full = RegionDrawing(map, counts: counts, titles: titles, wholeRegion: whole && counts.isEmpty, pins: pins)
    if phone { full.fitToAreas() }

    var legend: [LegendItem] = []
    for g in list {
        let n = nums(g.ids)
        if g.inMap { legend.append(LegendItem(kind: .inMap, count: g.ids.count, title: g.title, sub: n)) }
        else if g.whole { legend.append(LegendItem(kind: .whole, count: g.ids.count, title: g.title, sub: "\(L("map.wholeRegion", ["region": map.name])) · \(n)")) }
        else {
            // Wines from another region: a small map of their country with the place marked
            var places: [Place] = []
            for id in g.ids { if let w = wines.first(where: { $0.id == id }), let p = await placeOf(w) { places.append(p) } }
            var inset: OverviewDrawing?
            if !places.isEmpty, let ov = await MapStore.shared.overview(overviewFor(places)) {
                inset = OverviewDrawing(ov, pins: places.map { .init(lon: $0.lon, lat: $0.lat) }, focus: await focusFor(places), inset: true)
            }
            legend.append(LegendItem(kind: .other, count: g.ids.count, title: g.title, sub: "\(L("map.otherRegion")) · \(n)", inset: inset))
        }
    }
    return Origins(map: .region(full), legend: legend, sources: map.sources, osm: !full.pins.isEmpty, hero: hero)
}

private func overviewOrigins(_ wines: [Wine], _ nums: ([Int]) -> String) async -> Origins? {
    var groups: [String: (p: Place, wines: [Wine])] = [:]; var order: [String] = []
    for w in wines {
        guard let p = await placeOf(w) else { continue }
        let key = String(format: "%.2f,%.2f", p.lon, p.lat)
        if groups[key] == nil { groups[key] = (p, []); order.append(key) }
        groups[key]!.wines.append(w)
    }
    guard !order.isEmpty else { return nil }
    let list = order.map { groups[$0]! }.sorted { $0.wines.count > $1.wines.count }
    let places = list.map(\.p)
    guard let ov = await MapStore.shared.overview(overviewFor(places)) else { return nil }
    let drawing = OverviewDrawing(ov, pins: list.map { .init(lon: $0.p.lon, lat: $0.p.lat, label: $0.p.label, n: $0.wines.count) }, focus: await focusFor(places))
    let legend = list.map { g -> LegendItem in
        var parts: [String] = []
        for x in [g.wines[0].region, countryName(g.p.country)].compactMap({ $0 }) where !x.isEmpty && !parts.contains(x) { parts.append(x) }
        let sub = [parts.isEmpty ? nil : parts.joined(separator: ", "), nums(g.wines.map(\.id))].compactMap { $0 }.joined(separator: " · ")
        return LegendItem(kind: .inMap, count: g.wines.count, title: g.p.label, sub: sub)
    }
    return Origins(map: .overview(drawing), legend: legend, sources: "Natural Earth", osm: false, hero: nil)
}

/// The map card with its legend (component 23)
struct OriginsBlock: View {
    let origins: Origins
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Eyebrow(text: L("map.title"))
            VStack(alignment: .trailing, spacing: 4.8) {
                MapBox(drawing: origins.map, label: L("map.title"))
                MapCredit(sources: origins.sources, osm: origins.osm)
            }
            VStack(alignment: .leading, spacing: 7.2) {
                ForEach(origins.legend) { item in
                    HStack(alignment: .top, spacing: 9.6) {
                        LegendNumber(kind: item.kind, n: item.count)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(item.title).font(.semibold(15.2)).foregroundStyle(Color.paper)
                            Text(item.sub).font(.body(13.1)).foregroundStyle(Color.muted)
                            if let inset = item.inset {
                                MapBox(drawing: .overview(inset), zoomable: false).frame(width: 144).padding(.top, 6.4)
                            }
                        }
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            .padding(.top, 4.4)
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
