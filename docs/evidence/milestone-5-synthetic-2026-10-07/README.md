# Milestone 5 synthetic importer — offline evidence pack (2026-10-07)

**Status:** offline **core and store client verified**; the Function **handler and
final integration are PENDING**. This pack is not an M5 acceptance claim. No M5
live action — raw operation intents, private staging/import, Function execution,
deployment, publication, or cleanup — was authorized or executed while it was
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
text. The independent Gemini core review is included as **report-only** material
(`task-b-core-independent-review-6ad7009-report-only.txt`, extension changed to
`.txt` so Prettier does not reflow it; content otherwise untouched). Its "29"
refers to the whole suite's 29 test files, not to 29 importer files.

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

## Known limitation of this pack

`task-b-independent-store-ad9303b-check.log` — the root full check at store head
`ad9303b` (29 test files, 385 tests, `135 passed (48.6s)`, exit 0) — was
observed intact by this worker earlier in the session and was then **overwritten
in the shared orchestration temp store at 22:02 by a focused 58-test re-run**, so
no verbatim copy exists in this pack. The surviving full store check here is
`task-b-independent-store-mimo-final-check.log` (375 tests, 29 files, 135
browser tests); the ten additional tests at `ad9303b` are the query-protocol and
bucket-context cycles whose red/green logs are listed above.

## Deliberately absent

- Handler / Function-worker logs: the worker is still pending; the draft
  operation-intent schema and invocation commands may change and are not
  recorded as executable anywhere in this pack.
- Positive compiled artifact handler flow: not yet run (only the GET 405 refusal
  and real codec round-trip are proven).
- Any live M5 operation evidence: none was authorized or executed.
