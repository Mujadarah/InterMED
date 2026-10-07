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

## 10. Milestone 5 synthetic importer — future, separately approved changes

This section is a control boundary, not a live procedure. As of 2026-10-07 the
importer core, the Appwrite store client, and the Function artifact builder are
verified **offline** only (see
[the Milestone 5 evidence record](MILESTONE_5_EVIDENCE.md) and its
[evidence pack](evidence/milestone-5-synthetic-2026-10-07/README.md)); the
Function handler/authority worker is **pending**, and the deployed Function
remains the deliberate 501 stub until a separately approved deployment.
**No M5 live action was authorized or executed**: no raw operation intent, no
private staging/import, no Function execution, no deployment, no publication,
and no cleanup. Never request, paste, store, or expose credentials.

**Every future live step below requires its own written owner approval** —
approval for deployment does not authorize staging, and staging never grants
publication. Each approval names the environment (development only), scope,
exact revision/artifact, and approver, and is recorded separately.

1. **Deploy (separate owner approval):** deploy only the reviewed importer
   revision to `intermed-dev`. Production does not exist for this scope. The
   generated Node 22-compatible artifact must be produced outside the
   repository from the reviewed source and smoke-tested locally with fakes. The
   exact build/smoke/deploy commands stay **pending the final handler report**;
   the draft handler report may still change and this runbook deliberately
   records no unverified command.
2. **Private staging/import (separate owner approval):** use only a fictional
   synthetic snapshot and the synthetic placeholder source format, which is
   explicitly to be replaced after source-rights approval and review. Read raw
   material through the approved private port, write only private
   quarantine/run-log/candidate staging resources, and inspect the complete
   diff, counts, provenance, encoding, and SHA-256 before any publication
   decision. No network retrieval or real source layout is allowed.
3. **Publication (separate owner approval):** one bounded publication after
   review. Create immutable bundle first, descriptor second, and manifest last.
   `execute=[]` remains publicly denied. The exact operation-intent schema and
   invocation commands are **pending the final handler report** — do not treat
   any draft schema as executable and do not invent commands.
4. **Post-read-only verification (separate owner approval):** after an approved
   publication, perform only read-only manifest/descriptor/bundle checks and
   record exact bytes, sizes, checksums, counts, and provenance. Do not alter or
   delete a prior generation.

Concrete environment, scope, approver, function configuration, and future
least-privilege variables/scopes remain pending handler closure and
implementation review. Do not add a saved key or environment example. No
production project, billing change, Shell Test change, CSP change, or client
grant is part of M5.
