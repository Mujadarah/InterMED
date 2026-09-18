import SwiftUI

struct HomeView: View {
    var body: some View {
        NavigationStack {
            ContentUnavailableView(
                "InterMED",
                systemImage: "cross.case",
                description: Text("Local-first clinical workspace")
            )
            .navigationTitle("InterMED")
        }
    }
}

#Preview {
    HomeView()
}
