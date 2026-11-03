import SwiftUI

// The site's one menu (src/lib/ui/menu.ts, .menu in components.css): a white panel under the button that opened it,
// with an icon or flag and a text per item, a check by the chosen one, and quiet items (Sign out) in the muted colour.
// Used for the language and the account in the top bar, and for the dropdowns on the pages (sorting in the wine book).

enum MenuID: Hashable { case language, account, custom(String) }

struct MenuAnchors: PreferenceKey {
    static var defaultValue: [MenuID: Anchor<CGRect>] = [:]
    static func reduce(value: inout [MenuID: Anchor<CGRect>], nextValue: () -> [MenuID: Anchor<CGRect>]) {
        value.merge(nextValue()) { $1 }
    }
}

struct SiteMenuItem: Identifiable {
    enum Lead { case none, icon(String), flag(String) }
    var id: String { title }
    var lead: Lead = .none
    let title: String
    /// Radio items (language, sort): the check shows on the chosen one
    var checked: Bool? = nil
    /// .opt-i.quiet: Sign out
    var quiet = false
    /// The <hr> before the item
    var dividerBefore = false
    /// Shown at the right in the muted colour (the current language)
    var value: String? = nil
    /// A list the same panel switches to ("Sprog" → the languages), with "Tilbage" at the top
    var submenu: [SiteMenuItem]? = nil
    /// A second line under the title (a tasting's date in the switcher)
    var subtitle: String? = nil
    /// .m-group: a small heading over the items ("SKIFT SMAGNING"), not a button
    var isHeading = false
    var action: () -> Void = {}
}

/// .menu .opt-i: the light background while pressed
private struct MenuRowStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.background(configuration.isPressed ? Color.lodge : Color.clear, in: RoundedRectangle(cornerRadius: 6))
    }
}

struct MenuPanel: View {
    let items: [SiteMenuItem]
    let close: () -> Void
    @State private var sub: [SiteMenuItem]?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let sub {
                row(SiteMenuItem(lead: .icon("left"), title: L("wizard.back"), quiet: true) { withAnimation(.easeOut(duration: 0.15)) { self.sub = nil } }, keepOpen: true)
                Rectangle().fill(Color.rule).frame(height: 1).padding(.vertical, 4.8)
                ForEach(sub) { row($0) }
            } else {
                ForEach(items) { item in
                    if item.dividerBefore { Rectangle().fill(Color.rule).frame(height: 1).padding(.vertical, 4.8) }
                    row(item, keepOpen: item.submenu != nil)
                }
            }
        }
        .padding(5.6)
        .frame(minWidth: 224, alignment: .leading)
        .fixedSize()
        .background(Color.surface, in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.rule))
        .shadow(color: Color.paper.opacity(0.14), radius: 14, y: 10)
    }

    @ViewBuilder private func row(_ item: SiteMenuItem, keepOpen: Bool = false) -> some View {
        if item.isHeading {
            Text(item.title.uppercased()).font(.semibold(11.2)).tracking(1.3).foregroundStyle(Color.muted)
                .padding(.horizontal, 8.8).padding(.top, 8).padding(.bottom, 2.4).accessibilityAddTraits(.isHeader)
        } else { button(item, keepOpen: keepOpen) }
    }

    private func button(_ item: SiteMenuItem, keepOpen: Bool) -> some View {
        Button {
            if let s = item.submenu { withAnimation(.easeOut(duration: 0.15)) { sub = s } }
            else { if !keepOpen { close() }; item.action() }
        } label: {
            HStack(spacing: 9.6) {
                switch item.lead {
                case .icon(let name): SiteIcon(name, size: 17.6).foregroundStyle(Color.muted)
                case .flag(let code): FlagImage(code: code)
                case .none: EmptyView()
                }
                VStack(alignment: .leading, spacing: 1.6) {
                    Text(item.title).font(item.checked == true ? .medium(14.9) : .body(14.9))
                        .foregroundStyle(item.quiet ? Color.muted : Color.paper).lineLimit(1)
                    if let sub = item.subtitle { Text(sub).font(.body(12.8)).foregroundStyle(Color.muted).lineLimit(1) }
                }
                Spacer(minLength: 12)
                if let value = item.value { Text(value).font(.body(14.4)).foregroundStyle(Color.muted).lineLimit(1) }
                if item.submenu != nil { SiteIcon("right", size: 15).foregroundStyle(Color.muted) }
                if let checked = item.checked {
                    SiteIcon("check", size: 16).foregroundStyle(Color.bordeaux).opacity(checked ? 1 : 0)
                }
            }
            .padding(.horizontal, 8.8).frame(minHeight: 44).contentShape(Rectangle())
        }
        .buttonStyle(MenuRowStyle())
        .accessibilityAddTraits(item.checked == true ? .isSelected : [])
    }
}

