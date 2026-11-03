import XCTest

/// The tasting's page beyond the answer: the heading's links, where the wines come from and the evening's tiles. Danish UI.
final class TastingTests: XCTestCase {
    private let code = ProcessInfo.processInfo.environment["APP_TEST_CODE"] ?? ""

    private func openTasting() -> XCUIApplication {
        let a = XCUIApplication()
        a.launchArguments = ["-AppleLanguages", "(da)", "-AppleLocale", "da_DK", "-appLanguage", "da", "-inviteCode", code, "-route", "tasting"]
        a.launch()
        return a
    }

    func testHeadingHasCalendarAndMap() {
        let a = openTasting()
        XCTAssertTrue(a.buttons["Føj til kalender"].waitForExistence(timeout: 15), "add to calendar")
        XCTAssertTrue(a.links["Åbn i kort"].exists || a.buttons["Åbn i kort"].exists, "open in maps")
    }

    func testOriginsAndWinesTile() {
        let a = openTasting()
        let eyebrow = a.staticTexts["HVOR VINENE KOMMER FRA"]
        XCTAssertTrue(eyebrow.waitForExistence(timeout: 20), "the origin map")
        let tile = a.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Vinene,'")).firstMatch
        for _ in 0..<6 where !tile.isHittable { a.swipeUp() }
        XCTAssertTrue(tile.isHittable, "the wines tile")
        tile.tap()
        XCTAssertTrue(a.staticTexts["Det her skænker vi i aften."].waitForExistence(timeout: 15), "the wines")
    }

    func testCalendarOpensTheCalendarsForm() {
        let a = openTasting()
        let cal = a.buttons["Føj til kalender"]
        XCTAssertTrue(cal.waitForExistence(timeout: 15))
        cal.tap()
        // The calendar's own form, filled in with the tasting
        let form = a.textFields.matching(NSPredicate(format: "value == 'App-test'")).firstMatch
        XCTAssertTrue(form.waitForExistence(timeout: 10), "event form")
    }
}
