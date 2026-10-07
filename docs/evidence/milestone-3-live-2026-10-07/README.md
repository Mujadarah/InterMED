# Milestone 3 live evidence — development project (2026-10-07)

Initial honest evidence for Milestone 3 **live verification against the new
development project only**. Baseline commit
`f167d439fe3d608b99fb130ee314b2bbf68798f1` (= `origin/main` at capture). This
pack records what the lead and owner already executed; it does **not** claim
Milestone 3 live acceptance.

Companion summary:
[docs/MILESTONE_3_EVIDENCE.md](../../MILESTONE_3_EVIDENCE.md#live-verification-development-project-2026-10-07).

## Contents

| Path                                                   | Purpose                                                                                                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `observations.json`                                    | Machine-readable status for acceptance items 1–8 and recorded-field checks                                                                                          |
| `markdown-inventory.md`                                | The 36 tracked Markdown files audited by Antigravity (no controlling contradictions)                                                                                |
| `cli-preflight.md`                                     | Exact CLI version/syntax notes, executed vs pending commands, rejected preflight findings                                                                           |
| `site-probes/`                                         | Read-only public origin captures (headers + public frontend bodies; no secrets) for check 7                                                                         |
| `buckets/`                                             | Development bucket push/pull logs, including the corrected `--all` invocation                                                                                       |
| `tables/`                                              | Development TablesDB push/pull logs and declared-definition diff                                                                                                    |
| `function-checks/`                                     | Function deployment, runtime/variables, sanitized stub execution, and unauthenticated denial                                                                        |
| `scanner-review/`                                      | Bounded anonymous baseline responses and manual review of the public revision candidates                                                                            |
| `publication-live.json`                                | Sanitized synthetic generation, adapter metadata read, and guard-target record                                                                                      |
| `publication-live/` and `adapter-published-recording/` | Exact permitted publication command outputs, corrected probe records, approval-gated cleanup plan, and REST/query recordings; the source bundle archive is excluded |
| `site-source-audit.json` and `site-source-entries.txt` | Moved root site-source audit artifacts, retained in the dated evidence scope                                                                                        |
| `sites-deployment.log`                                 | Exact development Sites deployment attempt and Node/npm runtime failure                                                                                             |
| `cleanup-live/`                                        | Actual owner-approved guard cleanup, owner-side not-found repeat, and preserved published objects                                                                   |
| `adapter-final-after-cleanup/`                         | Actual final adapter read, REST recordings, request metadata, and verification after cleanup                                                                        |
| `site-retry/`                                          | Latest approved Sites retry failure, source audit, and official Node 24.21.0 musl checksum evidence; binary archive excluded                                        |

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
  probe, not a pass: the descriptor PATCH was a no-op with HTTP 200, storage
  update attempts used the wrong method and returned 404, and private guard
  GETs returned `row_not_found` rather than an authorization proof. The helper
  continued after an unexpected 200. The concrete six-row mapping is in
  [`publication-live/first-to-corrected-probes.md`](publication-live/first-to-corrected-probes.md),
  with links to both the first and corrected JSON for every row. The corrected
  matrix passed 39/39 with no abort, while the private `import-runs` GET
  remains a masked 404 rather than a strict 401/403 proof.
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
- The latest approved development Sites retry failed in the cloud build. The
  host reported npm `12.0.2`; the pinned Node `24.21.0` binary never started
  because `fcntl64: symbol not found`. The CLI exited 0 while deployment
  status was failed, so no successful deployment or actual pinned Node/npm
  runtime pair is claimed.
- Shell-site observations do not prove the recorded monorepo Sites build
  settings from [SITES.md](../../../infra/appwrite/SITES.md).
- Plan/org confirmation is **GitHub Student Pack** (`auto-1`), not Free plan.
- Item 8 covers only the verified development Frankfurt region and Student Pack
  confirmation. Production capacity and backup/restore remain wider roadmap
  items deferred outside this task, not current acceptance blockers.
- No overall Milestone 3 live acceptance claim.
- All copied evidence is sanitized: no API keys, session tokens, `clientIP`, or
  account identifiers are committed. The public bundle scanner's exit 1 is
  retained as an observed result; both candidates were manually matched to the
  public HTML revision and a Git commit, not suppressed or treated as a clean
  scanner pass.
- A separate sanitized review copy of the deployed bundle scanned cleanly, but
  the original strict scan still exited 1; both results are retained without
  collapsing them into a single pass.
- The official Node `24.21.0` Linux x64 musl archive checksum is recorded in
  `site-retry/` as follow-up evidence, not deployment proof. The retry fix
  remains **IMPLEMENTING** with fresh cloud approval pending. Production is
  untouched; production bootstrap packages must be pinned by integrity hash.
  The Linux artifact is hash-verified, while npm and Windows bootstrap
  integrity remain follow-up gates.
