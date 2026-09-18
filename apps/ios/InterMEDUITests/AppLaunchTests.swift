import XCTest

final class AppLaunchTests: XCTestCase {
    @MainActor
    func testAppLaunchesToForeground() {
        let app = XCUIApplication()

        app.launch()

        XCTAssertEqual(app.state, .runningForeground)
    }
}
