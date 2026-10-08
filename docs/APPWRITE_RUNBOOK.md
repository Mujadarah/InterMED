# Appwrite operations runbook

## Execution status (dated)

### Historical baseline — through 2026-10-06

Milestone 3 produced configuration-as-code and offline tests only. Through that
date no `appwrite login`, `appwrite init`, `appwrite pull`, `appwrite push`,
`appwrite deploy` or Appwrite API call was made by the milestone work, no
credential was stored in the repository, and the Milestone 2 shell project was
untouched. Treat older “everything NOT YET EXECUTED” wording as that baseline.

### Executed subset — 2026-10-07 (development only)

Owner personally approved development project creation and ran interactive CLI
login. Lead used `npx --yes appwrite-cli@28.1.0` (not the unsigned global
13.3.2). Evidence:
[`docs/evidence/milestone-3-live-2026-10-07/`](evidence/milestone-3-live-2026-10-07/README.md).

| Action                                                                                      | Result                                                                                                   | Status                                          |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Owner `login` + lead whoami / endpoint confirmation                                         | Console endpoint seen; **no secrets recorded here**                                                      | EXECUTED                                        |
| `organization create-project … --project-id intermed-dev --region fra --json`               | exit 0; active project; `$createdAt` `2026-10-07T08:35:00.440+00:00`                                     | EXECUTED                                        |
| Plan read                                                                                   | GitHub Student Pack `auto-1`; projects limit 2 (shell + `intermed-dev`); price 0                         | EXECUTED                                        |
| `storage list-buckets --config-file infra/appwrite/appwrite.config.development.json --json` | exit 0; total 0                                                                                          | EXECUTED                                        |
| `functions list-runtimes` (same config)                                                     | exit 0; node-22 and node-24 **supported**                                                                | EXECUTED                                        |
| Read-only shell site metadata + public HTTP/Playwright probes                               | See live evidence pack `site-probes/`                                                                    | EXECUTED                                        |
| `push` / `pull` buckets, tables, functions                                                  | Development evidence in `buckets/`, `tables/`, and `function-checks/`                                    | EXECUTED                                        |
| Synthetic publication / real adapter metadata read                                          | Ten fictional synthetic/guard objects; final post-cleanup adapter read passed                            | **PASS (bounded)**                              |
| Unauthenticated writes / non-empty CRUD matrix                                              | Initial matrix failed/inconclusive; corrected probes passed 39/39; exact seven approved deletes exited 0 | **PASS (corrected, bounded); CLEANUP EXECUTED** |
| Bounded anonymous empty-resource GET matrix                                                 | Public resources 200 empty; private resources 401; evidence `scanner-review/`                            | **PASS (bounded)**                              |
| Admin stub execution + unauthenticated execution denial                                     | 501 deliberate stub; unauthenticated POST 401; evidence `function-checks/`                               | PASS (bounded)                                  |
| Production project / billing / paid capacity                                                | —                                                                                                        | **NOT DONE**                                    |
| Shell project `6ac4b25b0012379cf3d0` / site `6ac4b3550003a26eea02` changes                  | Owner forbids changes; read-only checks only                                                             | UNCHANGED                                       |

Remaining sections below keep exact future commands. Blocks that have **not**
run stay marked pending. Do not rewrite untested steps as verified.

