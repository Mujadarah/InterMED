# Milestone 5 evidence — synthetic-only importer

**Status (updated 2026-10-07, final docs preparation):** **OFFLINE CORE, CLIENT,
AND PRODUCER/READER COMPATIBILITY VERIFIED — FUNCTION HANDLER REPAIRS AND FINAL
INTEGRATION PENDING.** This file does not claim Milestone 5 acceptance, and the
implementation is still repairing. The importer core, the Appwrite store
client, the Function artifact builder, and the core-producer → M3
published-reader compatibility are verified offline by tests and logs (matrix
below). The Function handler at `0c16177` has committed positive detached
Node 22 flows, but the root full gate **failed (5 of 598 tests)** and repairs
plus a fresh root full check are pending — **no handler acceptance is
claimed**. The core is repairing its public generation identity and related
items (below), so its acceptance is **pending** too. **No M5 live action was
authorized or executed:** no raw operation intent, no private staging/import,
no Function execution, no deployment, no publication, and no cleanup.

## Scope and safety boundary

The importer is limited to fictional synthetic fixtures such as `Synthetica`,
`Fictivol`, and `Placebex`, explicitly marked synthetic. There is no network
retrieval, real source material, real product name, source-layout copy, API
key, session, token, cloud call, or clinical claim. No real ANMDMR format,
name, document, or source was fetched. The source format is a **synthetic
placeholder label, explicitly to be replaced after rights approval and review**.
Synthetic rights are `not-approved` (rights approval is blocked/absent);
synthetic clinical references are `not-reviewed`. Neither is a human
publication approval.

The source is read through injected ports. The core must not import Appwrite,
`fetch`, filesystem, browser, credentials, or ambient time. The thin Function
adapter is a future server/owner-authorized path; public `execute: []` remains
denied. Production does not exist in this workstream, and `intermed-dev` is the
only future live environment named by the existing environment decision.

## Verified baseline contracts

- M3 evidence records TablesDB/storage boundaries, private raw/quarantine/log
  resources, public read-only dataset resources, and the deliberate 501
  `infra/appwrite/functions/import-anmdmr/src/main.js` stub (still the deployed
  and committed state; the live stub is unchanged).
- M4 evidence records synthetic fixture validation, explicit missing/unknown
  states, stable IDs, combination expansion, ambiguity retention, canonical
  JSON serialization, and referential-integrity checks.
- `packages/domain/src/published-dataset.ts` is immutable and read-only:
  `PublishedDatasetManifest` and `PublishedBundleDescriptor` carry exact
  published metadata and checksums.
- `packages/domain/src/checksum.ts` defines the sealed catalogue checksum as
  FNV-1a over canonical JSON with checksums blanked. This is distinct from the
  public bundle SHA-256.
- `packages/domain/src/serialize.ts` defines canonical JSON serialization and
  non-throwing deserialization. Counts and provenance must survive the
  serialized snapshot round-trip.
- No domain type or public contract was changed or proposed for change by
  Milestone 5 work. The public checksum contract keeps the existing M3
  `sha256:<64 hex>` transport form.

## Implementation state (2026-10-07, offline only)

Verified from the implementation workers' API reports and root's independent
checks; source and logs live in the implementation worktrees, and the bounded
logs are copied into
[`docs/evidence/milestone-5-synthetic-2026-10-07/`](evidence/milestone-5-synthetic-2026-10-07/README.md).

