import XCTest

/// WIN-335: the app uses the singular when there is one, as the site ("1 is coming so far"). The number coming is
/// set with TASTING_PATCH, so the test tasting's own guests are not changed.
final class PluralTests: XCTestCase {
    private let code = ProcessInfo.processInfo.environment["APP_TEST_CODE"] ?? ""

    private func tasting(_ lang: String, coming: Int) -> XCUIApplication {
        let a = XCUIApplication()
        a.launchEnvironment["TASTING_PATCH"] = "coming=\(coming)"
        let locale = ["da": "da_DK", "en": "en_GB", "is": "is_IS"][lang] ?? "da_DK"
        a.launchArguments = ["-AppleLanguages", "(\(lang))", "-AppleLocale", locale, "-appLanguage", lang, "-inviteCode", code, "-route", "tasting"]
        a.launch()
        return a
    }

    private func shot(_ name: String) {
        guard let dir = ProcessInfo.processInfo.environment["SHOT_DIR"], !dir.isEmpty else { return }
        try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name).png"))
    }

    private func check(_ lang: String, coming: Int, _ expected: String, shotName: String? = nil) {
        let a = tasting(lang, coming: coming)
        XCTAssertTrue(a.staticTexts[expected].waitForExistence(timeout: 20), "\(lang), \(coming) coming: \(expected)")
        if let shotName { shot(shotName) }
        a.terminate()
    }

    func testOneIsComingInEveryLanguage() {
        check("en", coming: 1, "1 is coming so far", shotName: "win335-coming-one-en")
        check("da", coming: 1, "1 kommer indtil nu", shotName: "win335-coming-one-da")
        check("is", coming: 1, "1 mætir hingað til", shotName: "win335-coming-one-is")
    }

    func testSeveralAreComingAsBefore() {
        check("en", coming: 3, "3 are coming so far", shotName: "win335-coming-many-en")
        check("da", coming: 3, "3 kommer indtil nu")
        check("is", coming: 3, "3 mæta hingað til")
        // Icelandic, as Intl.PluralRules on the site: 21 takes the singular, 11 does not
        check("is", coming: 21, "21 mætir hingað til")
        check("is", coming: 11, "11 mæta hingað til")
    }
}
