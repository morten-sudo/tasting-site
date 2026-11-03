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
    @State private var wines: [Wine] = []
    @State private var origins: Origins?
    @State private var payment: TastingPayment?
    @State private var addToCalendar = false

    var body: some View {
        @Bindable var model = model
        VStack(spacing: 0) {
            TopBar(tasting: tasting)
            TastingBar(title: tasting.title, tab: model.tastingTab) { model.tastingTab = $0 }
            Group {
                if let info, let invite {
                    if invite.email == nil { EmailStep(code: tasting.code, name: invite.name) { Task { await load() } } }
                    else {
                        switch model.tastingTab {
                        case .home: details(info, invite)
                        case .wines: WinesView(tasting: tasting)
                        case .quiz: QuizView(tasting: tasting)
                        case .chat: ChatView(tasting: tasting)
                        }
                    }
                } else if failed {
                    ErrorState { Task { await load() } }
                } else {
                    LoadingState()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(Color.lodge)
        .siteMenus()
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
        .sheet(isPresented: $addToCalendar) {
            if let info, let start = info.start {
                CalendarSheet(title: info.title, start: start, end: info.end, place: info.place,
                              url: URL(string: "https://winetastr.com/t/\(info.slug)/")) { addToCalendar = false }
                    .ignoresSafeArea()
            }
        }
        .toast($toast)
    }

    private func answered(_ invite: Invite) -> Bool { ["yes", "no", "waitlist"].contains(invite.status ?? "") }

    private func details(_ info: TastingInfo, _ invite: Invite) -> some View {
        let open = info.signup_open ?? true
        let done = answered(invite)
        let countdown = info.start.flatMap(countdownText)
        return ZStack(alignment: .topLeading) {
            // The faint map of the wines' region behind the heading (.hero-bg) – it stays put while the page scrolls
            if let hero = origins?.hero {
                GeometryReader { geo in
                    MapBackdrop(drawing: hero).frame(width: geo.size.width * 1.2).offset(x: geo.size.width * 0.2, y: -16)
                }
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 36) {
                    VStack(alignment: .leading, spacing: 9.6) {
                        // The countdown and, once answered, the answer as its chip with "Change answer" beside it
                        if countdown != nil || done {
                            FlowRow(spacing: 8) {
                                if let countdown { Chip(text: countdown, tone: .wait) }
                                if done, let s = statusText(invite.status) {
                                    Chip(text: s, tone: statusTone(invite.status), dashed: invite.status == "no")
                                    if open {
                                        Button(L("tastingHome.change")) { editing = true }
                                            .buttonStyle(TextButton(size: 14.4)).accessibilityIdentifier("change-answer")
                                    }
                                }
                            }
                        }
                        Text(info.title).font(.display(44, relativeTo: .largeTitle)).foregroundStyle(Color.paper).accessibilityAddTraits(.isHeader)
                            .padding(.bottom, 6.4)
                        if let d = info.start {
                            factLine("calendar", whenText(d)) { Button(L("tastingHome.calendar")) { addToCalendar = true }.buttonStyle(TextButton(size: 14.4, minHeight: 20)) }
                        }
                        if let p = info.place, !p.isEmpty {
                            factLine("pin", p) {
                                if let url = URL(string: "https://maps.apple.com/?q=" + (p.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")) {
                                    Link(L("tastingHome.map"), destination: url).buttonStyle(TextButton(size: 14.4, minHeight: 20))
                                }
                            }
                        }
                        if let h = info.hostLine { factLine("user", h) { EmptyView() } }
                        if let n = info.coming, n > 0 { factLine("users", L("tastingHome.coming", ["n": "\(n)"])) { EmptyView() } }
                    }
                    if !done || (payment.map { $0.amount > 0 } ?? false) {
                        VStack(spacing: 16) {
                            if !done { answerCard(info, open: open) }
                            if let payment, payment.amount > 0 {
                                FeeCard(amount: payment.amount, paid: payment.paid, mobilepay: info.mobilepay, name: invite.name, toast: $toast)
                            }
                        }
                    }
                    if let intro = info.intro?.trimmingCharacters(in: .whitespacesAndNewlines), !intro.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Eyebrow(text: L("tastingHome.about"))
                            introText(intro)
                        }
                    }
                    if let origins { OriginsBlock(origins: origins) }
                    VStack(alignment: .leading, spacing: 10) {
                        Eyebrow(text: L("tastingHome.during"))
                        Button { model.tastingTab = .wines } label: {
                            EveningTile(icon: "glass", title: L("nav.wines"), sub: wines.isEmpty ? nil : L("tastingHome.winesSub", ["n": "\(wines.count)"]))
                        }
                        .buttonStyle(.plain)
                        if (info.quiz_count ?? 0) > 0 {
                            Button { model.tastingTab = .quiz } label: {
                                EveningTile(icon: "question", title: L("nav.quiz"),
                                            sub: L(info.quiz_finished == true ? "tastingHome.quizDone" : info.quiz_open == true ? "tastingHome.quizOpen" : "tastingHome.quizLater"))
                            }
                            .buttonStyle(.plain)
                        }
                        Button { model.tastingTab = .chat } label: {
                            EveningTile(icon: "chat", title: L("nav.chat"), sub: L("tastingHome.chatSub"))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(16).padding(.top, 8).padding(.bottom, 16)
            }
            #if DEBUG
            .defaultScrollAnchor(UserDefaults.standard.bool(forKey: "scrollBottom") ? .bottom : .top)
            #endif
            .refreshable { await load() }
        }
    }

    /// The host's introduction: blank lines part the paragraphs, the first in the display face (.h-intro)
    private func introText(_ intro: String) -> some View {
        let paras = intro.components(separatedBy: "\n").reduce(into: [[String]]([[]])) { acc, line in
            if line.trimmingCharacters(in: .whitespaces).isEmpty { if !(acc.last ?? []).isEmpty { acc.append([]) } } else { acc[acc.count - 1].append(line) }
        }.filter { !$0.isEmpty }.map { $0.joined(separator: "\n") }
        return VStack(alignment: .leading, spacing: 14.4) {
            ForEach(Array(paras.enumerated()), id: \.offset) { i, p in
                if i == 0 { Text(p).font(.display(23, relativeTo: .title2)).foregroundStyle(Color.paper).lineSpacing(4) }
                else { Text(p).font(.body(16.8)).foregroundStyle(Color.paper).lineSpacing(6) }
            }
        }
    }

    /// One line of the heading (.hero-when): the icon, the text and its text link after it (or under it when there is no room)
    private func factLine<Act: View>(_ icon: String, _ text: String, @ViewBuilder link: () -> Act) -> some View {
        let act = link()
        return HStack(alignment: .firstTextBaseline, spacing: 9.6) {
            SiteIcon(icon, size: 19).foregroundStyle(Color.bordeaux).alignmentGuide(.firstTextBaseline) { $0[.bottom] - 4 }
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: 6) { Text(text).font(.body(15.7)).foregroundStyle(Color.paper); act }
                VStack(alignment: .leading, spacing: 0) { Text(text).font(.body(15.7)).foregroundStyle(Color.paper); act }
            }
        }
    }

    /// Not answered yet: the card with the one primary action (or, when sign-up is closed, why not)
    private func answerCard(_ info: TastingInfo, open: Bool) -> some View {
        Card {
            Text(L("tastingHome.yourAnswer")).font(.semibold(17)).foregroundStyle(Color.paper).accessibilityAddTraits(.isHeader)
            if open {
                if info.full == true { Text(L("guest.fullHint")).font(.body(14.4)).foregroundStyle(Color.muted) }
                Button(L("app.answer")) { editing = true }.buttonStyle(PrimaryButton())
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
            model.tastingHasQuiz = (a?.quiz_count ?? 0) > 0
            payment = try? await Backend.payment(tasting.code)
            if let w = try? await Backend.wines(tasting.code) {
                wines = w
                if origins == nil { origins = await buildOrigins(w) }
            }
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
