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
    static let placeholder = hex(0x9B8F8B)
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
    static func display(_ size: CGFloat, light: Bool = true, relativeTo style: Font.TextStyle = .title) -> Font {
        .custom(light ? "CormorantGaramond-Light" : "CormorantGaramond-Regular", size: size, relativeTo: style)
    }
    static func body(_ size: CGFloat = 16, relativeTo style: Font.TextStyle = .body) -> Font { .custom("Inter-Regular", size: size, relativeTo: style) }
    static func medium(_ size: CGFloat = 16, relativeTo style: Font.TextStyle = .body) -> Font { .custom("Inter-Medium", size: size, relativeTo: style) }
    static func semibold(_ size: CGFloat = 16, relativeTo style: Font.TextStyle = .body) -> Font { .custom("Inter-SemiBold", size: size, relativeTo: style) }
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
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.medium(15.2))
            .frame(maxWidth: .infinity, minHeight: 44)
            .foregroundStyle(enabled ? Color.white : Color.muted)
            .background(enabled ? (configuration.isPressed ? Color.bordeauxDark : Color.bordeaux) : Color.surface, in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(enabled ? Color.clear : Color.rule))
    }
}

/// .text-btn
struct TextButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.medium(15.2)).foregroundStyle(Color.bordeaux).opacity(configuration.isPressed ? 0.6 : 1)
            .frame(minHeight: 44).contentShape(Rectangle())
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
    enum Tone { case neutral, ok, wait }
    let text: String
    var tone = Tone.neutral
    var body: some View {
        Text(text).font(.body(12.5))
            .foregroundStyle(tone == .ok ? Color.okText : tone == .wait ? Color.tawny : Color.muted)
            .padding(.horizontal, 10).padding(.vertical, 5)
            .background(tone == .ok ? Color.okBg : tone == .wait ? Color.waitBg : Color.surface, in: Capsule())
            .overlay(Capsule().strokeBorder(tone == .ok ? Color.okLine : tone == .wait ? Color.waitLine : Color.rule))
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
    var onAddInvite: (() -> Void)? = nil
    @State private var confirmOut = false

    private var flag: String {
        switch appLanguageCode { case "da": "🇩🇰"; case "is": "🇮🇸"; default: "🇬🇧" }
    }

    var body: some View {
        HStack(spacing: 10) {
            Button { model.path = [] } label: {
                HStack(spacing: 10) {
                    Image("Logo").resizable().frame(width: 30, height: 30)
                    Text("Winetastr").font(.medium(17)).foregroundStyle(Color.paper)
                }
            }
            .buttonStyle(.plain)
            Spacer()
            Button {
                if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
            } label: {
                HStack(spacing: 5) { Text(flag); SiteIcon("chev", size: 14).foregroundStyle(Color.muted) }
                    .frame(minWidth: 44, minHeight: 44)
            }
            .accessibilityLabel(L("app.language"))
            Menu {
                if let onAddInvite { Button(L("app.addInvitation"), systemImage: "link", action: onAddInvite) }
                Button(L("nav.signOut"), systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) { confirmOut = true }
            } label: {
                HStack(spacing: 5) {
                    SiteIcon("user", size: 24).foregroundStyle(Color.paper)
                    SiteIcon("chev", size: 14).foregroundStyle(Color.muted)
                }
                .frame(minWidth: 44, minHeight: 44)
            }
            .accessibilityLabel(L("app.account"))
        }
        .padding(.horizontal, 16).frame(minHeight: 54)
        .background(Color.surface)
        .confirmationDialog(L("nav.signOut"), isPresented: $confirmOut) {
            Button(L("nav.signOut"), role: .destructive) { Task { await model.signOut() } }
        }
    }
}

/// Under the top bar in a tasting: its name and the tabs.
struct TastingBar: View {
    let title: String
    let tab: TastingTab
    let select: (TastingTab) -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Rectangle().fill(Color.rule).frame(height: 1)
            Text(title).font(.semibold(16)).foregroundStyle(Color.paper).padding(.top, 10)
            HStack(spacing: 22) {
                ForEach(TastingTab.allCases, id: \.self) { t in
                    Button { select(t) } label: {
                        Text(t.title).font(.body(16.5)).foregroundStyle(t == tab ? Color.bordeaux : Color.muted)
                            .padding(.vertical, 11)
                            .overlay(alignment: .bottom) { if t == tab { Rectangle().fill(Color.bordeaux).frame(height: 2) } }
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(t == tab ? .isSelected : [])
                }
                Spacer()
            }
        }
        .padding(.horizontal, 16)
        .background(Color.surface)
        .overlay(alignment: .bottom) { Rectangle().fill(Color.rule).frame(height: 1) }
    }
}

enum TastingTab: CaseIterable, Hashable {
    case home, wines
    var title: String { self == .home ? L("nav.tasting") : L("nav.wines") }
}
