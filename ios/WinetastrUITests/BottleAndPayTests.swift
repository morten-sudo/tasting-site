import XCTest

/// A bottle size that is not 75 cl in the list, on the wine's page and in the cart's order lines, and the payment box
/// (WIN-278: the MobilePay number with one copy button, the recipient and the amount – nothing else, no button into
/// MobilePay). The test tasting has only 75 cl bottles, no MobilePay number and no orders, so the debug switches
/// -bottleMock and -payMock fill them in (number 12 34 56 78, recipient Morten Kruse). Danish UI.
final class BottleAndPayTests: XCTestCase {
    private let code = ProcessInfo.processInfo.environment["APP_TEST_CODE"] ?? ""

    private func app(_ extra: [String]) -> XCUIApplication {
        let a = XCUIApplication()
        a.launchArguments = ["-AppleLanguages", "(da)", "-AppleLocale", "da_DK", "-appLanguage", "da", "-inviteCode", code] + extra
        a.launch()
        return a
    }

    private func shot(_ name: String) {
        guard let dir = ProcessInfo.processInfo.environment["SHOT_DIR"], !dir.isEmpty else { return }
        try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name).png"))
    }

    private func text(_ a: XCUIApplication, containing s: String) -> XCUIElement {
        a.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", s)).firstMatch
    }

    func testBottleSizeInTheListAndOnTheWinePage() {
        var a = app(["-route", "wines", "-bottleMock", "150"])
        XCTAssertTrue(text(a, containing: "150 cl").waitForExistence(timeout: 20), "the list's meta line")
        shot("bottle-list")
        a.terminate()
        a = app(["-route", "wine", "-bottleMock", "37.5"])
        XCTAssertTrue(text(a, containing: "37,5 cl").waitForExistence(timeout: 20), "the wine page, with a decimal comma")
        shot("bottle-wine")
    }

    func testPayBoxShowsNumberRecipientAndAmountOnly() {
        let a = app(["-route", "cart", "-payMock", "YES", "-bottleMock", "150"])
        let how = a.buttons["Sådan betaler du"]
        XCTAssertTrue(how.waitForExistence(timeout: 20), "the unpaid order")
        XCTAssertTrue(text(a, containing: "· 150 cl").exists, "the order line has the bottle size")
        how.tap()
        let box = a.otherElements["payFacts"]
        XCTAssertTrue(box.waitForExistence(timeout: 5), "the payment box")
        a.swipeUp(); a.swipeUp()
        for label in ["MobilePay-nummer", "Modtager", "Beløb"] { XCTAssertTrue(box.staticTexts[label].exists, label) }
        XCTAssertTrue(box.staticTexts["12 34 56 78"].exists, "the number")
        XCTAssertTrue(box.staticTexts["Morten Kruse"].exists, "the recipient")
        XCTAssertTrue(box.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "kr.")).firstMatch.exists, "the amount")
        // Nothing else: no how-to, no message, no button into MobilePay, and only one copy button
        XCTAssertFalse(text(a, containing: "vælg Send").exists, "no how-to text")
        XCTAssertFalse(box.staticTexts["Besked"].exists, "no message")
        XCTAssertFalse(a.buttons["Åbn MobilePay"].exists, "no button into MobilePay")
        XCTAssertFalse(a.links["Åbn MobilePay"].exists, "no link into MobilePay")
        XCTAssertEqual(box.buttons.count, 1, "one copy button")
        XCTAssertTrue(box.buttons["Kopiér nummer"].exists, "copy the number")
        shot("pay-box")
        box.buttons["Kopiér nummer"].tap()
        XCTAssertTrue(text(a, containing: "Kopieret").waitForExistence(timeout: 3), "the toast says the number was copied")
        // A message, not an error: it goes by itself after 4 s, as on the site (WIN-336)
        XCTAssertTrue(a.otherElements["toast"].exists, "an ordinary toast")
        shot("win336-copied-da")
        XCTAssertTrue(text(a, containing: "Kopieret").waitForNonExistence(timeout: 6), "\"Kopieret\" goes by itself")
    }
}
