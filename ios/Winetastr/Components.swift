import SwiftUI

// More of the site's shared components (components.css), for the screens beyond the tasting.

/// The one tab bar (Tabs.astro): the chosen tab in bordeaux with a line under it
struct UnderlineTabs<T: Hashable>: View {
    let tabs: [(T, String)]
    @Binding var selection: T
    var body: some View {
        HStack(spacing: 22) {
            ForEach(tabs, id: \.0) { tab, title in
                Button { selection = tab } label: {
                    Text(title).font(.body(16.5)).foregroundStyle(tab == selection ? Color.bordeaux : Color.muted)
                        .padding(.vertical, 11)
                        .overlay(alignment: .bottom) { if tab == selection { Rectangle().fill(Color.bordeaux).frame(height: 2) } }
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(tab == selection ? .isSelected : [])
            }
            Spacer()
        }
        .overlay(alignment: .bottom) { Rectangle().fill(Color.rule).frame(height: 1) }
    }
}

/// .notice: a quiet box with an icon and a text, and an action under it
struct NoticeBox<Actions: View>: View {
    enum Tone { case neutral, ok }
    let text: String
    var tone = Tone.neutral
    @ViewBuilder var actions: Actions
    var body: some View {
        HStack(alignment: .top, spacing: 11) {
            SiteIcon(tone == .ok ? "check" : "info", size: 18).foregroundStyle(tone == .ok ? Color.okText : Color.muted).padding(.top, 1)
            VStack(alignment: .leading, spacing: 9) {
                Text(text).font(.body(15.2)).foregroundStyle(Color.paper).fixedSize(horizontal: false, vertical: true)
                actions
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 12.8).padding(.horizontal, 16)
        .background(tone == .ok ? Color.okBg : Color.surface, in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(tone == .ok ? Color.okLine : Color.rule))
    }
}
extension NoticeBox where Actions == EmptyView {
    init(text: String, tone: Tone = .neutral) { self.text = text; self.tone = tone; actions = EmptyView() }
}

/// .btn.secondary.small
struct SecondaryButton: ButtonStyle {
    var small = true
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.medium(small ? 14.4 : 15.2)).foregroundStyle(Color.paper)
            .padding(.horizontal, 14).frame(minHeight: 44)
            .background(configuration.isPressed ? Color.lodge : Color.surface, in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.fieldLine))
    }
}

/// wineThumb(): the bottle on white in a small square
struct WineThumb: View {
    let url: URL?
    var size: CGFloat = 56
    var blind = false
    var body: some View {
        ZStack {
            if !blind, let url {
                AsyncImage(url: url) { phase in
                    if let image = phase.image { image.resizable().scaledToFit() } else { glass }
                }
                .padding(4)
            } else { glass }
        }
        .frame(width: size, height: size)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: 6))
        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(Color.rule))
        .accessibilityHidden(true)
    }
    private var glass: some View { Image("Glass").resizable().scaledToFit().frame(width: size * 0.5, height: size * 0.5).foregroundStyle(Color.rule) }
}

/// The card variant of the one list row (.lrow + .lcard): picture, title, chips, meta lines, the right side, a foot
struct ListCard<Pic: View, Aside: View, Body: View>: View {
    let title: String
    var chips: [Chip] = []
    var meta: [String] = []
    var note: String? = nil
    var foot: (String, String)? = nil
    @ViewBuilder var pic: Pic
    @ViewBuilder var aside: Aside
    @ViewBuilder var content: Body
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                pic
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(.semibold(16)).foregroundStyle(Color.paper).multilineTextAlignment(.leading)
                    if !chips.isEmpty { FlowRow(spacing: 5.6) { ForEach(Array(chips.enumerated()), id: \.offset) { $0.element } }.padding(.top, 3) }
                    ForEach(meta, id: \.self) { Text($0).font(.body(14.4)).foregroundStyle(Color.muted).multilineTextAlignment(.leading) }
                    if let note { Text(note).font(.body(14.4)).italic().foregroundStyle(Color.paper).multilineTextAlignment(.leading) }
                    content
                }
                Spacer(minLength: 0)
                aside
            }
            if let foot {
                HStack { Text(foot.0).font(.body(14.4)).foregroundStyle(Color.muted); Spacer(); Text(foot.1).font(.semibold(15.2)).foregroundStyle(Color.paper) }
                    .padding(.top, 10).overlay(alignment: .top) { Rectangle().fill(Color.rule).frame(height: 1) }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.rule))
        .accessibilityElement(children: .combine)
    }
}

/// The page heading (PageHeader.astro): the title in the display face
struct PageTitle: View {
    let text: String
    var body: some View { Text(text).font(.display(38, relativeTo: .largeTitle)).foregroundStyle(Color.paper).accessibilityAddTraits(.isHeader) }
}

/// .choice-cards, compact: a radio, a flag or nothing, the name – the choice saved straight away
struct CompactChoices<T: Hashable>: View {
    let options: [(T, String, String?)]
    @Binding var selection: T
    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 6.4)], spacing: 6.4) {
            ForEach(options, id: \.0) { value, title, flag in
                Button { selection = value } label: {
                    HStack(spacing: 10) {
                        Image(systemName: selection == value ? "largecircle.fill.circle" : "circle")
                            .foregroundStyle(selection == value ? Color.bordeaux : Color.muted)
                        if let flag { FlagImage(code: flag, width: 20) }
                        Text(title).font(.medium(15.2)).foregroundStyle(Color.paper)
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 12.8).frame(minHeight: 44)
                    .background(Color.surface, in: RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(selection == value ? Color.bordeaux : Color.fieldLine, lineWidth: selection == value ? 1.5 : 1))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selection == value ? .isSelected : [])
            }
        }
    }
}

/// The search field (SearchField.astro): the magnifier inside the field
struct SearchBox: View {
    let label: String
    @Binding var text: String
    var body: some View {
        HStack(spacing: 8) {
            SiteIcon("search", size: 17).foregroundStyle(Color.muted)
            TextField("", text: $text, prompt: Text(label).foregroundStyle(Color.placeholder))
                .textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityLabel(label)
            if !text.isEmpty {
                Button { text = "" } label: { SiteIcon("x", size: 15).foregroundStyle(Color.muted).frame(width: 32, height: 32) }
                    .accessibilityLabel(L("common.cancel"))
            }
        }
        .wtField()
    }
}

/// "1. december 2026" in the app's language
func dateText(_ d: Date, year: Bool = true) -> String {
    let f = DateFormatter(); f.locale = appLocale
    f.setLocalizedDateFormatFromTemplate(year ? "dMMMMy" : "dMMMM")
    return f.string(from: d)
}
