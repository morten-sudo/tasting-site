import XCTest

/// Runs against the real database with the "App-test" tasting. Danish UI.
final class GuestFlowTests: XCTestCase {
    // Invite codes for the test tasting come from ios/.env.local (the repo is public), see tools/simtest.sh
    private let code = ProcessInfo.processInfo.environment["APP_TEST_CODE"] ?? ""
    private let noMailCode = ProcessInfo.processInfo.environment["APP_TEST_NOMAIL_CODE"] ?? ""

    private func app(_ args: [String]) -> XCUIApplication {
        let a = XCUIApplication()
        a.launchArguments = ["-AppleLanguages", "(da)", "-AppleLocale", "da_DK", "-appLanguage", "da"] + args
        a.launch()
        return a
    }
    private func openTasting(_ a: XCUIApplication) {
        let row = a.staticTexts["App-test"].firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 15), "tasting in list")
        row.tap()
    }

    func testUnknownEmailShowsError() {
        let a = app(["-resetData", "YES"])
        let field = a.textFields["E-mail"]
        XCTAssertTrue(field.waitForExistence(timeout: 15))
        a.buttons["Send kode"].tap()
        XCTAssertTrue(a.staticTexts["Skriv din e-mail for at fortsætte."].waitForExistence(timeout: 5), "empty email")
        field.tap(); field.typeText("findes-ikke-apptest@example.com")
        a.buttons["Send kode"].tap()
        let msg = a.staticTexts.containing(NSPredicate(format: "label CONTAINS 'Vi kender ikke'")).firstMatch
        XCTAssertTrue(msg.waitForExistence(timeout: 15), "unknown email message")
    }

    func testPasteInviteLink() {
        let a = app(["-resetData", "YES"])
        let disclosure = a.buttons["Har du dit invitationslink i stedet?"].firstMatch
        XCTAssertTrue(disclosure.waitForExistence(timeout: 15))
        disclosure.tap()
        let field = a.textFields["Invitationslink"]
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        field.tap(); field.typeText("forkertkode123")
        a.buttons["Fortsæt"].tap()
        XCTAssertTrue(a.staticTexts.containing(NSPredicate(format: "label CONTAINS 'Koden blev ikke fundet'")).firstMatch.waitForExistence(timeout: 15), "wrong code")
        field.tap()
        field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 20))
        field.typeText("https://winetastr.com/t/app-test/?k=\(code)")
        a.buttons["Fortsæt"].tap()
        XCTAssertTrue(a.staticTexts["App-test"].firstMatch.waitForExistence(timeout: 15), "in after pasting")
    }

    func testAnswerInvitation() {
        let a = app(["-inviteCode", code])
        openTasting(a)
        let change = a.buttons["Ret svar"]
        let answer = a.buttons["Svar på invitationen"]
        XCTAssertTrue(change.waitForExistence(timeout: 15) || answer.exists)
        (change.exists ? change : answer).tap()
        a.buttons["Ja, jeg kommer"].tap()
        a.buttons["Gem"].tap()
        // Answered: the answer is a chip beside the countdown, with "Ret svar" next to it – no answer card
        XCTAssertTrue(a.staticTexts["Kommer"].waitForExistence(timeout: 15), "status chip yes")
        XCTAssertTrue(a.buttons["Ret svar"].exists, "change answer beside the chip")
        XCTAssertFalse(a.staticTexts["Dit svar"].exists, "no answer card once answered")
    }

    func testRatingIsSavedAndKept() {
        var a = app(["-inviteCode", code, "-route", "wine"])
        let four = a.buttons["4 stjerner"]
        XCTAssertTrue(four.waitForExistence(timeout: 20))
        four.tap()
        XCTAssertTrue(a.staticTexts["Gemt."].waitForExistence(timeout: 10), "saved")
        a.terminate()
        a = app(["-inviteCode", code, "-route", "wine"])
        let again = a.buttons["4 stjerner"]
        XCTAssertTrue(again.waitForExistence(timeout: 20))
        let selected = NSPredicate(format: "isSelected == true")
        expectation(for: selected, evaluatedWith: again)
        waitForExpectations(timeout: 10)
        again.tap() // clear again
        XCTAssertTrue(a.staticTexts["Gemt."].waitForExistence(timeout: 10), "cleared")
    }

    func testEmailStepValidates() {
        let a = app(["-inviteCode", noMailCode])
        openTasting(a)
        let field = a.textFields["Din e-mail"]
        XCTAssertTrue(field.waitForExistence(timeout: 15), "email step")
        field.tap(); field.typeText("ikke-en-mail")
        a.buttons["Fortsæt"].tap()
        XCTAssertTrue(a.staticTexts["E-mailen ser ikke rigtig ud. Ret den, og prøv igen."].waitForExistence(timeout: 5))
    }
}
