import XCTest

/// WIN-287: the wines without network. The simulator has no flight mode, so the test build pretends with
/// -offlineAfter / -onlineAfter (NetHook, Debug only): no network from that many seconds after the start. Danish UI.
final class OfflineTests: XCTestCase {
    private let code = ProcessInfo.processInfo.environment["APP_TEST_CODE"] ?? ""

    private func app(_ args: [String]) -> XCUIApplication {
        let a = XCUIApplication()
        a.launchArguments = ["-AppleLanguages", "(da)", "-AppleLocale", "da_DK", "-appLanguage", "da"] + args
        a.launch()
        return a
    }
    private func shot(_ name: String) {
        if let dir = ProcessInfo.processInfo.environment["SHOT_DIR"], !dir.isEmpty {
            try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: dir).appendingPathComponent(name))
        }
    }
    /// Opens the tasting online, waits for the network to go, then opens the wines tab
    private func winesWhenOffline(_ extra: [String] = [], back: Int = 50) -> XCUIApplication {
        let a = app(["-inviteCode", code, "-route", "tasting", "-offlineAfter", "12", "-onlineAfter", "\(back)"] + extra)
        XCTAssertTrue(a.buttons["Vinene"].waitForExistence(timeout: 12), "the tasting is open before the network goes")
        XCTAssertTrue(a.staticTexts["Ingen forbindelse"].waitForExistence(timeout: 20), "no network")
        a.buttons["Vinene"].tap()
        return a
    }
    private func fetchWinesOnline() {
        let a = app(["-inviteCode", code, "-route", "wines"])
        XCTAssertTrue(a.buttons["wine-card-1"].waitForExistence(timeout: 20), "the wines, fetched")
        a.terminate()
    }

    /// The list and a wine's page from last time with the quiet notice; stars given without network are "Ikke gemt",
    /// saved once the network is back although the page was left; the list is fetched again and the notice goes
    func testWinesWithoutNetwork() {
        fetchWinesOnline()
        var a = winesWhenOffline()
        XCTAssertTrue(a.buttons["wine-card-1"].waitForExistence(timeout: 10), "the list from last time")
        XCTAssertTrue(a.staticTexts.containing(NSPredicate(format: "label BEGINSWITH 'Vinene kunne ikke opdateres'")).firstMatch.exists, "the notice")
        shot("offline-list.png")
        a.buttons["wine-card-1"].tap()
        let four = a.buttons["4 stjerner"]
        XCTAssertTrue(four.waitForExistence(timeout: 10), "the wine's page from last time")
        XCTAssertTrue(a.staticTexts.containing(NSPredicate(format: "label BEGINSWITH 'Vinen kunne ikke opdateres'")).firstMatch.exists, "the notice on the page")
        shot("offline-wine.png")
        four.tap()
        XCTAssertTrue(a.staticTexts["Ikke gemt – prøv igen"].waitForExistence(timeout: 5), "not saved")
        shot("offline-not-saved.png")
        a.buttons["Alle vinene"].firstMatch.tap()
        // The network is back 50 seconds after the start: the list is fetched again, the notice goes
        let gone = NSPredicate(format: "exists == false")
        expectation(for: gone, evaluatedWith: a.staticTexts.containing(NSPredicate(format: "label BEGINSWITH 'Vinene kunne ikke opdateres'")).firstMatch)
        waitForExpectations(timeout: 60)
        shot("online-again-list.png")
        a.terminate()
        // Saved in the database although the page was left: a fresh start shows the four stars, then they are cleared
        a = app(["-inviteCode", code, "-route", "wine"])
        let again = a.buttons["4 stjerner"]
        XCTAssertTrue(again.waitForExistence(timeout: 20))
        expectation(for: NSPredicate(format: "isSelected == true"), evaluatedWith: again)
        waitForExpectations(timeout: 10)
        again.tap()
        XCTAssertTrue(a.staticTexts["Din bedømmelse er gemt"].waitForExistence(timeout: 10), "cleared")
    }

    /// Never fetched on this phone: "Kunne ikke hentes" with "Prøv igen" as before, and the wines once the network is back
    func testNeverFetchedShowsCouldNotLoad() {
        let a = winesWhenOffline(["-resetData", "YES"], back: 40)
        XCTAssertTrue(a.staticTexts["Kunne ikke hentes"].waitForExistence(timeout: 10), "could not load")
        XCTAssertTrue(a.buttons["Prøv igen"].exists, "try again")
        shot("offline-never-fetched.png")
        XCTAssertTrue(a.buttons["wine-card-1"].waitForExistence(timeout: 50), "the wines once the network is back")
    }

    /// Log out deletes the stored wines: the same code without network afterwards has nothing to show
    func testLogOutDeletesTheStoredWines() {
        fetchWinesOnline()
        var a = app(["-inviteCode", code])
        let account = a.buttons["Kontomenu"]
        XCTAssertTrue(account.waitForExistence(timeout: 15))
        account.tap()
        a.buttons["Log ud"].tap()
        XCTAssertTrue(a.textFields["E-mail"].waitForExistence(timeout: 10), "logged out")
        a.terminate()
        a = winesWhenOffline(back: 40)
        XCTAssertTrue(a.staticTexts["Kunne ikke hentes"].waitForExistence(timeout: 10), "nothing kept after log out")
        XCTAssertFalse(a.buttons["wine-card-1"].exists)
    }
}
