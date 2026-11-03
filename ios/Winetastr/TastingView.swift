import SwiftUI

/// One tasting: the top bar, its name and tabs, and the tab's content.
struct TastingView: View {
    @Environment(AppModel.self) private var model
    let tasting: MyTasting
    @State private var info: TastingInfo?
    @State private var invite: Invite?
    @State private var failed = false
    @State private var editing = false
    @State private var toast: String?

    var body: some View {
        @Bindable var model = model
        VStack(spacing: 0) {
            TopBar()
            TastingBar(title: tasting.title, tab: model.tastingTab) { model.tastingTab = $0 }
            Group {
                if let info, let invite {
                    if invite.email == nil { EmailStep(code: tasting.code, name: invite.name) { Task { await load() } } }
                    else if model.tastingTab == .home { details(info, invite) }
                    else { WinesView(tasting: tasting) }
                } else if failed {
                    ErrorState { Task { await load() } }
                } else {
                    LoadingState()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(Color.lodge)
        .toolbar(.hidden, for: .navigationBar)
        .task { await load() }
        .onChange(of: model.online) { if model.online && failed { Task { await load() } } }
        .sheet(isPresented: $editing) {
            if let invite, let info {
                AnswerSheet(code: tasting.code, invite: invite, full: info.full ?? false) { message in
                    toast = message; Task { await load() }
                }
            }
        }
        .toast($toast)
    }

    private func details(_ info: TastingInfo, _ invite: Invite) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 10) {
                    if let d = info.start, let c = countdownText(d) { Chip(text: c, tone: .wait) }
                    Text(info.title).font(.display(44, relativeTo: .largeTitle)).foregroundStyle(Color.paper).accessibilityAddTraits(.isHeader)
                    if let d = info.start { factLine("calendar", whenText(d)) }
                    if let p = info.place, !p.isEmpty { factLine("pin", p) }
                    if let h = info.hosts { factLine("user", L("tastingHome.host", ["name": h])) }
                }
                answerCard(info, invite)
                if let intro = info.intro, !intro.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Eyebrow(text: L("tastingHome.about"))
                        Text(intro).font(.display(25, relativeTo: .title2)).foregroundStyle(Color.paper).lineSpacing(3)
                    }
                }
            }
            .padding(16).padding(.top, 8)
        }
        .refreshable { await load() }
    }

    private func factLine(_ icon: String, _ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            SiteIcon(icon).foregroundStyle(Color.bordeaux).alignmentGuide(.firstTextBaseline) { $0[.bottom] - 4 }
            Text(text).font(.body()).foregroundStyle(Color.paper)
        }
    }

    private func answerCard(_ info: TastingInfo, _ invite: Invite) -> some View {
        let open = info.signup_open ?? true
        let answered = invite.status == "yes" || invite.status == "no" || invite.status == "waitlist"
        return Card {
            Text(L("tastingHome.yourAnswer")).font(.semibold(17)).foregroundStyle(Color.paper).accessibilityAddTraits(.isHeader)
            if answered, let s = statusText(invite.status) { Chip(text: s, tone: statusTone(invite.status)) }
            switch invite.status {
            case "yes": Text(L("guest.statusYes")).font(.body()).foregroundStyle(Color.paper)
            case "no": Text(L("guest.statusNo")).font(.body()).foregroundStyle(Color.paper)
            case "waitlist": Text(L("guest.statusWaitlist")).font(.body()).foregroundStyle(Color.paper)
            default: Text(L("guest.coming")).font(.body()).foregroundStyle(Color.paper)
            }
            if let note = invite.note, !note.isEmpty { Text(note).font(.body(14.4)).foregroundStyle(Color.muted) }
            if let n = info.coming, n > 0 { Text(L("tastingHome.coming", ["n": "\(n)"])).font(.body(14.4)).foregroundStyle(Color.muted) }
            if open {
                if answered {
                    Button(L("tastingHome.change")) { editing = true }.buttonStyle(TextButton())
                } else {
                    if info.full == true { Text(L("guest.fullHint")).font(.body(14.4)).foregroundStyle(Color.muted) }
                    Button(L("app.answer")) { editing = true }.buttonStyle(PrimaryButton())
                }
            } else {
                Text(L("tastingHome.closedHint")).font(.body(14.4)).foregroundStyle(Color.muted)
            }
        }
    }

    private func load() async {
        do {
            async let i = Backend.tasting(tasting.code)
            async let v = Backend.invite(tasting.code)
            let (a, b) = try await (i, v)
            info = a; invite = b; failed = a == nil || b == nil
            #if DEBUG
            if UserDefaults.standard.string(forKey: "route") == "rsvp", b?.email != nil { editing = true }
            #endif
        } catch {
            if info == nil { failed = true }
        }
    }
}

