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

Through 2026-10-06 this milestone was configuration-as-code only (no
provisioning). On **2026-10-07** the owner approved creation of a separate
Frankfurt development project and limited read-only checks; the honest status of
each live acceptance item is under
[Live verification (development project)](#live-verification-development-project-2026-10-07).
**Milestone 3 live acceptance is not claimed.**

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
  install `npm ci --prefix ../.. --no-fund`, build `npm run build`, output
  `./dist`, SPA deep-link fallback `index.html`, static adapter, framework
  `other`), with the monorepo alternative recorded. `appwrite push sites` is
  excluded from the runbook so no routine command can create or change a site.
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

## Review fixes (2026-10-06 review)

A reviewer reported three findings against this milestone. Each was fixed
test-first — the failing test first, captured in
[`red-review-fixes.log`](evidence/milestone-3-2026-10-06/red-review-fixes.log),
then the implementation with
[`green-review-fixes.log`](evidence/milestone-3-2026-10-06/green-review-fixes.log)
— and still with **no live Appwrite call** of any kind. The full gate list was
re-run afterwards and is captured in
[`check-after-review.log`](evidence/milestone-3-2026-10-06/check-after-review.log).
Suite sizes after the fixes: `tests/appwrite-config-permissions.test.ts` 26 → 32
tests, `tests/appwrite-config-secrets.test.ts` 9 → 10, Appwrite adapter 13 → 15;
`npm run test` runs **92 tests** across 10 files (83 before this review).

### 1 (High) — Appwrite query JSON shape

- **Finding:** in `packages/data-access/src/appwrite-published-dataset-reader.ts`
  `equalQuery` serialised `{"method":"equal","column":…,"values":[…]}` and
  `orderDescQuery` serialised `{"method":"orderDesc","values":["publishedAt"]}`,
  so the outgoing `queries[]` parameters did not use the Appwrite REST query
  format.
