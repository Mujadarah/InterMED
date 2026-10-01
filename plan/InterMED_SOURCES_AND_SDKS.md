# InterMED sources, SDKs and documentation guide

## Scope

This is the canonical implementation-reference guide for the revised PWA plan. Tools below are planned selections or candidates, not installed dependencies. Pin versions and validate capabilities during their milestone; consult current official documentation and Context7 where available. Do not treat an SDK example, search snippet or LLM answer as a clinical source.

### Current web/PWA stack

| Component | Role | Primary documentation |
| --- | --- | --- |
| React + TypeScript + Vite | Canonical responsive client and reproducible build | [React](https://react.dev/learn), [TypeScript](https://www.typescriptlang.org/docs/), [Vite](https://vite.dev/guide/) |
| React Router | Client routes and detail deep links | [React Router](https://reactrouter.com/) |
| TanStack Query | Remote metadata/provider request lifecycle; not a replacement for IndexedDB | [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview) |
| Dexie / IndexedDB | Local catalogue indexes, favorites, recent searches, generation activation | [Dexie](https://dexie.org/docs/), [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) |
| Zod | Validation of environment, source and transport boundaries | [Zod](https://zod.dev/) |
| React Hook Form | Accessible validated forms | [React Hook Form](https://react-hook-form.com/) |
| Tailwind (optional) | Styling if justified by the design system | [Tailwind](https://tailwindcss.com/docs) |
| Vitest / React Testing Library | Unit/component tests | [Vitest](https://vitest.dev/guide/), [Testing Library](https://testing-library.com/docs/react-testing-library/intro/) |
| Playwright | Browser/offline/multitab/deployment tests | [Playwright](https://playwright.dev/docs/intro) |

Choose a service-worker generation/registration approach in milestone 2 after compatibility/security review; do not imply a selected PWA plugin yet. Next.js is not required.

### Appwrite infrastructure from MVP

Use the browser Appwrite SDK only in adapters and only for nonsecret permitted operations. Server Node SDK/API keys belong in Functions/controlled operator tools. Select supported runtime/SDK versions during provisioning.

Primary references: [React quick start](https://appwrite.io/docs/quick-starts/react), [Sites React deployment](https://appwrite.io/docs/products/sites/quick-start/react), [regions](https://appwrite.io/docs/products/network/regions), [database products](https://appwrite.io/docs/products/databases), [Storage](https://appwrite.io/docs/products/storage), [Functions](https://appwrite.io/docs/products/functions), [permissions](https://appwrite.io/docs/advanced/security/permissions), [Auth](https://appwrite.io/docs/products/auth), [CLI](https://appwrite.io/docs/tooling/command-line/installation).

Frankfurt is preferred; the final database product/configuration, domain and production settings are open. Auth is later/optional. Public reference reads need no mandatory anonymous session. See [APPWRITE.md](APPWRITE.md).

### Clinical/reference sources

[ANMDMR Nomenclator](https://nomenclator.anm.ro/medicamente) is the canonical initial Romanian source strategy; see [DATA_SOURCES.md](DATA_SOURCES.md) for unresolved rights and [MEDICATION_DATA.md](MEDICATION_DATA.md) for ingestion. RCP/prospect links/data retain exact document provenance.

[ATC/DDD](https://atcddd.fhi.no/atc_ddd_index/) and interaction providers require separate licenses. No Mediately copying. No interaction supplier is selected; assess structured contracts, clinical quality, evidence, versioning and offline redistribution rights. [INTERACTIONS.md](INTERACTIONS.md) defines the vendor-neutral interface.

Clinical calculator implementation needs a formula-specific primary reference, version, units/population limits and tests. SDK documentation cannot supply clinical validation.

### Browser platform references

[Apple iPhone installation](https://support.apple.com/guide/iphone/iphea86e5236/ios), [Apple iPad installation](https://support.apple.com/en-gb/guide/ipad/ipad8f1f7a29/ipados), [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/), [Web App Manifest](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest), [service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API).

Verify Safari installed/tab-mode behavior on real iPhone/iPad. Playwright WebKit alone is not real-device evidence.

### Later cloud/evidence integrations

Google Drive, OneDrive and Dropbox remain BackupProvider candidates, with browser OAuth/server adapter choices reviewed before implementation: [Drive](https://developers.google.com/drive/api/guides/about-sdk), [Microsoft Graph OneDrive](https://learn.microsoft.com/en-us/graph/onedrive-concept-overview), [Dropbox](https://www.dropbox.com/developers/documentation). No Swift-only SDK is required for these PWA integrations.

FHIR-aware models and licensed ICD/LOINC/UCUM/SNOMED CT mappings are later compatibility work, not MVP hospital integration. AI-provider selection is later, privacy-gated and subordinate to [CLINICAL_SAFETY.md](CLINICAL_SAFETY.md).

### Optional future native-client references

Apple Swift/SwiftUI, Xcode, GRDB/SQLite, Vision OCR, Keychain/Secure Enclave, LocalAuthentication, CloudKit, Sign in with Apple and TestFlight are **future native-client references only**, not current PWA dependencies.

Useful primary entry points: [Apple developer documentation](https://developer.apple.com/documentation/), [Swift](https://www.swift.org/documentation/), [GRDB](https://github.com/groue/GRDB.swift), [CloudKit](https://developer.apple.com/documentation/cloudkit), [Vision](https://developer.apple.com/documentation/vision), [LocalAuthentication](https://developer.apple.com/documentation/localauthentication). Preserve these options without promising their semantics in a browser.

## Verification practice

Prefer current primary sources; record consulted date/version and capability limits. Use Context7 for library contracts, then verify against the exact SDK/service version before code changes. No credentials in tool output or committed examples. A planning reference does not authorize deployment, paid subscriptions or clinical-data publication.

## Retained reference catalogue from the earlier SDK guide

The following links preserve useful research from the original local guide. Sections 1–11 and 21–22 are **optional future native-client references only**. The iOS/Swift SDK variants in sections 12–15 are also native-only; choose browser/server adapters separately for PWA work. Standards and source candidates in sections 16–20 are governed by DATA_SOURCES and the current roadmap.

No link below implies verified current capability, data rights, product selection or an MVP dependency. The obsolete native day-one stack and future-only Appwrite recommendation are superseded by the current guide above.

### 1. Apple Core Development

- Xcode
  https://developer.apple.com/xcode/

- Xcode system requirements
  https://developer.apple.com/xcode/system-requirements/

- Swift
  https://docs.swift.org/swift-book/documentation/the-swift-programming-language/

- SwiftUI
  https://developer.apple.com/documentation/swiftui

- Swift Package Manager / Swift Packages in Xcode
  https://developer.apple.com/documentation/xcode/swift-packages

- Foundation
  https://developer.apple.com/documentation/foundation

- URLSession
  https://developer.apple.com/documentation/foundation/urlsession


### 2. Camera, Photos, OCR and Document Scanning

- AVFoundation
  https://developer.apple.com/documentation/avfoundation/

- AVFoundation capture setup
  https://developer.apple.com/documentation/avfoundation/capture-setup

- AVCapturePhotoOutput / photo capture
  https://developer.apple.com/documentation/avfoundation/photo-capture

- Vision
  https://developer.apple.com/documentation/vision

- RecognizeTextRequest
  https://developer.apple.com/documentation/vision/recognizetextrequest

- VisionKit
  https://developer.apple.com/documentation/visionkit

- DataScannerViewController
  https://developer.apple.com/documentation/visionkit/datascannerviewcontroller

- PhotosUI
  https://developer.apple.com/documentation/photosui

- PhotosPicker
  https://developer.apple.com/documentation/photosui/photospicker


### 3. Local Database

- GRDB.swift
  https://github.com/groue/GRDB.swift

- GRDB Swift Package Index
  https://swiftpackageindex.com/groue/GRDB.swift

- SwiftData
  https://developer.apple.com/documentation/swiftdata/


### 4. Encryption and Security

- LocalAuthentication
  https://developer.apple.com/documentation/localauthentication

- Keychain Services
  https://developer.apple.com/documentation/security/keychain-services

- Using Keychain to manage user secrets
  https://developer.apple.com/documentation/security/using-the-keychain-to-manage-user-secrets

- CryptoKit
  https://developer.apple.com/documentation/cryptokit

- FileProtectionType / iOS Data Protection
  https://developer.apple.com/documentation/foundation/fileprotectiontype

- SQLCipher Swift package
  https://github.com/sqlcipher/SQLCipher.swift


### 5. iCloud and Sync

- CloudKit overview
  https://developer.apple.com/icloud/cloudkit/

- CloudKit framework
  https://developer.apple.com/documentation/cloudkit

- CKSyncEngine
  https://developer.apple.com/documentation/cloudkit/cksyncengine-5sie5

- CloudKit private database
  https://developer.apple.com/documentation/cloudkit/ckcontainer/privateclouddatabase


### 6. File Export, Import and Backups

- SwiftUI fileImporter / fileExporter
  https://developer.apple.com/documentation/swiftui/view-presentation

- UIKit document / directory access
  https://developer.apple.com/documentation/uikit/providing-access-to-directories

- Uniform Type Identifiers
  https://developer.apple.com/documentation/uniformtypeidentifiers/


### 7. Background Tasks

- BackgroundTasks
  https://developer.apple.com/documentation/backgroundtasks


### 8. Logging

- Apple unified Logging
  https://developer.apple.com/documentation/os/logging/


### 9. Testing

- Swift Testing
  https://developer.apple.com/documentation/testing

- XCTest
  https://developer.apple.com/documentation/xctest/


### 10. Sign in with Apple — Future

- AuthenticationServices
  https://developer.apple.com/documentation/authenticationservices/

- Sign in with Apple
  https://developer.apple.com/sign-in-with-apple/

- Authenticating users with Sign in with Apple
  https://developer.apple.com/documentation/signinwithapple/authenticating-users-with-sign-in-with-apple


### 11. Apple On-device AI — Future

- Foundation Models
  https://developer.apple.com/documentation/foundationmodels/


### 12. Google Drive and Google Sign-In — Future

- Google Drive API
  https://developers.google.com/workspace/drive/api/guides/about-sdk

- Google Sign-In for iOS
  https://developers.google.com/identity/sign-in/ios/start-integrating


### 13. Microsoft OneDrive — Future

- Microsoft Graph Drive API
  https://learn.microsoft.com/en-us/graph/api/resources/drive?view=graph-rest-1.0

- Microsoft Graph upload file API
  https://learn.microsoft.com/en-us/graph/api/driveitem-put-content?view=graph-rest-1.0

- Microsoft Authentication Library (MSAL)
  https://learn.microsoft.com/en-us/entra/msal/


### 14. Dropbox — Future

- Dropbox Swift SDK
  https://www.dropbox.com/developers/documentation/swift

- SwiftyDropbox API docs
  https://dropbox.github.io/SwiftyDropbox/api-docs/latest/


### 15. Appwrite Apple SDK and self-hosting references — future optional native/operations

- Appwrite docs
  https://appwrite.io/docs

- Appwrite Apple SDK
  https://github.com/appwrite/sdk-for-apple

- Appwrite self-hosting
  https://appwrite.io/docs/advanced/self-hosting


### 16. Medical Interoperability Standards

- HL7 FHIR R5
  https://hl7.org/fhir/

- UCUM
  https://ucum.org/

- UCUM developer artifacts
  https://ucum.org/docs/artifacts

- LOINC
  https://loinc.org/

- LOINC license
  https://loinc.org/kb/license

- WHO ICD API
  https://icd.who.int/icdapi

- WHO ICD API documentation
  https://icd.who.int/docs/icd-api/APIDoc-Version2/

- SNOMED CT access
  https://www.snomed.org/get-snomed

- SNOMED CT licensing
  https://www.snomed.org/licensing


### 17. Romanian Medication Data

- ANMDMR Nomenclatorul medicamentelor
  https://nomenclator.anm.ro/medicamente


### 18. European Medication Data

- EMA Product Management Service (PMS) Public API
  https://api.pms.ema.europa.eu/public/v1/swagger


### 19. Drug Classification

- WHO ATC/DDD Index
  https://atcddd.fhi.no/atc_ddd_index/


### 20. Drug interaction candidate reference — assess for current MVP

- DrugBank API
  https://docs.drugbank.com/v1/


### 21. Apple App Store, Medical App and Privacy Requirements

- App Review Guidelines
  https://developer.apple.com/app-store/review/guidelines/

- Declare regulated medical device status
  https://developer.apple.com/help/app-store-connect/manage-app-information/declare-regulated-medical-device-status/

- Privacy manifests
  https://developer.apple.com/documentation/bundleresources/describing-data-use-in-privacy-manifests

- Managing App Privacy
  https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy

- Encryption / export compliance
  https://developer.apple.com/help/app-store-connect/manage-app-information/determine-and-upload-app-encryption-documentation


### 22. TestFlight and Apple Developer Program

- Apple Developer Program
  https://developer.apple.com/programs/

- Membership comparison
  https://developer.apple.com/support/compare-memberships/

- TestFlight
  https://developer.apple.com/testflight/

- TestFlight beta testing documentation
  https://developer.apple.com/help/app-store-connect/test-a-beta-version/
