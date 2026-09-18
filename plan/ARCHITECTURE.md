# ClinPath Architecture

## Architectural goals

- Local-first.
- Offline-capable.
- No backend dependency in MVP.
- Clean separation of UI, domain, persistence, providers and clinical content.
- Easy replacement/addition of storage, AI, medication and evidence providers.
- Safe database migrations.
- Testability of clinical rules without launching the iOS app.
- Future support for account/cloud features without rewriting the core.

## Suggested repository structure

```text
ClinPath/
├── apps/
│   └── ios/
│       ├── ClinPathApp/
│       ├── Features/
│       ├── DesignSystem/
│       └── Platform/
│
├── packages/
│   ├── domain/
│   ├── clinical-engine/
│   ├── evidence/
│   ├── medication/
│   ├── terminology/
│   └── test-fixtures/
│
├── docs/
├── scripts/
├── tests/
├── README.md
├── LICENSE
└── CONTRIBUTING.md
```

A simpler single-Xcode-project layout is acceptable initially, but boundaries should mirror these modules.

## Layers

### Presentation

Responsibilities:

- SwiftUI screens;
- navigation;
- view state;
- user input;
- accessibility;
- localization;
- confirmation/review flows.

Must not contain clinical rule logic.

### Application/use-case layer

Examples:

- `CreateCase`
- `AddObservation`
- `ImportPhoto`
- `ConfirmExtractedData`
- `EvaluateClinicalState`
- `SearchMedication`
- `CheckInteractions`
- `SyncCase`

Coordinates domain objects and providers.

### Domain

Contains pure types and rules:

- PatientCase
- Identifier
- Diagnosis
- Procedure
- Observation
- LaboratoryResult
- Medication
- ClinicalState
- ClinicalSignal
- ClinicalPathway
- EvidenceReference
- Recommendation
- RuleEvaluation

Domain must not import SwiftUI, CloudKit or Appwrite SDKs.

### Clinical engine

Input:

```text
ClinicalState + EvidencePackage + RulePackage
```

Output:

```text
Signals
ApplicablePathways
MissingData
SafetyAlerts
Recommendations
Explanations/provenance
```

The engine must be deterministic for validated rules.

### Data/persistence

Recommended MVP persistence: **SQLite + GRDB** or an equivalent explicit-schema database.

Reasons:

- deterministic schema;
- explicit migrations;
- testable queries;
- easier portability/export;
- suitable for long-term clinical records.

SwiftData may be used for non-critical UI/preferences if useful, but should not force the clinical domain model.

### Provider interfaces

Create protocols/interfaces early:

```swift
protocol CaseRepository { }
protocol LocalDatabase { }
protocol SyncProvider { }
protocol BackupProvider { }
protocol OCRProvider { }
protocol AIProvider { }
protocol MedicationCatalogProvider { }
protocol DrugInteractionProvider { }
protocol GuidelineProvider { }
protocol TerminologyProvider { }
protocol AuthenticationProvider { }
```

Avoid naming domain interfaces after specific vendors.

Bad:

```text
AppwritePatientService
```

Better:

```text
RemoteCaseStore
AccountService
```

Vendor adapters live in infrastructure:

```text
AppwriteAccountAdapter
CloudKitSyncAdapter
GoogleDriveBackupAdapter
DropboxBackupAdapter
OneDriveBackupAdapter
```

## Storage architecture

### MVP

```text
UI
 ↓
Use Cases
 ↓
CaseRepository
 ↓
Encrypted Local SQLite
```

### With iCloud

```text
Local SQLite ←→ SyncCoordinator ←→ CloudKitSyncAdapter
```

Local database remains the working source of truth. Cloud sync should be asynchronous and resilient.

### Future external backup

```text
Local SQLite
   ↓
Encrypted export bundle
   ↓
BackupProvider
   ├─ Google Drive
   ├─ OneDrive
   └─ Dropbox
```

Prefer backup first; full multi-provider live sync is much harder and should not be promised early.

## Authentication architecture

MVP:

```text
No account required
```

Optional app lock is separate from user identity/account authentication.

Future:

```text
AccountService
   ├─ AppleAuthAdapter
   ├─ GoogleAuthAdapter
   └─ AppwriteAccountAdapter
```

Do not couple patient records to account IDs in the initial local database. Introduce a stable local `ownerScope` abstraction so local records can later be associated with an account if migration occurs.

## AI architecture

AI receives only the minimum required context.

Preferred flow:

```text
Text/photo
 ↓
OCR / extraction model
 ↓
Structured candidates
 ↓
Clinician confirmation
 ↓
Clinical state
 ↓
Deterministic rule/evidence engine
 ↓
AI explanation/summarization
```

Avoid:

```text
Raw patient data → LLM → unverified clinical order
```

## Evidence packages

Clinical content should be data, not UI code.

Example:

```yaml
id: postop_aki
version: 1.0.0
triggers:
  - rule: creatinine_rise_48h
sources:
  - id: kdigo-source-id
recommendations:
  - id: reassess_nephrotoxins
```

Packages must be versioned and testable.

## Feature modules

Suggested iOS modules:

- Home
- Cases
- CaseOverview
- InputCapture
- Timeline
- Vitals
- Labs
- Medications
- ImagingReports
- Procedures
- Diagnoses
- Pathways
- EvidenceLibrary
- Calculators
- Settings
- Security
- SyncBackup

## Migration discipline

Every schema change must have:

1. migration version;
2. upgrade test;
3. downgrade/export consideration;
4. backup/restore test if format changes.

Never rely on deleting/recreating the database during development once real beta users exist.

