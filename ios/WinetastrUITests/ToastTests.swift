import XCTest

/// WIN-336: an error toast stays until it is closed or a new try works, as on the site (src/lib/ui/toast.ts); a message
/// such as "Kopieret" goes by itself after 4 s. The order fails once through the debug switch -sendMock failOnce
/// (WIN-314), without reaching the database.
final class ToastTests: XCTestCase {
    private let code = ProcessInfo.processInfo.environment["APP_TEST_CODE"] ?? ""

    private struct Words { let lang, locale, add, toCart, send, error, close: String }
    private let da = Words(lang: "da", locale: "da_DK", add: "Læg i kurv", toCart: "Gå til kurven", send: "Send bestilling",
                           error: "Bestillingen blev ikke sendt. Tjek din forbindelse, og prøv igen.", close: "Luk")
    private let en = Words(lang: "en", locale: "en_GB", add: "Add to cart", toCart: "Go to cart", send: "Send order",
                           error: "The order was not sent. Check your connection and try again.", close: "Close")
    private let isl = Words(lang: "is", locale: "is_IS", add: "Setja í körfu", toCart: "Fara í körfu", send: "Senda pöntun",
                            error: "Pöntunin var ekki send. Athugaðu tenginguna og reyndu aftur.", close: "Loka")

    private func shot(_ name: String) {
        guard let dir = ProcessInfo.processInfo.environment["SHOT_DIR"], !dir.isEmpty else { return }
        try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name).png"))
    }

    /// The cart with one bottle, the first order failed: returns the app and the send button
    private func failedOrder(_ w: Words, large: Bool = false) -> (XCUIApplication, XCUIElement) {
        let a = XCUIApplication()
        a.launchArguments = ["-AppleLanguages", "(\(w.lang))", "-AppleLocale", w.locale, "-appLanguage", w.lang, "-inviteCode", code,
                             "-resetData", "YES", "-route", "wine", "-ordersOpen", "YES", "-sendMock", "failOnce"]
            + (large ? ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"] : [])
        a.launch()
        let add = a.buttons[w.add]
        XCTAssertTrue(add.waitForExistence(timeout: 20), "add to cart")
        if !add.isHittable { a.swipeUp() }
        add.tap()
        let toCart = a.buttons[w.toCart]
        XCTAssertTrue(toCart.waitForExistence(timeout: 5), "go to the cart")
        if !toCart.isHittable { a.swipeUp() }
        toCart.tap()
        let send = a.buttons[w.send]
        XCTAssertTrue(send.waitForExistence(timeout: 15), "the cart")
        for _ in 0..<6 where !send.isHittable { a.swipeUp() }
        send.tap()
        XCTAssertTrue(a.staticTexts[w.error].waitForExistence(timeout: 3), "the first try fails")
        return (a, send)
    }

    // Testcase 1 and 4: the error stays until it is closed, is marked as an error and its close button has a name
    func testErrorToastStaysUntilClosed() {
        let (a, _) = failedOrder(da)
        let error = a.staticTexts[da.error]
        let toast = a.otherElements["toast-error"]
        XCTAssertTrue(toast.exists, "shown as an error toast")
        let close = a.buttons["toast-close"]
        XCTAssertTrue(close.exists, "a close button")
        XCTAssertEqual(close.label, "Luk", "the close button is named as on the site (admin.close)")
        // A message goes after 4 s; the error is still there well after that
        sleep(6)
        XCTAssertTrue(error.exists, "the error stays")
        shot("win336-cart-error-da")
        close.tap()
        XCTAssertTrue(error.waitForNonExistence(timeout: 2), "closed, it goes")
        XCTAssertFalse(toast.exists, "no toast left")
    }

    // Testcase 2: a new try works, so the error goes
    func testErrorToastGoesWhenTheNextTryWorks() {
        let (a, send) = failedOrder(da)
        sleep(3)
        XCTAssertTrue(a.staticTexts[da.error].exists, "still there before the new try")
        send.tap()
        XCTAssertTrue(a.staticTexts[da.error].waitForNonExistence(timeout: 2), "the error goes when the order is sent")
        XCTAssertTrue(a.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Din bestilling nr. 9001 er modtaget")).firstMatch
            .waitForExistence(timeout: 5), "the receipt")
    }

    // The error toast in every language, normal and the largest text size (screenshots for a look)
    func testErrorToastInEveryLanguageAndSize() {
        for w in [da, en, isl] {
            for large in [false, true] {
                let (a, _) = failedOrder(w, large: large)
                let close = a.buttons["toast-close"]
                XCTAssertTrue(close.exists && close.isHittable, "the close button: \(w.lang) \(large)")
                XCTAssertEqual(close.label, w.close, "its name: \(w.lang)")
                let frame = a.otherElements["toast-error"].frame
                XCTAssertLessThanOrEqual(frame.maxX, a.frame.maxX, "inside the screen: \(w.lang) \(large)")
                shot("win336-cart-error-\(w.lang)\(large ? "-xxxl" : "")")
                a.terminate()
            }
        }
    }

    // A message stands above the cart bar (never over "Gå til kurven"), and the cart's Undo is a toast with an action
    func testAddedToastAboveTheCartBarAndUndoToast() {
        let a = XCUIApplication()
        a.launchArguments = ["-AppleLanguages", "(da)", "-AppleLocale", "da_DK", "-appLanguage", "da", "-inviteCode", code,
                             "-resetData", "YES", "-route", "wine", "-ordersOpen", "YES"]
        a.launch()
        let add = a.buttons["Læg i kurv"]
        XCTAssertTrue(add.waitForExistence(timeout: 20), "add to cart")
        add.tap()
        let toast = a.otherElements["toast"]
        XCTAssertTrue(toast.waitForExistence(timeout: 3), "the toast")
        let toCart = a.buttons["Gå til kurven"]
        XCTAssertTrue(toCart.exists && toCart.isHittable, "the cart bar's button is not covered")
        XCTAssertLessThanOrEqual(toast.frame.maxY, toCart.frame.minY, "the toast is above the cart bar")
        shot("win336-added-above-cartbar-da")
        toCart.tap()
        XCTAssertTrue(a.buttons["Send bestilling"].waitForExistence(timeout: 15), "the cart")
        a.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Fjern:'")).firstMatch.tap()
        a.buttons["Fjern"].tap()
        XCTAssertTrue(a.buttons["Fortryd"].waitForExistence(timeout: 3), "Undo in the toast")
        XCTAssertTrue(a.otherElements["toast"].exists, "as a toast")
        shot("win336-cart-undo-da")
        a.buttons["Fortryd"].tap()
        XCTAssertTrue(a.buttons["Send bestilling"].waitForExistence(timeout: 5), "back after Undo")
    }
}
