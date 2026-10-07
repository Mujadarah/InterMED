# Milestone 5 evidence — synthetic-only importer

**Status (updated 2026-10-07, follow-up):** **OFFLINE CORE, CLIENT, AND
PRODUCER/READER COMPATIBILITY VERIFIED — FUNCTION HANDLER AND FINAL INTEGRATION
PENDING.** This file does not claim Milestone 5 acceptance. The importer core,
the Appwrite store client, the Function artifact builder, and the core-producer
→ M3 published-reader compatibility are implemented and verified offline by
tests and logs (matrix below). The Function handler/authority worker is still
pending (its publication-timestamp defect is open, so **handler retries are not
claimed**), the positive compiled handler flow has not been run, and no
integrated M5/M6 pass exists. **No M5 live action was authorized or executed:**
no raw operation intent, no private staging/import, no Function execution, no
deployment, no publication, and no cleanup.

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
  `infra/appwrite/functions/import-anmdmr/src/main.js` stub (still the committed
  state in this documentation worktree).
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
- No domain type or public contract was changed by Milestone 5 work. The public
  checksum contract keeps the existing M3 `sha256:<64 hex>` transport form.

## Implementation state (2026-10-07, offline only)

Verified from the implementation workers' API reports and root's independent
checks; source and logs live in the implementation worktrees, and the bounded
logs are copied into
[`docs/evidence/milestone-5-synthetic-2026-10-07/`](evidence/milestone-5-synthetic-2026-10-07/README.md).

