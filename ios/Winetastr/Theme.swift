import SwiftUI
import UIKit
import CoreText

// The website's look: src/styles/global.css and components.css. The site has a light theme only, and so does the app.
extension Color {
    private static func hex(_ v: UInt32) -> Color {
        Color(red: Double((v >> 16) & 255) / 255, green: Double((v >> 8) & 255) / 255, blue: Double(v & 255) / 255)
    }
    static let lodge = hex(0xFAF7F3)
    static let surface = hex(0xFFFFFF)
    static let rule = hex(0xE3DAD2)
    static let fieldLine = hex(0xD9CFC7)
    static let paper = hex(0x241C1B)
    static let muted = hex(0x6B5F5C)
    static let bordeaux = hex(0x6E0F1F)
    static let bordeauxDark = hex(0x4F0A16)
    static let tawny = hex(0x965A1E)
    static let okText = hex(0x2F6B3A)
    static let okBg = hex(0xEEF6F0)
    static let okLine = hex(0xB9D3BE)
    static let waitBg = hex(0xFBF3EA)
    static let waitLine = hex(0xE2C9AD)
    static let errorText = hex(0xB3261E)
    static let errBg = hex(0xFBF0F1)
    static let errLine = hex(0xE3C4C9)
    static let placeholder = hex(0x9B8F8B)
    static let warnText = hex(0x7A5200)
    static let warnBg = hex(0xFDF6DF)
    static let warnLine = hex(0xEAD48F)
    static func styleTone(_ key: String?) -> Color {
        switch key {
        case "Red": return hex(0x861530)
        case "WhiteWine": return hex(0xE0C27A)
        case "Rose": return hex(0xD98A8A)
        case "Orange": return hex(0xD08A3A)
        case "Sparkling": return hex(0xE8D9A0)
        case "Sweet": return hex(0xC9A66B)
        case "Fortified": return hex(0x7A1A2C)
        default: return hex(0x9A8A7A)
        }
    }
}

enum WTFonts {
    /// The site's fonts, registered at launch.
    static func register() {
        for name in ["CormorantGaramond-300", "CormorantGaramond-400", "Inter-400", "Inter-500", "Inter-600"] {
            if let url = Bundle.main.url(forResource: name, withExtension: "ttf") {
                CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            }
        }
    }
}

extension Font {
    /// The display face with lining figures: Cormorant's own old-style figures make 0 and 1 look like O and I
    static func display(_ size: CGFloat, light: Bool = true, relativeTo style: Font.TextStyle = .title) -> Font {
        let name = light ? "CormorantGaramond-Light" : "CormorantGaramond-Regular"
        guard let base = UIFont(name: name, size: size) else { return .custom(name, size: size, relativeTo: style) }
        let lining = base.fontDescriptor.addingAttributes([.featureSettings: [[
            UIFontDescriptor.FeatureKey.type: kNumberCaseType, UIFontDescriptor.FeatureKey.selector: kUpperCaseNumbersSelector,
        ]]])
        return Font(UIFontMetrics(forTextStyle: style.uiKit).scaledFont(for: UIFont(descriptor: lining, size: size)))
    }
    static func body(_ size: CGFloat = 16, relativeTo style: Font.TextStyle = .body) -> Font { .custom("Inter-Regular", size: size, relativeTo: style) }
    static func medium(_ size: CGFloat = 16, relativeTo style: Font.TextStyle = .body) -> Font { .custom("Inter-Medium", size: size, relativeTo: style) }
    static func semibold(_ size: CGFloat = 16, relativeTo style: Font.TextStyle = .body) -> Font { .custom("Inter-SemiBold", size: size, relativeTo: style) }
}

extension Font.TextStyle {
    var uiKit: UIFont.TextStyle {
        switch self {
        case .largeTitle: .largeTitle; case .title: .title1; case .title2: .title2; case .title3: .title3
        case .headline: .headline; case .subheadline: .subheadline; case .callout: .callout
        case .footnote: .footnote; case .caption: .caption1; case .caption2: .caption2; default: .body
        }
    }
}

/// The site's line icons (src/lib/ui/icons.ts)
struct SiteIcon: View {
    let name: String
    var size: CGFloat = 20
    init(_ name: String, size: CGFloat = 20) { self.name = name; self.size = size }
    var body: some View { Image("i-\(name)").resizable().scaledToFit().frame(width: size, height: size).accessibilityHidden(true) }
}

