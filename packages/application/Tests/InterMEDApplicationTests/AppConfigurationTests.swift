import Testing

@testable import InterMEDApplication

@Test(
    "Default configurations preserve local-only operation",
    arguments: [AppConfiguration.production, AppConfiguration.testing]
)
func defaultConfigurationsPreserveLocalOnlyOperation(
    configuration: AppConfiguration
) {
    #expect(configuration.storageMode == .localOnly)
    #expect(configuration.requiresAccount == false)
    #expect(configuration.hostedBackendEnabled == false)
    #expect(configuration.iCloudSyncEnabledByDefault == false)
    #expect(configuration.cloudAIEnabledByDefault == false)
}

@Test("Named configurations identify their runtime environment")
func namedConfigurationsIdentifyTheirRuntimeEnvironment() {
    #expect(AppConfiguration.production.environment == .production)
    #expect(AppConfiguration.testing.environment == .testing)
}
