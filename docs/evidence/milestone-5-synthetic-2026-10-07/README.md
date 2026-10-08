# Milestone 5 synthetic importer — offline evidence pack (2026-10-07)

**Status (updated 2026-10-08):** offline **core, store client, artifact,
handler, and combined integration verified** by root's immutable full runs —
handler `01f7a45` (634 tests / 38 files / 135 browser, exit 0) and the combined
`4cbc9ed` run with M6 main merged (734 / 46 / 150, exit 0) — while the **final
whole-patch static review at `4cbc9ed` is ACCEPTED at 0 reproducible blockers**
and **CI/PR are pending**.
This pack is **not** an M5 acceptance claim. No M5 live action — raw operation
intents, private staging/import, Function execution, deployment, schema
migration, publication, or cleanup — was authorized or executed while it was
assembled. Only read-only GET probes against the already-published Milestone 3
synthetic objects were run (see
[Read-only public wire-format probes](#read-only-public-wire-format-probes)).
No real ANMDMR format, name, document, or source material was fetched; the
source format stays a synthetic placeholder to be replaced after rights
approval and review.

## Copy and redaction policy

Files were produced by the Milestone 5 implementation workers (importer core,
Appwrite store client, Function artifact builder) and by root's independent
checks. The documentation worker copied them from the orchestration temp store
`<temp>`; it did **not** re-run them. Exactly two transformations were applied,
uniformly, to every copied file:

1. **Machine path segments only** were redacted to the agreed placeholders:
   - `<repo>` — the main checkout root
   - `<worktree>` — the sibling worktree that produced the log (named per file
     in the inventory below)
   - `<temp>` — the operating system temporary directory
   - `<user-home>` — the user home directory
2. **Encoding normalization:** UTF-8 without BOM, LF line endings, trailing
   whitespace stripped, final newline added. (Three sources carried a UTF-8 BOM
   and eleven carried CRLF; both are rejected by the repository hygiene guard.)

No test name, count, identifier, timestamp, command line, exit code, or result
line was altered, added, or removed. Per-file redaction counts were recorded at
copy time. The repository path-hygiene guard
(`tests/repository-path-hygiene.test.ts`) remains in force and was re-run over
this pack.

## Where the numbers come from

Unit and browser counts in [the Milestone 5 evidence
record](../../MILESTONE_5_EVIDENCE.md) are taken from the root command logs in
this pack (independent full `npm run check` runs per commit), never from review
text. Independent reviews are included as **report-only** material
(`*-report-only.txt`; extension changed to `.txt` so Prettier does not reflow
them, content otherwise untouched): the Gemini core review, the follow-up
artifact review at `57eb71f`, and the store client review at `ad9303b`. The
core review's "29" refers to the whole suite's 29 test files, not to 29
importer files.

## Log-name policy (collision avoidance)

This worker writes only **`DOCS-`-prefixed logs of its own runs**
(`DOCS-format-check-2026-10-07.log`, `DOCS-path-hygiene-2026-10-07.log`) and
never writes to a root/author file name, in the shared orchestration temp store
or here. Copied root/author logs keep their original names for traceability;
they live only in this folder and cannot overwrite their sources.

## Follow-up update — 2026-10-07 (late)

Root recaptured and extended the gate evidence after the log-name collision
described below. New bounded copies (same copy/redaction policy):

| File                                                         | What it shows                                                                                                                                                     |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `task-b-ROOT-client-ad9303b-FULL.log`                        | Root full `npm run check` at client `ad9303b`: 385 tests (29 files), 135 browser tests, exit 0                                                                    |
| `task-b-ROOT-artifact-57eb71f-FULL.log`                      | Root full `npm run check` at artifact `57eb71f`: 328 tests (28 files), 135 browser tests, exit 0                                                                  |
| `task-b-ROOT-core-reader-d1200c7-FULL.log`                   | Root full `npm run check` at core `d1200c7` (with reader proof): 431 tests (30 files), 135 browser tests, exit 0                                                  |
| `task-b-ROOT-reader-d1200c7-focused.log`                     | Root focused reader-compatibility run: 9 tests passed                                                                                                             |
| `task-b-ROOT-artifact-57eb71f-node22.log`                    | Root artifact smoke on v24.21.0 and official v22.23.2: GET 405 + real codec round-trip; artifact entry is now `src/main.js`                                       |
| `task-b-reader-compatibility.log`                            | Author report for `d1200c7`: producer `publish` output projects into the M3 reader; explicitly no M6 acceptance and no cryptographic bundle-hash activation claim |
| `task-b-artifact-independent-review-57eb71f-report-only.txt` | Follow-up review: W-2/W-3/W-4 closed (entry `src/main.js`, exact external pins, dynamic-import closure); W-1 stage/publish closure still pending; report-only     |
| `task-b-store-independent-review-ad9303b-report-only.txt`    | Independent client review: 58/58 focused, no code blockers (minor N1/N2, N3 live-proof gap); report-only                                                          |
| `task-b-handler-publication-time-finding.txt`                | Root defect finding: the handler bridge derives `publicationTimestamp` from `now()`; fix pending, so handler retries are **not** claimed                          |
| `task-b-reviewer-client-ad9303b-focused.log`                 | The reviewer's focused 58-test run that caused the log-name collision (kept as the collision record)                                                              |

## Follow-up update — 2026-10-08 (canonical identity + root proofs)

Eight more bounded copies (same copy/redaction policy: machine path segments
only, UTF-8 without BOM, LF, trailing whitespace stripped; **no line added or
removed**, and specifically no `node`/`npm` version line was inserted into any
log):

| File                                                         | What it shows                                                                                                                                                                |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `task-b-ROOT-core-b0fdde8-canonical-FULL.log`                | Root full `npm run check` at core `b0fdde8` on the synced `2bbbc38`: 452 tests (31 files), 135 browser tests, exit 0; the head prints `v24.21.0` / `11.19.0`                 |
| `task-b-ROOT-reader-41034c5-FULL.log`                        | Root full `npm run check` at storage schema + canonical reader `41034c5`: 415 tests (31 files), 150 browser tests, exit 0; original `npm run check` output, no version lines |
| `task-b-ROOT-artifact-e30e8d1-FULL.log`                      | Root full `npm run check` at artifact `e30e8d1`: 333 tests (28 files), 135 browser tests, exit 0; original `npm run check` output, no version lines                          |
| `task-b-ROOT-toolchain-recheck-2026-10-08.log`               | Current toolchain recheck: `v24.21.0` / `11.19.0` and heads `e30e8d1`, `41034c5`, `2bbbc38`; states explicitly it is **not** a repeat of the completed full suites           |
| `task-b-core-independent-review-b0fdde8-report-only.txt`     | Static core review: verdict ACCEPTED, severity none, 137 importer tests in 8 files passed in the reviewer's own probe; report-only                                           |
| `task-b-reader-independent-review-41034c5-report-only.txt`   | Static reader/schema review: no blockers; canonical column + nullable unique index, `$id` fallback only for missing/`null`, malformed present rejects; report-only           |
| `task-b-artifact-independent-review-e30e8d1-report-only.txt` | Static lock-projection/supply-chain review: no blockers; no browser tests or build gates executed by the reviewer; report-only                                               |
| `task-b-core-public-identity-repair-api.md`                  | Current core identity API note: canonical `dv U+001Fsource U+001Fgenkey` ids, ≤ 36 descriptor id and safe file name, HTTPS `resolvePublicUrl` validation, lineage matrix     |

The three reviews keep their original file names with the pack's documented
`-report-only.txt` suffix (extension changed so Prettier does not reflow them,
content otherwise untouched), because two of them fail `prettier --check` as
Markdown. ROOT ran all three full suites with the pinned toolchain on `PATH`;
the version output exists only where the log itself printed it (core), and the
recheck log above covers the toolchain and heads explicitly without re-running
any suite. The final handler run is still **pending**, so no handler log is
copied.

## Follow-up update — 2026-10-08 (handler proof, combined run, honest history)

Sixteen more bounded copies, same copy/redaction policy (machine path segments
only to `<worktree>` / `<repo>` / `<user-home>`, UTF-8 without BOM, LF,
trailing whitespace stripped; **no line added or removed** — a line-by-line
comparison against the sources shows identical line counts and differences only
in the redacted path segments):

| File                                                        | What it shows                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `task-b-ROOT-handler-01f7a45-FULL.log`                      | **Authoritative handler proof:** root immutable full `npm run check` at `01f7a4556e17608edb0865bacb3d421d23550847` — 634 tests (38 files), 135 browser tests, exit 0; head prints `v24.21.0` / `11.19.0` and `v22.23.2`                                                                                                                                                                                            |
| `task-b-handler-independent-review-01f7a45-report-only.txt` | Static **changed-repair** review: ACCEPTED, no blockers; scope is the two changed source files plus the changed tests, and the reviewer added **no new tests** — not a comprehensive whole-patch review                                                                                                                                                                                                            |
| `task-b-handler-canonical-final-api.md`                     | Handler canonical repair API report: canonical `datasetVersionId` (≤ 512, `U+001F`) persisted on descriptor/manifest rows, real HTTPS `resolvePublicUrl`, gate status list                                                                                                                                                                                                                                         |
| `task-b-handler-canonical-red.log`                          | Author red first: `handler-reader-identity.test.ts` 1 of 1 failed (publish returned 403) before the repair                                                                                                                                                                                                                                                                                                         |
| `task-b-handler-canonical-green.log`                        | Author green: 1 of 1 passed after the repair                                                                                                                                                                                                                                                                                                                                                                       |
| `task-b-ROOT-integration-4cbc9ed-FULL.log`                  | **Authoritative combined proof:** root immutable full run at `4cbc9edf89a12590f1fa7821428758ac8ac86bec` with M6 main merged — 734 tests (46 files), 150 browser tests, exit 0; head prints `v24.21.0` / `11.19.0` and the actual `v22.23.2` compiled flow                                                                                                                                                          |
| `task-b-ROOT-docs-bc508cd-FULL.log`                         | Root full `npm run check` at this documentation head `bc508cd`: 310 tests (24 files), 135 browser tests, exit 0                                                                                                                                                                                                                                                                                                    |
| `task-b-ROOT-handler-0c16177-FULL.log`                      | **Retained past failure:** root full gate at `0c16177` **failed 5 of 598** (npm offline-cache `ENOTCACHED` in the artifact lock step + a stale artifact dependency assertion)                                                                                                                                                                                                                                      |
| `task-b-ROOT-handler-reader-0266d8-RED.log`                 | **Retained past RED:** real canonical mismatch plus the **invalid middle assertion** that the canonical id must equal the physical Appwrite `$id` — not three production bugs                                                                                                                                                                                                                                      |
| `task-b-FINAL-independent-review-4cbc9ed-report-only.txt`   | **Final independent whole-patch static review at `4cbc9ed`: ACCEPTED, 0 reproducible blockers** — bounded static scope only (`git log`, `git diff`, patch analysis; exits 0), verdict "SCOPED VERDICT: PASS / ACCEPTED (Pending known M6 coordination issue)"; renamed `-report-only.txt` because it fails `prettier --check` as Markdown, content otherwise byte-identical. Static review, not execution evidence |
| `task-b-ROOT-m6-coordination-RED.log`                       | Root's portable M6 coordination repro rerun (2026-10-08): **3 of 3 expected failures, exit 1**, pinned Node `v24.21.0` / npm `11.19.0` as reported by root (the log prints no version line and none was added); temporary test removed afterwards, M6 and the domain unchanged                                                                                                                                     |
| `task-b-ROOT-m6-diagnostic.log`                             | Root's existing external diagnostic config with `COORD-m6-diagnostic.test.ts`: **2 of 2 passed, exit 0**, no M6 source edits and no activation — it neutralizes **Gap 1 only, in memory**, to expose the `invalid-unit` / `ambiguous-decimal` rejections; **not a fix**                                                                                                                                            |
| `task-b-approved-free-first-pass-resume.log`                | Report-only stdout of the approved owner-payload first pass over the eleven copied files at `4cbc9ed` — static observations F1–F11, verified properties, and explicit missing-import limitations; no code executed, no network. Root verified the actual paths                                                                                                                                                     |
| `task-b-approved-gemini-triage-capsule.log`                 | Gemini 3.1 Pro triage capsule stdout (F2–F10 statuses), from an **explicitly owner-approved** expanded payload with a clean local 42-file scan; **triage static only** — some line references are inaccurate and root's actual references are authoritative (the earlier auto-review rejection is dated history only)                                                                                              |
| `payload-verification.json`                                 | Public identifiers only — file paths, blob ids, byte counts, string-literal counts and fixed public URLs; **no values**, 11 files at `4cbc9ed`, `credentialLiteralFindings: 0` for every file                                                                                                                                                                                                                      |
| `task-b-ROOT-review-repair-ba3bff8-RED.log`                 | **Immutable root RED proof of the confirmed findings:** `tests/importer/publication-resume-review.test.ts` — **5 failed / 2 passed (7)**, exit 1: four stale-baseline-on-resume tests (**F1**) plus one divergent stored-manifest `recordCounts` test (**F11**). Tests only — the source is **not repaired yet**                                                                                                   |

Notes:

- The three superseded/non-passing runs are copied so the history is auditable
  rather than summarized; nothing is softened, and the counts above come from
  the root command logs, never from review text.
- The known **M6 consumer hard reject** (FNV-only consumer versus the
  established public SHA-256 contract) and the **`invalid-unit` /
  `ambiguous-decimal` note codes** (the `U+001F` separator is unrelated — it
  only delimits the canonical id) are **not fixed here** and are **not** a
  bundle-hash activation claim. The owner-approved coordination issue **is
  posted**: <https://github.com/Mujadarah/InterMED/issues/12>; root's rerun is
  RED 3/3 and its diagnostic config passes 2/2 only because Gap 1 is
  neutralized in memory — **no fix and no closure is claimed**.
- The **final whole-patch static review at `4cbc9ed` is ACCEPTED (0
  reproducible blockers)** and **CI/PR are pending**: the passing combined run
  is not an M5 acceptance.
- **Later on 2026-10-08 that accepted review is superseded by confirmed
  findings:** root's final triage confirms **F1** (partial/recovery manifest
  resume bypasses the stale-baseline recheck) and **F11** (asymmetric stored
  manifest `recordCounts`) via `task-b-ROOT-review-repair-ba3bff8-RED.log`
  (5 failed / 2 passed), **F9** is a confirmed stale comment being corrected,
  and the remaining eight (F2–F8, F10) stay **triage, static only**; the author
  **GREEN run with actual source edits is underway, no pass yet**.
  **No blanket first-pass PASS**
  — the code is **NOT ready** until confirmed fixes, a root regression/full
  check, and a fresh independent review.
- **Not copied:** the dirty working-tree WIP handler proof
  (`task-b-ROOT-handler-canonical-WIP-FULL.log`, `…-WIP-node22.log`), which
  stays in the orchestration store labelled **nonfinal / not authoritative**,
  and any raw worker stdout or inventory log.
- This documentation worker's own logs are `DOCS-FREE-FINAL-`-prefixed and are
  written only to the orchestration store.

## Inventory

### Importer core — worktree `m5-importer`, branch `codex/m5-synthetic-importer`, head `6ad7009`

| File                                               | What it shows                                                                                   |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `task-b-core-real-red-parser.log`                  | Red first: `parser.test.ts` 16 of 24 failing                                                    |
| `task-b-core-real-green-parser.log`                | Green: `parser.test.ts` 24 passed, exit 0                                                       |
| `task-b-core-real-red-stage.log`                   | Red first: `stage.test.ts` 21 of 33 failing                                                     |
| `task-b-core-real-green-stage.log`                 | Green: `stage.test.ts` 33 passed, exit 0                                                        |
| `task-b-core-real-red-publisher.log`               | Red first: `publisher.test.ts` 36 of 41 failing                                                 |
| `task-b-core-real-green-publisher.log`             | Green: `publisher.test.ts` 41 passed, exit 0                                                    |
| `task-b-core-real-red-core-stage-to-publish.log`   | Red first: `core-stage-to-publish.test.ts` 6 of 8 failing                                       |
| `task-b-core-real-green-core-stage-to-publish.log` | Green: `core-stage-to-publish.test.ts` 8 passed, exit 0                                         |
| `task-b-core-real-red-core-repair.log`             | Red run that was already 5/5 green (config schema scaffolding landed first) — kept as-is        |
| `task-b-core-real-green-core-repair.log`           | Green: `core-repair.test.ts` 5 passed, exit 0                                                   |
| `task-b-core-real-green-tests-importer.log`        | Green: `npx vitest run tests/importer` 116 passed (6 files), exit 0                             |
| `task-b-core-real-gate-format-check.log`           | `npm run format:check` exit 0                                                                   |
| `task-b-core-real-gate-lint.log`                   | `npm run lint` exit 0                                                                           |
| `task-b-core-real-gate-typecheck.log`              | `npm run typecheck` exit 0 (includes `packages/importer/tsconfig.json`)                         |
| `task-b-core-real-gate-check-boundaries.log`       | `npm run check:boundaries` exit 0 (51 source files)                                             |
| `task-b-core-real-final-verify.log`                | Head verification at `6ad7009`: pinned Node/npm, `tests/importer` 116 passed, four gates exit 0 |

### Store client — worktrees `m5-appwrite-store` and `m5-appwrite-query-fix`

| File                               | What it shows                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `task-b-store-mimo-red.log`        | Red first: base bridge contract 23 of 48 failing                                             |
| `task-b-store-mimo-green.log`      | Green: 48 passed, exit 0                                                                     |
| `task-b-store-mimo-gates.log`      | Focused 48 passed; full suite 375 passed (29 files); typecheck/lint/format/boundaries exit 0 |
| `task-b-query-fix-red.log`         | Red first: SDK query-object protocol 5 of 53 failing                                         |
| `task-b-query-fix-green.log`       | Green: 53 passed, exit 0                                                                     |
| `task-b-query-fix-gates.log`       | format/lint/typecheck/boundaries exit 0 (48 source files)                                    |
| `task-b-store-bucketctx-red.log`   | Red first: database/table/bucket context guards 4 of 58 failing                              |
| `task-b-store-bucketctx-green.log` | Green: 58 passed, exit 0                                                                     |
| `task-b-store-bucketctx-gates.log` | format/lint/typecheck/boundaries exit 0 (48 source files)                                    |

### Function artifact — worktree `m5-function-artifact`, head `6078537`

| File                                         | What it shows                                                                                             |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `task-b-artifact-mimo-closure-red.log`       | Red first: closure derivation 2 of 2 failing (mock/helper leakage)                                        |
| `task-b-artifact-mimo-closure-green.log`     | Green: 2 passed, exit 0                                                                                   |
| `task-b-artifact-mimo-closure-inventory.txt` | Actual artifact inventory: 23 files, no mock/fixture/in-memory module                                     |
| `task-b-artifact-mimo-closure-probe.log`     | Artifact child smoke on Node 24.21.0 and 22.23.2: GET 405 refusal, real codec round-trip, 0 network calls |
| `artifact-repair-red.log`                    | Earlier failed build state (`ERR_MODULE_NOT_FOUND` for a pruned module) — retained                        |
| `artifact-repair-green.log`                  | Repair green: artifact test 1 passed                                                                      |
| `artifact-repair-gates.log`                  | format/lint/typecheck/boundaries and artifact test exit 0                                                 |

### Root independent checks and probes

| File                                              | What it shows                                                                                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `task-b-independent-core-6ad7009-check.log`       | Full `npm run check` at core `6ad7009`: 422 tests (29 files), 135 browser tests passed                                             |
| `task-b-independent-artifact-6078537-check.log`   | Full `npm run check` at artifact `6078537`: 325 tests (28 files), 135 browser tests passed                                         |
| `task-b-independent-store-mimo-final-check.log`   | Full `npm run check` at the preceding store state: 375 tests (29 files), 135 browser tests passed                                  |
| `task-b-independent-store-569c668-check.log`      | **FAILED** earlier store full check (see below)                                                                                    |
| `task-b-root-artifact-node22-probe.log`           | Root artifact smoke: GET 405 + real codec round-trip on v24.21.0 and official v22.23.2; positive compiled handler flow not yet run |
| `runtime-node22-verification.json`                | Official Node v22.23.2 runtime checksum verification (`officialChecksumMatched: true`)                                             |
| `public-query-indexed-request-1.json`             | Read-only public GET `dataset-versions` with indexed `queries[0..3]` SDK objects: 200                                              |
| `public-query-indexed-request-2.json`             | Read-only public GET `dataset-bundles` with indexed `queries[0..1]`: 200                                                           |
| `task-b-independent-public-query-arrayparam.json` | Read-only public GET with repeated `queries[]` parameter: 200, `total: 1`                                                          |
| `task-b-independent-public-query-shape.json`      | Read-only comparison: recorded SDK query object 200 vs invented array form 400 `general_query_invalid`                             |
| `task-b-independent-public-list-shape.json`       | Read-only list envelope check: `{ total, rows }`, no `documents` key                                                               |

### Report-only material

`task-b-core-independent-review-6ad7009-report-only.txt` — independent Gemini
core review (verdict "accepted"). Per orchestration instruction this verdict is
**report-only**: it is not acceptance evidence, and all counts above come from
the root command logs.

## Retained failures (no false "passed" claims)

- `task-b-independent-store-569c668-check.log` — the root full check at store
  commit `569c668` **failed** at `format:check` (Prettier on
  `tests/importer/appwrite-store.test.ts`). Retained unchanged; the later store
  head `ad9303b` passed the same check.
- `artifact-repair-red.log` — earlier fail-closed artifact build failure,
  retained unchanged.
- `task-b-core-real-red-core-repair.log` — the red run for `core-repair.test.ts`
  was already 5/5 green because config-schema scaffolding landed first; it is
  kept as recorded instead of being restaged as a fake red.
- Every `*-red-*.log` keeps its original failing state.

## Log-name collision (resolved by root recapture)

`task-b-independent-store-ad9303b-check.log` originally held the root full check
at client head `ad9303b` (29 test files, 385 tests, 135 browser tests, exit 0).
A reviewer later reused that exact file name for a focused 58-test run and
overwrote it in the shared orchestration temp store. Root recaptured the full
check at the same head as **`task-b-ROOT-client-ad9303b-FULL.log`** (385 tests,
29 files, `135 passed (46.8s)`, exit 0), which is the authoritative client log
in this pack; the colliding focused run is preserved as
`task-b-reviewer-client-ad9303b-focused.log`. The earlier full store checks here
(`task-b-independent-store-mimo-final-check.log`, 375 tests) remain as history.

## Deliberately absent

- Dirty working-tree WIP handler proof (`task-b-ROOT-handler-canonical-WIP-FULL.log`,
  `…-WIP-node22.log`): **nonfinal / not authoritative** and deliberately not
  copied; the immutable `01f7a45` full run supersedes it.
- Live Function execution: none. The operation-intent schema is documented from
  `0c16177` in the runbook and must be re-read at `01f7a45` before any
  execution; nothing in this pack is recorded as executed. The publication-time
  finding file (`task-b-handler-publication-time-finding.txt`) is retained as
  history — the handler now pins publication time to the intent's immutable
  `approvedAt`.
- Any live M5 operation evidence: none was authorized or executed. Source rights
  remain `not-approved` (blocked), no domain or public contract changed, and the
  M6 FNV-only validator gap stays open; its coordination issue is posted at
  <https://github.com/Mujadarah/InterMED/issues/12> and is not yet fixed or
  closed.
- Duplicate older author red/green/gate logs and the large worker/steering debug
  logs: not copied (bounded pack). The reader author report above summarizes its
  own red/green cycle.
