import InterMEDApplication
import SwiftUI

struct HomeView: View {
    let configuration: AppConfiguration

    var body: some View {
        NavigationStack {
            ContentUnavailableView(
                "InterMED",
                systemImage: "cross.case",
                description: Text(storageDescription)
            )
            .navigationTitle("InterMED")
        }
    }

    private var storageDescription: String {
        switch configuration.storageMode {
        case .localOnly:
            "Local-only clinical workspace"
        }
    }
}

#Preview {
    HomeView(configuration: .production)
}
