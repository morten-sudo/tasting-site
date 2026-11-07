import XCTest

/// The guest fixes WIN-314 to WIN-320 in the app, as on the site. The test tasting's own state is the default one (no
/// quiz questions, the quiz closed, no fee, MobilePay off, one blind wine – number 11), so the other states come from
/// the debug switches -tastingPatch (keys of get_tasting replaced), -paymentMock (an unpaid fee) and -sendMock (the
/// first order or answer fails, the next works – without reaching the database). With REAL_DB=1 the switches that
/// stand in for the database are left out, for a run against the test tasting put in that state by hand; the
/// screenshots then end in "-db".
final class FixesTests: XCTestCase {
    private let code = ProcessInfo.processInfo.environment["APP_TEST_CODE"] ?? ""
    private let realDB = ProcessInfo.processInfo.environment["REAL_DB"] == "1"

    private func app(_ lang: String = "da", _ args: [String], mock: [String] = []) -> XCUIApplication {
        let a = XCUIApplication()
        let locale = ["da": "da_DK", "en": "en_GB", "is": "is_IS"][lang] ?? "da_DK"
        a.launchArguments = ["-AppleLanguages", "(\(lang))", "-AppleLocale", locale, "-appLanguage", lang, "-inviteCode", code]
            + args + (realDB ? [] : mock)
        a.launch()
        return a
    }

    private func shot(_ name: String) {
        guard let dir = ProcessInfo.processInfo.environment["SHOT_DIR"], !dir.isEmpty else { return }
        let file = realDB ? "\(name)-db" : name
        try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(file).png"))
    }

    private func text(_ a: XCUIApplication, containing s: String) -> XCUIElement {
        a.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", s)).firstMatch
    }

    private func scrollTo(_ a: XCUIApplication, _ e: XCUIElement, swipes: Int = 8) {
        for _ in 0..<swipes where !(e.exists && e.isHittable) { a.swipeUp() }
    }

    // MARK: WIN-314 – the error goes as soon as a new try works

    func testQuizErrorGoesWhenTheNextTryWorks() {
        let a = app(["-route", "quiz", "-quizMock", "open", "-sendMock", "failOnce"])
        let lock = a.buttons["Lås svar"]
        XCTAssertTrue(lock.waitForExistence(timeout: 15))
        a.buttons["Gennemsnitligt 10 år"].tap()
        lock.tap()
        let error = a.staticTexts["Svaret blev ikke gemt. Tjek forbindelsen, og prøv igen."]
        XCTAssertTrue(error.waitForExistence(timeout: 3), "the first try fails")
        shot("win314-quiz-error-da")
        lock.tap()
        // The toast would otherwise stay two seconds: it goes at once
        XCTAssertTrue(error.waitForNonExistence(timeout: 1), "the error goes when the answer is saved")
        XCTAssertTrue(a.staticTexts["Hvad betyder LBV?"].waitForExistence(timeout: 3), "on to the next question")
        shot("win314-quiz-ok-da")
    }

    func testCartErrorGoesWhenTheNextTryWorks() {
        let a = app(["-resetData", "YES", "-route", "wine", "-ordersOpen", "YES", "-sendMock", "failOnce"])
        let add = a.buttons["Læg i kurv"]
        XCTAssertTrue(add.waitForExistence(timeout: 20), "add to cart")
        add.tap()
        a.buttons["Gå til kurven"].tap()
        let send = a.buttons["Send bestilling"]
        XCTAssertTrue(send.waitForExistence(timeout: 15), "the cart")
        send.tap()
        let error = a.staticTexts["Bestillingen blev ikke sendt. Tjek din forbindelse, og prøv igen."]
        XCTAssertTrue(error.waitForExistence(timeout: 3), "the first try fails")
        shot("win314-cart-error-da")
        send.tap()
        XCTAssertTrue(error.waitForNonExistence(timeout: 1), "the error goes when the order is sent")
        XCTAssertTrue(text(a, containing: "Din bestilling nr. 9001 er modtaget").waitForExistence(timeout: 5), "the receipt")
        shot("win314-cart-ok-da")
    }