/// .btn
struct PrimaryButton: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    /// false: as wide as its text (the next tasting's one button), not the whole row
    var wide = true
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.medium(15.2))
            .padding(.horizontal, wide ? 0 : 20)
            .frame(maxWidth: wide ? .infinity : nil, minHeight: 44)
            .foregroundStyle(enabled ? Color.white : Color.muted)
            .background(enabled ? (configuration.isPressed ? Color.bordeauxDark : Color.bordeaux) : Color.surface, in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(enabled ? Color.clear : Color.rule))
    }
}

/// .text-btn
struct TextButton: ButtonStyle {
    var size: CGFloat = 15.2
    /// The quiet kind: muted until pressed
    var quiet = false
    /// Inline links in a line of text (.hero-when .text-btn) are not made taller than the line
    var minHeight: CGFloat = 44
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.medium(size)).foregroundStyle(quiet ? Color.muted : Color.bordeaux).opacity(configuration.isPressed ? 0.6 : 1)
            .frame(minHeight: minHeight).contentShape(Rectangle().inset(by: minHeight < 44 ? -8 : 0))
    }
}

/// Items in a row that wrap onto the next line when there is no room (like flex-wrap on the site)
struct FlowRow: Layout {
    var spacing: CGFloat = 8
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(proposal.width ?? .infinity, subviews)
        return CGSize(width: rows.map(\.width).max() ?? 0, height: rows.reduce(0) { $0 + $1.height } + spacing * CGFloat(max(0, rows.count - 1)))
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in arrange(bounds.width, subviews) {
            var x = bounds.minX
            for i in row.items {
                let s = subviews[i].sizeThatFits(.unspecified)
                subviews[i].place(at: CGPoint(x: x, y: y + (row.height - s.height) / 2), proposal: ProposedViewSize(s))
                x += s.width + spacing
            }
            y += row.height + spacing
        }
    }
    private func arrange(_ width: CGFloat, _ subviews: Subviews) -> [(items: [Int], width: CGFloat, height: CGFloat)] {
        var rows: [(items: [Int], width: CGFloat, height: CGFloat)] = []
        var cur: [Int] = []; var w: CGFloat = 0; var h: CGFloat = 0
        for (i, v) in subviews.enumerated() {
            let s = v.sizeThatFits(.unspecified)
            if !cur.isEmpty && w + spacing + s.width > width { rows.append((cur, w, h)); cur = []; w = 0; h = 0 }
            w += (cur.isEmpty ? 0 : spacing) + s.width; h = max(h, s.height); cur.append(i)
        }
        if !cur.isEmpty { rows.append((cur, w, h)) }
        return rows
    }
}

/// .card: white, 8px radius
struct Card<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 10) { content }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.surface, in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.rule))
    }
}

/// .input
struct FieldStyle: ViewModifier {
    var invalid = false
    func body(content: Content) -> some View {
        content.font(.body()).foregroundStyle(Color.paper)
            .padding(.horizontal, 13.6).frame(minHeight: 44)
            .background(Color.surface, in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(invalid ? Color.errorText : Color.fieldLine))
    }
}
extension View { func wtField(invalid: Bool = false) -> some View { modifier(FieldStyle(invalid: invalid)) } }

struct FieldLabel: View {
    let text: String
    var body: some View { Text(text).font(.medium(14.4)).foregroundStyle(Color.paper) }
}

struct FieldError: View {
    let text: String?
    var body: some View {
        if let text { Text(text).font(.body(13.6)).foregroundStyle(Color.errorText) }
    }
}

/// .chip
struct Chip: View {
    enum Tone { case neutral, ok, wait, err }
    let text: String
    var tone = Tone.neutral
    /// .chip.dashed: an answer, not an error ("Not coming")
    var dashed = false
    private var fg: Color { switch tone { case .ok: .okText; case .wait: .tawny; case .err: .errorText; case .neutral: .muted } }
    private var bg: Color { dashed ? .clear : { switch tone { case .ok: .okBg; case .wait: .waitBg; case .err: .errBg; case .neutral: .surface } }() }
    private var line: Color { switch tone { case .ok: .okLine; case .wait: .waitLine; case .err: .errLine; case .neutral: .rule } }
    var body: some View {
        Text(text).font(.body(12.5))
            .foregroundStyle(fg)
            .padding(.horizontal, 10).padding(.vertical, 5)
            .background(bg, in: Capsule())
            .overlay(Capsule().strokeBorder(line, style: StrokeStyle(lineWidth: 1, dash: dashed ? [3, 2] : [])))
    }
}

