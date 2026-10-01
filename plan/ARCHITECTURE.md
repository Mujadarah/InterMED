# InterMED architecture

## Canonical system

The first-party client is a responsive, installable PWA built with React, TypeScript and Vite. React Router handles navigation; TanStack Query coordinates remote metadata/provider requests; Dexie abstracts IndexedDB; Zod validates boundaries; React Hook Form supports forms. Tailwind is optional. Next.js is not required absent a concrete architectural need.

Appwrite Cloud begins as infrastructure, preferably Frankfurt/EU: GitHub-connected Sites serve the application, Functions ingest/validate data, normalized database services store reference entities, and Storage serves permitted immutable dataset bundles. Accounts are optional later. Reference search runs locally, not through a request on every keystroke. Realtime is not a default dependency.

The runtime relationships are:

```text
GitHub reviewed application revision → Appwrite Sites → PWA application shell
ANMDMR / licensed interaction source → private Functions → normalized database
                                              ↓ validated publication
                                    immutable Storage datasets + version manifest
                                              ↓ background download/validation
PWA search / details / checker ← active IndexedDB generation (Dexie)
```

These are intended components, not existing implementation. A verified legal permission and clinical-content approval gate precede real-data publication.

## Clean boundaries

1. Domain: vendor-neutral entities, ingredient resolution, interaction result semantics, deterministic calculators and rules. No React, browser storage or Appwrite SDK imports.
2. Application: use cases, coverage decisions, validation, dataset activation and orchestration through injected provider interfaces.
3. Infrastructure: Dexie repositories, Appwrite adapters, importer parsers, source adapters, network/clock/hash facilities.
4. Presentation: React views, responsive UI, accessible warnings and source/version display. No clinical rules embedded in view components.

Shared schemas validate external inputs and transport DTOs; SDK-specific objects must be converted at the infrastructure boundary. A module's public contract and domain tests must remain usable with synthetic providers and without cloud credentials.

## Proposed structure

This is a target layout for future implementation; do not scaffold it during the planning revision.

```text
InterMED/
├── apps/web/
├── packages/
│   ├── domain/
│   ├── medication/
│   ├── interactions/
│   ├── clinical-calculators/
│   ├── data-access/
│   ├── ui/
│   └── test-fixtures/
├── appwrite/
│   ├── functions/
│   │   ├── import-anmdmr/
│   │   ├── sync-medications/
│   │   └── interactions/
│   └── configuration/
├── plan/
├── docs/
├── scripts/
├── tests/
└── README.md
```

Domain dependencies point inward. Medication and interactions share canonical ingredient identifiers through explicit contracts, not private adapter implementation. Clinical-calculators has independent formula versions. Later clinical state/pathway/evidence packages must not force patient storage into the medication MVP.

## Provider contracts

| Interface | Responsibility and required behavior |
| --- | --- |
| MedicationCatalogProvider | Versioned product/ingredient lookup, search and regulatory references; returns missing/unresolved fields explicitly |
| DrugInteractionProvider | Structured ingredient-set evaluation; source vocabulary, provenance and coverage; distinguishes unavailable from no reported record |
| GuidelineProvider | Later licensed/versioned evidence retrieval |
| AIProvider | Later constrained explanation/extraction; never clinical authority |
| AuthenticationProvider | Later optional account/session capabilities and deletion; absent in anonymous MVP |
| BackupProvider | Later encrypted versioned export/import, separate from synchronization |
| RemoteCaseStore | Later permitted patient storage after privacy/compliance gate |

AnmdmrMedicationAdapter, AppwriteRemoteStore and GoogleDriveBackupAdapter/DropboxBackupAdapter/OneDriveBackupAdapter are infrastructure candidates. Provider substitution must not require rewriting domain logic. Account identity, dataset access and patient identity are separate concepts.

## Data and offline responsibilities

MedicationProduct is distinct from ActiveIngredient; MedicationIngredient is their normalized join. Stable source identifiers and source versions preserve lineage. RegulatoryDocument references are not assumed to include licensed cached document bodies. Interaction records carry source-specific severity, evidence and management only when supplied.

On startup, open local data first, then check the published dataset manifest in the background. Download and validate outside IndexedDB transactions, stage an immutable generation, then atomically switch the active pointer. Readers pin one generation. Interrupted downloads, invalid data or quota failures retain the previous working generation. See [PWA_OFFLINE.md](PWA_OFFLINE.md) for multitab handling, compatibility and rollback.

The service worker controls application-shell releases, not clinical dataset truth. SW and dataset versions are independent, with a compatibility contract. IndexedDB is not guaranteed permanent or encrypted storage: browser eviction/private-mode restrictions must be acknowledged and tested.

## Backend and permissions

Choose the final Appwrite database product/configuration during milestone 3. TablesDB is a candidate for typed normalized tables; the physical schema, indexes, transactions and limits require a decision record against the current hosted service. Domain normalization does not depend on a vendor's table/document API.

Publish only approved reference manifests/bundles with public read permission. No public writes; raw imports, logs, review queues and credentials stay private. Appwrite table-level grants cannot be treated as row-level denials: audit effective permissions at every resource level. Server keys bypass resource permissions within their scopes, so Functions enforce their own authorization and validation.

[APPWRITE.md](APPWRITE.md) specifies Sites configuration, least privilege, API keys and deployment boundaries. [DATA_SOURCES.md](DATA_SOURCES.md) controls rights. No patient data or mandatory anonymous Auth session are part of medication dataset delivery.

## Security and extensibility

Use HTTPS, reviewed CSP/security headers, untrusted-text sanitization, validated inputs, server-only secrets, endpoint rate limits and safe logs. Avoid logging medication query contents, identities or future patient facts. Clinical content imports require both technical validation and content governance.

Later patient data require an explicit encryption/key-management, retention/deletion/export, access-control and hosting/compliance design. A browser PIN or WebAuthn session is not a claim of native biometric/database security. Browser XSS risk must be included in that design.

Preserve FHIR-aware clinical models, terminology licensing checks, longitudinal observations, optional identifiers, deterministic pathway signals and evidence/rule versions. Cloud backup is separate from real-time sync and requires visible conflicts and recovery semantics.

## Platform scope

Native iOS/iPadOS application development is cancelled, not deferred. iPhone and iPad remain supported through Safari and the installable PWA. No native-client modules, SDKs, build pipelines or cloud-sync adapters are planned.