    // MARK: WIN-315 – a quiz open without questions

    private func checkEmptyQuiz(_ lang: String, title: String, tabs: [String], patch: String, shotName: String) {
        let a = app(lang, ["-route", "quiz"], mock: ["-tastingPatch", patch])
        XCTAssertTrue(a.staticTexts[title].waitForExistence(timeout: 15), "the empty state")
        XCTAssertFalse(a.buttons["Lås svar"].exists, "nothing to answer")
        for t in ["Stillingen lige nu", "Standings right now", "Staðan núna", "Slutstilling", "Final standings", "Lokastaða"] {
            XCTAssertFalse(a.staticTexts[t].exists, "no standings: \(t)")
        }
        XCTAssertFalse(text(a, containing: "Alle dine svar er låst").exists, "not \"all your answers are locked\"")
        // The tabs as on every other page: no Quiz tab while the tasting has no questions
        XCTAssertTrue(a.buttons[tabs[0]].exists && a.buttons[tabs[1]].exists, "the other tabs")
        XCTAssertFalse(a.buttons["Quiz"].exists, "no Quiz tab")
        shot(shotName)
    }

    func testOpenQuizWithoutQuestionsShowsAnEmptyState() {
        checkEmptyQuiz("da", title: "Værten har ikke lagt spørgsmål ind endnu", tabs: ["Smagningen", "Vinene"], patch: "quiz_open=true", shotName: "win315-quiz-empty-da")
        checkEmptyQuiz("en", title: "The host hasn’t added any questions yet", tabs: ["Tasting", "Wines"], patch: "quiz_open=true", shotName: "win315-quiz-empty-en")
        checkEmptyQuiz("is", title: "Gestgjafinn hefur ekki sett inn spurningar enn", tabs: ["Smökkunin", "Vínin"], patch: "quiz_open=true", shotName: "win315-quiz-empty-is")
        // Over without questions: the same
        checkEmptyQuiz("da", title: "Værten har ikke lagt spørgsmål ind endnu", tabs: ["Smagningen", "Vinene"], patch: "quiz_open=false,quiz_finished=true", shotName: "win315-quiz-empty-over-da")
    }

