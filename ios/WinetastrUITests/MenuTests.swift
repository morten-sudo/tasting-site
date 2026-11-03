import XCTest

/// The top bar's menus (the site's account menu and language dropdown), the wine book and the profile. Danish UI.
final class MenuTests: XCTestCase {
    private let code = ProcessInfo.processInfo.environment["APP_TEST_CODE"] ?? ""

    private func app(_ args: [String] = []) -> XCUIApplication {
        let a = XCUIApplication()
        a.launchArguments = ["-AppleLanguages", "(da)", "-AppleLocale", "da_DK", "-appLanguage", "da", "-inviteCode", code] + args
        a.launch()
        return a
    }

    func testAccountMenuHasTheSitesItems() {
        let a = app()
        let account = a.buttons["Kontomenu"]
        XCTAssertTrue(account.waitForExistence(timeout: 15))
        account.tap()
        for item in ["Hjem", "Min vinbog", "Min profil", "Log ud"] {
            XCTAssertTrue(a.buttons[item].waitForExistence(timeout: 3), "menu item \(item)")
        }
        a.buttons["Min vinbog"].tap()
        XCTAssertTrue(a.staticTexts["vine smagt"].waitForExistence(timeout: 15), "wine book")
        a.buttons["Kontomenu"].tap()
        a.buttons["Min profil"].tap()
        XCTAssertTrue(a.staticTexts["Sprog"].waitForExistence(timeout: 15), "profile")
        a.buttons["Kontomenu"].tap()
        a.buttons["Hjem"].tap()
        XCTAssertTrue(a.staticTexts["Mine smagninger"].waitForExistence(timeout: 15), "home")
    }

    func testTapOutsideClosesTheMenu() {
        let a = app()
        let account = a.buttons["Kontomenu"]
        XCTAssertTrue(account.waitForExistence(timeout: 15))
        account.tap()
        XCTAssertTrue(a.buttons["Min profil"].waitForExistence(timeout: 3))
        a.coordinate(withNormalizedOffset: CGVector(dx: 0.2, dy: 0.8)).tap()
        XCTAssertFalse(a.buttons["Min profil"].waitForExistence(timeout: 2), "closed")
    }

    func testLanguageSwitchesInPlace() {
        let a = app()
        let lang = a.buttons["Sprog"]
        XCTAssertTrue(lang.waitForExistence(timeout: 15))
        lang.tap()
        a.buttons["English"].tap()
        XCTAssertTrue(a.staticTexts["My tastings"].waitForExistence(timeout: 10), "English")
        a.buttons["Language"].tap()
        a.buttons["Dansk"].tap()
        XCTAssertTrue(a.staticTexts["Mine smagninger"].waitForExistence(timeout: 10), "back to Danish")
    }
}