| Component                                       | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Importer core (`stage`/`publish`)               | **Verified offline at `d1200c7` (431 tests / 30 files), repair in progress.** The open repair items are importer-internal: public generation identity (composite ids with a unit separator exceed the Appwrite row-id limit, so writer and reader disagree on the generation id), `minimumClientVersion` validation, deterministic explicit raw lineage, and absolute HTTPS descriptor URLs. Core acceptance is **pending** until that repair lands and re-verifies                                     |
| Producer ↔ M3 published reader compatibility    | **Verified offline** at `d1200c7` (9 focused tests). No M6 acceptance and no cryptographic bundle-hash activation claim: bundle-byte hash verification stays a downstream activation (M6) responsibility                                                                                                                                                                                                                                                                                                |
| Appwrite store client (thin bridge)             | **Verified offline** against a stateful fake of the Appwrite REST surface (58 focused tests) and reviewed independently with no code blockers (report-only). Head `ad9303b`                                                                                                                                                                                                                                                                                                                             |
| Function artifact builder                       | **Verified offline.** 23-file Node-compatible artifact derived from the real runtime closure, built outside the repository; entry `src/main.js` matches `entrypoint: "src/main.js"` in the configuration as code. Head `57eb71f`                                                                                                                                                                                                                                                                        |
| Function handler and operation-intent authority | **NOT ACCEPTED — repairs pending.** `0c16177` commits positive detached Node 22 flows, but the root full gate failed: 5 of 598 tests (ambient npm offline-cache failure in the artifact lock step plus a stale artifact dependency assertion). The author reported a single failure, which is not the root result. Publication time is now pinned to the immutable `approvedAt` of the owner intent in the source; the advancing-clock retry proof and a fresh green root full check are still required |
| Positive compiled handler flow                  | **Committed but not verified** (the compiled stage/publish flow tests failed in the root run for the environmental reason above). Only the non-POST 405 refusal and the real domain codec round-trip are proven on the artifact                                                                                                                                                                                                                                                                         |
| Final integration (root)                        | **PENDING.** Root runs the integrated gates serially after handler closure; the clean integration `384f5d8` retains both the importer and `local-store` workspaces                                                                                                                                                                                                                                                                                                                                      |

## Acceptance and evidence matrix

Required checks and their current evidence. `OFFLINE VERIFIED` means the named
tests ran green with the named logs; it is not a live or acceptance result.
Every `PENDING` cell stays open until the named owner report exists.

