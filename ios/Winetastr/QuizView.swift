import SwiftUI

/// The site's /quiz/ for a guest: closed until the host opens it, then one question at a time with the answer locked,
/// the standings while it runs, and the answers with their explanations when it is over.
struct QuizView: View {
    @Environment(AppModel.self) private var model
    let tasting: MyTasting
    /// The tasting's name and tabs, at the top of the scrolling content
    var head: AnyView = AnyView(EmptyView())
    enum Mode { case closed, open, finished }
    @State private var mode: Mode?
    @State private var total = 0
    @State private var questions: [QuizQuestion] = []
    @State private var answers: [Int: String] = [:]
    @State private var selected: String?
    @State private var busy = false
    @State private var board: [BoardRow] = []
    @State private var myName = ""
    @State private var toast: String?
    @State private var failed = false

    private var current: Int { questions.firstIndex { answers[$0.id] == nil } ?? questions.count }

    var body: some View {
        ZStack(alignment: .top) {
            PageBackground(path: "/t/quiz/")
            if failed && mode == nil { VStack(spacing: 0) { head; ErrorState { Task { await start(force: true) } } } }
            else if mode == nil { VStack(spacing: 0) { head; LoadingState() } }
            else { content }
        }
        .toast($toast)
        .task { await run() }
    }

