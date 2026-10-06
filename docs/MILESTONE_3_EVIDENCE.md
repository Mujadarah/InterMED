# Milestone 3 evidence — Appwrite infrastructure as code (2026-10-06)

This is evidence for **Milestone 3 only**, under
[CODEX_BUILD_PLAN](../plan/CODEX_BUILD_PLAN.md). Milestone 3 delivered Appwrite
infrastructure **as code** behind an injected, vendor-neutral backend-client
interface. **Nothing was provisioned or deployed:** no `appwrite login`,
`appwrite init`, `appwrite pull`, `appwrite push`, `appwrite deploy` and no
Appwrite API call was made, no credential was read, created or stored, and the
existing Milestone 2 static test site (project `6ac4b25b0012379cf3d0`, site
`6ac4b3550003a26eea02`) was not touched. The medication model remains out of
scope: no `MedicationProduct`, `ActiveIngredient`, `MedicationIngredient` or any
other Milestone 4 entity was created here, and no clinical fact appears in any
fixture (all fixtures are synthetic and flagged as such).

Live acceptance therefore remains **pending maintainer approval**; the exact
checks that still need a live project are listed under
[pending live verification](#pending-live-verification).

## Scope and requirement IDs

| Requirement (REQUIREMENTS.md)                                                                           | How this milestone addresses it                                                                                                                    |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| R10 — Appwrite Sites/Functions/database/Storage, Frankfurt                                              | Configuration as code for both environments at `https://fra.cloud.appwrite.io/v1`; provisioning pending                                            |
| R11 — Sites GitHub branch/root/install/build/output/domain, tested SPA deep links                       | [infra/appwrite/SITES.md](../infra/appwrite/SITES.md) plus `sites` config entries; live deep-link test pending                                     |
| R12 — preview/development separated from production                                                     | [decision 0002](decisions/0002-environment-strategy.md): separate projects, separate config files                                                  |
| R13 — public access without account/anonymous session, no public writes                                 | `read("any")` on three published resources only; offline tests assert the complete grant set                                                       |
| R14 — importer/raw/quarantine/logs/keys never public                                                    | Empty grants on private resources; function `execute: []`, `scopes: []`, `vars: []`; secret scan                                                   |
| R15 — database product, schema, indexes, limits, backup/restore, publication model decided and recorded | [decision 0001](decisions/0001-appwrite-database-product.md); limits/backup drill pending live                                                     |
| R16 — no server credentials in bundles; browser identifiers public                                      | Startup validation rejects credential-shaped values; secret scan over config, `.env.example` and build output                                      |
| R17 — Realtime only on demonstrated need                                                                | No Realtime usage anywhere; manifest polling remains the model                                                                                     |
| R18 — local use preserved, no end-user account                                                          | Application behavior unchanged (mock mode)                                                                                                         |
| R19 — Appwrite behind replaceable adapters                                                              | `PublishedDatasetReader` contract in `@intermed/domain`, Appwrite adapter in `@intermed/data-access`                                               |
| R20 — backend/auth logic isolated behind interfaces                                                     | No Appwrite type/identifier outside the adapter; domain stays dependency-free (boundary checker green)                                             |
| R26 — DatasetVersion/DataSource models explicit                                                         | `dataset-versions`/`dataset-bundles`/`import-runs` columns derived field-for-field from DATA_MODEL                                                 |
| R79/R80 — background manifest check, DatasetVersion tracking                                            | Reader contract supplies the manifest metadata (checksum, schema/client versions, counts, coverage, approvals); download/activation is Milestone 6 |
| R84 — immutable published generations, rollback                                                         | Publication/rollback model in decision 0001 and runbook §7.3                                                                                       |
| R124 — reviewed CSP/security headers                                                                    | CSP **unchanged** by instruction; the future `connect-src` need is recorded under [open risks](#open-risks-and-gaps)                               |
| R125 — Functions least privilege, bounded inputs, safe logs                                             | No execute permission, no scopes, no variables, bounded timeout; rate limits pending (no public function exists)                                   |
| R126 — effective Appwrite permissions tested                                                            | Offline grant tests now; live denial matrix scripted in runbook §5                                                                                 |
| R127 — pinning, lockfile, secret scanning in CI                                                         | `zod@4.6.5` pinned exactly, lockfile updated, `npm audit --audit-level=low` clean, secret scan runs inside `npm run test` (and therefore in CI)    |
| R135/R136 — dependency-free domain, contributor mock mode                                               | Domain contract is types-only; mock reader serves flagged synthetic fixtures                                                                       |
| R142/R145 — storage/replaceable providers behind interfaces                                             | Injected `FetchLike` transport and `PublishedDatasetReader` contract                                                                               |

## Deliverable 1 — configuration as code

Files: [`infra/appwrite/`](../infra/appwrite) —
`appwrite.config.development.json` (placeholder project `intermed-dev`),
`appwrite.config.production.json` (placeholder project `intermed-prod`),
`functions/import-anmdmr/` (stub entrypoint) and [`README.md`](../infra/appwrite/README.md)
with [`SITES.md`](../infra/appwrite/SITES.md).

- Format verified against current appwrite.io/docs on 2026-10-06: the CLI project
  file is **`appwrite.config.json`** (`appwrite.json` is legacy), multiple
  environments use `--config-file` / `APPWRITE_CONFIG_FILE` (CLI 28.1.0+), and
  the database product is **TablesDB** with `tablesDB`/`tables` keys and
  rows-per-table semantics. Column/index field names follow the CLI schema
  dispatcher documentation. Sources are listed in
  [infra/appwrite/README.md](../infra/appwrite/README.md).
- Database `intermed-datasets` with `dataset-versions` (public read),
  `dataset-bundles` (public read) and `import-runs` (private). Buckets
  `raw-sources`, `quarantine`, `import-run-logs` (private) and `published-datasets`
  (public read). Function `import-anmdmr` with **no execute permission**, no
  scopes and no variables; its entrypoint returns `stub-not-implemented` and
  performs no ingestion, no writes and no service calls (asserted by test).
- Sites settings are documented and mirrored as `sites` entries (root `apps/web`,
  install `npm ci --prefix .. --no-fund`, build `npm run build`, output `./dist`,
  SPA deep-link fallback `index.html`, static adapter, framework `other`), with
  the monorepo alternative recorded. `appwrite push sites` is excluded from the
  runbook so no routine command can create or change a site.
- No secrets anywhere: `vars`, `scopes` and all identifier fields hold slugs and
  placeholders only.

## Deliverable 2 — offline permission and secret tests

`tests/appwrite-config-permissions.test.ts` (26 tests) and
`tests/appwrite-config-secrets.test.ts` (9 tests) run inside `npm run test`
without network access and assert, for **both** environment files:

- `read("any")` exists on exactly `dataset-versions`, `dataset-bundles` and
  `published-datasets`, and those are the only grants in the whole configuration;
- no create/update/delete/write grant exists for any role, and no `users`,
  `guests`, `user`, `team` or `member` role appears at all — so public reads need
  no account and no anonymous Auth session;
- `raw-sources`, `quarantine`, `import-run-logs` and `import-runs` carry no
  grants (no public read), and the importer function has no public execute, no
  scopes and no variables;
- the importer stub contains no transport/storage/reference-content identifiers;
- neither file references the existing Milestone 2 project or site IDs;
- no credential-shaped string (API-key-like values, key assignments carrying a
  value, long hexadecimal or base64 material) appears in `infra/appwrite/**`,
  `apps/web/.env.example`, the frontend bundle inputs or `apps/web/dist` whenever
  that build output exists. The scan is deterministic: bundle sources are always
  scanned and the built bundle is added when present. Key-shaped values are
  never tolerated anywhere; a long digest is tolerated only when the text before
  it names a public checksum or revision value, because the service worker
  intentionally embeds SHA-256 asset integrity digests and the shell embeds its
  public revision identifier. That bounded rule is itself tested (5 detector
  tests), including that the same digest away from such a marker is still
  reported.

## Deliverable 3 — injected backend client

- **Contract (inward, vendor-neutral):** `@intermed/domain` exports
  `PublishedDatasetReader`, `PublishedDatasetManifest`, `PublishedBundleDescriptor`
  and the explicit `available | absent | unavailable` result type
  (`packages/domain/src/published-dataset.ts`). Pure types only: no fetch,
  storage or Appwrite identifier exists in domain and the dependency-free domain
  manifest check passes. "Absent" (never published / not found) is deliberately
  distinct from "unavailable" (denied / invalid response / transport failure) so
  missing data can never masquerade as an empty catalogue.
- **Mock (contributor mode):** `mockPublishedDatasetReader` in
  `@intermed/data-access` serves one synthetic fixture whose identity strings are
  all flagged synthetic, whose checksums are explicitly not digests and whose
  location is the unresolvable `fixtures.invalid` host. It reports everything
  else as absent and is tested for those properties.
- **Appwrite adapter:** `createAppwritePublishedDatasetReader` in
  `@intermed/data-access` uses an injected `fetch`-like function (plain fetch;
  no Appwrite SDK dependency) against the public TablesDB rows and Storage file
  endpoints. Every request is a GET carrying only the public
  `X-Appwrite-Project` header — no key, no JWT, no session (asserted by test).
  Responses are validated with **Zod 4.6.5** (added to `@intermed/data-access`
  pinned exactly at the lockfile version; `npm audit --audit-level=low` clean)
  and converted to domain types at the boundary. All 13 adapter tests use a fake
  transport; the network is never touched.
- **Public configuration groundwork:** `apps/web/src/config.ts` now accepts the
  optional, all-or-nothing public identifiers `VITE_PUBLISHED_DATASETS_ENDPOINT`,
  `VITE_APPWRITE_PROJECT_ID` and `VITE_APPWRITE_PUBLISHED_BUCKET_ID`
  (placeholders commented out in `apps/web/.env.example`), rejects
  credential-shaped values without echoing them, and keeps `mock` the only
  runtime mode. `services.ts`/`Bootstrap` are unchanged and **no UI screen is
  wired** to any backend; the reader is not composed into the application yet.
- **CSP unchanged** as instructed. A future reader call to a cross-origin
  Appwrite endpoint will need a reviewed `connect-src` change — recorded under
  [open risks](#open-risks-and-gaps), not applied here.

## Deliverable 4 — decision records and runbook

- [decisions/0001-appwrite-database-product.md](decisions/0001-appwrite-database-product.md):
  TablesDB chosen over the legacy Databases API; physical schema, indexes,
  application-enforced references, immutable publication/rollback model,
  required approval references.
- [decisions/0002-environment-strategy.md](decisions/0002-environment-strategy.md):
  separate projects per environment in Frankfurt, identical resource IDs,
  explicit `--config-file` selection, public-only browser identifiers, secrets in
  the server/CI secret store, deployment/rollback pipeline, and the decision not
  to add a GitHub Actions deploy workflow (optional; a manual approved step is
  the stricter control, so no `.github/**` change was made at all).
- [APPWRITE_RUNBOOK.md](APPWRITE_RUNBOOK.md): exact future CLI
  provisioning/push/deploy/rollback commands and an unauthenticated
  effective-permission verification script, each block marked **NOT YET EXECUTED
  — requires maintainer approval**, plus restore drill/retention/monitoring/
  ownership items that are still unassigned.

## Test-first evidence

Logs: [`docs/evidence/milestone-3-2026-10-06/`](evidence/milestone-3-2026-10-06/README.md)
(UTF-8, LF, trailing whitespace stripped).

| Behaviour under test                                | Red (before implementation)                                 | Green (after)                                                |
| --------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------ |
| Offline permission matrix of the configuration      | `01-permissions-red.txt` — config files missing             | `03-permissions-green.txt` — 26 passed                       |
| Secret scan of config/`.env.example`/bundle output  | `02-secrets-red.txt` — config files missing                 | `04-secrets-green.txt` — 4 passed (no build output yet)      |
| Injected reader contract, mock and Appwrite adapter | `05-reader-red.txt` — modules missing                       | `06-reader-green.txt` — 17 passed                            |
| Public config identifiers and credential refusal    | `07-config-red.txt` — 3 failed, 8 existing tests still pass | `08-config-green.txt` — 11 passed                            |
| Entropy detector against real build output          | `09-secret-scan-red.txt` — 3 failed (see below)             | `10-secret-scan-green.txt` — 9 passed (with `apps/web/dist`) |

No test, lint rule, gate or the boundary checker was weakened, skipped or
disabled. The 24 pre-existing tests still pass unchanged.

## Commands and results

Run from the repository root with the pinned Node `24.21.0` / npm `11.19.0`.
Logs are in [`docs/evidence/milestone-3-2026-10-06/`](evidence/milestone-3-2026-10-06/README.md).

| Command                       | Exit code | Result summary                                                    | Log                          |
| ----------------------------- | --------- | ----------------------------------------------------------------- | ---------------------------- |
| `npm run format:check`        | 0         | All matched files use Prettier code style                         | `gates-format-check.txt`     |
| `npm run lint`                | 0         | ESLint clean, zero warnings                                       | `gates-lint.txt`             |
| `npm run typecheck`           | 0         | App/tests/tooling types plus DOM-free domain compile              | `gates-typecheck.txt`        |
| `npm run test`                | 0         | 10 files, **83 tests passed** (24 before this milestone)          | `gates-test.txt`             |
| `npm run check:boundaries`    | 0         | Architecture boundaries passed (23 files; dependency-free domain) | `gates-check-boundaries.txt` |
| `npm audit --audit-level=low` | 0         | found 0 vulnerabilities                                           | `gates-audit.txt`            |
| `npm run build`               | 0         | Vite build succeeded, `apps/web/dist` written                     | `gates-build.txt`            |
| `npm run check`               | 0         | All gates in order including the Playwright browser suite         | `check-final.txt`            |

Test counts by suite added in this milestone: 26 offline permission tests, 9
secret-scan and credential-detector tests, 13 Appwrite-adapter tests, 4
mock-reader tests and 7 new public-configuration tests.

### The preliminary `npm run check` failure and its fix

The first full `npm run check` on this branch **failed (exit 1)** —
[`check-preliminary.txt`](evidence/milestone-3-2026-10-06/check-preliminary.txt)
— because the new secret scan flagged `apps/web/dist/sw.js` for a "long
hexadecimal secret". Inspection showed the eight matches are the shell's own
public SHA-256 asset integrity digests (`SHELL.assets[].hash`), which the worker
uses to reject corrupted assets: a security feature, and public by design. A
second fixture run then exposed a real detector gap: an API key written as a
quoted header name (`"X-Appwrite-Key": "…"`) was not matched.

Both were fixed without weakening the assertion in substance: key-shaped values
are still reported everywhere, and long digests are tolerated only in the
immediate context of a public checksum/revision marker (`hash`, `sha256`,
`checksum`, `integrity`, `digest`, `revision`, `version`). The red run
[`09-secret-scan-red.txt`](evidence/milestone-3-2026-10-06/09-secret-scan-red.txt)
and green run
[`10-secret-scan-green.txt`](evidence/milestone-3-2026-10-06/10-secret-scan-green.txt)
record the change, and the strict detector run also caught the quoted-header
gap. The full `npm run check` then passed on the finished tree
([`check-final.txt`](evidence/milestone-3-2026-10-06/check-final.txt)).

## Code-complete vs pending live

Code-complete and covered by tests now: configuration as code for both
environments; offline permission model and its tests; secret scanning;
injected reader contract, mock and Appwrite adapter with Zod boundary
validation; public configuration validation; decision records and runbook.

### Pending live verification

These Milestone 3 acceptance checks **cannot** be completed without provisioning
and remain open until the maintainer approves live work. They are the exact list
from the build-plan acceptance text plus what the offline tests cannot prove:

1. An authorized test deployment works with the exact recorded settings
   (Sites build settings from `SITES.md`, including the monorepo install command
   variant actually accepted by the build runner).
2. An unauthenticated reader (no account, **no anonymous session**) reads the
   published manifest/bundle resources and **only** those: live read of
   `dataset-versions`, `dataset-bundles` and `published-datasets` succeeds while
   `import-runs`, `raw-sources`, `quarantine` and `import-run-logs` are refused.
3. The same reader cannot write: create/update/delete on published tables and
   bucket files are refused, including table-level create attempts.
4. The reader cannot execute the admin importer (`import-anmdmr` execution
   refused without authorization), and the stub's response/logs contain no key.
5. Effective permissions are tested live at every resource level, including the
   additive table/row and bucket/file behavior described in
   [APPWRITE.md](../plan/APPWRITE.md), and the refusal results are recorded.
6. No server key appears in the built frontend bundle, in function variables, in
   function/site logs or in configuration (bundle inspection of the deployed
   artifact, not only of local `apps/web/dist`).
7. Deep-link SPA fallback (`/status`), manifest scope, `/sw.js` root scope, TLS
   and cache headers verified on the deployed origin.
8. Region/plan confirmation for both projects, quota and cost limits, and a
   backup/restore drill into a scratch project (R15).

### Pending live verification of recorded field values

Recorded from current documentation but not yet confirmed against a live
project/CLI version; correct the configuration if `appwrite pull` output differs:

- function runtime `node-22` and site build runtime `node-22`;
- site `framework: "other"`, `adapter: "static"` and `fallbackFile` semantics;
- column types `text` and `bigint`, enum columns with `elements`, and index
  entries with `columns`/`orders` (multi-column unique in particular);
- bucket fields `antivirus`, `encryption`, `compression` and the maximum-file-size
  bounds as accepted values;
- REST response shape assumed by the adapter: row lists as
  `{ total, rows }` with columns flattened at the row's top level beside the
  `$`-prefixed system fields. Verified against the REST documentation and SDK
  type-safety examples on 2026-10-06; confirm on the first live read and adjust
  `versionRowSchema`/`bundleRowSchema` if the live payload nests columns.

## Conservative decisions taken

1. Table/column optionality follows DATA_MODEL exactly: `recordCounts`,
   `coverage`, `rightsApprovalReference` and `clinicalReviewReference` are
   required columns, so publication-metadata rows cannot exist without recorded
   approvals; staging material stays in private `import-runs`/quarantine.
2. References are application-enforced identifier columns (no platform
   relationship columns) until cascade semantics are assessed.
3. `published-datasets` grants bucket-level `read("any")` with `fileSecurity`
   false, matching "public-read publication boundary"; withdrawal is therefore
   file/row removal plus manifest rollback, never a row-level denial (grant
   semantics are additive).
4. Encryption at rest is enabled only for `import-run-logs`, capped at 16 MiB per
   file because Appwrite cannot encrypt files above 20 MB; the larger private
   buckets keep byte-exact content for checksum verification and rely on
   project-level isolation.
5. File-extension allowlists stay empty until the Milestone 5 bundle format is
   chosen (recorded as a hardening item, not silently decided here).
6. Sites settings are configuration-as-code, but `appwrite push sites` is
   excluded from the runbook so no routine command can create or replace a site.
7. No GitHub Actions deploy workflow was added (optional deliverable; manual
   approved deployment is stricter). `.github/**` is untouched.
8. The secret scan always scans bundle sources and additionally scans
   `apps/web/dist` when it exists, instead of building inside the test run.
9. `docs/DEVELOPMENT.md` got one factual correction to its public-configuration
   paragraph (it claimed `VITE_RUNTIME_MODE` was the only supported value) in
   addition to the new commands, so the documentation stays true.
10. The credential detector tolerates long digests only next to public
    checksum/revision markers (see Deliverable 2), instead of exempting files:
    `sw.js` and `index.html` stay fully scanned.

## Open risks and gaps

- **CSP `connect-src 'self'` (unchanged, as instructed).** The production shell
  CSP meta policy allows same-origin connections only. When a future milestone
  actually calls the Appwrite REST endpoint cross-origin, the CSP needs a
  reviewed `connect-src` addition for that endpoint, and the header-level CSP
  gate (with `frame-ancestors`, CSP on `/sw.js`, `Referrer-Policy`,
  `Permissions-Policy`) remains a Milestone 12 requirement on a header-capable
  host or edge. Nothing in this milestone changed the CSP.
- All live checks in the two lists above are open; Milestone 3 acceptance is
  **not** claimed. No production deployment is implied.
- Field values listed above are documentation-derived and unverified live.
- Operational ownership (release approver, incident owner, retention, cost
  monitoring, alerting) is unassigned and required before production.
- One bundle per dataset generation is assumed by the current descriptor table
  (`datasetVersionId` unique); deltas or multi-bundle generations would need a
  schema extension (deltas are explicitly deferred in the build plan).
- Free-plan quotas and rate limits for future public functions are unmeasured.

## Next gate

Milestone 3 live acceptance requires a fresh, explicit maintainer authorization
to provision the two Frankfurt projects and execute
[the runbook](APPWRITE_RUNBOOK.md). Milestone 4 (medication domain model with
synthetic fixtures) proceeds in parallel under the maintainer's ordering
decision and is unaffected by these files.
