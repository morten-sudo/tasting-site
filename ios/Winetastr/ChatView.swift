import SwiftUI

/// The site's /chat/ (ChatBox.astro and src/lib/chat.ts): the guests' and the host's messages in a white box, the day
/// between them, your own on the right in bordeaux; new ones every four seconds while the screen is open.
/// Like Messages (Morten, 6 Nov 2026 – WIN-238): the tasting's name and tabs stay at the top and the field to write in
/// at the bottom; only what is between them scrolls – the heading, the intro and the box of messages, newest at the
/// bottom. (The other tabs scroll their name and tabs away, as on the site.)
struct ChatView: View {
    @Environment(AppModel.self) private var model
    let tasting: MyTasting
    /// The tasting's name and tabs, fixed above the messages
    var head: AnyView = AnyView(EmptyView())
    @State private var messages: [ChatMessage] = []
    @State private var loaded = false
    @State private var text = ""
    @State private var error: String?
    @State private var sending = false
    @FocusState private var focus: Bool

    private var lastId: Int { messages.last?.id ?? 0 }

    var body: some View {
        VStack(spacing: 0) {
            head
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 9.6) {
                        SectionHeading(text: L("page.chat")).padding(.top, 14)
                        Text(L("chat.intro")).font(.body()).foregroundStyle(Color.muted)
                        if !loaded {
                            LoadingState().padding(.vertical, 24)
                        } else if messages.isEmpty {
                            EmptyBox(icon: "chat", title: L("chat.emptyTitle"), text: L("chat.emptyText")) { EmptyView() }
                        } else {
                            list
                        }
                        Color.clear.frame(height: 1).id(Self.endId)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16).padding(.bottom, 6)
                }
                // The newest messages show first, as in Messages; scrolling up reads back
                .newestAtBottom()
                .scrollDismissesKeyboard(.interactively)
                // A new message, and the keyboard coming in: the newest message just over the field
                .onChange(of: lastId) { withAnimation { proxy.scrollTo(Self.endId, anchor: .bottom) } }
                .onChange(of: focus) {
                    guard focus else { return }
                    Task {
                        try? await Task.sleep(for: .milliseconds(350))
                        withAnimation { proxy.scrollTo(Self.endId, anchor: .bottom) }
                    }
                }
            }
            composer
                .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 10)
                .background(Color.lodge)
                .overlay(alignment: .top) { Rectangle().fill(Color.rule).frame(height: 1) }
        }
        .task { await poll() }
    }

    private static let endId = "chat-end"

    /// The messages in their white box (.chat-list); the box grows with them and the page around it scrolls
    private var list: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(messages.enumerated()), id: \.element.id) { i, m in
                if i == 0 || !Calendar.current.isDate(m.date, inSameDayAs: messages[i - 1].date) { day(m.date) }
                bubble(m).id(m.id)
            }
        }
        .padding(12)
        .background(Color.surface, in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.rule))
    }

    private func day(_ d: Date) -> some View {
        let f = DateFormatter(); f.locale = appLocale; f.setLocalizedDateFormatFromTemplate("EEEEdMMMM")
        let t = f.string(from: d)
        return Text(t.prefix(1).uppercased() + t.dropFirst()).font(.body(12)).foregroundStyle(Color.muted)
            .frame(maxWidth: .infinity).padding(.vertical, 4.8)
    }

    private func bubble(_ m: ChatMessage) -> some View {
        let f = DateFormatter(); f.locale = appLocale; f.setLocalizedDateFormatFromTemplate("HHmm")
        return VStack(alignment: m.mine ? .trailing : .leading, spacing: 2.4) {
            if !m.mine {
                Text(m.author + (m.from_host ? " · \(L("chat.host"))" : ""))
                    .font(m.from_host ? .semibold(12.2) : .body(12.2)).foregroundStyle(m.from_host ? Color.bordeaux : Color.muted)
                    .padding(.horizontal, 9.6)
            }
            Text(m.body).font(.body()).foregroundStyle(m.mine ? Color.white : Color.paper).lineSpacing(3)
                .padding(.vertical, 8).padding(.horizontal, 12.8)
                .background(m.mine ? Color.bordeaux : Color.lodge, in: UnevenRoundedRectangle(
                    topLeadingRadius: 16, bottomLeadingRadius: m.mine ? 16 : 4.8, bottomTrailingRadius: m.mine ? 4.8 : 16, topTrailingRadius: 16))
                .overlay(UnevenRoundedRectangle(topLeadingRadius: 16, bottomLeadingRadius: m.mine ? 16 : 4.8, bottomTrailingRadius: m.mine ? 4.8 : 16, topTrailingRadius: 16)
                    .strokeBorder(m.mine ? Color.bordeaux : Color.rule))
            Text(f.string(from: m.date)).font(.body(11.2)).foregroundStyle(Color.muted).padding(.horizontal, 9.6)
        }
        .frame(maxWidth: .infinity, alignment: m.mine ? .trailing : .leading)
        .padding(m.mine ? .leading : .trailing, 40)
        .accessibilityElement(children: .combine)
    }

    /// Write a message: the field grows with the text; why a message was not sent goes under it, and the text stays
    private var composer: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .bottom, spacing: 8) {
                TextField("", text: $text, prompt: Text(L("chat.write")).foregroundStyle(Color.placeholder), axis: .vertical)
                    .lineLimit(1...6).padding(.vertical, 10).wtField(invalid: error != nil)
                    .focused($focus).submitLabel(.send).onSubmit { Task { await send() } }
                    .accessibilityLabel(L("chat.write"))
                Button { Task { await send() } } label: {
                    SiteIcon("send", size: 20).foregroundStyle(.white).frame(width: 44, height: 44)
                        .background(Color.bordeaux, in: RoundedRectangle(cornerRadius: 8))
                }
                .disabled(sending || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityLabel(L("chat.send"))
            }
            FieldError(text: error)
        }
    }

    private func send() async {
        let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty, !sending else { return }
        sending = true; error = nil; defer { sending = false }
        do {
            try await Backend.postChat(tasting.code, body)
            text = ""
            await fetch()
        } catch {
            self.error = L(dbMessage(error).contains("too_many") ? "chat.tooMany" : "chat.notSent")
        }
    }

    private func fetch() async {
        #if DEBUG
        if UserDefaults.standard.bool(forKey: "chatMock") {
            let iso = ISO8601DateFormatter()
            func at(_ m: Int) -> String { iso.string(from: Date.now.addingTimeInterval(Double(-m) * 60)) }
            messages = [
                ChatMessage(id: 1, author: "Morten", body: "Velkommen! Vi starter kl. 19 – tag gerne et glas med, hvis I har et yndlingsglas.", created_at: at(1500), from_host: true, mine: false),
                ChatMessage(id: 2, author: "Aske", body: "Glæder mig! Kan jeg tage en ven med?", created_at: at(90), from_host: false, mine: false),
                ChatMessage(id: 3, author: "Dig", body: "Jeg kommer lidt over 19, så start bare uden mig 🙂", created_at: at(40), from_host: false, mine: true),
                ChatMessage(id: 4, author: "Erlingur", body: "Husk at Kopke 10 år er den første vin – den skal ikke for kold.", created_at: at(5), from_host: false, mine: false),
            ]
            loaded = true; return
        }
        #endif
        if let new = try? await Backend.chat(tasting.code, after: lastId) {
            let known = Set(messages.map(\.id))
            messages += new.filter { !known.contains($0.id) }
        }
        loaded = true
        // Seen: the newest message shown, per tasting (the site's localStorage key; the home page counts what came after)
        if let last = messages.last?.id { UserDefaults.standard.set(last, forKey: "wt-chat-seen:\(tasting.slug)") }
    }

    private func poll() async {
        await fetch()
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(4))
            await fetch()
        }
    }
}

private extension View {
    /// Opens at the newest message and stays there as messages come; a short chat (or none yet) sits at the top under
    /// the heading instead of sinking to the field
    @ViewBuilder func newestAtBottom() -> some View {
        if #available(iOS 18.0, *) {
            defaultScrollAnchor(.top, for: .alignment)
                .defaultScrollAnchor(.bottom, for: .initialOffset)
                .defaultScrollAnchor(.bottom, for: .sizeChanges)
        } else {
            defaultScrollAnchor(.bottom)
        }
    }
}
