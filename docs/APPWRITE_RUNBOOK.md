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

| Action                                                                                      | Result                                                                           | Status         |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------- |
| Owner `login` + lead whoami / endpoint confirmation                                         | Console endpoint seen; **no secrets recorded here**                              | EXECUTED       |
| `organization create-project … --project-id intermed-dev --region fra --json`               | exit 0; active project; `$createdAt` `2026-10-07T08:35:00.440+00:00`             | EXECUTED       |
| Plan read                                                                                   | GitHub Student Pack `auto-1`; projects limit 2 (shell + `intermed-dev`); price 0 | EXECUTED       |
| `storage list-buckets --config-file infra/appwrite/appwrite.config.development.json --json` | exit 0; total 0                                                                  | EXECUTED       |
| `functions list-runtimes` (same config)                                                     | exit 0; node-22 and node-24 **supported**                                        | EXECUTED       |
| Read-only shell site metadata + public HTTP/Playwright probes                               | See live evidence pack `site-probes/`                                            | EXECUTED       |
| `push` / `pull` buckets, tables, functions                                                  | Development evidence in `buckets/`, `tables/`, and `function-checks/`            | EXECUTED       |
| Dataset publishing / unauthenticated writes / non-empty CRUD matrix                         | —                                                                                | **PENDING**    |
| Bounded anonymous empty-resource GET matrix                                                 | Public resources 200 empty; private resources 401; evidence `scanner-review/`    | **PARTIAL**    |
| Admin stub execution + unauthenticated execution denial                                     | 501 deliberate stub; unauthenticated POST 401; evidence `function-checks/`       | PASS (bounded) |
| Production project / billing / paid capacity                                                | —                                                                                | **NOT DONE**   |
| Shell project `6ac4b25b0012379cf3d0` / site `6ac4b3550003a26eea02` changes                  | Owner forbids changes; read-only checks only                                     | UNCHANGED      |

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

> **PARTIAL — bounded development checks executed 2026-10-07**

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
`import-run-logs` returned HTTP 401. No anonymous write, non-empty read,
per-row/file guard, or publication probe was authorized, so this section is
not a complete acceptance.

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
Those probes do **not** prove the monorepo Sites build runner and are not a new
real-device acceptance.

> **New development/production Sites deploy NOT YET EXECUTED — requires maintainer approval**

```powershell
npm ci --no-fund
npm run build
# Git-connected site: pushing to the production branch creates and activates the
# deployment. Manual upload alternative (built output only):
npx --yes appwrite-cli@28.1.0 sites create-deployment --site-id intermed-web-prod --code apps/web/dist
npx --yes appwrite-cli@28.1.0 sites get --site-id intermed-web-prod
```

Post-deploy checklist (record results): deep link `/status` serves the app;
`/sw.js` at root scope; `manifest.webmanifest` correct; TLS valid without
bypass; asset cache headers match the reviewed policy; no source maps; `/status`
shows the expected shell identity; unauthenticated read/denial checks of
section 5 still hold. The existing public bundle scan returned exit 1 for two
40-character public revision strings; provenance review matched both to the
public HTML revision and Git commits. This is recorded as a bounded manual
classification, not a strict scanner pass.

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