/// .chip.warn.tb-env (TopBar.astro): "Test" by the logo on the test build, which talks to the test database
/// (AppDatabase in Backend.swift). Nothing on the real build.
struct EnvChip: View {
    var body: some View {
        if AppDatabase.isTest {
            Text("Test".uppercased()).font(.semibold(12.5, relativeTo: .caption)).tracking(0.75)
                .foregroundStyle(Color.warnText)
                .padding(.horizontal, 9.6).padding(.vertical, 5)
                .background(Color.warnBg, in: Capsule())
                .overlay(Capsule().strokeBorder(Color.warnLine))
                .fixedSize()
                .accessibilityLabel("Test")
                .accessibilityIdentifier("env-test")
        }
    }
}

/// .eyebrow
struct Eyebrow: View {
    let text: String
    var body: some View {
        Text(text.uppercased()).font(.medium(11.5, relativeTo: .caption)).tracking(2.5).foregroundStyle(Color.muted).accessibilityAddTraits(.isHeader)
    }
}

/// The small line and style name above a wine's name
struct StyleEyebrow: View {
    let wine: Wine
    var body: some View {
        if let name = styleName(wine.style) {
            HStack(spacing: 8) {
                RoundedRectangle(cornerRadius: 2).fill(Color.styleTone(wine.style)).frame(width: 24, height: 3)
                Text(name.uppercased()).font(.medium(11.5, relativeTo: .caption)).tracking(2.2).foregroundStyle(Color.muted)
            }
        }
    }
}

struct ErrorState: View {
    let retry: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(L("app.loadFailedTitle")).font(.display(30)).foregroundStyle(Color.paper)
            Text(L("app.loadFailedText")).font(.body()).foregroundStyle(Color.muted)
            Button(L("app.retry"), action: retry).buttonStyle(PrimaryButton()).padding(.top, 6)
            Spacer()
        }
        .padding(16).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct LoadingState: View {
    var body: some View { ProgressView().tint(Color.bordeaux).frame(maxWidth: .infinity, maxHeight: .infinity) }
}

/// toast()
struct ToastModifier: ViewModifier {
    @Binding var text: String?
    func body(content: Content) -> some View {
        content.overlay(alignment: .bottom) {
            if let text {
                Text(text).font(.medium(14.4)).foregroundStyle(Color.white)
                    .padding(.horizontal, 16).padding(.vertical, 11)
                    .background(Color.paper, in: RoundedRectangle(cornerRadius: 8))
                    .padding(.bottom, 24)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .task {
                        UIAccessibility.post(notification: .announcement, argument: text)
                        try? await Task.sleep(for: .seconds(2))
                        withAnimation { self.text = nil }
                    }
            }
        }
        .animation(.easeOut(duration: 0.2), value: text)
    }
}
extension View { func toast(_ text: Binding<String?>) -> some View { modifier(ToastModifier(text: text)) } }

/// The bars are the app's own (like the site's), and swiping back must keep working without the system bar.
extension UINavigationController: @retroactive UIGestureRecognizerDelegate {
    override open func viewDidLoad() {
        super.viewDidLoad()
        interactivePopGestureRecognizer?.delegate = self
    }
    public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        viewControllers.count > 1
    }
}

/// The one top bar: logo, language and account, as on every page of the site.
struct TopBar: View {
    @Environment(AppModel.self) private var model
    /// In a tasting: the cart with its badge, while it has bottles (as on the site)
    var tasting: MyTasting? = nil

