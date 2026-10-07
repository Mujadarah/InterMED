# Milestone 3 live evidence — development project (2026-10-07)

Evidence for Milestone 3 **live verification against the new development
project only**. Baseline commit
`f167d439fe3d608b99fb130ee314b2bbf68798f1` (= `origin/main` at capture). This
pack records what the lead and owner already executed. **All requested
development live checks passed; PR delivery remains pending final exact-head
CI.** This does not claim a global release or clinical-product validation.

Companion summary:
[docs/MILESTONE_3_EVIDENCE.md](../../MILESTONE_3_EVIDENCE.md#live-verification-development-project-2026-10-07).

## Contents

| Path                                                   | Purpose                                                                                                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `observations.json`                                    | Machine-readable status for acceptance items 1–8 and recorded-field checks                                                                                               |
| `markdown-inventory.md`                                | The 36 tracked Markdown files audited by Antigravity (no controlling contradictions)                                                                                     |
| `cli-preflight.md`                                     | Exact CLI version/syntax notes, executed vs pending commands, rejected preflight findings                                                                                |
| `site-probes/`                                         | Read-only public origin captures (headers + public frontend bodies; no secrets) for check 7                                                                              |
| `buckets/`                                             | Development bucket push/pull logs, including the corrected `--all` invocation                                                                                            |
| `tables/`                                              | Development TablesDB push/pull logs and declared-definition diff                                                                                                         |
| `function-checks/`                                     | Function deployment, runtime/variables, sanitized stub execution, and unauthenticated denial                                                                             |
| `scanner-review/`                                      | Bounded anonymous baseline responses and manual review of the public revision candidates                                                                                 |
| `publication-live.json`                                | Sanitized synthetic generation, adapter metadata read, and guard-target record                                                                                           |
| `publication-live/` and `adapter-published-recording/` | Exact permitted publication command outputs, corrected probe records, approval-gated cleanup plan, and REST/query recordings; the source bundle archive is excluded      |
| `site-source-audit.json` and `site-source-entries.txt` | Moved root site-source audit artifacts, retained in the dated evidence scope                                                                                             |
| `sites-deployment.log`                                 | Exact development Sites deployment attempt and Node/npm runtime failure                                                                                                  |
| `cleanup-live/`                                        | Actual owner-approved guard cleanup, owner-side not-found repeat, and preserved published objects                                                                        |
| `adapter-final-after-cleanup/`                         | Actual final adapter read, REST recordings, request metadata, and verification after cleanup                                                                             |
| `site-retry/`                                          | Earlier failed Sites retries and official Node 24.21.0 musl checksum evidence; binary archive excluded                                                                   |
| `site-musl-live/`                                      | Successful development deployment metadata, pinned-runtime build log, browser/TLS checks, drift comparison, and sanitized deployed-bundle scan; archives/images excluded |
| `owner-handoff.md`                                     | Copy-paste handoff of current bounded PASS checks, historical failures, and explicit limits                                                                              |

`sites-preparation/**` and probe scripts/tests are owned by other workers and
are not part of this pack.

## Honesty rules used here

- Pass/fail only for commands or probes that actually ran and were recorded.
- One owner-approved synthetic generation was created and is readable through
  the real adapter: ten synthetic objects (one bundle, one descriptor row, one
  version row, three disposable guard rows, and four disposable guard files).
  The generation is fictional and carries `not-approved` / `not-reviewed`
  references; it is not clinical approval.
- The first 39-check permission matrix is retained as a **failed/inconclusive**
  historical probe, not a pass: the descriptor PATCH was a no-op with HTTP
  200, storage update attempts used the wrong method and returned 404, and
  private guard GETs returned `row_not_found` rather than an authorization
  proof. The helper continued after an unexpected 200. The concrete six-row mapping is in
  [`publication-live/first-to-corrected-probes.md`](publication-live/first-to-corrected-probes.md),
  with links to both the first and corrected JSON for every row. The corrected
  matrix passed 39/39 with no abort, the seven approved disposable guard
  objects were deleted, and the owner repeat confirmed them not-found. The
  published version, bundle, and file were preserved. The private `import-runs`
  GET remains a masked 404 rather than a strict 401/403 proof.
- The owner's first repeat was conditional rather than an anonymous write/private
  read pass. A later owner-approved cleanup executed the exact seven-object
  plan: all seven delete commands exited 0, while the owner-side repeat
  recorded exit 1 with only requested-row/file-not-found messages. No HTTP
  status or error type is inferred. The published
  version/bundle/file `aba05ea1b8fc3e49f18d517b` remained present.
- The final real-adapter read is an actual saved-script run: it returned the
  expected version in both manifest and descriptor, selected no guard object,
  made two REST recordings, used `credentials: "omit"`, and passed verification.
  An earlier inline multiline `npx eval` exited 0 without records because
  Windows argument handling lost the script; it is not proof of the final read.
- Earlier development Sites retries failed in the cloud build. The final
  approved musl retry succeeded as deployment `6ac62b9286ef77aa3a78`: the
  build log records Node `v24.21.0` / npm `11.19.0`, install and build
  success, and edge distribution `6/6`. The sanitized records in
  `site-musl-live/` prove the ready deployment and its browser/TLS checks.
- The older shell-site observations are separate from the successful development
  deployment; the development `site.json` and live-field comparison prove the
  recorded monorepo Sites build settings from
  [SITES.md](../../../infra/appwrite/SITES.md).
- Plan/org confirmation is **GitHub Student Pack** (`auto-1`), not Free plan.
- Item 8 covers only the verified development Frankfurt region and Student Pack
  confirmation. Production capacity and backup/restore remain wider roadmap
  items deferred outside this task, not current acceptance blockers.
- All requested development checks 1–8 passed; production, restore,
  real-device, immutable-cache, and clinical validation remain out of scope or
  future follow-ups.
- All copied evidence is sanitized: no API keys, session tokens, `clientIP`, or
  account identifiers are committed. The public bundle scanner's exit 1 is
  retained as an observed result; both candidates were manually matched to the
  public HTML revision and a Git commit, not suppressed or treated as a clean
  scanner pass.
- The final deployed-bundle scan passed over 11 actual deployed HTML,
  manifest, service-worker, and referenced asset files. The earlier strict
  scan failure and its public-revision classification remain retained as
  historical evidence; they are not rewritten.
- Review adjudication: a freshly executed pinned `appwrite-cli@28.1.0`
  `tables-db delete-row --help` exited 0; canonical Usage is `tablesdb`.
  The previously recorded alias-based publication/read/delete succeeded and
  is not a plan failure. The private-list helper's masked-404 bug is being
  corrected separately offline; the recorded private list HTTP 401 remains
  valid. CI for source `ac848af0b48f92a4eb9ab03b8aa7841769165e33` failed on
  the Ubuntu fixture while Windows passed; final exact-head CI remains pending.
- The official Node `24.21.0` Linux x64 musl archive checksum is recorded in
  both `site-retry/` and `site-musl-live/`. The gzip archive hash matched the
  official SHASUMS file. Production remains untouched; npm and Windows
  bootstrap integrity remain follow-up gates.
