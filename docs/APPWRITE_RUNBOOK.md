# Appwrite operations runbook

> **Everything in this runbook is NOT YET EXECUTED — requires maintainer
> approval.** Milestone 3 produced configuration-as-code and offline tests only.
> No `appwrite login`, `appwrite init`, `appwrite pull`, `appwrite push`,
> `appwrite deploy` or any Appwrite API call has been made, no project was
> created or changed, and no credential was read or stored. Nothing here may run
> until the maintainer authorizes it in writing.

Commands follow the current CLI documentation
([installation](https://appwrite.io/docs/tooling/command-line/installation),
[tables](https://appwrite.io/docs/tooling/command-line/tables),
[buckets](https://appwrite.io/docs/tooling/command-line/buckets),
[functions](https://appwrite.io/docs/tooling/command-line/functions),
[sites](https://appwrite.io/docs/tooling/command-line/sites)). Flag names must be
confirmed with `appwrite <command> --help` at execution time and the exact
invocation recorded in the evidence log.

## 1. Preconditions

- Written maintainer approval naming: environment (development/production),
  scope (which sections below), and the release approver.
- Pinned Node `24.21.0` for repository work; Appwrite CLI **28.1.0 or later**
  (needed for `--config-file`).
- The reviewed commit of `infra/appwrite/` that will be applied.
- An Appwrite account in the organization that owns the Frankfurt region
  projects, and a named incident owner.

> **NOT YET EXECUTED — requires maintainer approval**

```powershell
node --version   # v24.21.0
npm --version    # 11.19.0
npm install -g appwrite-cli
appwrite -v      # record the exact version used
```

## 2. Credentials

- The CLI authenticates with `appwrite login` (interactive session) or with a
  project API key passed on the command line from an environment variable whose
  value lives only in the shell/CI secret store. Never write a key into a file,
  a commit, a command block or a log.
- Server keys are created with least-privilege scopes and a documented rotation
  date. Functions receive theirs at execution time; the repository holds no
  variable for it (`vars` is empty in the configuration and enforced by tests).
- Treat `apps/web/.env.*` values as public even if private-looking; the startup
  validation rejects credential-shaped values.

> **NOT YET EXECUTED — requires maintainer approval**

```powershell
appwrite client --endpoint https://fra.cloud.appwrite.io/v1
appwrite login
appwrite client --debug   # confirm endpoint and project; prints no key
```

## 3. Provision the environment projects

Create one project per environment in **Frankfurt** (see
[decision 0002](decisions/0002-environment-strategy.md)). Placeholder IDs
`intermed-dev` / `intermed-prod` in the committed files are replaced by the real
project IDs in a reviewed commit before the first push. Do **not** run
`appwrite init project` against the committed files: it rewrites the config.
Never touch the existing Milestone 2 test project `6ac4b25b0012379cf3d0` or site
`6ac4b3550003a26eea02`.

> **NOT YET EXECUTED — requires maintainer approval**

```powershell
# Create "InterMED development" and "InterMED production" with region Frankfurt,
# then record the returned project IDs and update the two config files.
appwrite projects get --project-id intermed-dev
appwrite projects get --project-id intermed-prod
```

## 4. Apply the resource configuration

Order matters: buckets and tables before the function that addresses them. Run
the block for one environment only, and record the output.

> **NOT YET EXECUTED — requires maintainer approval**

```powershell
appwrite push buckets  --config-file infra/appwrite/appwrite.config.development.json
appwrite push tables   --config-file infra/appwrite/appwrite.config.development.json
appwrite push functions --config-file infra/appwrite/appwrite.config.development.json
```

`appwrite push sites` is deliberately **excluded**: it would create a _new_ site
from the `sites` entry instead of configuring the existing shell host. Sites
settings are applied as described in
[infra/appwrite/SITES.md](../infra/appwrite/SITES.md). Review drift before and
after any change:

> **NOT YET EXECUTED — requires maintainer approval**

```powershell
appwrite pull buckets   --config-file infra/appwrite/appwrite.config.development.json
appwrite pull tables    --config-file infra/appwrite/appwrite.config.development.json
appwrite pull functions --config-file infra/appwrite/appwrite.config.development.json
git diff infra/appwrite
```

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

> **NOT YET EXECUTED — requires maintainer approval**

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

## 6. Deploy the web shell

Intended flow: reviewed `main` revision → Appwrite Sites → HTTPS PWA, with the
settings in [infra/appwrite/SITES.md](../infra/appwrite/SITES.md) (root
`apps/web`, install/build/output, `index.html` SPA fallback). Build locally with
the pinned runtime before any manual upload, and never upload source, dependency
folders, environment files or credentials.

> **NOT YET EXECUTED — requires maintainer approval**

```powershell
npm ci --no-fund
npm run build
# Git-connected site: pushing to the production branch creates and activates the
# deployment. Manual upload alternative (built output only):
appwrite sites create-deployment --site-id intermed-web-prod --code apps/web/dist
appwrite sites get --site-id intermed-web-prod
```

Post-deploy checklist (record results): deep link `/status` serves the app;
`/sw.js` at root scope; `manifest.webmanifest` correct; TLS valid without
bypass; asset cache headers match policy; no source maps; `/status` shows the
expected shell identity; unauthenticated read/denial checks of section 5 still
hold.

## 7. Rollback

### 7.1 Shell rollback

> **NOT YET EXECUTED — requires maintainer approval**

```powershell
appwrite sites list-deployments --site-id intermed-web-prod
appwrite sites update-site-deployment --site-id intermed-web-prod --deployment-id <RETAINED_HEALTHY_DEPLOYMENT_ID>
```

Retain at least the previous healthy deployment; never activate a knowingly
corrupted artifact. Verify the rolled-back shell identity on `/status` and
re-run the offline launch check.

### 7.2 Function rollback

> **NOT YET EXECUTED — requires maintainer approval**

```powershell
appwrite functions list-deployments --function-id import-anmdmr
appwrite functions update-deployment --function-id import-anmdmr --deployment-id <RETAINED_DEPLOYMENT_ID>
```

### 7.3 Dataset publication rollback

Published generations are immutable. To withdraw a bad generation: mark its
`dataset-versions` row `withdrawn`, remove its bundle file from
`published-datasets`, and re-point the publication to the `previousVersionId`
generation. Copies already downloaded by clients cannot be recalled.

> **NOT YET EXECUTED — requires maintainer approval**

```powershell
appwrite tables-db update-row --database-id intermed-datasets --table-id dataset-versions --row-id <BAD_VERSION_ID> --data '{"status":"withdrawn"}'
appwrite storage delete-file --bucket-id published-datasets --file-id <BAD_FILE_ID>
appwrite tables-db get-row --database-id intermed-datasets --table-id dataset-versions --row-id <PREVIOUS_VERSION_ID>
```

Then re-run the unauthenticated manifest read and confirm it serves the previous
generation, and record the withdrawal with its reason and approver.

## 8. Restore drill, retention and operations (open before production)

| Item                  | Requirement                                                                                         | Status                                        |
| --------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Backup/restore drill  | Export the database and a bucket, restore into a scratch project, verify checksums and counts (R15) | Not scheduled — needs approval                |
| Retention             | Raw snapshots and quarantine: agreed retention; run logs: bounded size and rotation                 | Not assigned                                  |
| Source failure alerts | Alert on failed/empty/suspicious imports and rights expiry                                          | Not assigned                                  |
| Release approver      | Named approver for publication and deployment                                                       | Not assigned                                  |
| Cost monitoring       | Quota/cost thresholds for both projects                                                             | Not assigned                                  |
| Incident owner        | Named owner and contact for rollback/incidents                                                      | Not assigned                                  |
| Rate limits           | Per-function limits for any future public function (R125)                                           | Not applicable until a public function exists |
| Key rotation          | Rotate on staff change/exposure; audit key list quarterly                                           | Not scheduled                                 |

## 9. Secrets incident response (summary)

Rotate the exposed key in the Console, delete the old key, review usage logs for
the exposure window, check the repository history and build output with the
secret scan (`npx vitest run tests/appwrite-config-secrets.test.ts`), and record
the incident with dates, scope and approver. Software rollback cannot erase
copies already distributed.