| Component                                       | State                                                                                                                                                                                                                                                                  |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Importer core (`stage`/`publish`)               | **Verified offline.** Port-injected, deterministic identity, fail-closed quarantine and publication. Current head `d1200c7` (431 tests / 30 files)                                                                                                                     |
| Producer ↔ M3 published reader compatibility    | **Verified offline.** Core `publish` output projects into `createAppwritePublishedDatasetReader`; 9 focused tests. No M6 acceptance and no cryptographic bundle-hash activation claim: bundle-byte hash verification stays a downstream activation (M6) responsibility |
| Appwrite store client (thin bridge)             | **Verified offline** against a stateful fake of the Appwrite REST surface (58 focused tests) and reviewed independently with no code blockers (report-only). No delete/update exports; validation before any network call. Head `ad9303b`                              |
| Function artifact builder                       | **Verified offline.** 23-file Node-compatible artifact derived from the real runtime closure, built outside the repository. The entry layout is now `src/main.js`, matching `entrypoint: "src/main.js"` in `infra/appwrite/appwrite.config.*.json`. Head `57eb71f`     |
| Function handler and operation-intent authority | **PENDING.** The handler worker's draft report may still change; its operation-intent schema and invocation commands are not recorded as executable anywhere. Root's publication-time finding is open (below), so handler retry behaviour is **not** verified          |
| Positive compiled handler flow                  | **NOT YET RUN** (only the non-POST 405 refusal and the real domain codec round-trip are proven on `src/main.js`)                                                                                                                                                       |
| Final integration (root)                        | **PENDING.** Root runs the integrated gates serially after handler closure                                                                                                                                                                                             |

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
| Retry                                   | same inputs produce the same generation identity and bytes; valid retry reuses exact immutable content                                                            | OFFLINE VERIFIED (core only; handler retry PENDING)             | "produces baseline-independent deterministic bytes", "derives the generation only from raw SHA and canonical config before sealing", "retries twice without duplicate rows while the baseline advanced"; `task-b-core-real-green-stage.log`, `task-b-core-real-green-publisher.log`. The handler bridge defect below keeps handler-level retry unproven                             |
| Isolation/privacy                       | parse, validation, staging, log, and publication faults preserve prior public objects and leak no private material                                                | OFFLINE VERIFIED (offline fault injection)                      | stage fault table (7 injected ports) and publisher fault table (8 read/lock ports) "fails closed when %s fails"; "keeps prior published generations unchanged when %s fails" (3 write ports); "keeps run summaries and logs free of source text"; `task-b-core-real-green-stage.log`, `task-b-core-real-green-publisher.log`                                                        |
| Review binding                          | approval binds candidate/config SHA, raw SHA, baseline id/fingerprint, and rejects stale/mismatched approval                                                      | OFFLINE VERIFIED                                                | ten publisher tests on `ReviewData`/`ReviewApproval` tampering, missing review, incomplete review, record-count mismatch, stale baseline; `task-b-core-real-green-publisher.log`                                                                                                                                                                                                    |
| Hashes                                  | internal catalogue FNV remains; transport/public descriptor and manifest use lowercase `sha256:<64 hex>`                                                          | OFFLINE VERIFIED (contract tests); M6 integration PENDING       | "writes the manifest last and binds real descriptor and manifest fields" (checksum format asserted) and the unmocked pipeline tests; `task-b-core-real-green-publisher.log`, `task-b-core-real-green-core-stage-to-publish.log`                                                                                                                                                     |
| Snapshot contract                       | deserialize, referential integrity, serialized counts, provenance, and source metadata agree                                                                      | OFFLINE VERIFIED                                                | "proves the domain pipeline is unmocked", "runs raw bytes through staging to a committed publication" (real `deserializeCatalogue`, `validateSyntheticIntegrity`); `manifest.sourceIds` equals the real `datasetVersions[0].sourceIds`; `task-b-core-real-green-core-stage-to-publish.log`, `task-b-core-real-green-publisher.log`                                                  |
| Producer ↔ reader compatibility         | core publication projects into the M3 published reader (`createAppwritePublishedDatasetReader`) preserving id, checksum, counts, sourceIds, lineage               | OFFLINE VERIFIED (9 focused tests)                              | `task-b-ROOT-reader-d1200c7-focused.log`, `task-b-reader-compatibility.log`, `task-b-ROOT-core-reader-d1200c7-FULL.log`. Not proven here: M6 store ingestion and cryptographic bundle-hash verification/activation (downstream activation responsibility)                                                                                                                           |
| Publication order                       | immutable bundle, descriptor, then manifest **LAST**; no public update/delete path                                                                                | OFFLINE VERIFIED                                                | write-sequence assertion ("writes the manifest last…"), "rejects publication collisions without updates or deletes", "keeps an existing public orphan immutable and unadvertised", "resumes an interrupted publication creating only the missing components"; store client exports no delete/update; `task-b-core-real-green-publisher.log`, `task-b-store-bucketctx-green.log`     |
| Store transport contract                | strict ID/budget/shape/scoping validation before any network call; private vs public permission split; bounded query-object policy                                | OFFLINE VERIFIED (fakes only)                                   | `appwrite-store.test.ts` 58 passed after red/green cycles; `task-b-store-mimo-green.log` (48), `task-b-query-fix-green.log` (53), `task-b-store-bucketctx-green.log` (58); independent review PASS (report-only)                                                                                                                                                                    |
| Adapter authority                       | forged body authority, wrong/missing trusted config, raw URL, and malicious secret error are rejected                                                             | PARTIAL — store side verified offline; Function handler PENDING | store client "rejects untrusted config before network", constant `StoreError` messages, keys never echoed (`task-b-store-mimo-red.log`/`-green.log`); handler-side authority rejection awaits the handler worker's final report                                                                                                                                                     |
| Artifact                                | generated Node 22-compatible artifact is outside the repo and locally smoke-tested against fakes                                                                  | PARTIAL — smoke passed, positive flow PENDING                   | 23-file artifact inventory with entry `src/main.js` matching the Appwrite config entrypoint (no mock/fixture/in-memory module); child smoke on official Node v22.23.2 and v24.21.0: non-POST 405 refusal + real domain codec round-trip, zero network calls; `task-b-ROOT-artifact-57eb71f-node22.log`, `task-b-ROOT-artifact-57eb71f-FULL.log`, `runtime-node22-verification.json` |
| Public read-only wire format            | published reads accept indexed `queries[N]` and repeated `queries[]` SDK query objects and return the `{ total, rows }` envelope; invented array forms fail       | VERIFIED READ-ONLY (existing M3 objects)                        | read-only GET probes: `public-query-indexed-request-1.json`, `public-query-indexed-request-2.json`, `task-b-independent-public-query-arrayparam.json`, `task-b-independent-public-list-shape.json`, `task-b-independent-public-query-shape.json`                                                                                                                                    |
| Handler authority and operation intents | owner-created private intent is the only authority; strict `{ operationId }` envelope; constant fail-closed codes; publication time pinned to the approval intent | PENDING                                                         | handler worker pending; the draft operation-intent schema and invocation commands may still change and are deliberately not recorded as executable here. Root's publication-time finding (`task-b-handler-publication-time-finding.txt`) is open                                                                                                                                    |

## Counts and gates from the root command logs

Counts are taken from root's independent full `npm run check` runs (logs in the
evidence pack), never from review text. Independent reviews (core Gemini,
artifact follow-up, store client) are **report-only**: the core review's "29"
refers to the whole suite's 29 test files and must not be read as "29 importer
files".