    private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                head
                VStack(alignment: .leading, spacing: 16) {
                    SectionHeading(text: L("page.quiz"))
                    switch mode {
                    case .closed: NoticeBox(text: L("quiz.closed"))
                    case .open: play
                    case .finished:
                        Text(L("quiz.over")).font(.body()).foregroundStyle(Color.paper)
                        boardBlock(L("quiz.final"))
                        results.padding(.top, 24)
                    default: EmptyView()
                    }
                    if mode == .open { boardBlock(L("quiz.standingsNow")).padding(.top, 24) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
            }
        }
        .refreshable { await start(force: true) }
    }

    // MARK: Play

    @ViewBuilder private var play: some View {
        Text(L("quiz.rules", ["total": "\(questions.count)"])).font(.body()).foregroundStyle(Color.muted)
        if current < questions.count {
            let q = questions[current]
            Card {
                progress
                Text(q.question).font(.display(26, light: false, relativeTo: .title2)).foregroundStyle(Color.paper)
                    .accessibilityAddTraits(.isHeader).padding(.top, 4)
                VStack(spacing: 6.4) {
                    ForEach(q.options, id: \.key) { o in choice(o) }
                }
                .padding(.bottom, 8)
                Button { Task { await lock(q) } } label: {
                    if busy { HStack(spacing: 8) { ProgressView().tint(.white); Text(L("quiz.locking")) } } else { Text(L("quiz.lock")) }
                }
                .buttonStyle(PrimaryButton()).disabled(selected == nil || busy)
            }
            .id(q.id)
        } else {
            Card { progress }
            NoticeBox(text: L("quiz.done"), tone: .ok)
        }
    }

    /// The progress (component 38): "Spørgsmål 4 af 12" and the bar, "3 af 12 besvaret" at the right
    private var progress: some View {
        let done = questions.filter { answers[$0.id] != nil }.count
        return VStack(alignment: .leading, spacing: 5.6) {
            HStack(alignment: .firstTextBaseline) {
                Text(current < questions.count ? L("quiz.count", ["n": "\(current + 1)", "total": "\(questions.count)"]) : L("quiz.allAnswered"))
                    .font(.medium(14.1)).foregroundStyle(Color.paper)
                Spacer()
                Text(L("quiz.answeredOf", ["n": "\(done)", "total": "\(questions.count)"])).font(.body(14.1)).foregroundStyle(Color.muted).monospacedDigit()
            }
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.rule)
                    Capsule().fill(Color.bordeaux).frame(width: questions.isEmpty ? 0 : g.size.width * Double(done) / Double(questions.count))
                }
            }
            .frame(height: 6)
            .accessibilityHidden(true)
        }
        .accessibilityElement(children: .combine)
    }

    /// .choice-cards: the radio and the answer
    private func choice(_ o: QuizOption) -> some View {
        let on = selected == o.key
        return Button { selected = o.key } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: on ? "largecircle.fill.circle" : "circle").foregroundStyle(on ? Color.bordeaux : Color.muted)
                Text(o.text).font(.medium()).foregroundStyle(Color.paper).multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .padding(14)
            .background(Color.surface, in: RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(on ? Color.bordeaux : Color.fieldLine, lineWidth: on ? 1.5 : 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    // MARK: Answers (finished)

    private var results: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(questions.enumerated()), id: \.element.id) { i, q in
                let mine = answers[q.id]
                let verdict: Chip = mine == nil ? Chip(text: L("quiz.unanswered"), dashed: true)
                    : mine == q.correct_key ? Chip(text: L("quiz.right"), tone: .ok) : Chip(text: L("quiz.wrong"), tone: .err)
                HStack(alignment: .top, spacing: 12) {
                    Text(twoDigits(i + 1)).font(.display(17, light: false, relativeTo: .caption)).tracking(2).foregroundStyle(Color.muted).padding(.top, 2)
                    VStack(alignment: .leading, spacing: 8) {
                        Text(q.question).font(.semibold(16)).foregroundStyle(Color.paper)
                        verdict
                        VStack(spacing: 6.4) {
                            ForEach(q.options, id: \.key) { o in lockedChoice(o, right: o.key == q.correct_key, picked: o.key == mine) }
                        }
                        if let e = q.explanation, !e.isEmpty { Text(e).font(.body(14.4)).foregroundStyle(Color.paper).padding(.top, 2) }
                    }
                }
                .padding(.vertical, 16)
                .overlay(alignment: .top) { if i > 0 { Rectangle().fill(Color.rule).frame(height: 1) } }
            }
        }
    }

    private func lockedChoice(_ o: QuizOption, right: Bool, picked: Bool) -> some View {
        let line = right ? Color.okText : picked ? Color.errorText : Color.fieldLine
        return HStack(alignment: .top, spacing: 12) {
            Image(systemName: picked ? "largecircle.fill.circle" : "circle").foregroundStyle(picked ? line : Color.rule)
            Text(o.text).font(.medium()).foregroundStyle(Color.paper).multilineTextAlignment(.leading)
            Spacer(minLength: 8)
            if right || picked {
                Text(right ? (picked ? L("quiz.right") : L("quiz.correctAnswer")) : L("quiz.yourAnswer")).font(.body(13.6)).foregroundStyle(line)
            }
        }
        .padding(14)
        .background(right ? Color.okBg : picked ? Color.errBg : Color.surface, in: RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(line, lineWidth: right || picked ? 1.5 : 1))
        .accessibilityElement(children: .combine)
    }

    // MARK: Standings (component 53)

    private func boardBlock(_ title: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.display(28, light: false, relativeTo: .title2)).foregroundStyle(Color.paper).accessibilityAddTraits(.isHeader)
            Leaderboard(rows: board, total: total, me: myName)
        }
    }

    // MARK: Loading

    private func run() async {
        if let inv = try? await Backend.invite(tasting.code) { myName = inv.name }
        await start(force: true)
        var tick = 0
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(5))
            tick += 1
            if tick % 2 == 0 { await start(force: false) }
            #if DEBUG
            if UserDefaults.standard.string(forKey: "quizMock") != nil { continue }
            #endif
            if mode != .closed { board = (try? await Backend.leaderboard(tasting.code)) ?? board }
        }
    }

    /// Reads whether the quiz is open; loads the questions when that changes (as start() on the site)
    private func start(force: Bool) async {
        #if DEBUG
        // Screenshots of the open and finished quiz without changing the test tasting
        if let m = UserDefaults.standard.string(forKey: "quizMock") {
            let o = { (k: String, t: String) in QuizOption(key: k, text: t) }
            questions = [
                QuizQuestion(id: 1, sort_order: 1, question: "Hvilken drue er Douros vigtigste?", options: [o("a", "Touriga Nacional"), o("b", "Tempranillo"), o("c", "Grenache")], correct_key: "a", explanation: "Touriga Nacional giver farve, struktur og duft og er rygraden i de fleste vintage-portvine."),
                QuizQuestion(id: 2, sort_order: 2, question: "Hvor længe skal en tawny mindst lagre for at hedde 10 år?", options: [o("a", "5 år"), o("b", "Gennemsnitligt 10 år"), o("c", "Præcis 10 år")], correct_key: "b", explanation: "Alderen er et gennemsnit af de vine, der er blandet."),
                QuizQuestion(id: 3, sort_order: 3, question: "Hvad betyder LBV?", options: [o("a", "Late Bottled Vintage"), o("b", "Light Bodied Vintage")], correct_key: "a", explanation: nil),
            ]
            answers = m == "finished" ? [1: "a", 2: "c"] : [1: "a"]
            total = 3; myName = "Morten"
            board = [BoardRow(name: "Erlingur", points: 2, answered: 3), BoardRow(name: "Morten", points: 1, answered: m == "finished" ? 2 : 1), BoardRow(name: "Aske", points: 1, answered: 2), BoardRow(name: "Ida", points: 0, answered: 1)]
            mode = m == "finished" ? .finished : .open
            return
        }
        #endif
        guard let info = try? await Backend.tasting(tasting.code) else { if mode == nil { failed = true }; return }
        failed = false
        let next: Mode = info.quiz_finished == true ? .finished : info.quiz_open == true ? .open : .closed
        total = info.quiz_count ?? questions.count
        guard force || next != mode else { return }
        if next != .closed {
            questions = (try? await Backend.quiz(tasting.code)) ?? []
            answers = (try? await Backend.myAnswers(tasting.code)) ?? answers
            board = (try? await Backend.leaderboard(tasting.code)) ?? board
            if total == 0 { total = questions.count }
        }
        selected = nil
        mode = next
    }

    private func lock(_ q: QuizQuestion) async {
        guard let key = selected else { return }
        busy = true; defer { busy = false }
        do {
            try await Backend.submitAnswer(tasting.code, question: q.id, key: key)
            answers[q.id] = key; selected = nil
            board = (try? await Backend.leaderboard(tasting.code)) ?? board
        } catch {
            let closed = dbMessage(error).contains("ikke åben")
            toast = L(closed ? "quiz.closedForAnswers" : "quiz.notSaved")
            if closed { await start(force: true) }
        }
    }
}

