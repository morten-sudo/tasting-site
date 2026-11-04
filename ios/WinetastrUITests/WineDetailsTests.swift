import XCTest

/// A wine's page: "Mere om vinen og producenten" opens on the producer and the wine's details. Danish UI.
final class WineDetailsTests: XCTestCase {
    private let code = ProcessInfo.processInfo.environment["APP_TEST_CODE"] ?? ""

    func testMoreAboutTheWineOpens() {
        let a = XCUIApplication()
        a.launchArguments = ["-AppleLanguages", "(da)", "-AppleLocale", "da_DK", "-appLanguage", "da", "-inviteCode", code, "-route", "wine"]
        a.launch()
        XCTAssertTrue(a.buttons["4 stjerner"].waitForExistence(timeout: 20), "the wine page")
        let more = a.buttons["Mere om vinen og producenten"]
        for _ in 0..<8 where !more.isHittable { a.swipeUp() }
        XCTAssertTrue(more.isHittable, "more about the wine")
        more.tap()
        a.swipeUp()
        // A screenshot of the open details for a look at the icons (tools/simtest.sh sets SHOT_DIR)
        if let dir = ProcessInfo.processInfo.environment["SHOT_DIR"], !dir.isEmpty {
            try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: dir).appendingPathComponent("wine-details.png"))
        }
        XCTAssertTrue(more.isSelected, "the details are open")
    }
}
