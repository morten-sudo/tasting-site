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
    let action: () -> Void
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
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(items) { item in
                if item.dividerBefore { Rectangle().fill(Color.rule).frame(height: 1).padding(.vertical, 4.8) }
                Button { close(); item.action() } label: {
                    HStack(spacing: 9.6) {
                        switch item.lead {
                        case .icon(let name): SiteIcon(name, size: 17.6).foregroundStyle(Color.muted)
                        case .flag(let code): FlagImage(code: code)
                        case .none: EmptyView()
                        }
                        Text(item.title).font(item.checked == true ? .medium(14.9) : .body(14.9))
                            .foregroundStyle(item.quiet ? Color.muted : Color.paper).lineLimit(1)
                        Spacer(minLength: 12)
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
        .padding(5.6)
        .frame(minWidth: 224, alignment: .leading)
        .fixedSize()
        .background(Color.surface, in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.rule))
        .shadow(color: Color.paper.opacity(0.14), radius: 14, y: 10)
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
    /// The top bar's menus: the languages, and the account with the guest's places (as on the site, without admin)
    func menuItems(_ id: MenuID) -> [SiteMenuItem]? {
        switch id {
        case .language:
            return appLanguages.map { l in
                SiteMenuItem(lead: .flag(l.code), title: l.name, checked: l.code == language) { [weak self] in self?.setLanguage(l.code) }
            }
        case .account:
            return [
                SiteMenuItem(lead: .icon("home"), title: L("nav.home")) { [weak self] in self?.path = [] },
                SiteMenuItem(lead: .icon("book"), title: L("book.title")) { [weak self] in self?.path = [.book] },
                SiteMenuItem(lead: .icon("user"), title: L("nav.profile")) { [weak self] in self?.path = [.profile] },
                SiteMenuItem(lead: .icon("logout"), title: L("nav.signOut"), quiet: true, dividerBefore: true) { [weak self] in
                    Task { await self?.signOut() }
                },
            ]
        case .custom: return nil
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