    var body: some View {
        HStack(spacing: 6) {
            Button { model.openMenu = nil; model.path = [] } label: {
                HStack(spacing: 10) {
                    Image("Logo").resizable().frame(width: 30, height: 30)
                    Text("Winetastr").font(.medium(17)).foregroundStyle(Color.paper)
                }
            }
            .buttonStyle(.plain)
            EnvChip().padding(.leading, 2)
            Spacer()
            if let tasting, model.cartCount(tasting.slug) > 0 {
                let n = model.cartCount(tasting.slug)
                Button { model.openMenu = nil; if case .cart = model.path.last {} else { model.path.append(.cart(tasting)) } } label: {
                    SiteIcon("cart", size: 23).foregroundStyle(Color.paper).frame(width: 44, height: 44)
                        .overlay(alignment: .topTrailing) {
                            Text("\(n)").font(.semibold(11.2)).foregroundStyle(.white).monospacedDigit()
                                .padding(.horizontal, 4.8).frame(minWidth: 19.2, minHeight: 19.2)
                                .background(Color.bordeaux, in: Capsule()).overlay(Capsule().strokeBorder(.white, lineWidth: 2))
                                .offset(x: 2, y: 2)
                        }
                }
                .accessibilityLabel("\(L("nav.cart")), \(L(n == 1 ? "wines.bottlesOne" : "wines.bottlesMany", ["n": "\(n)"]))")
            }
            // The account, with the language in it: the site's one menu (Menu.swift)
            MenuButton(id: .account, accessibilityLabel: L("nav.userMenu")) { SiteIcon("user", size: 23).foregroundStyle(Color.paper) }
        }
        .padding(.leading, 16).padding(.trailing, 8).frame(minHeight: 54)
        .background(Color.surface)
        .zIndex(10)
    }
}

/// The tasting's head in the page (as the site's, like the admin's): on the tasting's own tab the chips over it, then
/// its name as the page title, then the tabs (the quiz only when the tasting has one) with the underline.
/// It is the top of each tab's scrolling content (not pinned), so it scrolls away with the page as on the site; only
/// the TopBar stays put (the site's sticky .site-header).
struct TastingHead<Chips: View>: View {
    @Environment(AppModel.self) private var model
    let title: String
    /// The tasting's language (the host writes its name in it)
    var lang: String? = nil
    /// None on the cart and a wine's page's parent, which are not tabs themselves
    let tab: TastingTab?
    let select: (TastingTab) -> Void
    @ViewBuilder var chips: Chips
    @State private var tabsScrolled = false
    var body: some View {
        VStack(alignment: .leading, spacing: 9.6) {
            chips
            PageTitle(text: title, lang: lang)
            // .tabs on phones: one line that scrolls sideways (never two rows, never cut off with larger text); the
            // right edge fades, and the last tab has room after it so it is not faded once scrolled to the end.
            // As showChosen() in tabs.ts: the chosen tab is brought into view, and the left edge fades once scrolled.
            ScrollViewReader { bar in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 22) {
                    ForEach(TastingTab.allCases.filter { $0 != .quiz || model.tastingHasQuiz }, id: \.self) { t in
                        Button { select(t) } label: {
                            Text(t.title).font(.body(16.5)).foregroundStyle(t == tab ? Color.bordeaux : Color.muted)
                                .fixedSize()
                                .padding(.vertical, 11)
                                .overlay(alignment: .bottom) { if t == tab { Rectangle().fill(Color.bordeaux).frame(height: 2) } }
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(t == tab ? .isSelected : [])
                        .id(t)
                    }
                }
                .padding(.trailing, 24)
            }
            .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
            .fixedSize(horizontal: false, vertical: true)
            .modifier(TabsScrolled(scrolled: $tabsScrolled))
            .mask {
                HStack(spacing: 0) {
                    if tabsScrolled { LinearGradient(colors: [.clear, .black], startPoint: .leading, endPoint: .trailing).frame(width: 24) }
                    Rectangle()
                    LinearGradient(colors: [.black, .clear], startPoint: .leading, endPoint: .trailing).frame(width: 24)
                }
            }
            .onAppear { if let tab { bar.scrollTo(tab, anchor: .center) } }
            }
            .overlay(alignment: .bottom) { Rectangle().fill(Color.rule).frame(height: 1) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16).padding(.top, 14)
    }
}
/// The tabs' strip is scrolled from its start (the site's .tabs.scrolled: then the left edge fades too); iOS 18 and later
private struct TabsScrolled: ViewModifier {
    @Binding var scrolled: Bool
    func body(content: Content) -> some View {
        if #available(iOS 18.0, *) {
            content.onScrollGeometryChange(for: Bool.self) { $0.contentOffset.x > 4 } action: { _, now in scrolled = now }
        } else { content }
    }
}
extension TastingHead where Chips == EmptyView {
    init(title: String, lang: String? = nil, tab: TastingTab?, select: @escaping (TastingTab) -> Void) { self.init(title: title, lang: lang, tab: tab, select: select) { EmptyView() } }
}

enum TastingTab: CaseIterable, Hashable {
    case home, wines, quiz, chat
    var title: String {
        switch self { case .home: L("nav.tasting"); case .wines: L("nav.wines"); case .quiz: L("nav.quiz"); case .chat: L("nav.chat") }
    }
}
