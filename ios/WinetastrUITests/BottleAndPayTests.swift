import XCTest

/// A bottle size that is not 75 cl in the list, on the wine's page and in the cart's order lines, and the payment box
/// (how to pay, then number, amount and message to copy – no button into MobilePay). The test tasting has only 75 cl
/// bottles, no MobilePay number and no orders, so the debug switches -bottleMock and -payMock fill them in. Danish UI.
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

    func testPayBoxHasNoMobilePayButton() {
        let a = app(["-route", "cart", "-payMock", "YES", "-bottleMock", "150"])
        let how = a.buttons["Sådan betaler du"]
        XCTAssertTrue(how.waitForExistence(timeout: 20), "the unpaid order")
        XCTAssertTrue(text(a, containing: "· 150 cl").exists, "the order line has the bottle size")
        how.tap()
        XCTAssertTrue(text(a, containing: "vælg Send").waitForExistence(timeout: 5), "how to pay")
        a.swipeUp(); a.swipeUp()
        XCTAssertFalse(a.buttons["Åbn MobilePay"].exists, "no button into MobilePay")
        XCTAssertFalse(a.links["Åbn MobilePay"].exists, "no link into MobilePay")
        for what in ["nummer", "beløb", "besked"] { XCTAssertTrue(a.buttons["Kopiér \(what)"].exists, "copy \(what)") }
        shot("pay-box")
        a.buttons["Kopiér nummer"].tap()
        XCTAssertTrue(text(a, containing: "Kopieret").waitForExistence(timeout: 3), "the toast says what was copied")
    }
}
