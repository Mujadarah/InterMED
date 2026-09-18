import InterMEDApplication
import SwiftUI

@main
struct InterMEDApp: App {
    private let configuration = AppConfiguration.production

    var body: some Scene {
        WindowGroup {
            HomeView(configuration: configuration)
        }
    }
}
