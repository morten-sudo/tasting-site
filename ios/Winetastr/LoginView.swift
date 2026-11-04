import SwiftUI
import Supabase

/// The site's /login/: the cellar photo with the claim, and the card with the two steps.
struct LoginView: View {
    @Environment(AppModel.self) private var model
    /// Opened from a page (the wine book, the profile) to sign in with the email: a way back
    var onClose: (() -> Void)? = nil
    private enum Step { case email, code }
    @State private var step = Step.email
    @State private var email = ""
    @State private var otp = ""
    @State private var link = ""
    @State private var showLink = false
    @State private var error: String?
    @State private var linkError: String?
    @State private var busy = false
    @State private var note: String?
    @FocusState private var focus: Bool

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                hero
                card.padding(.horizontal, 16).padding(.top, -18).padding(.bottom, 24)
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Color.lodge)
        .safeAreaInset(edge: .top, spacing: 0) {
            HStack(spacing: 10) {
                Image("Logo").resizable().frame(width: 30, height: 30)
                Text("Winetastr").font(.medium(17)).foregroundStyle(Color.paper)
                Spacer()
                if onClose == nil { MenuButton(id: .account, accessibilityLabel: L("nav.userMenu")) { SiteIcon("user", size: 23).foregroundStyle(Color.paper) } }
                if let onClose {
                    Button(action: onClose) { SiteIcon("x", size: 20).foregroundStyle(Color.muted).frame(width: 44, height: 44) }
                        .accessibilityLabel(L("common.cancel"))
                }
            }
            .padding(.horizontal, 16).frame(minHeight: 54).background(Color.surface)
        }
        .siteMenus()
    }

    private var hero: some View {
        ZStack(alignment: .bottomLeading) {
            Image("Cellar").resizable().scaledToFill().frame(height: 232).frame(maxWidth: .infinity).clipped()
                .overlay(LinearGradient(colors: [Color.black.opacity(0.15), Color.black.opacity(0.65)], startPoint: .top, endPoint: .bottom))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 8) {
                Text("WINETASTR").font(.medium(11.5)).tracking(2.5).foregroundStyle(Color.white.opacity(0.9))
                Text(L("loginx.claim")).font(.display(40, relativeTo: .largeTitle)).foregroundStyle(Color.white).lineSpacing(-4)
            }
            .padding(.horizontal, 16).padding(.bottom, 34)
        }
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(L("login.title")).font(.display(38, relativeTo: .largeTitle)).foregroundStyle(Color.paper).accessibilityAddTraits(.isHeader)
            stepper
            if step == .email { emailStep } else { codeStep }
            HStack(spacing: 14) {
                Rectangle().fill(Color.fieldLine).frame(height: 1)
                Text(L("loginx.or")).font(.body(14.4)).foregroundStyle(Color.muted)
                Rectangle().fill(Color.fieldLine).frame(height: 1)
            }
            .padding(.vertical, 4)
            inviteBox
            Text(L("login.lostHint")).font(.body(14.4)).foregroundStyle(Color.muted)
        }
        .padding(20)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.rule))
    }

    private var stepper: some View {
        HStack(spacing: 8) {
            stepDot(1, L("common.email"), active: step == .email)
            Rectangle().fill(Color.fieldLine).frame(width: 26, height: 1)
            stepDot(2, L("loginx.code"), active: step == .code)
        }
        .accessibilityElement(children: .combine)
    }

    private func stepDot(_ n: Int, _ label: String, active: Bool) -> some View {
        HStack(spacing: 7) {
            Text("\(n)").font(.semibold(13)).foregroundStyle(active ? Color.white : Color.muted)
                .frame(width: 24, height: 24)
                .background(active ? Color.bordeaux : Color.surface, in: Circle())
                .overlay(Circle().strokeBorder(active ? Color.bordeaux : Color.fieldLine))
            Text(label).font(active ? .semibold(15) : .body(15)).foregroundStyle(active ? Color.paper : Color.muted)
        }
    }

    private var emailStep: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(L("login.mailLead")).font(.body()).foregroundStyle(Color.paper)
            FieldLabel(text: L("common.email")).padding(.top, 6)
            TextField("", text: $email)
                .accessibilityLabel(L("common.email"))
                .keyboardType(.emailAddress).textContentType(.emailAddress)
                .textInputAutocapitalization(.never).autocorrectionDisabled().focused($focus).wtField(invalid: error != nil)
                .submitLabel(.send).onSubmit { Task { await send() } }
            FieldError(text: error)
            Button { Task { await send() } } label: { busyLabel(L("login.sendCode")) }
                .buttonStyle(PrimaryButton()).disabled(busy).padding(.top, 6)
            Text(L("loginx.noPassword")).font(.body(14.4)).foregroundStyle(Color.muted)
        }
    }

    private var codeStep: some View {
        VStack(alignment: .leading, spacing: 8) {
            // The same words whether the email is known or not (WIN-181); the email in bold, so a typo is easy to see
            sentLead.font(.body()).foregroundStyle(Color.paper)
            FieldLabel(text: L("login.codeLabel")).padding(.top, 6)
            TextField("", text: $otp)
                .accessibilityLabel(L("login.codeLabel"))
                .keyboardType(.numberPad).textContentType(.oneTimeCode).focused($focus).wtField(invalid: error != nil)
                .onChange(of: otp) { otp = otp.filter(\.isNumber) }
            FieldError(text: error)
            Button { Task { await verify() } } label: { busyLabel(L("login.submit")) }
                .buttonStyle(PrimaryButton()).disabled(busy).padding(.top, 6)
            if let note { Text(note).font(.body(14.4)).foregroundStyle(Color.okText) }
            HStack {
                Button(L("login.resend")) { Task { if await sendCode() { note = L("login.resent") } } }.buttonStyle(TextButton())
                Spacer()
                Button(L("login.otherEmail")) { step = .email; otp = ""; error = nil; note = nil }.buttonStyle(TextButton())
            }
            NoticeBox(title: L("login.noCodeTitle"), text: L("login.noCodeHelp")).padding(.top, 2)
        }
    }

    /// login.sentIfKnown with the email in bold
    private var sentLead: Text {
        let parts = L("login.sentIfKnown").components(separatedBy: "{email}")
        guard parts.count == 2 else { return Text(verbatim: L("login.sentIfKnown", ["email": email])) }
        let bold = Text(verbatim: email).font(.semibold())
        return Text("\(Text(verbatim: parts[0]))\(bold)\(Text(verbatim: parts[1]))")
    }

    private var inviteBox: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button { withAnimation(.easeOut(duration: 0.18)) { showLink.toggle() } } label: {
                HStack(spacing: 12) {
                    SiteIcon("link").foregroundStyle(Color.bordeaux)
                    Text(L("login.inviteSummary")).font(.medium(15.5)).foregroundStyle(Color.paper).multilineTextAlignment(.leading)
                    Spacer(minLength: 4)
                    SiteIcon("chev", size: 16).rotationEffect(.degrees(showLink ? 180 : 0)).foregroundStyle(Color.muted)
                }
                .frame(minHeight: 44).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if showLink {
                Text(L("login.inviteHelp")).font(.body(14.4)).foregroundStyle(Color.muted)
                FieldLabel(text: L("login.inviteLabel"))
                TextField("", text: $link)
                    .accessibilityLabel(L("login.inviteLabel")).accessibilityIdentifier("inviteField")
                    .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL).wtField(invalid: linkError != nil)
                FieldError(text: linkError)
                Button(L("common.continue")) { Task { await useLink() } }.buttonStyle(PrimaryButton()).disabled(busy).padding(.bottom, 6)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 4)
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.fieldLine))
    }

    private func busyLabel(_ text: String) -> some View {
        Group { if busy { ProgressView().tint(.white) } else { Text(text) } }
    }

    private func send() async {
        let e = email.trimmingCharacters(in: .whitespaces).lowercased()
        guard e.range(of: #"^[^@\s]+@[^@\s]+\.[^@\s]+$"#, options: .regularExpression) != nil else {
            error = e.isEmpty ? L("guest.emailMissing") : L("guest.emailBad"); return
        }
        email = e
        if await sendCode() { step = .code; focus = true }
    }

    /// Asks Supabase to send a code. The answer looks the same whether the email is known or not, so the app
    /// shows the same next step for both (WIN-181) and no longer asks login_email_known. Only problems that do
    /// not depend on the email are shown: the connection, or too many emails in a short time.
    private func sendCode() async -> Bool {
        busy = true; error = nil; defer { busy = false }
        do {
            try await supabase.auth.signInWithOTP(email: email, shouldCreateUser: true, data: ["lang": .string(appLanguageCode)])
            await Backend.logLogin()
            return true
        } catch {
            let code = (error as? AuthError)?.errorCode.rawValue ?? ""
            // Answers that would only come for an email we do not know (if sign-ups are turned off) are shown as sent
            if ["otp_disabled", "signup_disabled", "user_not_found"].contains(code) { return true }
            let rate = (error as? AuthError)?.errorCode == .overEmailSendRateLimit || String(describing: error).contains("429")
            self.error = rate ? L("login.tooManyMails") : L("login.sendFailed")
            return false
        }
    }

    private func verify() async {
        guard otp.count >= 6 else { error = L("login.wholeCode"); return }
        busy = true; error = nil; defer { busy = false }
        do {
            try await supabase.auth.verifyOTP(email: email, token: otp, type: .email)
            await model.didSignIn(email: email)
        } catch {
            self.error = String(describing: error).contains("429") ? L("login.tooManyTries") : L("login.wrongCode")
        }
    }

    private func useLink() async {
        guard let code = extractInviteCode(link) else { linkError = L("login.pasteCode"); return }
        busy = true; linkError = nil; defer { busy = false }
        do {
            guard try await Backend.invite(code) != nil, let info = try await Backend.tasting(code) else {
                linkError = L("login.codeNotFound"); return
            }
            model.didAddCode(slug: info.slug, code: code)
        } catch {
            linkError = L("app.loadFailedText")
        }
    }
}
