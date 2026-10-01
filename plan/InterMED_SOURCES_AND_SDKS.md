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
