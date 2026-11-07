#if DEBUG
import Foundation

/// Debug only: runs the guest's database calls and writes the result to a file, so builds can be checked without tapping.
enum SelfTest {
    static func runIfAsked() async {
        guard let code = UserDefaults.standard.string(forKey: "selfTest") else { return }
        var out: [String] = []
        let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("selftest.txt")
        func step(_ name: String, _ body: () async throws -> String) async {
            do { out.append("OK \(name): \(try await body())") } catch { out.append("FAIL \(name): \(error)") }
            try? out.joined(separator: "\n").write(to: url, atomically: true, encoding: .utf8)
        }
        try? "started".write(to: url, atomically: true, encoding: .utf8)
        await step("get_invite") { (try await Backend.invite(code)).map { "\($0.name) status=\($0.status ?? "nil") email=\($0.email ?? "nil")" } ?? "none" }
        await step("get_tasting") { (try await Backend.tasting(code)).map { "\($0.title) \($0.start.map(whenText) ?? "") coming=\($0.coming ?? -1) open=\($0.signup_open ?? false)" } ?? "none" }
        var firstWine: Wine?
        await step("get_wines") { let w = try await Backend.wines(code); firstWine = w.first; return "\(w.count) wines, blind=\(w.filter(\.isBlind).count), first=\(w.first?.name ?? "-") \(w.first.flatMap(\.price_dkk).map(krText) ?? "")" }
        if let id = firstWine?.id {
            await step("rate_wine") { try await Backend.rate(code, wine: id, stars: 4, note: "selftest"); let r = try await Backend.ratings(code)[id]; return "stars=\(r?.rating ?? -1) note=\(r?.note ?? "")" }
            await step("rate_wine clear") { try await Backend.rate(code, wine: id, stars: nil, note: nil); let r = try await Backend.ratings(code)[id]; return "stars=\(r?.rating.map(String.init) ?? "nil") note=\(r?.note ?? "nil")" }
        }
        await step("respond yes") { try await Backend.respond(code, attending: true, note: "selftest") }
        await step("respond no") { try await Backend.respond(code, attending: false, note: nil) }
        await step("invite_is_mine") { "\(await Backend.inviteIsMine(code))" }
        // WIN-307: links on the app address and old links from before it all give the code
        await step("extract") {
            let links = [AppDatabase.web, "https://app.winetastr.com", "https://test-app.winetastr.com",
                         "https://winetastr.com", "https://test.winetastr.com"].map { "\($0)/t/x/?k=abc123" }
            return (links.map { extractInviteCode($0) ?? "nil" } + [extractInviteCode(" abc123 ") ?? "nil", extractInviteCode("not a code") ?? "nil"]).joined(separator: " ")
        }
        // WIN-307: maps and wine images come from the app address that goes with the build
        await step("web") {
            let map = await MapStore.shared.map("douro") != nil
            var img = "nil"
            if let u = AppDatabase.webURL("/img/hero-800.jpg"), let (_, r) = try? await URLSession.shared.data(from: u) {
                img = "\(u.absoluteString) \((r as? HTTPURLResponse)?.statusCode ?? -1)"
            }
            return "web=\(AppDatabase.web) map=\(map) image=\(img) calendar=\(AppDatabase.webURL("/t/x/")?.absoluteString ?? "nil") profile=\(AppDatabase.webURL("/profile/")?.absoluteString ?? "nil")"
        }
        await step("texts") { "\(appLanguageCode): \(L("guest.coming")) / \(L("app.winesSub", ["n": "3"]))" }
        // WIN-335: the singular "#one" form when the language's plural rule says "one", as t() on the site
        await step("plurals") {
            let before = AppLanguage.chosen
            defer { AppLanguage.chosen = before }
            return appLanguages.map { lang in
                AppLanguage.chosen = lang.code
                return [1, 3, 11, 21].map { L("tastingHome.coming", ["n": "\($0)"]) }.joined(separator: " | ")
                    + " | " + L("book.statWines", ["n": "1"]) + " | " + L("book.statWines", ["n": "2"])
            }.joined(separator: " ; ")
        }
        print(out.joined(separator: "\n"))
    }
}
#endif
