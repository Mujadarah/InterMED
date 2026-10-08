# Package boundaries

Only packages needed by the development web/PWA shell exist today:

| Package/layer                       | Public boundary                                | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@intermed/domain`                  | `src/index.ts`, exposed through `exports["."]` | Dependency-free medication catalogue: field state, branded stable ids, provenance, combination expansion, referential integrity, ambiguous identity, and JSON serialization. Also the bootstrap provider contract and the vendor-neutral, read-only published-dataset reader contract                                                                                                                                                                                                                                                           |
| `@intermed/data-access`             | `src/index.ts`, exposed through `exports["."]` | Zod 4.6.5 validation of synthetic medication source documents, an in-memory `MedicationCatalogueSource`, synthetic bootstrap and published-dataset providers, and the Appwrite published-dataset adapter (injected transport, Zod-validated at the boundary). No ambient network or persistence                                                                                                                                                                                                                                                 |
| `@intermed/local-store`             | `src/index.ts`, exposed through `exports["."]` | IndexedDB/Dexie repositories and the local dataset update pipeline: versioned schema, immutable per-generation catalogue rows, staging with one atomic pointer switch, generation-pinned readers, rollback and safe retention/garbage collection, independent preferences (favorites, recent searches, tombstones) and single-writer coordination. Depends on `@intermed/domain` and `dexie` only; browser storage globals are allowed here. Only `apps/web/src/Bootstrap.tsx` and the test-only `apps/web/src/dev/**` harness may construct it |
| `apps/web/src/application`          | `createServices`                               | Compose injected contracts with validated configuration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `apps/web/src/application/shell.ts` | `ShellController`, `ShellState`                | Inject shell status and explicit update/install actions without exposing browser types                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `apps/web/src/infrastructure`       | `createBrowserShell`                           | Browser-native service-worker and installation adapter; no clinical persistence                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `apps/web/src/presentation`         | `App`                                          | Accessible navigation and explicit development limitations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `apps/web/src/Bootstrap.tsx`        | Composition root                               | Select mock infrastructure and handle invalid startup configuration                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `infra/appwrite`                    | `appwrite.config.<environment>.json`           | Appwrite configuration as code (not provisioned), guarded by offline permission and secret scans                                                                                                                                                                                                                                                                                                                                                                                                                                                |

`apps/web/pwa` contains Node-only production build tooling and the explicit public-shell worker generator; it is not imported into domain or presentation. The application controller is injected through bootstrap and consumed with `useSyncExternalStore`. Synthetic persistence canaries are browser tests only.

Imports between workspaces use only their public package names. Dependencies point inward: data-access and local-store depend on domain; domain depends on nothing. The AST boundary checker rejects outward/domain imports, browser/network identifiers and private workspace imports, and confines `@intermed/local-store` to the app composition root and the test-only harness. Domain also has an independent TypeScript compilation with no DOM library or ambient framework types. The check is a bootstrap guard, not a claim of complete static security analysis; extend its negative fixtures as new adapters/layers appear.

The architecture sketch named a future `packages/medication` package. Milestone 4 keeps the medication catalogue in `@intermed/domain` and does not create that package. Interactions, clinical-calculators, ui and test-fixtures remain documented extension points. Create them when their milestone needs an actual public contract. Presentation remains in the app until shared UI is needed. Appwrite Functions/configuration begin in Milestone 3 with separate authority.

No React, Appwrite, Dexie, browser persistence, vendor transport object or clinical rule enters domain. Zod validates the public app configuration and, in `@intermed/data-access` only, synthetic medication source documents and Appwrite transport responses; domain does not import Zod. The published-dataset reader contract in domain is read-only and vendor-neutral; its Appwrite adapter takes an injected `fetch`-like function and is tested with fakes only. The local dataset store is the only module that touches IndexedDB (through `dexie`): domain defines the vendor-neutral ports it implements (`LocalCatalogueStore`, `DatasetGenerationRepository`, `GenerationReader`, `DatasetUpdateState`, `LocalPreferencesStore`, `PublishedBundleLoader`) and never mentions a storage vendor, so a later change to the published-dataset contract stays confined to those contracts and the update pipeline. Appwrite Functions/configuration live in `infra/appwrite` with separate authority and are not provisioned by this repository's tooling.

Milestone 5's importer core is a separate dependency-light boundary:
`@intermed/importer` in the Milestone 5 implementation branch (port-injected
`stage`/`publish` with a real, unmocked domain pipeline), plus the thin
Appwrite store client and artifact builder under
`infra/appwrite/functions/import-anmdmr`. It consumes domain public exports but
does not change the domain or published-dataset contracts (verified offline
2026-10-07). Producer/reader compatibility is also verified offline: core
publication output projects into the `@intermed/data-access` Appwrite
published-dataset reader, with no M6 acceptance and no cryptographic
bundle-hash activation claim. File, network, Appwrite, credential, clock, and
logging behavior
belongs behind injected ports; the Function adapter is not a domain dependency.
Synthetic source validation and private staging remain outside the browser
shell. The repaired Function handler/authority layer and offline integration
checks are verified (2026-10-08, full repair run at `9a40644`). The historical
offline handler repair proof at `9a40644` — 744 unit tests in 47 files and 150
browser tests — **remains valid**, while the **current** PR13 (the three new P1
repairs, the retry-identity repairs and the Codacy fixes) is **root-verified
offline at the public head `474353181d899fb1e889d18ee96e82816784cfb4`, with
no overall acceptance claim**: `npm run check` passed **809 unit tests in 48
files plus 150 browser tests, exit 0**, clean tree before and after, on the
pinned Node `v24.21.0` / npm `11.19.0` with the actual Node `v22.23.2` flow
through `INTERMED_NODE22_RUNTIME`. GitHub Actions run `37765213291` has **both
jobs SUCCESS** (Ubuntu `113271078278`, Windows `113271077989`), and Codacy
Static Code Analysis, DeepSource Secrets and CodeRabbit are **SUCCESS on the
same head** (provider facts from the GitHub API job logs); every code/runtime
bot thread is replied/resolved, with only the CodeRabbit contributor status
`4217007131` pending this documentation update. The first full run at that
head died in a **native Windows process crash during Vitest** and recorded no
valid result; the repeated, unchanged run passed and is the accepted proof.
The **final documentation head's CI must be reverified by root — no future
head PASS is claimed**. The newly confirmed P1
regression was first recorded as 17 FAIL against the original source at the
root's immutable `613c055`, but one of those 17 was an invalid test-harness
error (a SHA-port probe passed the bare `sha256Hex` function instead of the
`{ hash }` port object), not a production defect, so the invalid failure is
not defect proof and the genuine original failures are 16. The corrected
tests-only corpus `6fff95f` — production untouched — rerun against the
original, unchanged `861fe81` production records 22 failures and 172 passing
controls of 194, all 22 genuine defect assertions, and that corrected run is
now **root-verified**. Milestone 5 performs no live Appwrite change — no live
schema change, deployment, staging, execution or publication (GitHub reads
happened; no Appwrite actions); Milestone 6 stays with its issue 12 owner in
a separate PR for the validator SHA-256/data-quality notes, the canonical
`datasetVersionId` persistence data-access mapping and the offline Appwrite
512 capacity configuration remain **future live schema requiring separate
owner approval — not issue #12** — and the domain, type and contract
boundaries listed above are unchanged. All other milestone setup and
documentation is untouched, keeping this repair minimal so it does not collide
with the parallel owner M6 PR. The final documentation head's CI recheck by
root and the owner merge remain pending; live actions and approvals stay
blocked. See
[the Milestone 5 evidence record](../docs/MILESTONE_5_EVIDENCE.md) and its
[evidence pack](../docs/evidence/milestone-5-synthetic-2026-10-07/README.md).
