import Testing

@testable import InterMEDDomain

@Test("Domain module publishes its initial schema version")
func domainModulePublishesInitialVersion() {
    #expect(InterMEDDomainModule.version == 1)
}
