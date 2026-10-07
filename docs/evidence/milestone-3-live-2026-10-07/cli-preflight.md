# CLI preflight notes (2026-10-07)

## Toolchain versions (lead-verified)

| Tool                        | Version / note                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| Baseline git                | `f167d439fe3d608b99fb130ee314b2bbf68798f1` (= live `origin/main`)                                |
| Global `appwrite`           | 13.3.2 (unsigned legacy; do not use for this work)                                               |
| Invoked CLI                 | `npx --yes appwrite-cli@28.1.0` (verified)                                                       |
| Console / API endpoint used | `https://cloud.appwrite.io/v1` for whoami; regional API `https://fra.cloud.appwrite.io/v1`       |
| Owner login                 | Owner ran interactive login; lead `whoami` saw console endpoint; **no secrets read or recorded** |

## Exact syntax corrections (from CLI 28.1.0 research)

Research source: orchestration `research.log` (help-only probes against
`appwrite-cli@28.1.0`; no login in that research session).

| Topic                        | Correct 28.1.0 form                                                                      | Legacy / wrong form in older docs                |
| ---------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Create project               | `organization create-project --organization-id … --project-id … --name … --region fra`   | `projects create` / plural `organizations`       |
| Read project (org scope)     | `organization get-project --organization-id … --project-id …`                            | `projects get`                                   |
| Read project (project scope) | `project get --project-id …`                                                             | `projects get`                                   |
| TablesDB row update          | `tablesdb update-row …`                                                                  | `tables-db update-row` (hyphenated)              |
| Function deployment switch   | `functions update-function-deployment --function-id … --deployment-id …`                 | `functions update-deployment`                    |
| Config selection             | global `--config-file` (28.1.0+)                                                         | accidental bare `appwrite.config.json` discovery |
| Push/pull resource names     | `push`/`pull` `bucket`/`table`/`function` (aliases `buckets`/`tables`/`functions` valid) | —                                                |
| Safe pull                    | scratch `--config-file`, `pull function --no-code`; never `--with-variables`             | pulling secrets into `.env`                      |

Query JSON wire key remains **`attribute`** (SDK + CLI binary + Utopia parser).
REST docs that show `"column"` are documentation drift; the adapter’s
`attribute` shape is correct per research. A separate research note about
`PublishedDatasetManifest.checksum` vs `catalogueFingerprint` is
**UNCONFIRMED** as a product bug until verified — not asserted here.

## Executed commands (owner/lead; this worker did not re-run cloud calls)

| Command / action                                                                                                                                                               | Exit / result                                                                                                                                                                                      | Status               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Owner `appwrite login` (interactive)                                                                                                                                           | Session established; credentials not copied into evidence                                                                                                                                          | EXECUTED             |
| Lead whoami / endpoint confirmation                                                                                                                                            | console endpoint `cloud.appwrite.io/v1`                                                                                                                                                            | EXECUTED             |
| `npx --yes appwrite-cli@28.1.0 organization create-project --organization-id 6abdb0c92ffbb4c7fdf6 --project-id intermed-dev --name "InterMED Development" --region fra --json` | exit 0; `$id` `intermed-dev`; `$createdAt` `2026-10-07T08:35:00.440+00:00`; `region` `fra`; `status` `active`                                                                                      | EXECUTED             |
| Connector confirmation of new project                                                                                                                                          | name/region/active; **zero** tablesdb / storage / functions / sites / users                                                                                                                        | EXECUTED             |
| `organizations_get_plan` (Student Pack)                                                                                                                                        | name `GitHub Student Pack`, id `auto-1`, `projects` 2, `addons.projects.limit` 2, `price` 0; now **two** projects (shell + `intermed-dev`)                                                         | EXECUTED             |
| `npx … storage list-buckets --config-file infra/appwrite/appwrite.config.development.json --json`                                                                              | exit 0; `total` 0; `buckets` `[]`                                                                                                                                                                  | EXECUTED             |
| `push`/`pull` buckets and tables with development/scratch config                                                                                                               | exit 0 after corrected `--all`; 4 buckets and 3 tables; declared-definition comparison has zero differences                                                                                        | EXECUTED             |
| `push`/`pull` function and list variables                                                                                                                                      | exit 0; deployment ready; pull skipped source; variables total 0                                                                                                                                   | EXECUTED             |
| Owner-approved synthetic publication + adapter metadata read                                                                                                                   | 10 fictional synthetic/guard objects created; manifest and descriptor available; sanitized record in `publication-live.json`                                                                        | PARTIAL              |
| Development Sites push                                                                                                                                                         | Deployment `6ac61591ec43a84f8084` reported build failure: Node 22.23.2 vs required 24.21.0 (`EBADENGINE`); CLI exit 0                                                                           | FAILED (runtime)     |
| `npx … functions list-runtimes` (same `--config-file`)                                                                                                                         | exit 0; lists `node-22` and `node-24` as **supported** runtimes (availability only)                                                                                                                | EXECUTED             |
| Read-only shell `sites_list` (origin project `6ac4b25b0012379cf3d0`)                                                                                                           | site `6ac4b3550003a26eea02`: framework `other`, adapter `static`, `fallbackFile` `index.html`, `buildRuntime` `node-22`, empty install/build, output `./`, deployment `6ac4e58c6e620fd5dd84` ready | EXECUTED (read-only) |
| Public HTTP probes of `https://intermed-shell-test.appwrite.network`                                                                                                           | see `site-probes/`; every path HTTP 200, TLS verify OK                                                                                                                                             | EXECUTED             |
| Playwright navigate `/status` + `navigator.serviceWorker.getRegistrations`                                                                                                     | secureContext true; controller `/sw.js`; scope `/`; shell text version `77c816387c81001988b3`; clinical capabilities unavailable                                                                   | EXECUTED             |

## Explicitly pending (NOT RUN)

- Corrected anonymous write probes and non-empty backend reads
- Per-row/file permission matrix and cleanup (runbook §5)
- Production project creation, billing/paid capacity changes
- Backup/restore drill
- Changing or redeploying shell project `6ac4b25b0012379cf3d0` / site `6ac4b3550003a26eea02`
- Successful new development Sites deployment with the pinned Node 24.21.0 runtime

## Rejected preflight findings (do not change code)

A read-only preflight review claimed High defects that the lead independently
falsified against official CLI 28.1.0 source downloaded under the orchestration
temp `cli-source/`:

1. **`$permissions` → must rename to `permissions` — FALSE.**
   `pushsimple.go` lines 55–77 map config `$permissions` → wire `permissions`.
   `resource.go` records JSON tag `$permissions` on the config struct. No rename
   required; changing the files would break the CLI’s documented config shape.
2. **Function `path` must be rewritten from cwd — FALSE for intended layout.**
   `function.go` resolves relative paths via `ResourceDirname` relative to the
   config resource location, not merely bare `process.cwd()` assumptions in the
   review text. Recorded for awareness; no code change in this docs-only stage.
3. **Free plan** — FALSE for this org. Live plan read is **GitHub Student Pack**
   (`auto-1`). Audit text that says Free plan is superseded.

The public bundle secret scanner returned exit 1 for two 40-character
candidates. Manual provenance review matched both to the public HTML revision
and Git commits; no API-key assignment was identified. The original scanner
result is retained and this is not recorded as a strict scanner pass.

Dependent claims that assumed dropped permissions from (1) are therefore also
rejected as currently actionable defects.
