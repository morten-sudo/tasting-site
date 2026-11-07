import SwiftUI

let maxPerWine = 48

/// Debug only: shows ordering as open, for screenshots and tests of the cart while the test tasting is closed
var debugOrdersOpen: Bool {
    #if DEBUG
    return UserDefaults.standard.bool(forKey: "ordersOpen")
    #else
    return false
    #endif
}

/// The cart is kept on the device, per tasting, until the guest sends the order (as the site keeps it in the browser).
extension AppModel {
    func cart(_ slug: String) -> [Int: Int] { carts[slug] ?? [:] }
    func cartCount(_ slug: String) -> Int { cart(slug).values.reduce(0, +) }
    func setQty(_ slug: String, _ wine: Int, _ n: Int) {
        var c = cart(slug)
        let q = max(0, min(maxPerWine, n))
        if q == 0 { c.removeValue(forKey: wine) } else { c[wine] = q }
        carts[slug] = c.isEmpty ? nil : c
        saveCarts()
    }
    func addToCart(_ slug: String, _ wine: Int, _ n: Int) { setQty(slug, wine, (cart(slug)[wine] ?? 0) + n) }
    func clearCart(_ slug: String) { carts[slug] = nil; saveCarts() }
}

/// The stepper (component 17): − the number +, between min and max
struct Stepper17: View {
    @Binding var value: Int
    var min = 1
    var max = maxPerWine
    var label: String
    var less: String? = nil
    var more: String? = nil
    var small = false
    var body: some View {
        HStack(spacing: 0) {
            step("minus", less ?? label, enabled: value > min) { value -= 1 }
            Text("\(value)").font(.medium(small ? 14.7 : 16)).foregroundStyle(Color.paper).monospacedDigit().frame(minWidth: small ? 30 : 35)
                .accessibilityLabel(label).accessibilityValue("\(value)")
            step("plus", more ?? label, enabled: value < max) { value += 1 }
        }
        .frame(height: small ? 38 : 44)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.fieldLine))
        .fixedSize()
    }
    private func step(_ icon: String, _ a11y: String, enabled: Bool, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            SiteIcon(icon, size: 17.6).foregroundStyle(enabled ? Color.bordeaux : Color.rule).frame(width: small ? 38 : 44, height: small ? 38 : 44)
        }
        .disabled(!enabled).accessibilityLabel(a11y)
    }
}

/// The cart bar (component 50): how many bottles and what they cost, and the way to the cart
struct CartBar: View {
    @Environment(AppModel.self) private var model
    let tasting: MyTasting
    let wines: [Wine]
    var body: some View {
        let cart = model.cart(tasting.slug)
        let n = cart.values.reduce(0, +)
        if n > 0 {
            let total = wines.reduce(0.0) { $0 + Double(cart[$1.id] ?? 0) * unitPrice($1, cart[$1.id] ?? 0) }
            HStack(spacing: 12.8) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(L(n == 1 ? "wines.bottlesOne" : "wines.bottlesMany", ["n": "\(n)"])).font(.semibold(15.2)).foregroundStyle(.white)
                    Text(krText(total)).font(.body(13.6)).foregroundStyle(.white.opacity(0.75))
                }
                Spacer()
                Button(L("wines.toCart")) { model.path.append(.cart(tasting)) }
                    .font(.medium(14.4)).foregroundStyle(Color.paper)
                    .padding(.horizontal, 14).frame(minHeight: 40)
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 8))
            }
            .padding(.leading, 16).padding(.trailing, 8.8).padding(.vertical, 8.8)
            .background(Color.paper, in: RoundedRectangle(cornerRadius: 8))
            .shadow(color: .black.opacity(0.22), radius: 12, y: 8)
            .padding(.horizontal, 16).padding(.bottom, 8)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }
}

