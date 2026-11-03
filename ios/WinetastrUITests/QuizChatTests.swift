import XCTest

/// The quiz and the chat. The open and finished quiz use the debug sample (the test tasting has no quiz). Danish UI.
final class QuizChatTests: XCTestCase {
    private let code = ProcessInfo.processInfo.environment["APP_TEST_CODE"] ?? ""

    private func app(_ args: [String]) -> XCUIApplication {
        let a = XCUIApplication()
        a.launchArguments = ["-AppleLanguages", "(da)", "-AppleLocale", "da_DK", "-appLanguage", "da", "-inviteCode", code] + args
        a.launch()
        return a
    }

    func testQuizIsClosedUntilTheHostOpensIt() {
        let a = app(["-route", "quiz"])
        XCTAssertTrue(a.staticTexts.containing(NSPredicate(format: "label BEGINSWITH 'Quizzen åbner'")).firstMatch.waitForExistence(timeout: 15))
    }

    func testOpenQuizLocksAnAnswer() {
        let a = app(["-route", "quiz", "-quizMock", "open"])
        let lock = a.buttons["Lås svar"]
        XCTAssertTrue(lock.waitForExistence(timeout: 15))
        XCTAssertFalse(lock.isEnabled, "nothing chosen yet")
        a.buttons["Gennemsnitligt 10 år"].tap()
        XCTAssertTrue(lock.isEnabled, "an answer chosen")
        XCTAssertTrue(a.staticTexts["Stillingen lige nu"].exists, "the standings")
    }

    func testFinishedQuizShowsTheAnswers() {
        let a = app(["-route", "quiz", "-quizMock", "finished"])
        XCTAssertTrue(a.staticTexts["Slutstilling"].waitForExistence(timeout: 15))
        XCTAssertTrue(a.staticTexts["Morten (dig)"].exists || a.staticTexts.containing(NSPredicate(format: "label CONTAINS '(dig)'")).firstMatch.exists, "own line")
    }

    func testChatSendsOnlyWithText() {
        let a = app(["-route", "chat"])
        let field = a.textFields["Skriv en besked"].firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 15))
        let send = a.buttons["Send"].firstMatch
        XCTAssertFalse(send.isEnabled, "empty message")
        field.tap(); field.typeText("Hej")
        XCTAssertTrue(send.isEnabled, "with text")
    }
}
