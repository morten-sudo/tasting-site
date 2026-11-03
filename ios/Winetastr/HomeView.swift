import SwiftUI

struct HomeView: View {
    @Environment(AppModel.self) private var model
    @State private var tastings: [MyTasting] = []
    @State private var loaded = false
    @State private var failed = false
    @State private var showAddLink = false

    var body: some View {
        @Bindable var model = model
        NavigationStack(path: $model.path) {
            VStack(spacing: 0) {
                TopBar(onAddInvite: { showAddLink = true })
                Rectangle().fill(Color.rule).frame(height: 1)
                content.frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .background(Color.lodge)
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $showAddLink) { AddInviteSheet { Task { await load() } } }
            .navigationDestination(for: Route.self) { route in
                switch route {
                case .tasting(let t): TastingView(tasting: t)
                case .wine(let t, let w, let n): WineDetailView(tasting: t, wine: w, position: n)
                }
            }
        }
        .task { await load() }
        .onChange(of: model.online) { if model.online && failed { Task { await load() } } }
    }

    @ViewBuilder private var content: some View {
        if failed && tastings.isEmpty {
            ErrorState { Task { await load() } }
        } else if !loaded {
            LoadingState()
        } else if tastings.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text(L("nav.myTastings")).font(.display(38, relativeTo: .largeTitle)).foregroundStyle(Color.paper)
                Card {
                    Text(L("app.noTastingsTitle")).font(.semibold(17)).foregroundStyle(Color.paper)
                    Text(L("tastings.noneHint")).font(.body()).foregroundStyle(Color.muted)
                    Button(L("app.addInvitation")) { showAddLink = true }.buttonStyle(PrimaryButton())
                }
                .padding(.top, 8)
                Spacer()
            }
            .padding(16)
        } else {
            let upcoming = tastings.filter { !$0.isPast }, past = tastings.filter(\.isPast)
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    Text(L("nav.myTastings")).font(.display(38, relativeTo: .largeTitle)).foregroundStyle(Color.paper).accessibilityAddTraits(.isHeader)
                    if !upcoming.isEmpty { section(L("home.upcomingMany"), upcoming) }
                    if !past.isEmpty { section(L("tastings.past"), past) }
                }
                .padding(16)
            }
            .refreshable { await load() }
        }
    }

    private func section(_ title: String, _ items: [MyTasting]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Eyebrow(text: title)
            ForEach(items) { t in
                NavigationLink(value: Route.tasting(t)) { TastingRow(tasting: t) }.buttonStyle(.plain)
            }
        }
    }

    private func load() async {
        do {
            let list = try await model.loadTastings()
            tastings = list; failed = false; loaded = true
            #if DEBUG
            if model.path.isEmpty, UserDefaults.standard.string(forKey: "route") != nil, let t = list.first { model.path = [.tasting(t)] }
            #endif
        } catch {
            failed = true; loaded = true
        }
    }
}

/// .lcard
struct TastingRow: View {
    let tasting: MyTasting
    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 5) {
                Text(tasting.title).font(.display(26, light: false, relativeTo: .title2)).foregroundStyle(Color.paper).multilineTextAlignment(.leading)
                if let d = tasting.start { Text(whenText(d)).font(.body(14.4)).foregroundStyle(Color.muted) }
                if let p = tasting.place, !p.isEmpty { Text(p).font(.body(14.4)).foregroundStyle(Color.muted) }
                if let s = statusText(tasting.status) { Chip(text: s, tone: statusTone(tasting.status), dashed: tasting.status == "no").padding(.top, 4) }
            }
            Spacer()
            SiteIcon("right", size: 18).foregroundStyle(Color.muted).padding(.top, 8)
        }
        .padding(16)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.rule))
        .accessibilityElement(children: .combine)
    }
}

func statusText(_ status: String?) -> String? {
    switch status {
    case "yes": return L("status.yes")
    case "no": return L("status.no")
    case "waitlist": return L("status.waitlist")
    default: return L("app.notAnswered")
    }
}

func statusTone(_ status: String?) -> Chip.Tone {
    switch status { case "yes": return .ok; case "waitlist": return .wait; default: return .neutral }
}

struct AddInviteSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let done: () -> Void
    @State private var link = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        SheetFrame(title: L("app.addInvitation")) {
            Text(L("login.inviteHelp")).font(.body()).foregroundStyle(Color.muted)
            FieldLabel(text: L("login.inviteLabel"))
            TextField("", text: $link)
                .accessibilityLabel(L("login.inviteLabel"))
                .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL).wtField(invalid: error != nil)
            FieldError(text: error)
            Button { Task { await add() } } label: { Text(L("common.continue")) }.buttonStyle(PrimaryButton()).disabled(busy)
        }
        .presentationDetents([.medium])
    }

    private func add() async {
        guard let code = extractInviteCode(link) else { error = L("login.pasteCode"); return }
        busy = true; error = nil; defer { busy = false }
        do {
            guard try await Backend.invite(code) != nil, let info = try await Backend.tasting(code) else {
                error = L("login.codeNotFound"); return
            }
            if model.signedInEmail != nil, !(await Backend.inviteIsMine(code)) {
                error = L("login.otherInvite"); return
            }
            model.didAddCode(slug: info.slug, code: code)
            done(); dismiss()
        } catch {
            self.error = L("app.loadFailedText")
        }
    }
}

/// The site's bottom sheet: a title, a close button and its content.
struct SheetFrame<Content: View>: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    @ViewBuilder var content: Content
    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(title).font(.display(30, relativeTo: .title)).foregroundStyle(Color.paper).accessibilityAddTraits(.isHeader)
                Spacer()
                Button { dismiss() } label: {
                    SiteIcon("x", size: 20).foregroundStyle(Color.muted).frame(width: 44, height: 44)
                }
                .accessibilityLabel(L("common.cancel"))
            }
            .padding(.leading, 20).padding(.trailing, 10).padding(.top, 12)
            ScrollView {
                VStack(alignment: .leading, spacing: 10) { content }.padding(.horizontal, 20).padding(.bottom, 20).padding(.top, 4)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .background(Color.lodge)
        .preferredColorScheme(.light)
    }
}
