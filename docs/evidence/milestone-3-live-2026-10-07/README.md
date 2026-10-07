# Milestone 3 live evidence — development project (2026-10-07)

Initial honest evidence for Milestone 3 **live verification against the new
development project only**. Baseline commit
`f167d439fe3d608b99fb130ee314b2bbf68798f1` (= `origin/main` at capture). This
pack records what the lead and owner already executed; it does **not** claim
Milestone 3 live acceptance.

Companion summary:
[docs/MILESTONE_3_EVIDENCE.md](../../MILESTONE_3_EVIDENCE.md#live-verification-development-project-2026-10-07).

## Contents

| Path                    | Purpose                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `observations.json`     | Machine-readable status for acceptance items 1–8 and recorded-field checks                  |
| `markdown-inventory.md` | The 36 tracked Markdown files audited by Antigravity (no controlling contradictions)        |
| `cli-preflight.md`      | Exact CLI version/syntax notes, executed vs pending commands, rejected preflight findings   |
| `site-probes/`          | Read-only public origin captures (headers + public frontend bodies; no secrets) for check 7 |
| `buckets/`                | Development bucket push/pull logs, including the corrected `--all` invocation           |
| `tables/`                 | Development TablesDB push/pull logs and declared-definition diff                         |
| `function-checks/`        | Function deployment, runtime/variables, sanitized stub execution, and unauthenticated denial |
| `scanner-review/`         | Bounded anonymous baseline responses and manual review of the public revision candidates  |

`sites-preparation/**` and probe scripts/tests are owned by other workers and
are not part of this pack.

## Honesty rules used here

- Pass/fail only for commands or probes that actually ran and were recorded.
- Dataset publication and unauthenticated writes remain **NOT RUN**. The
  bounded empty-resource GET matrix and the approved function stub checks are
  recorded separately; they do not prove row/file CRUD or publication behavior.
- Shell-site observations do not prove the recorded monorepo Sites build
  settings from [SITES.md](../../../infra/appwrite/SITES.md).
- Plan/org capacity is **GitHub Student Pack** (`auto-1`), not Free plan.
- No overall Milestone 3 live acceptance claim.
- All copied evidence is sanitized: no API keys, session tokens, `clientIP`, or
  account identifiers are committed. The public bundle scanner's exit 1 is
  retained as an observed result; both candidates were manually matched to the
  public HTML revision and a Git commit, not suppressed or treated as a clean
  scanner pass.