| Scope (commit)                           | Unit tests (files)                | Browser tests | Gates                                                                       | Log                                                                                                                  |
| ---------------------------------------- | --------------------------------- | ------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Importer core `d1200c7` (current)        | 431 passed (30 files)             | 135 passed    | format/lint/typecheck/test/boundaries/audit/build/scan:dist/browser, exit 0 | `task-b-ROOT-core-reader-d1200c7-FULL.log`; focused reader proof `task-b-ROOT-reader-d1200c7-focused.log` (9 passed) |
| Store client `ad9303b` (current)         | 385 passed (29 files)             | 135 passed    | same sequence, exit 0                                                       | `task-b-ROOT-client-ad9303b-FULL.log` (root recapture after the log-name collision)                                  |
| Function artifact `57eb71f` (current)    | 328 passed (28 files)             | 135 passed    | same sequence, exit 0                                                       | `task-b-ROOT-artifact-57eb71f-FULL.log`; Node 22/24 smoke `task-b-ROOT-artifact-57eb71f-node22.log`                  |
| Importer core `6ad7009` (superseded)     | 422 passed (29 files)             | 135 passed    | same sequence, exit 0                                                       | `task-b-independent-core-6ad7009-check.log`                                                                          |
| Function artifact `6078537` (superseded) | 325 passed (28 files)             | 135 passed    | same sequence, exit 0                                                       | `task-b-independent-artifact-6078537-check.log`                                                                      |
| Store client earlier state (superseded)  | 375 passed (29 files)             | 135 passed    | same sequence, exit 0                                                       | `task-b-independent-store-mimo-final-check.log`                                                                      |
| Focused importer suite (core)            | 116 passed (6 files) at `6ad7009` | —             | `npx vitest run tests/importer`, exit 0                                     | `task-b-core-real-green-tests-importer.log`, `task-b-core-real-final-verify.log`                                     |

Retained failures are kept on purpose (no false "passed" claims): the root full
check at store commit `569c668` failed `format:check`
(`task-b-independent-store-569c668-check.log`), the earlier artifact build
failed with `ERR_MODULE_NOT_FOUND` on a pruned module
(`artifact-repair-red.log`), and the `core-repair` red run was already 5/5
green before implementation (`task-b-core-real-red-core-repair.log`). All
`*-red-*` logs keep their failing state. The log-name collision that overwrote
the first `ad9303b` full-check copy is documented in the pack README; root's
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

## Open defect: handler publication time (fix pending)

Root's finding (`task-b-handler-publication-time-finding.txt`) records that the
current handler storage bridge derives `publicationTimestamp` from `now()`,
which breaks immutable retry comparison when the wall clock advances even
though fixed-clock fakes pass. The required correction binds publication time
to an immutable field of the owner approval intent (for example `approvedAt`)
and adds a real handler retry test with the clock advanced between calls. This
is an importer-internal adapter correction: no domain or public contract
change. Until it lands and is tested, **no handler retry result is claimed**,
and the Appwrite string limits of the intent schema must be validated against
the infra configuration as part of the fix.

## M6 integration gap (recorded honestly)

M6 PR10 at head `8ef6fd8` still validates only the internal FNV fingerprint
against the public manifest checksum. That remains incompatible with the
established M3 public SHA-256 transport contract
(`sha256:<64 hex>` over the exact serialized bundle bytes). No domain or public
contract change is permitted to close it: the internal catalogue FNV checksum
stays, the public SHA-256 contract stays, and compatibility is an upstream M6
coordination item. **No integrated M5/M6 pass is claimed**, and the reader
compatibility proof above is explicitly not an M6 acceptance or a cryptographic
bundle-hash activation claim. The publisher now binds `manifest.sourceIds` to
the real `datasetVersions[0].sourceIds` (not `dataSource.sourceKey`), which is
the other M6 `checkBundle` contract; that fix is verified offline only.

## Open items before any acceptance claim

1. Function handler/authority worker final report (operation-intent schema and
   exact commands — currently draft and deliberately unrecorded as executable).
2. Handler publication-time binding fix plus a real handler retry test with an
   advanced clock (finding above).
3. Positive compiled artifact handler flow on Node 22 (beyond the 405 refusal
   and codec round-trip): the artifact closure must grow to include the real
   `stage`/`publish` pipeline (review item W-1).
4. Artifact review closure for W-1 and final integrated root gate run (root
   runs serially) after handler closure.
5. M6 PR10 SHA-256 validator compatibility (upstream coordination).
6. Every future live step requires separate owner approval (deploy to
   `intermed-dev`, private synthetic staging/import, bounded publication,
   read-only post-verification) as recorded in
   [the runbook](APPWRITE_RUNBOOK.md); the exact owner workflow commands stay
   pending the handler API.

## Evidence protocol

Implementation leads attach actual red/green logs and targeted gate results
before any cell changes. The evidence pack README
([`docs/evidence/milestone-5-synthetic-2026-10-07/README.md`](evidence/milestone-5-synthetic-2026-10-07/README.md))
records the copy and redaction policy: copied logs are UTF-8/LF with only
machine path segments redacted to `<repo>/<worktree>/<temp>/<user-home>`, and no
factual line changed. This documentation worker writes only `DOCS-`-prefixed
logs of its own runs and never overwrites root/author logs. Commands that
depend on generated output, credentials, deployment, or live resources are not
executable instructions in this documentation. Use relative repository paths or
the placeholders above in future evidence.

## Prior milestone references

- [M3 infrastructure evidence](MILESTONE_3_EVIDENCE.md)
- [M4 domain/data-access evidence](MILESTONE_4_EVIDENCE.md)
- [Appwrite runbook](APPWRITE_RUNBOOK.md)
- [Package boundaries](../packages/README.md)
- [Development checks](DEVELOPMENT.md)