    func testTastingHasNoQuizTileWithoutQuestions() {
        let a = app(["-route", "tasting"], mock: ["-tastingPatch", "quiz_open=true"])
        XCTAssertTrue(a.buttons["Smagningen"].waitForExistence(timeout: 15))
        XCTAssertFalse(a.buttons["Quiz"].exists, "no Quiz tab")
        let wines = a.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Vinene,'")).firstMatch
        scrollTo(a, wines)
        XCTAssertFalse(a.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Quiz,'")).firstMatch.exists, "no Quiz tile")
    }

    // MARK: WIN-316 – the chat field (a native field: one line, no scroll bar)

    func testEmptyChatFieldIsOneLine() {
        let a = app(["-route", "chat"])
        let field = a.textFields["Skriv en besked"].firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 15))
        XCTAssertLessThan(field.frame.height, 60, "one line high")
        XCTAssertEqual(field.scrollBars.count, 0, "no scroll bar")
        shot("win316-chat-empty-da")
    }

    // MARK: WIN-317 / WIN-318 / WIN-319 – the tasting fee and the payment box

    private func feeCard(_ lang: String, patch: String, expect: [String], absent: [String], shotName: String, extra: [String] = []) -> XCUIApplication {
        let a = app(lang, ["-route", "tasting"] + extra, mock: ["-tastingPatch", patch, "-paymentMock", "150"])
        let first = a.staticTexts[expect[0]]
        XCTAssertTrue(a.buttons.firstMatch.waitForExistence(timeout: 15))
        scrollTo(a, first, swipes: 10)
        for e in expect { XCTAssertTrue(a.staticTexts[e].exists, e) }
        for e in absent { XCTAssertFalse(text(a, containing: e).exists, "not: \(e)") }
        shot(shotName)
        return a
    }

    func testSharedFeeWithoutMobilePay() {
        // WIN-317 shared fee and WIN-318 MobilePay off: the amount and that the host tells how to pay – MobilePay is not named
        _ = feeCard("da", patch: "fee_shared=true,mobilepay=null,mobilepay_name=null",
                    expect: ["Prisen for aftenen er fundet ud fra indkøb og antal gæster.", "Beløb", "Værten fortæller dig, hvordan du betaler."],
                    absent: ["MobilePay", "Prisen er den samme"], shotName: "win317-318-fee-shared-da")
        _ = feeCard("en", patch: "fee_shared=true,mobilepay=null,mobilepay_name=null",
                    expect: ["The price for the evening is based on purchases and the number of guests.", "Amount", "The host will tell you how to pay."],
                    absent: ["MobilePay", "same price"], shotName: "win317-318-fee-shared-en")
        _ = feeCard("is", patch: "fee_shared=true,mobilepay=null,mobilepay_name=null",
                    expect: ["Verðið fyrir kvöldið miðast við innkaup og fjölda gesta.", "Upphæð", "Gestgjafinn segir þér hvernig þú greiðir."],
                    absent: ["MobilePay", "sama verð"], shotName: "win317-318-fee-shared-is")
    }

    func testFixedFeeWithMobilePayOnOneLine() {
        // WIN-317 fixed fee, WIN-319 the number on one line – also with larger text
        let patch = "fee_shared=false,mobilepay='12345678',mobilepay_name='Morten Kruse'"
        var a = feeCard("da", patch: patch, expect: ["Prisen er den samme for alle gæster.", "MobilePay-nummer", "12 34 56 78", "Morten Kruse"],
                        absent: ["fundet ud fra indkøb", "fortæller dig"], shotName: "win317-319-fee-fixed-da")
        XCTAssertLessThan(a.staticTexts["12 34 56 78"].frame.height, 30, "the number is on one line")
        a.terminate()
        _ = feeCard("en", patch: patch, expect: ["Every guest pays the same price.", "12 34 56 78"], absent: ["based on purchases"], shotName: "win317-fee-fixed-en")
        a = feeCard("da", patch: patch, expect: ["Prisen er den samme for alle gæster.", "12 34 56 78"], absent: [],
                    shotName: "win319-number-largetext-da", extra: ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityM"])
        let number = a.staticTexts["12 34 56 78"]
        let label = a.staticTexts["MobilePay-nummer"]
        XCTAssertLessThan(number.frame.height, label.frame.height * 1.6 + 8, "the number is on one line with larger text")
    }

    // MARK: WIN-320 – an unrevealed blind wine shows only its number

    func testBlindWineShowsOnlyItsNumber() {
        var a = app(["-route", "wines"])
        let next = a.buttons["Næste"]
        XCTAssertTrue(next.waitForExistence(timeout: 20))
        let card = a.buttons.matching(NSPredicate(format: "label CONTAINS 'Vin 11'")).firstMatch
        for _ in 0..<12 where !(card.exists && card.isHittable) { next.tap(); usleep(400_000) }
        XCTAssertTrue(card.waitForExistence(timeout: 5), "the blind wine's card")
        XCTAssertFalse(card.label.localizedCaseInsensitiveContains("vintage"), "no style on the card: \(card.label)")
        shot("win320-blind-list-da")
        a.terminate()
        a = app(["-route", "blind"])
        XCTAssertTrue(a.staticTexts["Vin 11"].waitForExistence(timeout: 20), "the blind wine's page")
        XCTAssertFalse(a.staticTexts["VINTAGE"].exists, "no style on the wine's page")
        XCTAssertTrue(a.staticTexts["Blind – afsløres senere"].exists, "the blind hint")
        shot("win320-blind-wine-da")
    }
}