/// The leaderboard (src/lib/leaderboard.ts): place, name, how far and points; the guest's own line marked; tied places share a rank
struct Leaderboard: View {
    let rows: [BoardRow]
    let total: Int
    var me: String? = nil
    var body: some View {
        if rows.isEmpty {
            Text(L("board.noAnswers")).font(.body()).foregroundStyle(Color.muted)
        } else {
            VStack(spacing: 0) {
                ForEach(Array(ranked.enumerated()), id: \.offset) { _, r in
                    let mine = r.row.mine ?? (me != nil && r.row.name == me)
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text("\(r.rank)").font(.body()).foregroundStyle(Color.muted).monospacedDigit().frame(width: 32, alignment: .leading)
                        (Text(r.row.name).font(.medium()) + Text(mine ? " (\(L("hosts.you")))" : "").font(.body()))
                            .foregroundStyle(mine ? Color.bordeaux : Color.paper).lineLimit(1)
                        Spacer(minLength: 8)
                        Text(total == 0 ? "" : r.row.answered >= total ? L("board.done") : "\(r.row.answered)/\(total)")
                            .font(.body(13.6)).foregroundStyle(Color.muted).monospacedDigit()
                        Text("\(r.row.points)").font(.display(24, light: false)).foregroundStyle(mine ? Color.bordeaux : Color.paper)
                            .frame(width: 48, alignment: .trailing)
                    }
                    .padding(.vertical, 10.4).padding(.horizontal, mine ? 12 : 4)
                    .background(mine ? Color.errBg : Color.clear, in: RoundedRectangle(cornerRadius: 8))
                    .overlay(alignment: .bottom) { if !mine { Rectangle().fill(Color.rule).frame(height: 1) } }
                    .padding(.horizontal, mine ? -8 : 0)
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }
    private var ranked: [(rank: Int, row: BoardRow)] {
        var out: [(Int, BoardRow)] = []; var rank = 0; var prev = -1
        for (i, r) in rows.enumerated() { if r.points != prev { rank = i + 1; prev = r.points }; out.append((rank, r)) }
        return out
    }
}