| Area                                    | Required behavior                                                                                                                                                 | Status                                                          | Evidence                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input shape                             | malformed, missing, blank, truncated, unsupported schema/encoding                                                                                                 | OFFLINE VERIFIED                                                | `parser.test.ts` (24) and `stage.test.ts` (33): invalid envelope/JSON root, non-synthetic marker, forged counts, `maxRawBytes`/`maxRows` bounds, unsupported encoding; `task-b-core-real-green-parser.log`, `task-b-core-real-green-stage.log`                                                                                                                                      |
| Duplicates                              | identical duplicate warns/deduplicates; conflicting duplicate quarantines                                                                                         | OFFLINE VERIFIED                                                | "collapses identical duplicate rows before the counts check", "fails closed on conflicting rows sharing one key", "deduplicates rows keyed by source ingredient id as well"; `task-b-core-real-green-parser.log`                                                                                                                                                                    |
| Text identity                           | UTF-8, BOM, Windows-1250; NFC; legacy cedilla `ş/ţ` mapping; `ă/â/î` remain distinct; no fuzzy merge                                                              | OFFLINE VERIFIED                                                | `decodeBytes` tests (8): BOM strip, Windows-1250 legacy cedilla folding, NFC normalization, verbatim `șțăâî`, unsupported/invalid bytes throw; `task-b-core-real-green-parser.log`                                                                                                                                                                                                  |
| Combinations                            | every explicit ingredient join is preserved and expanded deterministically                                                                                        | OFFLINE VERIFIED                                                | M4 domain combination-expansion tests plus importer link comparison ("detects related ingredient link changes as product changes"); `task-b-core-real-green-stage.log`                                                                                                                                                                                                              |
| Removal safety                          | empty/partial input quarantines; large complete removal requires threshold reason and explicit review                                                             | OFFLINE VERIFIED                                                | "always quarantines empty snapshots and never writes a candidate", "always quarantines partial and incomplete snapshots with no candidate", "writes a private large-drop quarantine and keeps the candidate reviewable", "rejects unapproved large removals and publishes with threshold approval"; `task-b-core-real-green-stage.log`, `task-b-core-real-green-publisher.log`      |
| Retry                                   | same inputs produce the same generation identity and bytes; valid retry reuses exact immutable content                                                            | OFFLINE VERIFIED (core only; handler retry PENDING)             | "produces baseline-independent deterministic bytes", "derives the generation only from raw SHA and canonical config before sealing", "retries twice without duplicate rows while the baseline advanced"; `task-b-core-real-green-stage.log`, `task-b-core-real-green-publisher.log`. Handler-level retry with an advanced clock is **not** proven (handler repairs pending)         |
| Isolation/privacy                       | parse, validation, staging, log, and publication faults preserve prior public objects and leak no private material                                                | OFFLINE VERIFIED (offline fault injection)                      | stage fault table (7 injected ports) and publisher fault table (8 read/lock ports) "fails closed when %s fails"; "keeps prior published generations unchanged when %s fails" (3 write ports); "keeps run summaries and logs free of source text"; `task-b-core-real-green-stage.log`, `task-b-core-real-green-publisher.log`                                                        |
| Review binding                          | approval binds candidate/config SHA, raw SHA, baseline id/fingerprint, and rejects stale/mismatched approval                                                      | OFFLINE VERIFIED                                                | ten publisher tests on `ReviewData`/`ReviewApproval` tampering, missing review, incomplete review, record-count mismatch, stale baseline; `task-b-core-real-green-publisher.log`                                                                                                                                                                                                    |
| Hashes                                  | internal catalogue FNV remains; transport/public descriptor and manifest use lowercase `sha256:<64 hex>`                                                          | OFFLINE VERIFIED (contract tests); M6 coordination PENDING      | "writes the manifest last and binds real descriptor and manifest fields" (checksum format asserted) and the unmocked pipeline tests; `task-b-core-real-green-publisher.log`, `task-b-core-real-green-core-stage-to-publish.log`                                                                                                                                                     |
| Snapshot contract                       | deserialize, referential integrity, serialized counts, provenance, and source metadata agree                                                                      | OFFLINE VERIFIED                                                | "proves the domain pipeline is unmocked", "runs raw bytes through staging to a committed publication" (real `deserializeCatalogue`, `validateSyntheticIntegrity`); `manifest.sourceIds` equals the real `datasetVersions[0].sourceIds`; `task-b-core-real-green-core-stage-to-publish.log`, `task-b-core-real-green-publisher.log`                                                  |
| Producer ↔ reader compatibility         | core publication projects into the M3 published reader (`createAppwritePublishedDatasetReader`) preserving id, checksum, counts, sourceIds, lineage               | OFFLINE VERIFIED (9 focused tests)                              | `task-b-ROOT-reader-d1200c7-focused.log`, `task-b-reader-compatibility.log`, `task-b-ROOT-core-reader-d1200c7-FULL.log`. Not proven here: M6 store ingestion and cryptographic bundle-hash verification/activation (downstream activation responsibility)                                                                                                                           |
| Public generation identity              | the public generation id fits Appwrite row-id limits and equals the actual manifest row `$id` and every provenance link                                           | PENDING — core repair in progress                               | the composite domain id exceeds the 36-char row-id limit and carries a unit separator; the writer hashed it while the bundle kept the old id (consumer mismatch). Repair: a deterministic safe opaque generation id derived from the raw SHA and canonical config SHA, rebased before sealing, with full digests retained and compared                                              |
| Publication order                       | immutable bundle, descriptor, then manifest **LAST**; no public update/delete path                                                                                | OFFLINE VERIFIED                                                | write-sequence assertion ("writes the manifest last…"), "rejects publication collisions without updates or deletes", "keeps an existing public orphan immutable and unadvertised", "resumes an interrupted publication creating only the missing components"; store client exports no delete/update; `task-b-core-real-green-publisher.log`, `task-b-store-bucketctx-green.log`     |
| Store transport contract                | strict ID/budget/shape/scoping validation before any network call; private vs public permission split; bounded query-object policy                                | OFFLINE VERIFIED (fakes only)                                   | `appwrite-store.test.ts` 58 passed after red/green cycles; `task-b-store-mimo-green.log` (48), `task-b-query-fix-green.log` (53), `task-b-store-bucketctx-green.log` (58); independent review PASS (report-only)                                                                                                                                                                    |
| Adapter authority                       | forged body authority, wrong/missing trusted config, raw URL, and malicious secret error are rejected                                                             | PARTIAL — store side verified offline; Function handler PENDING | store client "rejects untrusted config before network", constant `StoreError` messages, keys never echoed (`task-b-store-mimo-red.log`/`-green.log`); handler-side authority rejection awaits handler repair closure and a fresh root full check                                                                                                                                    |
| Artifact                                | generated Node 22-compatible artifact is outside the repo and locally smoke-tested against fakes                                                                  | PARTIAL — smoke passed, positive flow PENDING                   | 23-file artifact inventory with entry `src/main.js` matching the Appwrite config entrypoint (no mock/fixture/in-memory module); child smoke on official Node v22.23.2 and v24.21.0: non-POST 405 refusal + real domain codec round-trip, zero network calls; `task-b-ROOT-artifact-57eb71f-node22.log`, `task-b-ROOT-artifact-57eb71f-FULL.log`, `runtime-node22-verification.json` |
| Public read-only wire format            | published reads accept indexed `queries[N]` and repeated `queries[]` SDK query objects and return the `{ total, rows }` envelope; invented array forms fail       | VERIFIED READ-ONLY (existing M3 objects)                        | read-only GET probes: `public-query-indexed-request-1.json`, `public-query-indexed-request-2.json`, `task-b-independent-public-query-arrayparam.json`, `task-b-independent-public-list-shape.json`, `task-b-independent-public-query-shape.json`                                                                                                                                    |
| Handler authority and operation intents | owner-created private intent is the only authority; strict `{ operationId }` envelope; constant fail-closed codes; publication time pinned to the approval intent | PENDING — handler repairs in progress                           | schema is documented concretely (runbook section 10.0) from the handler source at `0c16177`, but the root full gate failed (5 of 598) and the schema may still change with repairs; nothing is recorded as executed                                                                                                                                                                 |

