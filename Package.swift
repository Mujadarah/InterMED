// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "InterMEDCore",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(name: "InterMEDDomain", targets: ["InterMEDDomain"]),
        .library(name: "InterMEDClinicalEngine", targets: ["InterMEDClinicalEngine"]),
        .library(name: "InterMEDEvidence", targets: ["InterMEDEvidence"]),
        .library(name: "InterMEDMedication", targets: ["InterMEDMedication"]),
        .library(name: "InterMEDTerminology", targets: ["InterMEDTerminology"]),
        .library(name: "InterMEDTestFixtures", targets: ["InterMEDTestFixtures"]),
    ],
    targets: [
        .target(
            name: "InterMEDDomain",
            path: "packages/domain/Sources/InterMEDDomain"
        ),
        .target(
            name: "InterMEDClinicalEngine",
            dependencies: ["InterMEDDomain"],
            path: "packages/clinical-engine/Sources/InterMEDClinicalEngine"
        ),
        .target(
            name: "InterMEDEvidence",
            dependencies: ["InterMEDDomain"],
            path: "packages/evidence/Sources/InterMEDEvidence"
        ),
        .target(
            name: "InterMEDMedication",
            dependencies: ["InterMEDDomain"],
            path: "packages/medication/Sources/InterMEDMedication"
        ),
        .target(
            name: "InterMEDTerminology",
            dependencies: ["InterMEDDomain"],
            path: "packages/terminology/Sources/InterMEDTerminology"
        ),
        .target(
            name: "InterMEDTestFixtures",
            dependencies: ["InterMEDDomain"],
            path: "packages/test-fixtures/Sources/InterMEDTestFixtures"
        ),
    ]
)