- **Verified source (not guessed):**
  [`src/query.ts` of `appwrite/sdk-for-web`](https://raw.githubusercontent.com/appwrite/sdk-for-web/main/src/query.ts)
  — the `Query` class of the official web SDK (the published `appwrite@28.1.0`
  bundles the same class and serialises through `json-bigint`, whose `stringify`
  drops object members that stay `undefined`, exactly like `JSON.stringify`).
  `Query.toString()` always emits `{ method, attribute, values }`, so for
  TablesDB the wire strings are:
  - `Query.equal('dataset', 'demo')` →
    `{"method":"equal","attribute":"dataset","values":["demo"]}`
  - `Query.orderDesc('publishedAt')` →
    `{"method":"orderDesc","attribute":"publishedAt"}`
  - `Query.limit(1)` → `{"method":"limit","values":[1]}` (this one was already
    correct)
- **Fix:** `equalQuery` emits `attribute` and `orderDescQuery` emits `attribute`
  without `values`. Two new adapter tests decode the `queries[N]` parameters
  exactly as the server reads them and compare the **byte-exact** SDK strings
  (equal, orderDesc and limit for the manifest query; equal and limit for the
  bundle query), and the existing request-URL assertion was corrected to the
  verified shape. A wrong shape now fails the suite — the red log shows the
  `column`/`values` mismatch for both.

### 2 (Medium) — secret-scan public-digest exemption

- **Finding:** the public-digest exemption in `tests/support/secret-scan.ts`
  triggered on a `version`-like word anywhere in a 64-character window, so
  `{"version": "1.0", "secret": "0123456789abcdef…(64 hex)…"}` passed the scan.
- **Fix:** `version` — and the bare word `revision` — are gone from the marker
  set. A high-entropy value is now tolerated only in a genuine checksum context
  bound to the value's own label or prefix:
  - it is directly labelled by a checksum field: `hash` (the shell build
    manifest's digest field names, i.e. `SHELL.assets[].hash` in
    `apps/web/dist/sw.js`), `checksum`, `integrity`, `digest`, `md5` or
    `sha1`/`sha256`/`sha384`/`sha512`, in plain, quoted or backslash-escaped
    JSON/JS syntax, or
  - it carries an explicit `sha256-`/`sha384-` subresource-integrity prefix, or
  - it fills the shell's public revision metadata attribute
    `<meta name="intermed-shell-revision" content="…">` (exact attribute name
    required).

  A word that merely appears nearby — `version`, `revision`, `id`, `name` —
  never exempts anything.

- **Tests:** a negative test with exactly the reviewer's string plus `id`,
  `name` and `revision` neighbours behind secret-looking key names (`secret`,
  `apiKey`, `token`) and the `version:`/`revision =` direct-label forms, while
  the positive tests are kept: real shell asset digests and the shell revision
  metadata are not flagged, the same digest away from a checksum context still
  is, and key shapes are never tolerated anywhere.

### 3 (Medium) — missing security-flag assertions

- **Finding:** `tests/appwrite-config-permissions.test.ts` asserted grants only
  and never looked at `rowSecurity` (tables) or `fileSecurity` (buckets) — the
  field names of the current config format.
- **Fix:** explicit expected values per resource, in three tests per
  environment: `dataset-versions`, `dataset-bundles` and `published-datasets`
  must keep `rowSecurity`/`fileSecurity` `false` and carry `read("any")`, so the
  public read is granted at the resource level and never relies on per-row or
  per-file grants; `import-runs`, `raw-sources`, `quarantine` and
  `import-run-logs` must keep the flags `false` (no per-row/per-file grant is
  documented, and one would bypass their empty `$permissions`) and carry no
  grant at all; and every table and bucket must appear in the expectations, so a
  new resource cannot escape them. Each assertion is `toBe(false)` and therefore
  fails on a flipped **or** dropped flag.
- This finding was a coverage gap rather than a wrong configuration: both config
  files already carried the expected `false` flags. The red run is therefore an
  **induced mutation**, recorded as such in `red-review-fixes.log`: four flags
  were flipped temporarily (`dataset-versions.rowSecurity` and
  `published-datasets.fileSecurity` in development, `import-runs.rowSecurity`
  and `import-run-logs.fileSecurity` in production) to show the new assertions
  fail on a flip, and the configuration was restored right afterwards
  (`git status` shows no `infra/appwrite` change in the final tree). A second
  short run flips only the two `fileSecurity` flags because the test loops stop
  at the first failure.

### Gates after the review fixes

All logs above were captured with the pinned Node `24.21.0` / npm `11.19.0`;
every run is recorded with its exit code inside
[`check-after-review.log`](evidence/milestone-3-2026-10-06/check-after-review.log).

| Command                    | Exit code | Result summary                                                                                                  |
| -------------------------- | --------- | --------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`     | 0         | All matched files use Prettier code style                                                                       |
| `npm run lint`             | 0         | ESLint clean, zero warnings                                                                                     |
| `npm run typecheck`        | 0         | App/tests/tooling types plus DOM-free domain compile                                                            |
| `npm run test`             | 0         | 10 files, **92 tests passed** (83 before this review)                                                           |
| `npm run check:boundaries` | 0         | Architecture boundaries passed (23 files; dependency-free domain)                                               |
| `npm run build`            | 0         | Vite build succeeded, `apps/web/dist` written                                                                   |
| `npm run check`            | 0         | Full gate list incl. `npm audit --audit-level=low` (0 issues) and the 135 Playwright browser tests (135 passed) |

Code-complete and covered by tests now: configuration as code for both
environments; offline permission model and its tests; secret scanning;
injected reader contract, mock and Appwrite adapter with Zod boundary
validation; public configuration validation; decision records and runbook.

### Live verification (development project) — 2026-10-07

Evidence pack:
[`docs/evidence/milestone-3-live-2026-10-07/`](evidence/milestone-3-live-2026-10-07/README.md)
(`observations.json`, `cli-preflight.md`, `markdown-inventory.md`,
`buckets/**`, `tables/**`, `function-checks/**`, `scanner-review/**`,
`site-probes/**`). Baseline
`f167d439fe3d608b99fb130ee314b2bbf68798f1` (= live `origin/main`). **No overall
Milestone 3 live acceptance claim.**

#### Verified lead/owner facts (public ids only)

- Owner approved development project creation on 2026-10-07. Lead ran
  `npx --yes appwrite-cli@28.1.0 organization create-project --organization-id 6abdb0c92ffbb4c7fdf6 --project-id intermed-dev --name "InterMED Development" --region fra --json`
  → **exit 0**; active `intermed-dev`, `$createdAt`
  `2026-10-07T08:35:00.440+00:00` (11:35 Bucharest). Connector confirmed
  name/region/active and **zero** tablesdb/storage/functions/sites/users.
  Regional API `https://fra.cloud.appwrite.io/v1`.
- Org plan `organizations_get_plan` → name **GitHub Student Pack**, id
  `auto-1`, projects limit **2**, price **0**. Shell project already occupied
  one slot; `intermed-dev` fills the second. **No** billing/paid/production
  changes. Future production needs a separate capacity decision. No fallback
  sharing of the shell project.
- Owner keeps shell project `6ac4b25b0012379cf3d0` / site `6ac4b3550003a26eea02`
  unchanged; only read-only origin checks authorized.
- Owner approved the development resource checks. Bucket push/pull, TablesDB
  push/pull, the function stub deployment, the bounded anonymous GET matrix,
  and the two approved function checks are recorded in the evidence pack.
  One fictional synthetic generation and ten total synthetic/guard objects
  were also created; the real adapter read its manifest and descriptor.
  The first 39-check permission matrix remains failed/inconclusive: it used
  an invalid storage update method, accepted an unexpected descriptor 200
  no-op, masked private guard existence with 404, and did not fail fast.
  The corrected 39-check probes passed 39/39 without aborting; the private
  `import-runs` GET remains a masked 404 rather than a strict 401/403 proof.
  The owner's first repeat was conditional: it observed the public descriptor
  as an identical-data 200 no-op, with no private 2xx and no successful
  create/delete. A later owner-approved cleanup executed the exact seven-object
  plan; all seven delete commands exited 0, and the owner-side repeat recorded
  only requested-row/file-not-found messages with exit 1. The published
  version/bundle/file `aba05ea1b8fc3e49f18d517b` remained present. The final
  saved-script adapter read passed for the expected manifest and descriptor,
  selected no guard, and recorded two REST requests.
- `storage list-buckets --config-file infra/appwrite/appwrite.config.development.json --json`
  → exit 0, `total` 0, `buckets` `[]`. `functions list-runtimes` (same config)
  → exit 0, lists **node-22** and **node-24** as supported (availability only,
  not a deployed runtime on `intermed-dev`).
- Shell `sites_list`: site `6ac4b3550003a26eea02` framework `other`, adapter
  `static`, `fallbackFile` `index.html`, `buildRuntime` `node-22`, empty
  install/build, output `./`, deployment `6ac4e58c6e620fd5dd84` ready — does
  **not** prove the recorded monorepo Sites build. The latest approved retry used the configured pinned
  bootstrap, but the cloud host reported npm `12.0.2` and the Node `24.21.0`
  binary never started (`fcntl64: symbol not found`). The CLI exited 0 while
  deployment `6ac6226495b5ff1a3249` is recorded as failed; no successful
  deployment is claimed. The existing shell remains unchanged.
- CLI: global 13.3.2 unsigned; work used `npx --yes appwrite-cli@28.1.0`. Owner
  ran login; lead whoami saw console endpoint; no secrets recorded.
- Markdown: Antigravity audited all **36** tracked Markdown files — no
  controlling contradictions. Grok audit failed (usage exhausted); **not**
  claimed passed.
- Preflight “rename `$permissions`” finding is **FALSE** (official CLI maps
  `$permissions` → `permissions`); see
  [`cli-preflight.md`](evidence/milestone-3-live-2026-10-07/cli-preflight.md).

#### Acceptance items 1–8

| #   | Check                                                                        | Command / probe                                                       | Results (summary)                                                                                                                                                                                                                                                                                                                                                                | Status                        |
| --- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 1   | Authorized test deployment with exact recorded `SITES.md` settings           | Development Sites push, deployment readback, pinned-runtime build log | Deployment `6ac62b9286ef77aa3a78` is **ready**. Install and build succeeded with Node `v24.21.0` / npm `11.19.0`; edge distribution completed `6/6`. The live site fields and declared fields have zero differences; the pull export omits `enabled`, which was verified by direct GET.                                                                                          | **PASS (bounded)**            |
| 2   | Unauthenticated reader reads only published resources                        | Anonymous TablesDB/Storage GETs and real adapter read                 | Adapter read returned the available synthetic manifest and descriptor; public reads and private-resource denials were recorded. The bounded matrix retains the private `import-runs` masked 404 limitation; the published version/file remained untouched by cleanup.                                                                                                            | **PASS (bounded)**            |
| 3   | Unauthenticated writes refused                                               | Initial and corrected 39-check matrices                               | Initial run remains failed/inconclusive: descriptor PATCH was HTTP 200 but identical/no-op, storage updates used PATCH and returned 404, and the helper continued after an unexpected 200. Corrected probes passed 39/39 with no abort; the private 404 remains a masked refusal rather than a strict status proof.                                                              | **PASS (corrected, bounded)** |
| 4   | Admin importer execution refused; stub reveals no key                        | Unauth POST plus approved CLI stub execution                          | Unauth POST returned HTTP 401 `user_unauthorized`. Approved CLI execution returned stub HTTP 501, failed execution status, exact stub log, and no variables; this is bounded stub evidence, not importer acceptance.                                                                                                                                                             | **PASS (bounded)**            |
| 5   | Effective permissions at every resource level                                | Live denial matrix (runbook §5)                                       | Corrected probes passed 39/39; the owner-approved cleanup then executed all seven exact deletes (CLI exit 0), and the owner-side repeat returned only requested-row/file-not-found messages. The final adapter read passed with the expected version in both manifest and descriptor and no guard selected. The private 404 remains a masked refusal, not a strict status proof. | **PASS (bounded)**            |
| 6   | No server key in deployed bundle / vars / logs / config                      | Sanitized deployed-bundle scan plus deployment variables/readback     | The final scan covered 11 actual deployed HTML, manifest, service-worker, and referenced asset files and found no credential-shaped strings. Variables are empty; source archive entries contain only the public env example.                                                                                                                                                    | **PASS (bounded)**            |
| 7   | Deep-link `/status`, manifest scope, `/sw.js` root scope, TLS, cache headers | curl + Playwright on the successful development deployment            | Preview `/status` returned the Development status heading; TLS verification, manifest root scope, active/controller root service worker, and all recorded HTTP 200 checks passed. Cache-Control is `public, max-age=0, must-revalidate`; immutable long-cache remains a policy risk. Browser proof only; not real-device/installed acceptance.                                   | **PASS (bounded)**            |
| 8   | Region/plan confirmation (development)                                       | `organization create-project`, plan read                              | Development **fra** + Student Pack (`auto-1`, projects=2) confirmed. Production capacity and backup/restore are wider roadmap items deferred outside this task.                                                                                                                                                                                                                  | **PASS**                      |

#### Recorded-field checks

| Field / assumption                                                        | Command / probe                               | Results                                                                                                                                                                                                                                                                                                                                                                                                        | Status                          |
| ------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Function runtime `node-22`; site build runtime `node-22`                  | function readback; shell site                 | Deployed function readback reports runtime node-22 and ready deployment; shell `buildRuntime` node-22. Supported runtimes also include node-24.                                                                                                                                                                                                                                                                | **PASS (development function)** |
| Site `framework: "other"`, `adapter: "static"`, `fallbackFile`            | Shell `sites_list`                            | Observed on shell site only; monorepo runner unproven                                                                                                                                                                                                                                                                                                                                                          | **PARTIAL**                     |
| Column types `text`/`bigint`, enum `elements`, indexes `columns`/`orders` | push/pull tables                              | Three tables pushed and pulled; declared table, column, and index properties compare with difference count 0.                                                                                                                                                                                                                                                                                                  | **PASS**                        |
| Bucket `antivirus` / `encryption` / `compression` / max sizes             | push/pull buckets                             | Four buckets pushed and pulled; expected declared fields compare with zero differences.                                                                                                                                                                                                                                                                                                                        | **PASS**                        |
| REST `{ total, rows }` with flattened columns                             | anonymous TablesDB read and adapter recording | The root adapter recordings show non-empty `{ "total": 1, "rows": [...] }` responses with flattened manifest and descriptor columns; see [`rest-1.json`](evidence/milestone-3-live-2026-10-07/adapter-published-recording/rest-1.json) and [`rest-2.json`](evidence/milestone-3-live-2026-10-07/adapter-published-recording/rest-2.json). Public empty-table reads also returned `{ "total": 0, "rows": [] }`. | **PASS (recorded shape)**       |

#### Corrected probe and cleanup status

The corrected probe pack is under
[`publication-live/`](evidence/milestone-3-live-2026-10-07/publication-live/):
`corrected-anonymous-probes.json` and its summary record 39/39 passed with no
abort; the six first-run failures are mapped to their corrected probes in
[`first-to-corrected-probes.md`](evidence/milestone-3-live-2026-10-07/publication-live/first-to-corrected-probes.md);
and `corrected-run-owner-condition.json` records that the owner's first
repeat was conditional, not an independent anonymous write/private-read pass;
and `corrected-guard-before-after.json` records all seven guard objects
unchanged after parsed-field comparison. The first matrix remains retained as
failed/inconclusive evidence, with a corrected-probe link for each failure.

Cleanup is executed. The exact seven-object plan is
[`cleanup-plan.md`](evidence/milestone-3-live-2026-10-07/publication-live/cleanup-plan.md)
and [`cleanup-plan.json`](evidence/milestone-3-live-2026-10-07/publication-live/cleanup-plan.json).
It targets only the disposable guard rows/files in `intermed-dev`; the
published version, bundle, and file `aba05ea1b8fc3e49f18d517b` were explicitly
excluded and remain present in `cleanup-live/preserved-*.json`. The seven CLI
deletes exited 0, while the owner-side repeat exited 1 with the exact
requested-row/file-not-found messages. The final saved-script adapter read is
in `adapter-final-after-cleanup/verification.json`; it passed, selected no
guard, and recorded two REST calls. The earlier inline multiline invocation
exited 0 without records because Windows argument handling lost the script and
is not treated as evidence.

The successful corrected probes and the successful development Sites deployment
do not make overall Milestone 3 live acceptance complete. The final deployment
is bounded development evidence only. Production is untouched; production
bootstrap packages must be pinned by integrity hash before any production work.
npm/Windows bootstrap integrity and production capacity/backup/restore remain
deferred roadmap gates.

## PR #7 review fixes

Four findings against [PR #7](https://github.com/Mujadarah/InterMED/pull/7) were
fixed test-first where they were behaviour: the failing runs are
[`red-pr7.log`](evidence/milestone-3-2026-10-06/red-pr7.log) and the passing
ones [`green-pr7.log`](evidence/milestone-3-2026-10-06/green-pr7.log), still
with **no live Appwrite call** of any kind. All gates and the full
`npm run check` were re-run afterwards and captured in
[`check-after-pr7.log`](evidence/milestone-3-2026-10-06/check-after-pr7.log).
`npm run test` now runs **103 tests** across 12 files (92 across 10 before this
round): `tests/appwrite-config-secrets.test.ts` 10 → 14 tests, plus the new
`tests/appwrite-sites-install.test.ts` (2) and `tests/scan-dist-secrets.test.ts`
(5). No test, lint rule, gate or the boundary checker was weakened or skipped.

1. **Secrets check — secret-shaped literals in committed source.** The fake
   credential fixtures of `apps/web/src/config.test.ts` and
   `tests/appwrite-config-secrets.test.ts` were committed as plain literals
   (key-shaped `standard_…` strings, long hexadecimal strings, an
   `APPWRITE_API_KEY=…` line). Every one of them is now assembled at runtime —
   `['standard', '_', 'f'.repeat(32)].join('')`, `'ab'.repeat(32)` and
   template/value constructions — so no key-shaped literal remains in any file
   while the tests assert exactly the same detections. Verbatim fixture values
   that earlier runs had printed into
   [`09-secret-scan-red.txt`](evidence/milestone-3-2026-10-06/09-secret-scan-red.txt)
   and
   [`red-review-fixes.log`](evidence/milestone-3-2026-10-06/red-review-fixes.log)
   are replaced with `<redacted synthetic fixture>` (assertion text kept), as
   noted in the
   [evidence README](evidence/milestone-3-2026-10-06/README.md). A re-grep of
   the whole diff against `ffa7c51` for `standard_[A-Za-z0-9]{8,}` and bare 40+
   hexadecimal literals finds none left in this branch's files outside the
   public shell digests quoted by pre-existing historical documents.
2. **Sites install path (Greptile P1).** `npm ci --prefix .. --no-fund` ran with
   `apps/web` as the working directory and therefore targeted `apps/`, which has
   no `package.json` and no lockfile. Both configuration files now install with
   `npm ci --prefix ../.. --no-fund`, which resolves from `apps/web` to the
   repository root holding the single root `package-lock.json`
   ([SITES.md](../infra/appwrite/SITES.md) explains the variant). The offline
   test `tests/appwrite-sites-install.test.ts` asserts for both environments that
   the configured prefix resolves to the lockfile directory.
3. **Regex flags dropped (Greptile P2).** `findCredentialShape` rebuilt each
   pattern with `'g'` only, silently dropping its `i` flag, so a lowercase or
   mixed-case `"x-appwrite-key": "…"` or `appwrite_api_key=…` was missed. The
   matcher now keeps every existing flag and appends `g`; four new tests cover
   lowercase and mixed-case key header and variable assignments (red log: all
   four failed before the fix).
4. **Built bundle never scanned in CI (Greptile P2).** `npm run check` runs
   `npm run test` before `npm run build`, so the test suite's opportunistic scan
   of `apps/web/dist` was skipped on a fresh checkout.
   `scripts/scan-dist-secrets.mjs` reuses the same detector and runs as
   `npm run scan:dist`, wired into `npm run check` directly after
   `npm run build`; it **fails** when the build output is missing instead of
   skipping and reports file names and pattern labels only. Five tests cover
   missing, clean and credential-carrying build output plus the `check`/CI
   wiring. `.github/**` is unchanged: CI already runs `npm run check`, so the
   scan runs there after the build.

| Command                       | Exit code | Result summary                                                             | Log                   |
| ----------------------------- | --------- | -------------------------------------------------------------------------- | --------------------- |
| `npm run format:check`        | 0         | All matched files use Prettier code style                                  | `check-after-pr7.log` |
| `npm run lint`                | 0         | ESLint clean, zero warnings                                                | `check-after-pr7.log` |
| `npm run typecheck`           | 0         | App/tests/tooling types plus DOM-free domain compile                       | `check-after-pr7.log` |
| `npm run test`                | 0         | 12 files, **103 tests passed** (92 before this round)                      | `check-after-pr7.log` |
| `npm run check:boundaries`    | 0         | Architecture boundaries passed (23 files; dependency-free domain)          | `check-after-pr7.log` |
| `npm audit --audit-level=low` | 0         | found 0 vulnerabilities                                                    | `check-after-pr7.log` |
| `npm run build`               | 0         | Vite build succeeded, `apps/web/dist` written                              | `check-after-pr7.log` |
| `npm run scan:dist`           | 0         | 9 files scanned, no credential-shaped strings                              | `check-after-pr7.log` |
| `npm run check`               | 0         | Full gate list in order plus the 135 Playwright browser tests (135 passed) | `check-after-pr7.log` |

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
- Live items 1–7 are **PASS (bounded)** in the development evidence pack; the
  corrected permission matrix retains a masked private 404 limitation and the
  successful Sites deployment retains the observed no-immutable-cache risk.
  Item 8 is **PASS** for development region/plan confirmation only. Milestone 3
  live acceptance is **not** claimed. No production deployment is implied.
- Most recorded field values remain unverified live; runtime/framework notes
  above are availability or shell-site observations only.
- Operational ownership (release approver, incident owner, retention, cost
  monitoring, alerting) is unassigned and required before production.
- One bundle per dataset generation is assumed by the current descriptor table
  (`datasetVersionId` unique); deltas or multi-bundle generations would need a
  schema extension (deltas are explicitly deferred in the build plan).
- Org capacity is **GitHub Student Pack** (`auto-1`, projects limit 2, both
  slots used by shell + `intermed-dev`). Production capacity and future public
  function rate limits remain deferred roadmap work.
- Hashed shell assets on the existing origin serve
  `Cache-Control: public, max-age=0, must-revalidate` with no `immutable`
  long-cache — residual risk until a reviewed header policy is confirmed on the
  intended development Sites deployment.

## Next gate

Development project `intermed-dev` exists; remaining Milestone 3 live acceptance
still requires explicit maintainer authorization for push/pull, permission
probes, publishing, and any Sites deployment that proves the recorded monorepo
settings. Production capacity is a separate deferred roadmap decision before
`intermed-prod`.
See [the runbook](APPWRITE_RUNBOOK.md). Milestone 4 proceeds under the
maintainer's ordering decision and is unaffected by these files.