## Counts and gates from the root command logs

Counts are taken from root's independent full `npm run check` runs (logs in the
evidence pack), never from review text. Independent reviews (core Gemini,
artifact follow-up, store client) are **report-only**: the core review's "29"
refers to the whole suite's 29 test files and must not be read as "29 importer
files".

| Scope (commit)                               | Unit tests (files)                             | Browser tests | Gates                                                                                                                                   | Log                                                                                                                                                                    |
| -------------------------------------------- | ---------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Importer core `d1200c7` (repair in progress) | 431 passed (30 files)                          | 135 passed    | format/lint/typecheck/test/boundaries/audit/build/scan:dist/browser, exit 0                                                             | `task-b-ROOT-core-reader-d1200c7-FULL.log`; focused reader proof `task-b-ROOT-reader-d1200c7-focused.log` (9 passed)                                                   |
| Store client `ad9303b`                       | 385 passed (29 files)                          | 135 passed    | same sequence, exit 0                                                                                                                   | `task-b-ROOT-client-ad9303b-FULL.log` (root recapture after the log-name collision)                                                                                    |
| Function artifact `57eb71f`                  | 328 passed (28 files)                          | 135 passed    | same sequence, exit 0                                                                                                                   | `task-b-ROOT-artifact-57eb71f-FULL.log`; Node 22/24 smoke `task-b-ROOT-artifact-57eb71f-node22.log`                                                                    |
| Function handler `0c16177`                   | **593 passed, 5 failed (598 tests, 35 files)** | not reached   | **FAILED** at `npm run test` (npm offline-cache `ENOTCACHED` during the artifact lock step, plus a stale artifact dependency assertion) | `task-b-ROOT-handler-0c16177-FULL.log` (orchestration store; to be copied in the final evidence update). Author reported one failure; the root result is authoritative |
| Importer core `6ad7009` (superseded)         | 422 passed (29 files)                          | 135 passed    | same sequence, exit 0                                                                                                                   | `task-b-independent-core-6ad7009-check.log`                                                                                                                            |
| Function artifact `6078537` (superseded)     | 325 passed (28 files)                          | 135 passed    | same sequence, exit 0                                                                                                                   | `task-b-independent-artifact-6078537-check.log`                                                                                                                        |
| Store client earlier state (superseded)      | 375 passed (29 files)                          | 135 passed    | same sequence, exit 0                                                                                                                   | `task-b-independent-store-mimo-final-check.log`                                                                                                                        |
| Focused importer suite (core)                | 116 passed (6 files) at `6ad7009`              | —             | `npx vitest run tests/importer`, exit 0                                                                                                 | `task-b-core-real-green-tests-importer.log`, `task-b-core-real-final-verify.log`                                                                                       |

Retained failures are kept on purpose (no false "passed" claims): the root full
check at store commit `569c668` failed `format:check`
(`task-b-independent-store-569c668-check.log`), the earlier artifact build
failed with `ERR_MODULE_NOT_FOUND` on a pruned module
(`artifact-repair-red.log`), and the `core-repair` red run was already 5/5
green before implementation (`task-b-core-real-red-core-repair.log`). All
`*-red-*` logs keep their failing state, and the handler gate failure above is
recorded as a failure, not softened. The log-name collision that overwrote the
first `ad9303b` full-check copy is documented in the pack README; root's
recapture is authoritative and the colliding focused run is preserved as
`task-b-reviewer-client-ad9303b-focused.log`.

## Read-only public wire-format verification

