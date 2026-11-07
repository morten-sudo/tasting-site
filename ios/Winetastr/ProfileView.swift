import SwiftUI
import Supabase

/// The site's /profile/ for a guest: name and email (edited in the side panel), the wine book, the language and sign out.
struct ProfileView: View {
    @Environment(AppModel.self) private var model
    @State private var name: String?
    @State private var email: String?
    @State private var loaded = false
    @State private var editing = false
    @State private var pending: String?
    @State private var toast: String?
    @State private var signIn = false

    var body: some View {
        @Bindable var model = model
        VStack(spacing: 0) {
            TopBar()
            Rectangle().fill(Color.rule).frame(height: 1)
            ZStack(alignment: .top) {
                PageBackground(path: "/profile/")
                if !loaded { LoadingState() } else { content }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(Color.lodge)
        .siteMenus()
        .toolbar(.hidden, for: .navigationBar)
        .task { await load() }
        .sheet(isPresented: $editing) {
            ProfileSheet(signedIn: model.signedInEmail != nil, name: name ?? "", email: email ?? "") { result in
                switch result {
                case .saved(let n, let e): name = n ?? name; email = e; toast = L("common.saved")
                case .pending(let e): pending = L("profile.emailConfirm", ["email": e])
                }
            }
        }
        .sheet(isPresented: $signIn) { LoginView(onClose: { signIn = false }) }
        .onChange(of: model.signedInEmail) { if model.signedInEmail != nil { signIn = false; Task { await load() } } }
        .toast($toast)
    }

    private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        PageTitle(text: name ?? L("nav.profile"))
                        if let email { Text(email).font(.body()).foregroundStyle(Color.muted) }
                    }
                    Spacer()
                    Button { editing = true } label: {
                        SiteIcon("edit", size: 20).foregroundStyle(Color.paper).frame(width: 44, height: 44)
                            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.fieldLine))
                    }
                    .accessibilityLabel(L("profile.edit"))
                }
                if let pending { NoticeBox(text: pending).padding(.top, 12) }
                if model.signedInEmail == nil {
                    NoticeBox(text: L("profile.linkOnly")) {
                        Button(L("login.submit")) { signIn = true }.buttonStyle(SecondaryButton())
                    }
                    .padding(.top, 12)
                }
                // Tastings, wines and orders live in the wine book
                Button { model.path.append(.book) } label: {
                    HStack(spacing: 16) {
                        VStack(alignment: .leading, spacing: 2.4) {
                            Text(L("book.title")).font(.semibold(16)).foregroundStyle(Color.paper)
                            Text(L("book.linkText")).font(.body(14.4)).foregroundStyle(Color.muted).multilineTextAlignment(.leading)
                        }
                        Spacer()
                        SiteIcon("right", size: 20).foregroundStyle(Color.bordeaux)
                    }
                    .padding(20)
                    .background(Color.surface, in: RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.rule))
                }
                .buttonStyle(.plain)
                .padding(.top, 32)

                VStack(alignment: .leading, spacing: 12) {
                    Text(L("profile.language")).font(.display(28, light: false, relativeTo: .title2)).foregroundStyle(Color.paper).accessibilityAddTraits(.isHeader)
                    CompactChoices(options: appLanguages.map { ($0.code, $0.name, $0.code) }, selection: Binding(get: { model.language }, set: { model.setLanguage($0) }))
                }
                .padding(.top, 40)

                Button(L("nav.signOut")) { Task { await model.signOut() } }
                    .buttonStyle(SecondaryButton(small: false)).padding(.top, 40)
            }
            .padding(16)
        }
    }

    private func load() async {
        if model.signedInEmail != nil {
            await Backend.linkMe()
            let p = try? await Backend.profile()
            let user = try? await supabase.auth.session.user
            let own: String? = {
                if case .string(let n)? = user?.userMetadata["name"] { let t = n.trimmingCharacters(in: .whitespaces); return t.isEmpty ? nil : t }
                return nil
            }()
            email = user?.email ?? p?.email
            name = own ?? p?.name ?? email.map { String($0.split(separator: "@").first ?? "") }
        } else if let code = CodeStore.all().values.first, let inv = try? await Backend.invite(code) {
            name = inv.name; email = inv.email
        }
        loaded = true
    }
}

/// The side panel "Edit name and email" (the bottom sheet on a phone)
struct ProfileSheet: View {
    enum Result { case saved(String?, String), pending(String) }
    @Environment(\.dismiss) private var dismiss
    let signedIn: Bool
    @State var name: String
    @State var email: String
    let done: (Result) -> Void
    @State private var nameError: String?
    @State private var emailError: String?
    @State private var busy = false
    @State private var failed: String?

    var body: some View {
        SheetFrame(title: L("profile.edit")) {
            if signedIn {
                FieldLabel(text: L("profile.name"))
                TextField("", text: $name).textContentType(.name).accessibilityLabel(L("profile.name")).wtField(invalid: nameError != nil)
                FieldError(text: nameError)
                Text(L("profile.nameHint")).font(.body(13.6)).foregroundStyle(Color.muted)
            }
            FieldLabel(text: L("common.email")).padding(.top, signedIn ? 8 : 0)
            TextField("", text: $email).keyboardType(.emailAddress).textContentType(.emailAddress)
                .textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityLabel(L("common.email")).wtField(invalid: emailError != nil)
            FieldError(text: emailError ?? failed)
            Button { Task { await save() } } label: {
                if busy { ProgressView().tint(.white) } else { Text(L("common.save")) }
            }
            .buttonStyle(PrimaryButton()).disabled(busy).padding(.top, 8)
        }
        .presentationDetents([.medium, .large])
    }

    private func save() async {
        let n = name.trimmingCharacters(in: .whitespaces), e = email.trimmingCharacters(in: .whitespaces).lowercased()
        nameError = nil; emailError = nil; failed = nil
        if signedIn && n.isEmpty { nameError = L("host.nameMissing"); return }
        guard e.range(of: #"^[^@\s]+@[^@\s]+\.[^@\s]+$"#, options: .regularExpression) != nil else { emailError = L("guest.emailBad"); return }
        busy = true; defer { busy = false }
        if signedIn {
            let user = try? await supabase.auth.session.user
            do { try await supabase.auth.update(user: UserAttributes(data: ["name": .string(n)])) }
            catch { failed = L("admin.changesNotSaved"); return }
            // The sign-in address changes once the confirmation link has been opened
            if e != (user?.email ?? "").lowercased() {
                do {
                    try await supabase.auth.update(user: UserAttributes(email: e), redirectTo: AppDatabase.webURL("/profile/"))
                    done(.saved(n, user?.email ?? "")); done(.pending(e)); dismiss()
                } catch {
                    failed = L("profile.emailNotChanged")
                }
                return
            }
            done(.saved(n, e)); dismiss()
        } else {
            // Only invite links: the email on each invitation on this device
            for code in CodeStore.all().values {
                do { try await Backend.setEmail(code, e) }
                catch { self.emailError = Winetastr.emailError(error); return }
            }
            done(.saved(nil, e)); dismiss()
        }
    }
}
