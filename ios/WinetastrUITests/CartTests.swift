import XCTest

/// The cart: adding from the wine page, the cart bar, the cart page, removing with Undo and the closed tasting's answer.
/// The test tasting is closed for orders, so ordering is shown as open with the debug switch; sending is refused. Danish UI.
final class CartTests: XCTestCase {
    private let code = ProcessInfo.processInfo.environment["APP_TEST_CODE"] ?? ""

    func testAddToCartAndRemoveWithUndo() {
        let a = XCUIApplication()
        a.launchArguments = ["-AppleLanguages", "(da)", "-AppleLocale", "da_DK", "-appLanguage", "da", "-resetData", "YES",
                             "-inviteCode", code, "-route", "wine", "-ordersOpen", "YES"]
        a.launch()
        let add = a.buttons["Læg i kurv"]
        XCTAssertTrue(add.waitForExistence(timeout: 20), "add to cart")
        add.tap()
        XCTAssertTrue(a.staticTexts["1 flaske i kurven"].waitForExistence(timeout: 5), "the cart bar")
        XCTAssertTrue(a.buttons["Læg i kurv (1 i kurven)"].exists, "the button says how many are in the cart")
        a.buttons["Gå til kurven"].tap()
        let send = a.buttons["Send bestilling"]
        XCTAssertTrue(send.waitForExistence(timeout: 15), "the cart")
        send.tap()
        XCTAssertTrue(a.staticTexts["Bestillingen er lukket, så den kunne ikke sendes."].waitForExistence(timeout: 15), "closed for orders")
        a.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Fjern:'")).firstMatch.tap()
        a.buttons["Fjern"].tap()
        XCTAssertTrue(a.staticTexts["Kurven er tom."].waitForExistence(timeout: 5), "empty")
        a.buttons["Fortryd"].tap()
        XCTAssertTrue(send.waitForExistence(timeout: 5), "back after Undo")
    }
}