Read-only GET probes against the already-published Milestone 3 synthetic objects
(`version-aba05ea1b8fc3e49f18d517b`) returned HTTP 200 for both the indexed
`queries[N]` form and the repeated `queries[]` parameter carrying recorded SDK
query objects, with the `X-Appwrite-Project` header only and `credentials:
omit`. The list envelope is `{ total, rows }` with no `documents` key. The
invented array query form returns `400 general_query_invalid`, matching the
store client's pre-network rejection of that shape. These probes read public
`read("any")` objects only; they are not M5 import, staging, or publication
actions.

## Handler state (repairs pending — no acceptance)

- Root's publication-time finding is addressed in the current handler source:
  the publish intent's immutable `approvedAt` pins the publication timestamp, so
  a retry presents the identical publication even when the wall clock advances.
  The advancing-clock retry proof is part of the committed positive flows that
  the root run could not verify (below), so **no handler retry result is
  claimed**.
- The root full gate at `0c16177` **failed**: 5 of 598 tests, from an ambient
  npm offline-cache failure (`ENOTCACHED` for the pinned `zod` fetch in the
  artifact runtime-lock step) and a stale artifact dependency assertion. The
  author reported a single failure; the root result is the one recorded. Handler
  acceptance requires repairs and a fresh green root full check.
- The concrete operation-intent schema and the owner workflow are documented in
  [the runbook](APPWRITE_RUNBOOK.md) section 10 from the handler source at
  `0c16177`; the schema may still change with repairs and is **not** recorded as
  executed anywhere.

## M6 status: PR10 merged, contract conflict open

M6 PR10 is merged (head `8ef6fd8`, merge commit
`729ccfc797358499398b2bbf811f2f7d87bffa02`); the clean integration `384f5d8`
retains both the importer and `local-store` workspaces. The merged validator
still checks only the internal FNV fingerprint against the public manifest
checksum, so the known conflict with the established M3 public SHA-256
transport contract (`sha256:<64 hex>` over the exact serialized bundle bytes)
is a **hard reject**, recorded here and unchanged: the internal catalogue FNV
checksum stays, the public SHA-256 contract stays, and no domain or public
contract change is proposed to close it. Upstream coordination (a GitHub
coordination issue, plus the preserved-token notes) is **awaiting owner
permission** and has not been opened. **No integrated M5/M6 pass is claimed**,
and the reader compatibility proof is explicitly not an M6 acceptance or a
cryptographic bundle-hash activation claim.

## Open items before any acceptance claim

1. Core public-identity repair and re-verification (safe opaque generation id
   within Appwrite row-id limits, `minimumClientVersion` validation,
   deterministic explicit raw lineage, absolute HTTPS descriptor URLs).
2. Handler repairs and a fresh green root full check (the `0c16177` root run
   failed 5 of 598); then the advancing-clock retry proof counts as verified.
3. Positive compiled artifact handler flow verified on Node 22 (beyond the 405
   refusal and codec round-trip): the closure must include the real
   `stage`/`publish` pipeline (review item W-1).
4. Final integrated root gate run (serial) and the whole-patch final review.
5. M6 SHA-256 contract compatibility — coordination issue awaiting owner
   permission; until then the hard-reject gap stands.
6. Every future live step requires separate owner approval (deploy to
   `intermed-dev`, private synthetic staging/import, bounded publication,
   read-only post-verification) exactly as recorded in
   [the runbook](APPWRITE_RUNBOOK.md) section 10; nothing there has been
   executed.

## Evidence protocol

Implementation leads attach actual red/green logs and targeted gate results
before any cell changes. The evidence pack README
([`docs/evidence/milestone-5-synthetic-2026-10-07/README.md`](evidence/milestone-5-synthetic-2026-10-07/README.md))
records the copy and redaction policy: copied logs are UTF-8/LF with only
machine path segments redacted to `<repo>/<worktree>/<temp>/<user-home>`, and no
factual line changed. This documentation worker writes only `DOCS-`-prefixed
logs of its own runs and never overwrites root/author logs. A final evidence
update (including the handler root gate log) follows the completed repairs.
Commands that depend on generated output, credentials, deployment, or live
resources are not executable instructions in this documentation. Use relative
repository paths or the placeholders above in future evidence.

## Prior milestone references

- [M3 infrastructure evidence](MILESTONE_3_EVIDENCE.md)
- [M4 domain/data-access evidence](MILESTONE_4_EVIDENCE.md)
- [Appwrite runbook](APPWRITE_RUNBOOK.md)
- [Package boundaries](../packages/README.md)
- [Development checks](DEVELOPMENT.md)
