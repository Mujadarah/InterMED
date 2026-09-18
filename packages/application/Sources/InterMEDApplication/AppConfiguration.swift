/// Runtime configuration kept separate from UI and provider implementations.
public struct AppConfiguration: Equatable, Sendable {
    public enum Environment: String, Equatable, Sendable {
        case development
        case testing
        case production
    }

    public enum StorageMode: Equatable, Sendable {
        case localOnly
    }

    public let environment: Environment
    public let storageMode: StorageMode
    public let requiresAccount: Bool
    public let hostedBackendEnabled: Bool
    public let iCloudSyncEnabledByDefault: Bool
    public let cloudAIEnabledByDefault: Bool

    public init(
        environment: Environment,
        storageMode: StorageMode = .localOnly,
        requiresAccount: Bool = false,
        hostedBackendEnabled: Bool = false,
        iCloudSyncEnabledByDefault: Bool = false,
        cloudAIEnabledByDefault: Bool = false
    ) {
        self.environment = environment
        self.storageMode = storageMode
        self.requiresAccount = requiresAccount
        self.hostedBackendEnabled = hostedBackendEnabled
        self.iCloudSyncEnabledByDefault = iCloudSyncEnabledByDefault
        self.cloudAIEnabledByDefault = cloudAIEnabledByDefault
    }

    public static let production = AppConfiguration(environment: .production)
    public static let testing = AppConfiguration(environment: .testing)
}