Commands follow the current CLI documentation
([installation](https://appwrite.io/docs/tooling/command-line/installation),
[tables](https://appwrite.io/docs/tooling/command-line/tables),
[buckets](https://appwrite.io/docs/tooling/command-line/buckets),
[functions](https://appwrite.io/docs/tooling/command-line/functions),
[sites](https://appwrite.io/docs/tooling/command-line/sites)). Flag names must be
confirmed with `appwrite <command> --help` at execution time and the exact
invocation recorded in the evidence log. Prefer
`npx --yes appwrite-cli@28.1.0` (or a later pinned exact version) over an
unsigned older global install.

## 1. Preconditions

- Written maintainer approval naming: environment (development/production),
  scope (which sections below), and the release approver.
- Pinned Node `24.21.0` for repository work; Appwrite CLI **28.1.0 or later**
  (needed for `--config-file`).
- The reviewed commit of `infra/appwrite/` that will be applied.
- An Appwrite account in the organization that owns the Frankfurt region
  projects, and a named incident owner.
- Capacity awareness: org is on **GitHub Student Pack** with **two** project
  slots already used (shell + `intermed-dev`). Creating production requires a
  separate capacity decision — **no** paid/billing change without explicit
  owner approval.

> **Partial — local toolchain check still required at each execution**

```powershell
node --version   # v24.21.0
npm --version    # 11.19.0
npx --yes appwrite-cli@28.1.0 -v   # record the exact version used
```

## 2. Credentials

- The CLI authenticates with interactive `login` (owner) or with a project API
  key passed on the command line from an environment variable whose value lives
  only in the shell/CI secret store. Never write a key into a file, a commit, a
  command block or a log. **Do not paste session tokens, API keys, or whoami
  secret material into evidence.**
- Server keys are created with least-privilege scopes and a documented rotation
  date. Functions receive theirs at execution time; the repository holds no
  variable for it (`vars` is empty in the configuration and enforced by tests).
- Treat `apps/web/.env.*` values as public even if private-looking; the startup
  validation rejects credential-shaped values.
- Never pass global `--show-secrets`. Prefer `pull function --no-code` and never
  `--with-variables` for routine drift checks.

> **Login EXECUTED by owner on 2026-10-07; subsequent sessions still require owner credentials — do not record them**

```powershell
npx --yes appwrite-cli@28.1.0 client --endpoint https://fra.cloud.appwrite.io/v1
npx --yes appwrite-cli@28.1.0 login
npx --yes appwrite-cli@28.1.0 client --debug   # confirm endpoint and project; prints no key
```

## 3. Provision the environment projects

Create one project per environment in **Frankfurt** (see
[decision 0002](decisions/0002-environment-strategy.md)). Development project
**`intermed-dev` already exists** (created 2026-10-07). Production
`intermed-prod` is **deferred** until capacity is decided. Do **not** run
`appwrite init project` against the committed files: it rewrites the config.
Never touch the existing Milestone 2 test project `6ac4b25b0012379cf3d0` or site
`6ac4b3550003a26eea02`. Do not use the shell project as a fallback development
backend.

> **Development create-project EXECUTED 2026-10-07. Production create PENDING capacity decision. Reads below remain useful for confirmation.**

```powershell
# Development (already created — confirm only):
npx --yes appwrite-cli@28.1.0 organization get-project --organization-id 6abdb0c92ffbb4c7fdf6 --project-id intermed-dev
npx --yes appwrite-cli@28.1.0 project get --project-id intermed-dev

# Production — NOT AUTHORIZED until capacity/billing decision:
# npx --yes appwrite-cli@28.1.0 organization create-project --organization-id 6abdb0c92ffbb4c7fdf6 --project-id intermed-prod --name "InterMED Production" --region fra --json
```

## 4. Apply the resource configuration

Order matters: buckets and tables before the function that addresses them. Run
the block for one environment only, and record the output. CLI 28.1.0 accepts
singular resource names; aliases `buckets` / `tables` / `functions` are valid.
`--config-file` is required (28.1.0+).

> **EXECUTED 2026-10-07 — development only; owner-approved**

```powershell
npx --yes appwrite-cli@28.1.0 push buckets --all --config-file infra/appwrite/appwrite.config.development.json --force
npx --yes appwrite-cli@28.1.0 push tables --all --config-file infra/appwrite/appwrite.config.development.json --force
npx --yes appwrite-cli@28.1.0 push functions --function-id import-anmdmr --force --config-file infra/appwrite/appwrite.config.development.json
```

The first bucket command without `--all` exited 1 because a non-interactive
terminal could not answer the resource-selection prompt; the corrected
`--all` command exited 0 and pushed all four buckets. Bucket and table pull
logs, plus the declared-definition comparison, are in the evidence pack.
Function pull used `--no-code`; variable listing used the default redacted
output and returned zero variables. These commands modified only
`intermed-dev`, never production or the shell project.

`appwrite push sites` is deliberately **excluded**: it would create a _new_ site
from the `sites` entry instead of configuring the existing shell host. Sites
settings are applied as described in
[infra/appwrite/SITES.md](../infra/appwrite/SITES.md). The existing shell site
remains prebuilt (empty install/build); the real monorepo Sites runner remains
an open verification item. Review drift before and after any change into a
**scratch** config file (do not overwrite reviewed files blindly):

> **EXECUTED 2026-10-07 — scratch readback only**

```powershell
npx --yes appwrite-cli@28.1.0 pull buckets --all --force --config-file <scratch-development.json>
npx --yes appwrite-cli@28.1.0 pull tables --all --force --config-file <scratch-development.json>
npx --yes appwrite-cli@28.1.0 pull functions --all --no-code --force --config-file <scratch-development.json>
# never --with-variables
git diff --no-index infra/appwrite/appwrite.config.development.json <scratch-development.json>
```

The scratch pull exited 0. All expected bucket fields and every declared table,
column, and index property compared with zero differences. The live snapshot is
retained under `function-checks/`; response metadata such as generated IDs and
status fields is not treated as declared configuration.

## 5. Effective-permission verification (live acceptance)

Run unauthenticated, with **no** API key and **no** session, against the
development project first. Expected results are part of the Milestone 3 live
acceptance record; anything else is a failure to investigate, not a warning.

The offline probe uses materially different valid row updates and `PUT` for
Storage file updates (`updateFile`). An unexpected `2xx` on any write or on a
private read aborts the matrix immediately and records the checks that were
not run. A private row `404` with `row_not_found` may be counted as a masked
refusal only when the caller supplies explicit owner-verified existence for
that exact table/row pair; `400` and unverified `404` responses remain
failures.

> **PASS — bounded development checks executed 2026-10-07**

```powershell
$api = 'https://fra.cloud.appwrite.io/v1'
$project = 'intermed-dev'

# Public manifest read: expect HTTP 200 and an empty rows list before publication.
curl.exe -s -D - "$api/tablesdb/intermed-datasets/tables/dataset-versions/rows?queries[0]={%22method%22:%22limit%22,%22values%22:[1]}" -H "X-Appwrite-Project: $project"

# Private import-run metadata: expect an authorization error, never rows.
curl.exe -s -D - "$api/tablesdb/intermed-datasets/tables/import-runs/rows?queries[0]={%22method%22:%22limit%22,%22values%22:[1]}" -H "X-Appwrite-Project: $project"

# Public write attempt: expect an authorization error.
curl.exe -s -D - -X POST "$api/tablesdb/intermed-datasets/tables/dataset-versions/rows" -H "X-Appwrite-Project: $project" -H "Content-Type: application/json" -d "{\"dataset\":\"synthetic-fixture-demo\"}"

# Private raw material: expect an authorization error for listing and download.
curl.exe -s -D - "$api/storage/buckets/raw-sources/files" -H "X-Appwrite-Project: $project"

# Admin importer execution: expect an authorization error.
curl.exe -s -D - -X POST "$api/functions/import-anmdmr/executions" -H "X-Appwrite-Project: $project" -H "Content-Type: application/json" -d "{}"
```

Record for each call: request, HTTP status, response body and the effective
permissions shown in the Console. Repeat against production only after the
development matrix passes. This is the live proof for R13, R14, R25 and R126.

The executed bounded GET matrix is in `scanner-review/`: public
`dataset-versions`, `dataset-bundles`, and `published-datasets` returned HTTP
200 with empty results; private `import-runs`, `raw-sources`, `quarantine`, and
`import-run-logs` returned HTTP 401. The initial 39-check guard/write matrix is
retained as failed/inconclusive: descriptor PATCH was an identical HTTP 200
no-op, storage updates used PATCH and returned 404, private guard GETs returned
`row_not_found`, and the helper continued after an unexpected 200.

The corrected matrix is recorded in
`publication-live/corrected-anonymous-probes.json` and its summary: **39/39
checks passed, with no abort**. The corrected run proves expected
unauthenticated denials where the response is available; the private
`import-runs` GET remains a masked 404 and is not reclassified as a strict
401/403 proof. The owner's first repeat was conditional, not an independent
matrix pass: it saw only an identical public descriptor 200 no-op, with no
private 2xx and no successful create/delete. All seven guard objects were
unchanged on parsed-field comparison, including permissions and timestamps.
This is completed bounded development evidence. Production, restore,
real-device, immutable-cache, and clinical validation remain out of scope or
future follow-ups.

### 5.1 Guard cleanup — executed with owner approval

After the corrected probes and evidence review, the owner gave **separate
approval** for the exact seven-object cleanup plan at
`publication-live/cleanup-plan.md` and `.json`. The seven exact commands
exited 0; the owner-side repeat exited 1 with only the CLI's requested-row/
file-not-found messages. Do not infer HTTP statuses or error types from those
messages. The published version, bundle, and file
`aba05ea1b8fc3e49f18d517b` remained untouched, as shown by the preserved
readbacks in `cleanup-live/`. The final saved-script real-adapter read passed:
the expected version appeared in both manifest and descriptor, no guard was
selected, and two REST requests were recorded. The inline multiline `npx eval`
attempt exited 0 without records due to Windows argument loss and is not proof.

## 6. Deploy the web shell

Intended flow: reviewed `main` revision → Appwrite Sites → HTTPS PWA, with the
settings in [infra/appwrite/SITES.md](../infra/appwrite/SITES.md) (root
`apps/web`, install/build/output, `index.html` SPA fallback). Build locally with
the pinned runtime before any manual upload, and never upload source, dependency
folders, environment files or credentials.

Read-only probes of the **existing** shell origin
`https://intermed-shell-test.appwrite.network` on 2026-10-07 (deep link, TLS,
manifest/SW scopes, observed cache headers) are recorded in
[`docs/evidence/milestone-3-live-2026-10-07/site-probes/`](evidence/milestone-3-live-2026-10-07/site-probes/).
Those probes are historical shell evidence and are not the development
deployment record or real-device acceptance.

> **Final approved development Sites retry succeeded 2026-10-07**

Deployment `6ac62b9286ef77aa3a78` is ready. The pinned bootstrap log records
successful install and build with Node `v24.21.0` / npm `11.19.0`, followed by
successful edge distribution to `6/6`. The deployment readback records the
reviewed install/build commands, output directory, static adapter and SPA
fallback. The export comparison reports a synthetic `enabled: null` difference
because the pull omits that field; direct GET verified `enabled: true`, so this
is not live drift. Full sanitized records are in
`evidence/milestone-3-live-2026-10-07/site-musl-live/`.

The official Node `24.21.0` Linux x64 musl archive and gzip checksum are
recorded in `site-retry/` and `site-musl-live/`. This deployment proves the requested development path only; production remains
untouched and its bootstrap integrity gates remain future production
follow-ups.
Before production, every bootstrap package must be pinned by integrity hash;
the Linux artifact is hash-verified, while npm and Windows bootstrap integrity
remain follow-up gates.

```powershell
npm ci --no-fund
npm run build
# Git-connected site: pushing to the production branch creates and activates the
# deployment. Manual upload alternative (built output only):
npx --yes appwrite-cli@28.1.0 sites create-deployment --site-id intermed-web-prod --code apps/web/dist
npx --yes appwrite-cli@28.1.0 sites get --site-id intermed-web-prod
```

Post-deploy checks passed in the bounded development scope: `/status` served
the Development status heading; `/sw.js` was active and controlling at root
scope; the manifest id/start/scope were `/`; TLS verification and HTTP 200
checks passed; and the deployed-bundle scan found no credential-shaped strings
in 11 actual deployed files. Observed asset headers are
`public, max-age=0, must-revalidate`, so immutable long-cache policy remains an
open risk. The earlier public-shell strict-scan failure is retained as
historical evidence; it is not conflated with the final clean deployed-bundle
scan.

## 7. Rollback

### 7.1 Shell rollback

> **NOT YET EXECUTED — requires maintainer approval**

```powershell
npx --yes appwrite-cli@28.1.0 sites list-deployments --site-id intermed-web-prod
npx --yes appwrite-cli@28.1.0 sites update-site-deployment --site-id intermed-web-prod --deployment-id <RETAINED_HEALTHY_DEPLOYMENT_ID>
```

Retain at least the previous healthy deployment; never activate a knowingly
corrupted artifact. Verify the rolled-back shell identity on `/status` and
re-run the offline launch check.

### 7.2 Function rollback

> **NOT YET EXECUTED — requires maintainer approval**

```powershell
npx --yes appwrite-cli@28.1.0 functions list-deployments --function-id import-anmdmr
npx --yes appwrite-cli@28.1.0 functions update-function-deployment --function-id import-anmdmr --deployment-id <RETAINED_DEPLOYMENT_ID>
```

### 7.3 Dataset publication rollback

Published generations are immutable. To withdraw a bad generation: mark its
`dataset-versions` row `withdrawn`, remove its bundle file from
`published-datasets`, and re-point the publication to the `previousVersionId`
generation. Copies already downloaded by clients cannot be recalled.

> **NOT YET EXECUTED — requires maintainer approval**

```powershell
npx --yes appwrite-cli@28.1.0 tablesdb update-row --database-id intermed-datasets --table-id dataset-versions --row-id <BAD_VERSION_ID> --data '{"status":"withdrawn"}'
npx --yes appwrite-cli@28.1.0 storage delete-file --bucket-id published-datasets --file-id <BAD_FILE_ID>
npx --yes appwrite-cli@28.1.0 tablesdb get-row --database-id intermed-datasets --table-id dataset-versions --row-id <PREVIOUS_VERSION_ID>
```

Then re-run the unauthenticated manifest read and confirm it serves the previous
generation, and record the withdrawal with its reason and approver.

## 8. Restore drill, retention and operations (open before production)

| Item                  | Requirement                                                                                         | Status                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Backup/restore drill  | Export the database and a bucket, restore into a scratch project, verify checksums and counts (R15) | Not scheduled — needs approval                         |
| Retention             | Raw snapshots and quarantine: agreed retention; run logs: bounded size and rotation                 | Not assigned                                           |
| Source failure alerts | Alert on failed/empty/suspicious imports and rights expiry                                          | Not assigned                                           |
| Release approver      | Named approver for publication and deployment                                                       | Not assigned                                           |
| Cost monitoring       | Quota/cost thresholds for both projects                                                             | Student Pack slots full; production capacity undecided |
| Incident owner        | Named owner and contact for rollback/incidents                                                      | Not assigned                                           |
| Rate limits           | Per-function limits for any future public function (R125)                                           | Not applicable until a public function exists          |
| Key rotation          | Rotate on staff change/exposure; audit key list quarterly                                           | Not scheduled                                          |

## 9. Secrets incident response (summary)

Rotate the exposed key in the Console, delete the old key, review usage logs for
the exposure window, check the repository history and build output with the
secret scan (`npx vitest run tests/appwrite-config-secrets.test.ts`), and record
the incident with dates, scope and approver. Software rollback cannot erase
copies already distributed. Never commit recovered key material into evidence
logs.

## 10. Milestone 5 synthetic importer — concrete future owner-approved procedure

> **NOTHING IN THIS SECTION HAS BEEN EXECUTED.** Every step needs its own
> written owner approval, and each approval is recorded separately. The live
> `import-anmdmr` Function is still the deliberate 501 stub; no M5 live check,
> staging, execution, deployment, publication, cleanup, or **schema migration**
> has been authorized or run. **M5 acceptance is not claimed**: the handler
> repair is verified offline at `01f7a4556e17608edb0865bacb3d421d23550847`
> (root immutable full: 634 tests / 38 files / 135 browser, exit 0, Node
> `v24.21.0` / npm `11.19.0` and official Node `v22.23.2`, including the real
> compiled Node 22 stage → publish → retry path and the real public-reader
> canonical round trip), and the final combined root run at `4cbc9ed` with M6
> main merged also passed (734 / 46 / 150, exit 0); the **final independent
> whole-patch static review at `4cbc9ed` is ACCEPTED at 0 reproducible blockers**
> (bounded `git log` / `git diff` / patch analysis) while **CI/PR are pending** —
> and that accepted review is now **superseded by two root-confirmed findings**
> (**F1** stale-baseline resume bypass, **F11** asymmetric stored-manifest
> `recordCounts`); the source is **not repaired yet**, so nothing here is
> ready and section 10.0.1 records the **F2** lock recovery prerequisite.
> The superseded `0c16177` root failure (5 of 598) and the `0266d8` RED run
> (whose middle "canonical must equal the physical `$id`" assertion is an
> invalid root assumption) are preserved as history. The owner-approved M6
> coordination issue **is posted**: <https://github.com/Mujadarah/InterMED/issues/12>;
> its two gaps (the FNV-only versus public SHA-256 hard reject and the
> `invalid-unit` / `ambiguous-decimal` note handling) are **not fixed here**, and
> root's portable repro rerun is RED 3/3 as expected with the temporary test
> removed. Commands
> below are exact Appwrite CLI **28.1.0**
> invocations (verified with `--help` and the public CLI docs on 2026-10-07) and
> match the handler schema actually implemented in the handler worktree; confirm
> each flag with `npx --yes appwrite-cli@28.1.0 <command> --help` at execution
> time and record the exact invocation. All examples use fictional synthetic
> material only, contain **no key values**, and are not executable evidence.

**Credential rules (owner terminal only).** The owner authenticates with the
interactive `login` command in their own terminal. A key never appears in a
command line argument, a log, a file, or this runbook; `--show-secrets` is never
used; `appwrite client --key …` (non-interactive key mode) is deliberately **not**
used here. The Function's `INTERMED_SERVER_KEY` is an I/O credential the owner
provisions through the Console function-variables screen in their own
authenticated session (never via a CLI `--value` flag). Public `execute: []`
stays unchanged.

### Storage-schema prerequisite (future owner approval — NOT EXECUTED)

> **PREREQUISITE BEFORE 10.3 (deploy) AND BEFORE ANY NEW PUBLICATION.**
> **Nothing here has been executed, and no live field is confirmed.** The
> canonical dataset-identity mapping exists only as code in
> `infra/appwrite/appwrite.config.development.json` and
> `infra/appwrite/appwrite.config.production.json`; no M5 worker, review, or
> probe altered a live table. Production does not exist in this workstream and
> is never touched.

What the migration would apply, in `intermed-dev` only, under its own written
owner approval (recorded as its own approval, separate from 10.1–10.8):

- `dataset-versions.datasetVersionId` — **optional** string column, max **512**,
  with the **nullable** unique index `datasetVersionId_unique` on
  `datasetVersionId`.
- `dataset-bundles.datasetVersionId` — capacity extended to **512**, and
  `dataset-versions.previousVersionId` — capacity extended to **512**, so
  canonical `dv U+001Fsource U+001Fgenkey` ids fit.
- Physical row `$id` values are **unchanged** (safe, `≤ 36`,
  `/^[A-Za-z0-9._-]{1,36}$/`); no existing row, bucket, permission, or manifest
  field is rewritten.

Ordering and safety rules:

1. Apply with the same reviewed pattern as
   [section 4](#4-apply-the-resource-configuration)
   (`push tables --all --config-file … --force`, development config only) and
   capture the output; never run it against production or the shell project.
2. Verify read-only afterwards: the new column and index exist, existing rows
   read back with `datasetVersionId: null`, and the public list envelope is
   unchanged. Legacy M3 published rows without the canonical attribute stay a
   **bounded legacy fallback** — the reader uses `$id` only when the attribute
   is missing or `null` and **rejects** a present-but-malformed value.
3. **No deploy (10.3) and no publication (10.6) may run before this migration
   is applied and verified**, because a new publication persists the canonical
   `datasetVersionId` on its descriptor and manifest rows.
4. Rollback is metadata-only and needs its own approval: the canonical column
   is additive, and no published object is created or deleted by the migration.

### 10.0 Verified handler contract (source of truth for the steps below)

Documented from the handler source at `0c16177`; the repaired head is
`01f7a4556e17608edb0865bacb3d421d23550847` (offline-verified, root full exit 0) — **re-read the source at `01f7a45` before executing**, and confirm any
bound it changed. In particular the `01f7a45` API report states that
`isVersionId` accepts canonical ids up to **512** characters including `U+001F`
and rejects control codes `< 0x20` and `0x7F`, which widens the `≤ 256`
`candidateVersionId` bound recorded below from `0c16177`:

- Trusted runtime context (read from environment only, no header fallback):
  `APPWRITE_ENDPOINT` must be `https://fra.cloud.appwrite.io/v1`,
  `APPWRITE_FUNCTION_PROJECT_ID` must be `intermed-dev`,
  `APPWRITE_FUNCTION_ID` must be `import-anmdmr`. `INTERMED_SERVER_KEY` must
  exist. `INTERMED_SYNTHETIC_PUBLISH_ENABLED` must be exactly `true` or any
  `op-publish-…` reference fails `publication-disabled`.
- Request envelope: `POST` with body exactly `{"operationId":"<reference>"}`
  (≤ 2048 bytes). Reference pattern `^op-(stage|publish)-[a-z0-9][a-z0-9-]{0,43}$`;
  the `op-stage-`/`op-publish-` prefix binds the operation kind.
- Authority document: one owner-created private JSON file in the
  `import-run-logs` bucket, file name exactly
  `op-intent-v1.<operationId>.json`, file id `oid1<32 hex>` where the hex is the
  first 32 characters of
  `sha256("intermed-op-intent-file/v1|<operationId>")`. Any other name is
  rejected.
- Stage intent (`"purpose": "intermed-synthetic-stage/v1"`), exact keys:
  `purpose`, `operationId` (`op-stage-…`), `issuedAt` (UTC instant
  `YYYY-MM-DDTHH:MM:SS[.mmm]Z`), `dataset` (≤ 100), `syntheticOnly: true`,
  `rawSnapshotFileId` (≤ 36, `[a-zA-Z0-9][a-zA-Z0-9.\-_]*`), `rawSnapshotSha256`
  (64 lowercase hex), `config`.
- Publish intent (`"purpose": "intermed-synthetic-publish/v1"`), exact keys:
  `purpose`, `operationId` (`op-publish-…`), `stageOperationId` (`op-stage-…`),
  `issuedAt`, `dataset`, `version` (≤ 100), `candidateVersionId` (≤ 256),
  `candidateSha256`, `rawSnapshotSha256` (both 64 lowercase hex),
  `baselineVersionId` + `baselineFingerprint` (both `null` for a first
  generation, otherwise `sha256:<64 hex>`), `approvedBy` (≤ 200),
  `approvalReference` (≤ 500), `approvedAt` (UTC instant — this value pins the
  publication time so retries present the identical publication),
  `operationalApproval: true`, `largeRemovalApproval` (boolean), `config`.
- `config` (exact 11 keys): `sourceKey` (≤ 100), `sourceVersion` (≤ 200),
  `schemaVersion` (≤ 50), `importerVersion` (≤ 50), `parserVersion` (≤ 50),
  `parserEncoding` (`utf-8`/`utf8`/`windows-1250`), `syntheticAllowlist`
  (1–20 keys, includes `sourceKey`), `largeRemovalCount` (integer 1–1000000),
  `largeRemovalPercent` (0–100), `maxRawBytes` (integer 1–5242880), `maxRows`
  (integer 1–1000000).
- Handler-written evidence (never owner-written): `candidate-v1.<cnd1…>.json`,
  `stage-review-v1.<rev1…>.json`, `quarantine-v1.<reason>.raw`, and the
  `import-runs` run row.
- Responses carry constant codes only: `staged`, `quarantined`, `published`,
  `already-published` (200); `envelope-invalid` (400); `method-not-allowed`
  (405); `runtime-credential-missing` (401); `runtime-context-rejected`,
  `publication-disabled`, `operation-rejected` (403); `operation-unknown`
  (404); `publication-busy`, `publication-collision`, `stale-baseline` (409);
  `backend-error`, `operation-failed` (500). Bodies add only 12-hex derived
  refs (`operationRef`, `runRef`, `datasetVersionRef`) and a bounded summary.

### 10.0.1 Publication-lock owner recovery (F2) — prerequisite, NOT EXECUTED

The persistent `lock` row in the `import-runs` table is **deliberate
fail-closed behavior**: the publisher never steals a lock, so if an instance
dies between acquire and release every later publish returns `publication-busy`
(409) until the owner removes that one row. **Never use TTL-based lock
stealing, and never execute anything from this subsection from this document —
nothing here has been executed.** Each step below needs its own written owner
approval, recorded separately:

1. **Prevent new executions** and **prove that no running or paused old
   publisher can resume**, before anything is inspected or changed.
2. **Inspect, owner-only and read-only,** the exact lock record at
   `intermed-dev` / `intermed-datasets` / `import-runs` / `lock`.
3. **Separately approve deletion of only that lock row** — no other row, no
   publication or run data.
4. **Verify the lock row is absent**, then permit **one** already-approved
   retry and verify its outcome before any further execution.

Any CLI flag used later can have its syntax checked offline with
`npx --yes appwrite-cli@28.1.0 <command> --help`; no command in this
subsection is an executable instruction here.

### 10.1 Preconditions (no cloud change)

Written owner approval naming environment (`intermed-dev` only), scope, the
reviewed commit, and the approver. Then, in the owner's own terminal:

```powershell
npx --yes appwrite-cli@28.1.0 -v
npx --yes appwrite-cli@28.1.0 client --endpoint https://fra.cloud.appwrite.io/v1
npx --yes appwrite-cli@28.1.0 login
npx --yes appwrite-cli@28.1.0 whoami
```

`login` is interactive and stores a session; no key is placed on any command
line. Never run `appwrite init project` against the committed configuration.

### 10.2 Build a fresh artifact outside the tracked tree (local only)

With the pinned Node, from the reviewed commit; the builder writes into the
system temp directory by default, so the artifact stays **outside** the tracked
tree (entry `src/main.js`, matching `entrypoint: "src/main.js"` in the
configuration as code):

```powershell
node scripts/build-importer-function.mjs
# prints: Artifact built successfully: <temp>/intermed-importer-function-XXXXXX
```

Smoke-test that artifact on Node 22 before any deployment step and record the
result. Do not copy the artifact into the repository.

### 10.3 Approval 1 — deploy the reviewed Function to `intermed-dev` only

Run these from the artifact's parent directory (`--code` must be inside the
current directory) so the package is the fresh temp artifact, never repository
source. Explicit function id, explicit development config:

```powershell
cd <temp>
npx --yes appwrite-cli@28.1.0 functions create-deployment --function-id import-anmdmr --code <temp>/intermed-importer-function-XXXXXX --entrypoint src/main.js --commands "npm ci --ignore-scripts --offline" --config-file <repo>/infra/appwrite/appwrite.config.development.json --json
npx --yes appwrite-cli@28.1.0 functions get-deployment --function-id import-anmdmr --deployment-id <DEPLOYMENT_ID> --config-file <repo>/infra/appwrite/appwrite.config.development.json --json
npx --yes appwrite-cli@28.1.0 functions update-function-deployment --function-id import-anmdmr --deployment-id <DEPLOYMENT_ID> --config-file <repo>/infra/appwrite/appwrite.config.development.json --json
npx --yes appwrite-cli@28.1.0 functions get --function-id import-anmdmr --config-file <repo>/infra/appwrite/appwrite.config.development.json --json
```

Then, in the Console (owner session), create the function variables
`INTERMED_SERVER_KEY` (secret value entered only in the Console) and leave
`INTERMED_SYNTHETIC_PUBLISH_ENABLED` unset until publication approval. Confirm
`execute` is still `[]`. Deployment is not staging and not publication.

### 10.4 Approval 2 — private synthetic raw snapshot and stage intent

Use only fictional synthetic fixture material (for example `Synthetica`,
`Fictivol`, `Placebex`) in a placeholder-format snapshot. Hash and upload the
raw bytes to the private `raw-sources` bucket (bucket `$permissions: []`,
`fileSecurity: false`):

```powershell
node -e "const f=require('node:fs'),c=require('node:crypto');console.log(c.createHash('sha256').update(f.readFileSync(process.argv[1])).digest('hex'))" <temp>/synthetic-snapshot.json
npx --yes appwrite-cli@28.1.0 storage create-file --bucket-id raw-sources --file-id synth-raw-2026-10-07-a --file <temp>/synthetic-snapshot.json --config-file <repo>/infra/appwrite/appwrite.config.development.json --json
```

Derive the reserved intent file id and write the stage intent JSON locally
(exact schema in 10.0; fictional values only), then upload it to the private
`import-run-logs` bucket under its reserved name:

```powershell
node -e "const c=require('node:crypto');const op='op-stage-synth-2026-10-07-a';console.log('oid1'+c.createHash('sha256').update('intermed-op-intent-file/v1|'+op).digest('hex').slice(0,32))"
npx --yes appwrite-cli@28.1.0 storage create-file --bucket-id import-run-logs --file-id <OID1_RESULT> --file <temp>/op-intent-v1.op-stage-synth-2026-10-07-a.json --config-file <repo>/infra/appwrite/appwrite.config.development.json --json
```

Execute the staged operation (body is exactly the one reference):

```powershell
npx --yes appwrite-cli@28.1.0 functions create-execution --function-id import-anmdmr --body "{\"operationId\":\"op-stage-synth-2026-10-07-a\"}" --config-file <repo>/infra/appwrite/appwrite.config.development.json --json
npx --yes appwrite-cli@28.1.0 functions get-execution --function-id import-anmdmr --execution-id <EXECUTION_ID> --config-file <repo>/infra/appwrite/appwrite.config.development.json --json
```

Expected: `staged` or `quarantined` with bounded summary only. A quarantined
run is recorded privately and never proceeds to publication.

### 10.5 Human diff review (read-only, mandatory before any publication)

Download the handler-written candidate and stage review and inspect the diff,
counts, provenance, encodings, and checksums. Record the human decision with
actor, reference, and timestamp — the publish intent must copy these exactly.

```powershell
npx --yes appwrite-cli@28.1.0 storage list-files --bucket-id import-run-logs --config-file <repo>/infra/appwrite/appwrite.config.development.json --json
npx --yes appwrite-cli@28.1.0 storage get-file-download --bucket-id import-run-logs --file-id <CANDIDATE_FILE_ID> --destination <temp>/candidate.json --config-file <repo>/infra/appwrite/appwrite.config.development.json
npx --yes appwrite-cli@28.1.0 storage get-file-download --bucket-id import-run-logs --file-id <REVIEW_FILE_ID> --destination <temp>/stage-review.json --config-file <repo>/infra/appwrite/appwrite.config.development.json
```

### 10.6 Approval 3 — one bounded publication (separate approval only)

Only after an approved diff review: turn on the publish flag in the Console
function variables (`INTERMED_SYNTHETIC_PUBLISH_ENABLED` exactly `true`), write
the publish intent (exact schema in 10.0; `approvedAt` pins the publication
time; `candidateVersionId`, `candidateSha256`, `stageOperationId`, and the
baseline binding copy the reviewed values), upload it under its reserved name,
and execute:

```powershell
npx --yes appwrite-cli@28.1.0 storage create-file --bucket-id import-run-logs --file-id <OID1_RESULT> --file <temp>/op-intent-v1.op-publish-synth-2026-10-07-a.json --config-file <repo>/infra/appwrite/appwrite.config.development.json --json
npx --yes appwrite-cli@28.1.0 functions create-execution --function-id import-anmdmr --body "{\"operationId\":\"op-publish-synth-2026-10-07-a\"}" --config-file <repo>/infra/appwrite/appwrite.config.development.json --json
```

Expected: `published` or `already-published` (an identical retry), or a
fail-closed `operation-rejected` / `publication-collision` / `stale-baseline` /
`publication-busy`. The handler writes immutable bundle first, descriptor
second, manifest last, and never updates or deletes a prior generation. Turn
the publish flag back off afterwards. **No publication is authorized now.**

### 10.7 Approval 4 — read-only post-verification

Read-only checks only (no update, no delete):

```powershell
npx --yes appwrite-cli@28.1.0 tablesdb get-row --database-id intermed-datasets --table-id dataset-versions --row-id <GENERATION_ROW_ID> --config-file <repo>/infra/appwrite/appwrite.config.development.json --json
npx --yes appwrite-cli@28.1.0 tablesdb get-row --database-id intermed-datasets --table-id dataset-bundles --row-id <BUNDLE_ROW_ID> --config-file <repo>/infra/appwrite/appwrite.config.development.json --json
npx --yes appwrite-cli@28.1.0 storage get-file-view --bucket-id published-datasets --file-id <BUNDLE_FILE_ID> --destination <temp>/published-bundle.json --config-file <repo>/infra/appwrite/appwrite.config.development.json
```

Compare bytes, sizes, `sha256:<64 hex>` checksums, counts, and provenance with
the reviewed candidate and with the anonymous public read (section 5). Rollback
(7.3) is the only withdrawal path and is separately approved.

### 10.8 Standing limits

No key values or environment examples are stored anywhere; no production
project, billing change, Shell Test change, CSP change, or client grant is part
of Milestone 5. Source rights remain `not-approved` and clinical references
`not-reviewed`: synthetic staging never implies publication rights. The exact
step order above may change with the final handler report; re-read the handler
schema (10.0) before any execution.