/// The site's /cart/: the lines with a stepper each, the total, "Send bestilling", and the guest's orders with how to pay.
struct CartView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let tasting: MyTasting
    @State private var wines: [Int: Wine] = [:]
    /// Every wine's bottle size, also of wines no longer for sale, for the order lines ("2 × … · 150 cl")
    @State private var sizes: [Int: Double] = [:]
    @State private var info: TastingInfo?
    /// Debug only (payMock): a MobilePay number and recipient for screenshots of the payment box
    @State private var mockPayee: (number: String, name: String)?
    // The mock (set only with -payMock) wins over the database, so the box looks the same whatever the database has
    private var payee: String? { mockPayee?.number ?? info?.mobilepay }
    private var recipient: String? { mockPayee?.name ?? info?.mobilepay_name }
    @State private var orders: [OrderLine] = []
    @State private var loaded = false
    @State private var sending = false
    @State private var confirm: (id: Int, total: Double)?
    @State private var toast: Toast?
    @State private var asking: Wine?
    @State private var undo: (wine: Wine, n: Int)?

    private var open: Bool { info?.orders_open == true || debugOrdersOpen }
    /// Pooled quantity prices can still fall while ordering is open, so paying waits until the host closes it
    private var payLater: Bool { info?.bulk_mode == "pooled" && open }

    var body: some View {
        VStack(spacing: 0) {
            TopBar(tasting: tasting)
            Rectangle().fill(Color.rule).frame(height: 1)
            ZStack(alignment: .top) {
                PageBackground(path: "/t/cart/")
                if !loaded { VStack(spacing: 0) { head; LoadingState() } } else { content }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(Color.lodge)
        .siteMenus()
        .toolbar(.hidden, for: .navigationBar)
        .toast($toast)
        .overlay(alignment: .bottom) { undoBar }
        .task { await load() }
        .confirmationDialog(asking.map { L("cart.removeQ", ["name": wineTitle($0, number: nil)]) } ?? "", isPresented: Binding(get: { asking != nil }, set: { if !$0 { asking = nil } }), titleVisibility: .visible) {
            Button(L("cart.remove"), role: .destructive) { if let w = asking { remove(w) } }
            Button(L("common.cancel"), role: .cancel) { asking = nil }
        }
    }

    private var lines: [(Wine, Int)] {
        model.cart(tasting.slug).compactMap { id, n in wines[id].map { ($0, n) } }.sorted { ($0.0.sort_order ?? 0) < ($1.0.sort_order ?? 0) }
    }

    /// The tasting's name and tabs, at the top of the scrolling content as on the site (WIN-238)
    private var head: some View {
        TastingHead(title: tasting.title, tab: nil) { tab in model.tastingTab = tab; model.path.removeLast(model.path.count - 1) }
    }

    private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                head
                VStack(alignment: .leading, spacing: 16) {
                    SectionHeading(text: L("page.cart"))
                    if !open { NoticeBox(text: L("cart.closed")) }
                    if let confirm {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(L("cart.thanks", ["id": "\(confirm.id)"])).font(.semibold(16)).foregroundStyle(Color.paper)
                            if payLater { Text(L("bulk.payLater")).font(.body()).foregroundStyle(Color.paper) }
                            else { PayBox(mobilepay: payee, recipient: recipient, amount: confirm.total, toast: $toast) }
                        }
                        .padding(16)
                        .background(Color.okBg, in: RoundedRectangle(cornerRadius: 8))
                        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.okLine))
                    }
                    let list = lines
                    if list.isEmpty {
                        if confirm == nil {
                            EmptyBox(icon: "cart", title: L("cart.empty"), text: L("cart.emptyHelp")) {
                                Button(L("cart.seeWines")) { model.tastingTab = .wines; model.path.removeLast(model.path.count - 1) }.buttonStyle(SecondaryButton())
                            }
                        }
                    } else {
                        VStack(spacing: 0) {
                            ForEach(list, id: \.0.id) { w, n in line(w, n) }
                        }
                        HStack { Text(L("cart.total")).font(.medium()); Spacer(); Text(krText(total(list))).font(.display(28, light: false)) }
                            .foregroundStyle(Color.paper).padding(.top, 4)
                        Button { Task { await send(list) } } label: {
                            if sending { HStack(spacing: 8) { ProgressView().tint(.white); Text(L("common.sending")) } } else { Text(L("cart.send")) }
                        }
                        .buttonStyle(PrimaryButton()).disabled(!open || sending)
                        Text(L("cart.binding")).font(.body(13.6)).foregroundStyle(Color.muted)
                    }
                    if !orders.isEmpty {
                        Text(L("cart.yourOrders")).font(.display(28, light: false, relativeTo: .title2)).foregroundStyle(Color.paper).padding(.top, 32)
                        ForEach(groupOrders(orders).reversed(), id: \.first!.order_id) { ls in history(ls) }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16).padding(.bottom, 24)
            }
        }
        .refreshable { await load() }
    }

    private func total(_ list: [(Wine, Int)]) -> Double {
        list.reduce(0.0) { $0 + Double($1.1) * unitPrice($1.0, ($1.0.ordered ?? 0) + $1.1) }
    }

    /// One line per wine: picture, name, price per bottle and the next quantity price, the stepper, the line's total, the trash
    private func line(_ w: Wine, _ n: Int) -> some View {
        let counted = (w.ordered ?? 0) + n
        let price = unitPrice(w, counted)
        let name = wineTitle(w, number: nil)
        return HStack(alignment: .top, spacing: 12) {
            WineThumb(url: w.imageURL, blind: w.isBlind)
            VStack(alignment: .leading, spacing: 4) {
                Text(name).font(.semibold(16)).foregroundStyle(Color.paper)
                Text([w.bottleLine, L("cart.perBottle", ["price": krText(price)]), nextTierLabel(w, counted)].compactMap { $0 }.joined(separator: " · "))
                    .font(.body(14.4)).foregroundStyle(Color.muted)
                if let note = bulkNote(w, mode: info?.bulk_mode, inCart: n) { Text(note).font(.body(14.4)).foregroundStyle(Color.bordeaux) }
                HStack {
                    Stepper17(value: Binding(get: { n }, set: { model.setQty(tasting.slug, w.id, $0) }), label: name,
                              less: L("cart.oneLess", ["name": name]), more: L("cart.oneMore", ["name": name]), small: true)
                    Spacer()
                    Text(krText(Double(n) * price)).font(.medium()).foregroundStyle(Color.paper)
                }
                .padding(.top, 4)
            }
            Button { asking = w } label: { SiteIcon("trash", size: 19).foregroundStyle(Color.muted).frame(width: 44, height: 44) }
                .accessibilityLabel("\(L("cart.remove")): \(name)")
        }
        .padding(.vertical, 14)
        .overlay(alignment: .bottom) { Rectangle().fill(Color.rule).frame(height: 1) }
    }

    /// An order: its number, paid or not, the date, the lines and the total; how to pay folded under it
    private func history(_ ls: [OrderLine]) -> some View {
        let total = ls.reduce(0.0) { $0 + Double($1.quantity) * $1.unit_price }
        let id = ls[0].order_id
        return VStack(alignment: .leading, spacing: 0) {
            orderCard(ls, withTasting: false, sizes: sizes)
            if !ls[0].paid {
                if payLater { Text(L("bulk.payLater")).font(.body(14.4)).foregroundStyle(Color.muted).padding(.top, 8) }
                else {
                    Disclosure(summary: L("cart.howToPay")) {
                        PayBox(mobilepay: payee, recipient: recipient, amount: total, toast: $toast)
                    }
                    .padding(.top, 8)
                }
            }
        }
    }

    // MARK: Removing with Undo

    private func remove(_ w: Wine) {
        let n = model.cart(tasting.slug)[w.id] ?? 0
        model.setQty(tasting.slug, w.id, 0)
        asking = nil
        withAnimation { undo = (w, n) }
        Task { try? await Task.sleep(for: .seconds(5)); withAnimation { if undo?.wine.id == w.id { undo = nil } } }
    }

    @ViewBuilder private var undoBar: some View {
        if let undo {
            HStack(spacing: 12) {
                Text(L("cart.removed", ["name": wineTitle(undo.wine, number: nil)])).font(.medium(14.4)).foregroundStyle(.white)
                Spacer(minLength: 4)
                Button(L("wineLib.undo")) {
                    model.setQty(tasting.slug, undo.wine.id, undo.n); withAnimation { self.undo = nil }
                }
                .font(.semibold(14.4)).foregroundStyle(.white)
            }
            .padding(.horizontal, 16).padding(.vertical, 11)
            .background(Color.paper, in: RoundedRectangle(cornerRadius: 8))
            .padding(.horizontal, 16).padding(.bottom, 24)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    // MARK: Loading and sending

    private func load() async {
        async let w = try? Backend.wines(tasting.code)
        async let t = try? Backend.tasting(tasting.code)
        async let o = try? Backend.myOrders(tasting.code)
        let (list, settings, mine) = await (w, t, o)
        wines = Dictionary(((list ?? []).filter { $0.orderable == true }).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        if let list { sizes = Dictionary(list.compactMap { w in w.bottle_cl?.value.map { (w.id, $0) } }, uniquingKeysWith: { a, _ in a }) }
        info = settings ?? info
        orders = mine ?? orders
        #if DEBUG
        // Screenshots of the payment box, without changing the test data: one unpaid order (and a number if the host has none)
        if UserDefaults.standard.bool(forKey: "payMock"), orders.isEmpty, let w = list?.first(where: { !$0.isBlind }) {
            mockPayee = ("12345678", "Morten Kruse")
            orders = [OrderLine(order_id: 101, created_at: "2026-11-03T19:30:00Z", paid: false, wine_id: w.id, wine_name: w.name ?? "", quantity: 2, unit_price: w.price_dkk ?? 0)]
        }
        #endif
        loaded = true
    }

    private func send(_ list: [(Wine, Int)]) async {
        sending = true; defer { sending = false }
        do {
            let id = try await Backend.placeOrder(tasting.code, list.map { ($0.0.id, $0.1) })
            let sum = total(list)
            // A new try worked: the error from the last one goes (WIN-314)
            toast.clearError()
            model.clearCart(tasting.slug)
            withAnimation { confirm = (id, sum) }
            await load()
        } catch {
            let m = dbMessage(error)
            toast = .error(L(m.contains("lukket") ? "cart.errClosed" : m.contains("kan ikke bestilles") ? "cart.errWine" : "cart.errSend"))
        }
    }
}
