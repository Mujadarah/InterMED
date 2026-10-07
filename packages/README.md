# Package boundaries

Only packages needed by the development web/PWA shell exist today:

| Package/layer                       | Public boundary                                | Responsibility                                                                                                                                                                                                                                                                                  |
| ----------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@intermed/domain`                  | `src/index.ts`, exposed through `exports["."]` | Dependency-free medication catalogue: field state, branded stable ids, provenance, combination expansion, referential integrity, ambiguous identity, and JSON serialization. Also the bootstrap provider contract and the vendor-neutral, read-only published-dataset reader contract           |
| `@intermed/data-access`             | `src/index.ts`, exposed through `exports["."]` | Zod 4.6.5 validation of synthetic medication source documents, an in-memory `MedicationCatalogueSource`, synthetic bootstrap and published-dataset providers, and the Appwrite published-dataset adapter (injected transport, Zod-validated at the boundary). No ambient network or persistence |
| `apps/web/src/application`          | `createServices`                               | Compose injected contracts with validated configuration                                                                                                                                                                                                                                         |
| `apps/web/src/application/shell.ts` | `ShellController`, `ShellState`                | Inject shell status and explicit update/install actions without exposing browser types                                                                                                                                                                                                          |
| `apps/web/src/infrastructure`       | `createBrowserShell`                           | Browser-native service-worker and installation adapter; no clinical persistence                                                                                                                                                                                                                 |
| `apps/web/src/presentation`         | `App`                                          | Accessible navigation and explicit development limitations                                                                                                                                                                                                                                      |
| `apps/web/src/Bootstrap.tsx`        | Composition root                               | Select mock infrastructure and handle invalid startup configuration                                                                                                                                                                                                                             |
| `infra/appwrite`                    | `appwrite.config.<environment>.json`           | Appwrite configuration as code (not provisioned), guarded by offline permission and secret scans                                                                                                                                                                                                |

`apps/web/pwa` contains Node-only production build tooling and the explicit public-shell worker generator; it is not imported into domain or presentation. The application controller is injected through bootstrap and consumed with `useSyncExternalStore`. Synthetic persistence canaries are browser tests only.

Imports between workspaces use only their public package names. Dependencies point inward: data-access depends on domain; domain depends on nothing. The AST boundary checker rejects outward/domain imports, browser/network identifiers and private workspace imports. Domain also has an independent TypeScript compilation with no DOM library or ambient framework types. The check is a bootstrap guard, not a claim of complete static security analysis; extend its negative fixtures as new adapters/layers appear.

The architecture sketch named a future `packages/medication` package. Milestone 4 keeps the medication catalogue in `@intermed/domain` and does not create that package. Interactions, clinical-calculators, ui and test-fixtures remain documented extension points. Create them when their milestone needs an actual public contract. Presentation remains in the app until shared UI is needed. Appwrite Functions/configuration begin in Milestone 3 with separate authority.

No React, Appwrite, Dexie, browser persistence, vendor transport object or clinical rule enters domain. Zod validates the public app configuration and, in `@intermed/data-access` only, synthetic medication source documents and Appwrite transport responses; domain does not import Zod. The published-dataset reader contract in domain is read-only and vendor-neutral; its Appwrite adapter takes an injected `fetch`-like function and is tested with fakes only. Appwrite Functions/configuration live in `infra/appwrite` with separate authority and are not provisioned by this repository's tooling.

Milestone 5's importer core is a separate dependency-light boundary:
`@intermed/importer` in the Milestone 5 implementation branch (port-injected
`stage`/`publish` with a real, unmocked domain pipeline), plus the thin
Appwrite store client and artifact builder under
`infra/appwrite/functions/import-anmdmr`. It consumes domain public exports but
does not change the domain or published-dataset contracts (verified offline
2026-10-07). File, network, Appwrite, credential, clock, and logging behavior
belongs behind injected ports; the Function adapter is not a domain dependency.
Synthetic source validation and private staging remain outside the browser
shell. The Function handler/authority layer and final integration are still
pending. See
[the Milestone 5 evidence record](../docs/MILESTONE_5_EVIDENCE.md) and its
[evidence pack](../docs/evidence/milestone-5-synthetic-2026-10-07/README.md).