/// First visit without an email on the invitation: the same step as on the website.
struct EmailStep: View {
    let code: String
    let name: String
    let done: () -> Void
    @State private var email = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text("\(L("guest.welcome")) \(name)").font(.display(38, relativeTo: .largeTitle)).foregroundStyle(Color.paper)
                Text(L("guest.emailLead")).font(.body()).foregroundStyle(Color.muted)
                FieldLabel(text: L("guest.yourEmail")).padding(.top, 8)
                TextField("", text: $email)
                    .accessibilityLabel(L("guest.yourEmail"))
                    .keyboardType(.emailAddress).textContentType(.emailAddress)
                    .textInputAutocapitalization(.never).autocorrectionDisabled().wtField(invalid: error != nil)
                FieldError(text: error)
                Button { Task { await save() } } label: {
                    if busy { ProgressView().tint(.white) } else { Text(L("common.continue")) }
                }
                .buttonStyle(PrimaryButton()).disabled(busy).padding(.top, 6)
            }
            .padding(16)
        }
    }

    private func save() async {
        let e = email.trimmingCharacters(in: .whitespaces)
        guard e.range(of: #"^[^@\s]+@[^@\s]+\.[^@\s]+$"#, options: .regularExpression) != nil else {
            error = e.isEmpty ? L("guest.emailMissing") : L("guest.emailBad"); return
        }
        busy = true; error = nil; defer { busy = false }
        do { try await Backend.setEmail(code, e); done() }
        catch { self.error = emailError(error) }
    }
}

func emailError(_ error: Error) -> String {
    let m = dbMessage(error)
    if m.contains("bruges allerede") { return L("guest.emailTaken") }
    if m.contains("Ugyldig") { return L("guest.emailBad") }
    if m.contains("email_locked") { return L("guest.emailLocked") }
    return L("guest.emailNotSaved")
}

struct AnswerSheet: View {
    @Environment(\.dismiss) private var dismiss
    let code: String
    let invite: Invite
    let full: Bool
    let done: (String) -> Void
    @State private var attending: Bool?
    @State private var note = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        SheetFrame(title: L("guest.coming")) {
            choice(true, L("app.yesTitle"), full && invite.status != "yes" ? L("guest.fullHint") : nil)
            choice(false, L("app.noTitle"), nil)
            FieldLabel(text: L("guest.note")).padding(.top, 8)
            TextField("", text: $note, axis: .vertical)
                .accessibilityLabel(L("guest.note")).lineLimit(3...6).padding(.vertical, 10).wtField()
            Text(L("guest.canChange")).font(.body(14.4)).foregroundStyle(Color.muted)
            FieldError(text: error)
            Button { Task { await save() } } label: {
                if busy { ProgressView().tint(.white) } else { Text(L("common.save")) }
            }
            .buttonStyle(PrimaryButton()).disabled(busy).padding(.top, 8)
        }
        .presentationDetents([.medium, .large])
        .onAppear {
            note = invite.note ?? ""
            if invite.status == "no" { attending = false } else if invite.status == "yes" || invite.status == "waitlist" { attending = true }
        }
    }

    /// .choice-cards
    private func choice(_ value: Bool, _ title: String, _ hint: String?) -> some View {
        Button { attending = value; error = nil } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: attending == value ? "largecircle.fill.circle" : "circle")
                    .foregroundStyle(attending == value ? Color.bordeaux : Color.muted)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.medium()).foregroundStyle(Color.paper)
                    if let hint { Text(hint).font(.body(14.4)).foregroundStyle(Color.muted).multilineTextAlignment(.leading) }
                }
                Spacer(minLength: 0)
            }
            .padding(14)
            .background(Color.surface, in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(attending == value ? Color.bordeaux : Color.fieldLine, lineWidth: attending == value ? 1.5 : 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(attending == value ? .isSelected : [])
    }

    private func save() async {
        guard let attending else { error = L("guest.chooseYesNo"); return }
        busy = true; error = nil; defer { busy = false }
        do {
            _ = try await Backend.respond(code, attending: attending, note: note)
            done(L("common.saved")); dismiss()
        } catch {
            self.error = dbMessage(error).contains("lukket") ? L("guest.signupClosed") : L("guest.answerNotSaved")
        }
    }
}