/// The site's flag (src/i18n/flags.ts): 3:2 with a thin edge
struct FlagImage: View {
    let code: String
    var width: CGFloat = 17.6
    var body: some View {
        Image("flag-\(code)").resizable().frame(width: width, height: width / 1.5)
            .clipShape(RoundedRectangle(cornerRadius: 2))
            .overlay(RoundedRectangle(cornerRadius: 2).strokeBorder(Color.black.opacity(0.12), lineWidth: 1))
            .accessibilityHidden(true)
    }
}

/// The button that opens a menu: its content and the chevron, which turns up while the menu is open.
struct MenuButton<Label: View>: View {
    @Environment(AppModel.self) private var model
    let id: MenuID
    let accessibilityLabel: String
    @ViewBuilder var label: Label
    var body: some View {
        let open = model.openMenu == id
        Button { withAnimation(.easeOut(duration: 0.15)) { model.openMenu = open ? nil : id } } label: {
            HStack(spacing: 5) {
                label
                SiteIcon("chev", size: 14).foregroundStyle(Color.muted).opacity(0.7).rotationEffect(.degrees(open ? 180 : 0))
            }
            .frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .anchorPreference(key: MenuAnchors.self, value: .bounds) { [id: $0] }
        .accessibilityLabel(accessibilityLabel)
        .accessibilityAddTraits(open ? .isSelected : [])
    }
}

extension AppModel {
    /// The languages, as the sub list of "Sprog": the current one checked, picking one switches at once
    var languageItems: [SiteMenuItem] {
        appLanguages.map { l in SiteMenuItem(lead: .flag(l.code), title: l.name, checked: l.code == language) { [weak self] in self?.setLanguage(l.code) } }
    }
    private var languageRow: SiteMenuItem {
        SiteMenuItem(lead: .icon("globe"), title: L("profile.language"), dividerBefore: true,
                     value: appLanguages.first { $0.code == language }?.name, submenu: languageItems)
    }

    /// The account menu with the guest's places, as on the site (without admin); the language is a row in it
    func menuItems(_ id: MenuID) -> [SiteMenuItem]? {
        switch id {
        case .account where isIn:
            return [
                SiteMenuItem(lead: .icon("home"), title: L("nav.home")) { [weak self] in self?.path = [] },
                SiteMenuItem(lead: .icon("book"), title: L("book.title")) { [weak self] in self?.path = [.book] },
                SiteMenuItem(lead: .icon("user"), title: L("nav.profile")) { [weak self] in self?.path = [.profile] },
                languageRow,
                SiteMenuItem(lead: .icon("logout"), title: L("nav.signOut"), quiet: true, dividerBefore: true) { [weak self] in
                    Task { await self?.signOut() }
                },
            ]
        case .account:
            // Not signed in (the sign-in page): only the language
            var row = languageRow; row.dividerBefore = false
            return [row]
        default: return nil
        }
    }
}

/// Draws the open menu under its button, on top of the screen; a tap outside closes it.
/// `extra` gives the items of a page's own menus (MenuID.custom).
struct SiteMenus: ViewModifier {
    @Environment(AppModel.self) private var model
    var extra: (MenuID) -> [SiteMenuItem]? = { _ in nil }
    func body(content: Content) -> some View {
        content.overlayPreferenceValue(MenuAnchors.self) { anchors in
            GeometryReader { geo in
                if let id = model.openMenu, let anchor = anchors[id], let items = model.menuItems(id) ?? extra(id) {
                    let r = geo[anchor]
                    ZStack(alignment: .topLeading) {
                        Color.black.opacity(0.001).ignoresSafeArea()
                            .onTapGesture { withAnimation(.easeOut(duration: 0.15)) { model.openMenu = nil } }
                            .accessibilityHidden(true)
                        MenuPanel(items: items) { model.openMenu = nil }
                            .alignmentGuide(.leading) { d in -max(16, min(r.maxX, geo.size.width - 16) - d.width) }
                            .alignmentGuide(.top) { _ in -(r.maxY + 6) }
                            .transition(.opacity.combined(with: .offset(y: -4)))
                    }
                }
            }
        }
    }
}

extension View {
    func siteMenus(_ extra: @escaping (MenuID) -> [SiteMenuItem]? = { _ in nil }) -> some View { modifier(SiteMenus(extra: extra)) }
}
