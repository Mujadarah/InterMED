# Milestone 5 evidence — synthetic-only importer

**Status (updated 2026-10-08, repair verified + focused review accepted):**
**OFFLINE CODE REPAIRED AND ROOT-VERIFIED AT `9a40644` (744 tests / 47 files /
150 browser, exit 0) AND THE FOCUSED REPAIR REVIEW IS ACCEPTED (REPAIR SCOPE
ONLY); CI AND THE PR ARE PENDING. NO M5 LIVE ACTION AND NO M5 ACCEPTANCE.** This
file does not claim Milestone 5 acceptance and does **not** claim B is ready:
readiness still needs CI and the PR. The earlier combined run (`4cbc9ed`,
734 / 46 / 150) and its accepted whole-patch static review, the confirmed
F1/F11/F9 findings, and the rejected broad review are retained below as dated
history. Verified offline by tests and
logs (matrix below):

- importer core `b0fdde8` at the synced `2bbbc38` — 452 tests / 31 files / 135
  browser;
- storage schema + canonical reader `41034c5` — 415 / 31 / 150;
- Function artifact `e30e8d1` — 333 / 28 / 135;
- **Function handler `01f7a4556e17608edb0865bacb3d421d23550847` — 634 / 38 /
  135**, from root's immutable
  `task-b-ROOT-handler-01f7a45-FULL.log`, **exit 0** on Node `v24.21.0` /
  npm `11.19.0` **and official Node `v22.23.2`**, including the real compiled
  generated Node 22 stage → publish → retry path and the real public-reader
  canonical round trip;
- this documentation head `bc508cd` — 310 / 24 / 135, exit 0;
- **final combined integration `4cbc9edf89a12590f1fa7821428758ac8ac86bec`
  (M6 main merged) — 734 / 46 / 150**, exit 0 from root's immutable
  `task-b-ROOT-integration-4cbc9ed-FULL.log`, printing `v24.21.0` / `11.19.0`
  **and** the actual Node `v22.23.2` compiled flow;
- **repair verified — author `9a40644e3dd292c3069b0e5be0d248dff97a1da8`
  (integrated `421da57`, tests `e61a983`) — 744 / 47 / 150**, exit 0 from
  root's immutable `task-b-ROOT-review-repair-9a40644-FULL.log`, printing
  `v24.21.0` / `11.19.0` **and** `v22.23.2`, with a clean tree before and
  after; the current integration `4fcd44f` carries that same author head with
  **M6, the domain, and the UI unchanged** (protected scope: no changes).

The combined run covers the known **M6 consumer hard reject** (the FNV-only
consumer versus the established public SHA-256 contract) as a documented,
non-blocking gap — it is **not** a bundle-hash activation claim. The **final
independent whole-patch static review at `4cbc9ed` is ACCEPTED with 0
reproducible blockers** (`task-b-FINAL-independent-review-4cbc9ed-report-only.txt`:
bounded static scope only — `git log`, `git diff`, and patch analysis, exits 0,
one known M6 gap recorded, verdict "SCOPED VERDICT: PASS / ACCEPTED (Pending
known M6 coordination issue)"). It is a static review, not a live or execution
proof. **CI and the PR are still pending**, and the independent review track is
covered by the dated status below — **no acceptance is claimed for B**.

**PR13 documentation review repair — IN PROGRESS (2026-10-08).** The PR13
review repair is **open, not finished**: **CI is red** (the required Node 22
runtime job is missing) and the secrets scanner flagged an **inert static
fixture value**; workers are implementing the required runtime and a dynamic
fake credential, and **three remaining P1s plus the retry-identity repairs are
still pending**. The public `861fe81` CodeRabbit changes stay **provisional
until independent verification** — root verified 115 tests of `861fe81`, origin
advanced to `7a3bea3` (comments-only) while root keeps this `861fe81`-based
commit, and **current CI is red**. API references for this pass come only from
**freely available MiMo documentation — no real data, no credentials, no live
calls**. **No acceptance-passed claim is made until root supplies the final
results later.** The future live **nullable 512 `datasetVersionId` schema**
remains a **separate owner approval** and an **M6 issue #12 owner, separate
PR** item with **no contract changes**.

**Status 2026-10-08 (first-pass triage → root-confirmed findings).** The
accepted `4cbc9ed` whole-patch static review above is retained as historical
record and is now **superseded by confirmed findings**, so **the code is NOT
ready**: acceptance requires **confirmed fixes, a root regression/full check,
and a fresh independent review**, then CI and the PR. No blanket first-pass
PASS is claimed and no M5 live action exists.

- **Confirmed by root:** **F1** — partial/recovery manifest resume bypasses the
  stale-baseline recheck, and **F11** — asymmetric stored-manifest
  `recordCounts` equality, both proven by the immutable RED run
  `task-b-ROOT-review-repair-ba3bff8-RED.log` (**5 failed / 2 passed** of 7
  tests). **F9** is a confirmed stale comment the author is correcting. Author
  **GREEN with actual source edits is now underway — no pass yet**, so repairs
  are **pending until proven**.
- **Triage, static only — the remaining eight (F2–F8, F10) are not defects:**
  **F2** deliberate fail-closed persistent lock (owner-only recovery
  prerequisite recorded in [the runbook](APPWRITE_RUNBOOK.md) section 10.0.1,
  **NOT EXECUTED**, never TTL steal); **F3** not proven, given immutable review
  ordering and no inconsistent staged publication shown; **F4** false positive —
  the fixed reason union; **F5** false positive — the regex copies currently
  match; **F6** false positive — parser and stage normalize from the same source
  and allowlist, so the current mismatch is not shown; **F7** bounded resource
  concern only, **no proven OOM** (the unsupported V8 memory-threshold assertion
  is rejected and not repeated); **F8** newest-ordered bounded 100-row window is
  deliberate, no wrong baseline shown; **F10** fail-closed constant 500 error
  policy.
- **Gemini 3.1 Pro expanded review: explicitly owner-approved and completed.**
  Its bounded source/tests/docs payload was approved, the **local 42-file scan
  came back clean**, and the capsule triage finished
  (`task-b-approved-gemini-triage-capsule.log`). This is **triage static only**:
  some Gemini line references are inaccurate (acquireLock 706, privateRow 396,
  baseline 464, publicationRowId 490 at `4cbc9ed`) and **root's actual
  references are authoritative**. An earlier auto-review rejection of the
  expanded payload is retained only as dated history, superseded by this
  approval.
- **Net result: two confirmed behavior defects (F1, F11) plus one stale comment
  (F9)** — not nine remaining after F9. Author **GREEN with actual source edits
  is now underway**; **no pass yet**, and the final repair proof can be appended
  later.

**Status 2026-10-08 (repairs verified offline; focused review pending).** This
supersedes the repair-pending note above; the earlier proofs stay as history.

- **F1, F11 and the F9 stale comment are repaired** in author head
  `9a40644e3dd292c3069b0e5be0d248dff97a1da8` (integrated `421da57`, tests
  `e61a983`): the baseline recheck now runs under the held lease across clean,
  partial and recovery-partial resume paths, `sameCounts` is bidirectional so an
  extra stored key raises `publication-collision`, and the `publicationRowId`
  JSDoc now limits the 36-char derivation to the physical manifest row `$id`.
- **Author proof:** recovery RED `task-b-review-repair-recovery-RED.log`
  (**7 failed / 3 passed of 10**) → GREEN `task-b-review-repair-GREEN.log`
  (**10 passed**); `task-b-review-repair-GATES.log` read actual: `format:check`,
  `check:boundaries`, `typecheck` and `lint` all **EXIT 0**; the author's WORKER
  REPORT is copied as
  `task-b-review-repair-GREEN-ACT-worker-report-only.txt`.
- **Root independent proof:** `task-b-ROOT-review-repair-9a40644-FULL.log` —
  **744 tests / 47 files / 150 browser, exit 0**, pinned `v24.21.0` / `11.19.0`
  **and** actual `v22.23.2`, clean tree before and after. The current
  integration `4fcd44f` is that same author head with **M6, the domain and the
  UI unchanged** (protected scope: no changes).
- **Independent reviews — focused ACCEPTED, broad rejected:** the focused
  independent F1/F11/F9 repair review completed **exit 0 with zero actionable
  findings and is ACCEPTED for the repair scope only**
  (`task-b-approved-gemini-focused-repair-review-4fcd44f-report-only.txt`); root
  checked the actual predicate and test-counter lines and confirmed the 43
  capsule hashes unchanged. The broad Gemini source review
  `task-b-approved-gemini-final-review-4fcd44f.log` was **rejected by root** —
  unsupported broad claims (encoding versus normalizer, query-limit versus
  baseline reasoning, no regression test listed) — and is **not accepted**; no
  blanket whole-patch claim is made, and the other modules keep their own
  separately dated reviews. The original `ba3bff8` RED and the `4cbc9ed` proofs
  are retained unchanged.
- **Still pending — no acceptance claimed:** **CI** and the **PR** (root owns
  the final integration full run and PR/CI), and
  **NO M5 live action**. The optional storage mapping — nullable unique
  `dataset-versions.datasetVersionId` at max 512, widened
  `dataset-bundles.datasetVersionId` and `dataset-versions.previousVersionId`
  at 512 — plus the data-access canonical `datasetVersionId` mapping stay
  **explicitly PR-flagged** and need **separate owner approval** for any live
  migration. Public and domain contract types are **unchanged**; M6
  **issue #12 keeps both gaps open**.

ROOT launched every run with the pinned toolchain on `PATH`; where a log does
not print versions, none was added to it, and the bounded
`task-b-ROOT-toolchain-recheck-2026-10-08.log` records the toolchain and heads
**without repeating any suite**.

The earlier proposal to **rebase the canonical `DatasetVersionId` onto an
opaque physical `$id` is cancelled** as a root architecture mistake (details in
[Canonical dataset version identity](#canonical-dataset-version-identity-corrected-2026-10-08)).
The earlier `0c16177` root full gate failure (5 of 598) and the `0266` RED run
(its middle "canonical must equal the physical `$id`" assertion is an invalid
root assumption) are **preserved, copied, and explained** as honest history, not
current state. **No M5 live action was authorized or executed:** no raw
operation intent, no private staging/import, no Function execution, no
deployment, no publication, no schema migration, and no cleanup. Production,
the shell/hosting project, and source rights are unchanged.

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

## Canonical dataset version identity (corrected 2026-10-08)

**Cancelled proposal.** Earlier drafts of this record proposed rebasing the
canonical `DatasetVersionId` onto an opaque, hashed physical row id so that one
value would fit the Appwrite row-id limit. That proposal is **cancelled
explicitly**: it was a **root architecture mistake**, because an opaque bundle
identity would require a forbidden domain contract change. Root verified the
real serializer path (`serialize.ts` → `parseStableId`) and the integrity check:
the domain requires exactly three `U+001F`-separated canonical parts
(`dv U+001F <sourceKey> U+001F <generationVersionKey>`), and
`previousVersionId` is validated the same way.

**Actual architecture.**

- The canonical domain id is preserved unchanged in the sealed bundle
  candidate bytes, provenance, and the public manifest
  (`manifest.datasetVersionId`). It is never rewritten to a physical id.
- Physical Appwrite row ids stay safe and separate: `/^[A-Za-z0-9._-]{1,36}$/`
  (`$id` ≤ 36). The descriptor id is a deterministic plain hash slice of the
  canonical id (≤ 36), and the bundle file name is a safe
  `bundle-<descriptorId>.json` with no control characters.
- Storage gains an **optional** canonical attribute:
  `dataset-versions.datasetVersionId` (string, max 512) with a **nullable
  unique index**, plus `dataset-bundles.datasetVersionId` and
  `dataset-versions.previousVersionId` extended to 512 so canonical ids fit.
  This is a **storage schema mapping only** — no new manifest field, no new
  type, no domain or public contract change, no M6 change.
- The public reader **prefers the canonical attribute**; when it is missing or
  `null` it falls back to the legacy physical `$id` (bounded legacy M3
  behavior); when it is present but malformed it **rejects** (fail closed, no
  silent fallback). Descriptor queries use the canonical id and fail closed on
  a mismatched returned row id.

**Not executed.** The live schema migration has **NOT been executed** and is
not confirmed on any live table. It requires a **separate owner approval**
before any deploy or any new publication, as recorded in
[the runbook](APPWRITE_RUNBOOK.md) section 10. Legacy M3 published rows that
lack the canonical attribute are a **known, bounded legacy fallback**, and no
claim is made that M6 activates the old M3 fixture.

## Implementation state (2026-10-08, offline only)

Verified from the implementation workers' API reports and root's independent
checks; source and logs live in the implementation worktrees, and the bounded
logs are copied into
[`docs/evidence/milestone-5-synthetic-2026-10-07/`](evidence/milestone-5-synthetic-2026-10-07/README.md).

| Component                                       | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Importer core (`stage`/`publish`)               | **Verified offline at `b0fdde8` (root full run on the synced `2bbbc38`: 452 tests / 31 files / 135 browser, exit 0).** The canonical repair landed **without rebasing**: canonical `dv U+001Fsource U+001Fgenkey` ids are preserved in bundle, provenance, and manifest, and only the physical descriptor id and file name are hashed to ≤ 36 safe characters. Also closed: `minimumClientVersion` (trimmed numeric `x.y.z`, ≤ 50), deterministic explicit raw lineage (`previousVersionKey` sits inside the raw hash and must derive the reviewed baseline; `active = self` restage preserves the original review), and absolute HTTPS descriptor URLs validated through the optional `resolvePublicUrl` callback (https only, no credentials, no fragment, no control characters). Static review: **ACCEPTED / no blockers (report-only)**; the reviewer's own probe ran 137 importer tests in 8 files. Core acceptance still waits on the handler/reader/schema sync and final integration                                                                                                                                                                                                                                           |
| Storage schema + canonical public reader        | **Verified offline at `41034c5` (root full run: 415 tests / 31 files / 150 browser, exit 0).** Adds the optional `dataset-versions.datasetVersionId` (max 512) column with a nullable unique index, and extends `dataset-bundles.datasetVersionId` / `dataset-versions.previousVersionId` to 512; the physical `$id` stays ≤ 36. The reader prefers the canonical attribute, falls back to `$id` only when it is missing or `null`, and **rejects a present-but-malformed** value. Static review: **no blockers (report-only)**. The live schema migration is **NOT executed** and needs separate owner approval                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Producer ↔ M3 published reader compatibility    | **Verified offline** at `d1200c7` (9 focused tests). No M6 acceptance and no cryptographic bundle-hash activation claim: bundle-byte hash verification stays a downstream activation (M6) responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Appwrite store client (thin bridge)             | **Verified offline** against a stateful fake of the Appwrite REST surface (58 focused tests) and reviewed independently with no code blockers (report-only). Head `ad9303b`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Function artifact builder                       | **Verified offline.** 23-file Node-compatible artifact derived from the real runtime closure, built outside the repository; entry `src/main.js` matches `entrypoint: "src/main.js"` in the configuration as code. Root full run at `e30e8d1`: **333 tests / 28 files / 135 browser, exit 0**; static lock-projection/supply-chain review **no blockers (report-only)**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Function handler and operation-intent authority | **VERIFIED OFFLINE at `01f7a45` (`01f7a4556e17608edb0865bacb3d421d23550847`) — no live action.** Root's immutable full run exited 0: 634 tests / 38 files / 135 browser on Node `v24.21.0` / npm `11.19.0`, with official Node `v22.23.2` for the compiled artifact flow. The canonical mapping now persists the canonical `datasetVersionId` (≤ 512, `U+001F` allowed) on descriptor and manifest rows while the physical `$id` stays ≤ 36 (`publicationRowId()`); `resolvePublicUrl` returns the real flat HTTPS download URL with no fragment; baseline queries use the persisted canonical attribute. The real public-reader round trip covers first and second generation, advancing-clock idempotency, `active = self` restaging, and baseline tampering. Author red/green: `task-b-handler-canonical-red.log` (1 failed, publish 403 before the repair) then `-green.log` (1 passed). Independent static review **ACCEPTED, no blockers — changed-repair scope only** (`intent.js` + `storage-bridge.js` plus the changed tests; the reviewer added no new tests and did not perform a whole-patch review). The operation-intent schema is still documented from `0c16177` and must be re-read at `01f7a45` before any execution |
| Positive compiled handler flow                  | **VERIFIED OFFLINE.** The real compiled generated Node 22 stage → publish → retry path is green on official Node `v22.23.2` (and `v24.21.0`), and the real M3 public reader reads back the canonical round trip; the non-POST 405 refusal and real domain codec round-trip remain covered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Final integration (root)                        | **COMBINED ROOT FULL PASSED at `4cbc9ed`; FINAL WHOLE-PATCH STATIC REVIEW ACCEPTED; CI/PR pending.** Root's immutable full run at the clean integration `4cbc9edf89a12590f1fa7821428758ac8ac86bec` with M6 main merged: **734 tests / 46 files / 150 browser, exit 0**, on Node `v24.21.0` / npm `11.19.0` with the actual Node `v22.23.2` compiled flow. This documentation head `bc508cd` also passed (310 / 24 / 135). The final independent whole-patch static review at `4cbc9ed` is **ACCEPTED, 0 reproducible blockers**, bounded to `git log` / `git diff` / patch analysis (`task-b-FINAL-independent-review-4cbc9ed-report-only.txt`). **CI and the PR are pending**, and the eleven-file first-pass review is now reported: **F1** and **F11** root-confirmed RED at `ba3bff8` plus **F9** stale comment, the other eight triage — repairs for **F1**, **F11** and **F9** have landed and are root-verified at `9a40644` (744 / 47 / 150, exit 0) and the focused repair review is **ACCEPTED (repair scope only)**, so the remaining blockers are **CI and the PR**, and no M5 acceptance is claimed; the known M6 consumer hard reject stays documented and is **not** an activation claim                                 |

## Acceptance and evidence matrix

Required checks and their current evidence. `OFFLINE VERIFIED` means the named
tests ran green with the named logs; it is not a live or acceptance result.
Every `PENDING` cell stays open until the named owner report exists.

| Area                                    | Required behavior                                                                                                                                                                     | Status                                                            | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Input shape                             | malformed, missing, blank, truncated, unsupported schema/encoding                                                                                                                     | OFFLINE VERIFIED                                                  | `parser.test.ts` (24) and `stage.test.ts` (33): invalid envelope/JSON root, non-synthetic marker, forged counts, `maxRawBytes`/`maxRows` bounds, unsupported encoding; `task-b-core-real-green-parser.log`, `task-b-core-real-green-stage.log`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Duplicates                              | identical duplicate warns/deduplicates; conflicting duplicate quarantines                                                                                                             | OFFLINE VERIFIED                                                  | "collapses identical duplicate rows before the counts check", "fails closed on conflicting rows sharing one key", "deduplicates rows keyed by source ingredient id as well"; `task-b-core-real-green-parser.log`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Text identity                           | UTF-8, BOM, Windows-1250; NFC; legacy cedilla `ş/ţ` mapping; `ă/â/î` remain distinct; no fuzzy merge                                                                                  | OFFLINE VERIFIED                                                  | `decodeBytes` tests (8): BOM strip, Windows-1250 legacy cedilla folding, NFC normalization, verbatim `șțăâî`, unsupported/invalid bytes throw; `task-b-core-real-green-parser.log`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Combinations                            | every explicit ingredient join is preserved and expanded deterministically                                                                                                            | OFFLINE VERIFIED                                                  | M4 domain combination-expansion tests plus importer link comparison ("detects related ingredient link changes as product changes"); `task-b-core-real-green-stage.log`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Removal safety                          | empty/partial input quarantines; large complete removal requires threshold reason and explicit review                                                                                 | OFFLINE VERIFIED                                                  | "always quarantines empty snapshots and never writes a candidate", "always quarantines partial and incomplete snapshots with no candidate", "writes a private large-drop quarantine and keeps the candidate reviewable", "rejects unapproved large removals and publishes with threshold approval"; `task-b-core-real-green-stage.log`, `task-b-core-real-green-publisher.log`                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Retry                                   | same inputs produce the same generation identity and bytes; valid retry reuses exact immutable content                                                                                | OFFLINE VERIFIED (core and handler)                               | core: "produces baseline-independent deterministic bytes", "derives the generation only from raw SHA and canonical config before sealing", "retries twice without duplicate rows while the baseline advanced"; handler at `01f7a45`: real compiled stage → publish → retry on official Node 22.23.2 plus advancing-clock idempotency and `active = self` restaging in `handler-reader-identity.test.ts`; `task-b-ROOT-handler-01f7a45-FULL.log`, `task-b-core-real-green-stage.log`, `task-b-core-real-green-publisher.log`                                                                                                                                                                                                                                                                                                                      |
| Isolation/privacy                       | parse, validation, staging, log, and publication faults preserve prior public objects and leak no private material                                                                    | OFFLINE VERIFIED (offline fault injection)                        | stage fault table (7 injected ports) and publisher fault table (8 read/lock ports) "fails closed when %s fails"; "keeps prior published generations unchanged when %s fails" (3 write ports); "keeps run summaries and logs free of source text"; `task-b-core-real-green-stage.log`, `task-b-core-real-green-publisher.log`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Review binding                          | approval binds candidate/config SHA, raw SHA, baseline id/fingerprint, and rejects stale/mismatched approval                                                                          | OFFLINE VERIFIED                                                  | ten publisher tests on `ReviewData`/`ReviewApproval` tampering, missing review, incomplete review, record-count mismatch, stale baseline; `task-b-core-real-green-publisher.log`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Hashes                                  | internal catalogue FNV remains; transport/public descriptor and manifest use lowercase `sha256:<64 hex>`                                                                              | OFFLINE VERIFIED (contract tests); M6 coordination PENDING        | "writes the manifest last and binds real descriptor and manifest fields" (checksum format asserted) and the unmocked pipeline tests; `task-b-core-real-green-publisher.log`, `task-b-core-real-green-core-stage-to-publish.log`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Snapshot contract                       | deserialize, referential integrity, serialized counts, provenance, and source metadata agree                                                                                          | OFFLINE VERIFIED                                                  | "proves the domain pipeline is unmocked", "runs raw bytes through staging to a committed publication" (real `deserializeCatalogue`, `validateSyntheticIntegrity`); `manifest.sourceIds` equals the real `datasetVersions[0].sourceIds`; `task-b-core-real-green-core-stage-to-publish.log`, `task-b-core-real-green-publisher.log`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Producer ↔ reader compatibility         | core publication projects into the M3 published reader (`createAppwritePublishedDatasetReader`) preserving id, checksum, counts, sourceIds, lineage                                   | OFFLINE VERIFIED (9 focused tests + canonical round trip)         | `task-b-ROOT-reader-d1200c7-focused.log`, `task-b-reader-compatibility.log`, `task-b-ROOT-core-reader-d1200c7-FULL.log`; reader query objects and canonical `datasetVersionId` field agreement are verified offline at `41034c5` and through the real reader round trip at `01f7a45` (`task-b-ROOT-handler-01f7a45-FULL.log`). Not proven here: M6 store ingestion and cryptographic bundle-hash verification/activation (downstream activation responsibility); the live canonical column migration is still not executed                                                                                                                                                                                                                                                                                                                       |
| Public generation identity              | the canonical `DatasetVersionId` (`dv U+001Fsource U+001Fgenkey`) stays in the bundle, provenance, and manifest, while the physical Appwrite row `$id` stays safe (≤ 36) and separate | OFFLINE VERIFIED at `b0fdde8`/`41034c5`; live schema NOT executed | the earlier repair plan — a deterministic **opaque id rebased before sealing** so one value could be the canonical id _and_ the row `$id` — is **cancelled as a root architecture mistake** (it would require a forbidden domain contract change). Delivered instead: canonical ids preserved verbatim; deterministic plain hash descriptor id matching `^[A-Za-z0-9._-]{1,36}$`; optional `dataset-versions.datasetVersionId` (max 512) with a nullable unique index; `dataset-bundles.datasetVersionId` and `dataset-versions.previousVersionId` extended to 512; reader prefers the canonical attribute, falls back to `$id` only when missing/`null`, and rejects a present-but-malformed value. Evidence: `task-b-ROOT-core-b0fdde8-canonical-FULL.log`, `task-b-ROOT-reader-41034c5-FULL.log`, `task-b-core-public-identity-repair-api.md` |
| Publication order                       | immutable bundle, descriptor, then manifest **LAST**; no public update/delete path                                                                                                    | OFFLINE VERIFIED                                                  | write-sequence assertion ("writes the manifest last…"), "rejects publication collisions without updates or deletes", "keeps an existing public orphan immutable and unadvertised", "resumes an interrupted publication creating only the missing components"; store client exports no delete/update; `task-b-core-real-green-publisher.log`, `task-b-store-bucketctx-green.log`                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Store transport contract                | strict ID/budget/shape/scoping validation before any network call; private vs public permission split; bounded query-object policy                                                    | OFFLINE VERIFIED (fakes only)                                     | `appwrite-store.test.ts` 58 passed after red/green cycles; `task-b-store-mimo-green.log` (48), `task-b-query-fix-green.log` (53), `task-b-store-bucketctx-green.log` (58); independent review PASS (report-only)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Adapter authority                       | forged body authority, wrong/missing trusted config, raw URL, and malicious secret error are rejected                                                                                 | OFFLINE VERIFIED (store and handler, fakes only)                  | store client "rejects untrusted config before network", constant `StoreError` messages, keys never echoed (`task-b-store-mimo-red.log`/`-green.log`); handler intent validation at `01f7a45` binds candidate constraints and rejects unsafe control codes (`isVersionId`, ≤ 512, `U+001F` allowed) per the static review; `task-b-ROOT-handler-01f7a45-FULL.log`. No live authority claim                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Artifact                                | generated Node 22-compatible artifact is outside the repo and locally smoke-tested against fakes                                                                                      | OFFLINE VERIFIED (positive flow on official Node 22)              | 23-file artifact inventory with entry `src/main.js` matching the Appwrite config entrypoint (no mock/fixture/in-memory module); official Node v22.23.2 plus v24.21.0: non-POST 405 refusal, real domain codec round-trip, and at `01f7a45` the real compiled stage → publish → retry path, zero network calls; `task-b-ROOT-handler-01f7a45-FULL.log`, `task-b-ROOT-artifact-57eb71f-node22.log`, `runtime-node22-verification.json`                                                                                                                                                                                                                                                                                                                                                                                                             |
| Public read-only wire format            | published reads accept indexed `queries[N]` and repeated `queries[]` SDK query objects and return the `{ total, rows }` envelope; invented array forms fail                           | VERIFIED READ-ONLY (existing M3 objects)                          | read-only GET probes: `public-query-indexed-request-1.json`, `public-query-indexed-request-2.json`, `task-b-independent-public-query-arrayparam.json`, `task-b-independent-public-list-shape.json`, `task-b-independent-public-query-shape.json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Handler authority and operation intents | owner-created private intent is the only authority; strict `{ operationId }` envelope; constant fail-closed codes; publication time pinned to the approval intent                     | OFFLINE VERIFIED at `01f7a45` (nothing executed)                  | schema documented concretely (runbook section 10.0) from the handler source at `0c16177`; root's full run at `01f7a45` is exit 0 (634 / 38 / 135) with the intent-authority tests green, and the changed-repair static review found no blockers (scope: `intent.js` + `storage-bridge.js` and changed tests). Re-read the schema at `01f7a45` before any execution; **nothing is recorded as executed**                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## Counts and gates from the root command logs

Counts are taken from root's independent full `npm run check` runs (logs in the
evidence pack), never from review text. All three newest runs were launched by
ROOT with the pinned toolchain on `PATH` (Node `v24.21.0`, npm `11.19.0`) and
each ended with `exit 0`. Version output is **not** present in every log: the
core `b0fdde8` log prints `v24.21.0` / `11.19.0` at its head, while the artifact
`e30e8d1` and reader `41034c5` logs preserve the original `npm run check`
output and print no version lines — none was added to them. The separate
`task-b-ROOT-toolchain-recheck-2026-10-08.log` prints the current `v24.21.0` /
`11.19.0` and the current heads (`e30e8d1`, `41034c5`, `2bbbc38`) and states
explicitly that it is **not** a repeat of the completed full suites.
Independent reviews (core, artifact, reader, store client) are **report-only**:
the core review's "29" refers to the whole suite's 29 test files and must not
be read as "29 importer files".

| Scope (commit)                                      | Unit tests (files)                             | Browser tests | Gates                                                                                                                                                                                                                                        | Log                                                                                                                                                                                                                                                        |
| --------------------------------------------------- | ---------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core canonical repair `b0fdde8` at synced `2bbbc38` | 452 passed (31 files)                          | 135 passed    | format/lint/typecheck/test/boundaries/audit/build/scan:dist/browser, exit 0; log head prints pinned `v24.21.0` / `11.19.0`                                                                                                                   | `task-b-ROOT-core-b0fdde8-canonical-FULL.log`; static review `task-b-core-independent-review-b0fdde8-report-only.txt` (no blockers)                                                                                                                        |
| Storage schema + canonical reader `41034c5`         | 415 passed (31 files)                          | 150 passed    | same sequence, exit 0; ROOT pinned-PATH launch, this log prints no version lines                                                                                                                                                             | `task-b-ROOT-reader-41034c5-FULL.log`; static review `task-b-reader-independent-review-41034c5-report-only.txt` (no blockers)                                                                                                                              |
| Function artifact `e30e8d1`                         | 333 passed (28 files)                          | 135 passed    | same sequence, exit 0; ROOT pinned-PATH launch, this log prints no version lines                                                                                                                                                             | `task-b-ROOT-artifact-e30e8d1-FULL.log`; static review `task-b-artifact-independent-review-e30e8d1-report-only.txt` (no blockers)                                                                                                                          |
| Toolchain recheck (2026-10-08)                      | no suite run                                   | —             | prints `v24.21.0` / `11.19.0` and heads `e30e8d1`, `41034c5`, `2bbbc38`; explicitly **not** a repeat of the completed full suites                                                                                                            | `task-b-ROOT-toolchain-recheck-2026-10-08.log`                                                                                                                                                                                                             |
| Importer core `d1200c7` (superseded by `b0fdde8`)   | 431 passed (30 files)                          | 135 passed    | format/lint/typecheck/test/boundaries/audit/build/scan:dist/browser, exit 0                                                                                                                                                                  | `task-b-ROOT-core-reader-d1200c7-FULL.log`; focused reader proof `task-b-ROOT-reader-d1200c7-focused.log` (9 passed)                                                                                                                                       |
| Store client `ad9303b`                              | 385 passed (29 files)                          | 135 passed    | same sequence, exit 0                                                                                                                                                                                                                        | `task-b-ROOT-client-ad9303b-FULL.log` (root recapture after the log-name collision)                                                                                                                                                                        |
| Function artifact `57eb71f`                         | 328 passed (28 files)                          | 135 passed    | same sequence, exit 0                                                                                                                                                                                                                        | `task-b-ROOT-artifact-57eb71f-FULL.log`; Node 22/24 smoke `task-b-ROOT-artifact-57eb71f-node22.log`                                                                                                                                                        |
| Final combined integration `4cbc9ed`                | 734 passed (46 files)                          | 150 passed    | format/lint/typecheck/test/boundaries/audit/build/scan:dist/browser, exit 0; log head prints `v24.21.0` / `11.19.0` and `v22.23.2` (actual compiled flow)                                                                                    | `task-b-ROOT-integration-4cbc9ed-FULL.log` (immutable root run, M6 main merged); known M6 consumer hard reject documented, not an activation claim; whole-patch static review ACCEPTED at 0 blockers, CI/PR pending                                        |
| Repair verified `9a40644` (root full)               | 744 passed (47 files)                          | 150 passed    | format/lint/typecheck/test/boundaries/audit/build/scan:dist/browser, exit 0; log head prints Node `v24.21.0` / npm `11.19.0` and Node `v22.23.2`; clean tree before and after                                                                | `task-b-ROOT-review-repair-9a40644-FULL.log` (authoritative); author `task-b-review-repair-recovery-RED.log` 7 failed / 3 passed of 10 → `task-b-review-repair-GREEN.log` 10 passed; `task-b-review-repair-GATES.log` EXIT 0 each                          |
| M6 coordination repro rerun (root, RED)             | 3 failed (3 expected)                          | —             | portable repro `tests/m6-coordination-repro.test.ts`, exit 1; pinned Node `v24.21.0` / npm `11.19.0` as reported by root — the log prints no version line and none was added; temporary test removed afterwards, M6 and the domain unchanged | `task-b-ROOT-m6-coordination-RED.log` — **3/3 expected failures**: Gap 1 (clean `sha256:`-checksummed generation hard-rejected), Gap 2 (preserved source-token notes still hard-rejected), control (reason is `checksum-mismatch`, not `integrity-failed`) |
| Function handler `01f7a45` (authoritative)          | 634 passed (38 files)                          | 135 passed    | format/lint/typecheck/test/boundaries/audit/build/scan:dist/browser, exit 0; log head prints `v24.21.0` / `11.19.0` and `v22.23.2`                                                                                                           | `task-b-ROOT-handler-01f7a45-FULL.log` (immutable root run); author red/green `task-b-handler-canonical-red.log` / `-green.log`; static review `task-b-handler-independent-review-01f7a45-report-only.txt` (changed-repair scope, no blockers)             |
| Documentation head `bc508cd`                        | 310 passed (24 files)                          | 135 passed    | same sequence, exit 0 (pinned `v24.21.0` / `11.19.0`)                                                                                                                                                                                        | `task-b-ROOT-docs-bc508cd-FULL.log`                                                                                                                                                                                                                        |
| Function handler `0c16177` (superseded failure)     | **593 passed, 5 failed (598 tests, 35 files)** | not reached   | **FAILED** at `npm run test` (npm offline-cache `ENOTCACHED` during the artifact lock step, plus a stale artifact dependency assertion)                                                                                                      | `task-b-ROOT-handler-0c16177-FULL.log` (copied; retained as honest history). Author reported one failure; the root result is authoritative                                                                                                                 |
| Handler reader run `0266d8` (superseded RED)        | **RED** — canonical mismatch                   | not reached   | Real canonical mismatch plus an **invalid middle assertion** that the canonical id must equal the physical Appwrite `$id`                                                                                                                    | `task-b-ROOT-handler-0266d8-RED.log` (copied; retained as honest history — not three production bugs)                                                                                                                                                      |
| Importer core `6ad7009` (superseded)                | 422 passed (29 files)                          | 135 passed    | same sequence, exit 0                                                                                                                                                                                                                        | `task-b-independent-core-6ad7009-check.log`                                                                                                                                                                                                                |
| Function artifact `6078537` (superseded)            | 325 passed (28 files)                          | 135 passed    | same sequence, exit 0                                                                                                                                                                                                                        | `task-b-independent-artifact-6078537-check.log`                                                                                                                                                                                                            |
| Store client earlier state (superseded)             | 375 passed (29 files)                          | 135 passed    | same sequence, exit 0                                                                                                                                                                                                                        | `task-b-independent-store-mimo-final-check.log`                                                                                                                                                                                                            |
| Focused importer suite (core)                       | 116 passed (6 files) at `6ad7009`              | —             | `npx vitest run tests/importer`, exit 0                                                                                                                                                                                                      | `task-b-core-real-green-tests-importer.log`, `task-b-core-real-final-verify.log`                                                                                                                                                                           |

Retained failures are kept on purpose (no false "passed" claims): the root full
check at store commit `569c668` failed `format:check`
(`task-b-independent-store-569c668-check.log`), the earlier artifact build
failed with `ERR_MODULE_NOT_FOUND` on a pruned module
(`artifact-repair-red.log`), and the `core-repair` red run was already 5/5
green before implementation (`task-b-core-real-red-core-repair.log`). All
`*-red-*` logs keep their failing state, and the handler gate failure above is
recorded as a failure, not softened. The two superseded handler failures —
`0c16177` (5 of 598) and `0266d8` (RED) — are **now copied into this pack**
(`task-b-ROOT-handler-0c16177-FULL.log`, `task-b-ROOT-handler-reader-0266d8-RED.log`)
so the history is auditable rather than summarized, and the dirty WIP handler
proof stays in the orchestration store labelled **nonfinal / not
authoritative**. The log-name collision that overwrote the first `ad9303b`
full-check copy is documented in the pack README; root's recapture is
authoritative and the colliding focused run is preserved as
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

## Handler state (verified offline at `01f7a45` — no acceptance, nothing executed)

- **Repair closed and root-verified.** The handler canonical mapping at
  `01f7a4556e17608edb0865bacb3d421d23550847` is proven by root's immutable
  full run `task-b-ROOT-handler-01f7a45-FULL.log`: **634 tests / 38 files /
  135 browser tests, exit 0**, on Node `v24.21.0` / npm `11.19.0` and official
  Node `v22.23.2`. It includes the **real compiled generated Node 22 stage →
  publish → retry path** and the **real M3 public-reader canonical round trip**
  (first and second generation, advancing-clock idempotency, `active = self`
  restaging, baseline tampering).
- **Author red/green:** `task-b-handler-canonical-red.log` — the new
  `handler-reader-identity` test failed (publish returned 403) before the
  repair; `task-b-handler-canonical-green.log` — 1 passed afterwards.
- **Independent static review (report-only):**
  `task-b-handler-independent-review-01f7a45-report-only.txt`, verdict
  **ACCEPTED**, no blockers. Its scope is deliberately narrow — the two changed
  source files (`intent.js`, `storage-bridge.js`) plus the changed tests. The
  reviewer wrote **no new tests** and did **not** run a comprehensive
  whole-patch review; this is not described as one anywhere.
- **Prior root proof kept as non-authoritative:** a dirty working-tree WIP run
  exists in the orchestration store (`task-b-ROOT-handler-canonical-WIP-FULL.log`
  and `…-WIP-node22.log`) and is labelled **nonfinal / not authoritative**; it
  is not copied here because the immutable `01f7a45` full run supersedes it.
- **Honest history preserved and now copied:** the earlier root full gate at
  `0c16177` **failed 5 of 598** (ambient npm offline-cache `ENOTCACHED` for the
  pinned `zod` fetch in the artifact runtime-lock step, plus a stale artifact
  dependency assertion; the author reported one failure — the root result is
  the one recorded), and the `0266d8` run is **RED** on a real canonical
  mismatch **plus** an invalid middle assertion that the canonical id must equal
  the physical Appwrite `$id`. Both logs are copied unchanged apart from path
  redaction, neither is softened, and this is **not** a claim of three
  production bugs.
- **Schema caveat:** the concrete operation-intent schema in
  [the runbook](APPWRITE_RUNBOOK.md) section 10.0 was documented from `0c16177`;
  re-read it at `01f7a45` (canonical ids up to 512 including `U+001F`, the
  `isVersionId` control-code rules) before any execution.
- **No live state.** No M5 live action exists — no raw operation intent, no
  private staging/import, no Function execution, no deployment, no schema
  migration, no publication, no cleanup. Production, the shell/hosting project,
  and source rights are unchanged. The final combined root run and the final
  whole-patch static review are retained as historical green record, but **F1**
  and **F11** are root-confirmed RED at `ba3bff8`, so acceptance requires
  **confirmed fixes (landed and root-verified at `9a40644`), the focused
  repair review (accepted, repair scope only), CI and the PR (the last two
  pending)**.

## M6 status: PR10 merged, contract conflict open, coordination issue posted

M6 PR10 is merged (head `8ef6fd8`, merge commit
`729ccfc797358499398b2bbf811f2f7d87bffa02`); the clean integration `384f5d8`
retains both the importer and `local-store` workspaces, and the final combined
root run at `4cbc9ed` with M6 main merged passed (734 tests / 46 files / 150
browser, exit 0).

The merged validator still checks only the internal FNV fingerprint against the
public manifest checksum, so the known conflict with the established M3 public
SHA-256 transport contract (`sha256:<64 hex>` over the exact serialized bundle
bytes) is a **hard reject**, recorded here unchanged and **still NOT FIXED by
this work**: the internal catalogue FNV checksum stays, the public SHA-256
contract stays, and no domain or public contract change is proposed to close
it. Two further notes remain **intentional domain behavior that this consumer
rejects**, also **not fixed here**: the **`invalid-unit`** note and the
**`ambiguous-decimal`** note — both are nonfatal **note codes** reported by the
M6 consumer, not the canonical `U+001F` part separator (that separator is only
the delimiter inside the canonical `dv U+001F source U+001F genkey` id). The
consumer refuses these notes rather than normalizing them — a consumer-side
limitation, not a license to change the domain.

**Coordination issue: posted.** The owner approved it and root posted it —
**<https://github.com/Mujadarah/InterMED/issues/12>**. It records the two known
M6 gaps (the FNV-only consumer versus the established public SHA-256 contract,
and the `invalid-unit` / `ambiguous-decimal` note handling). Nothing here claims
the issue is fixed or closed: **both gaps remain open**, Claude will address
them in a **separate PR that closes that issue**, and this worker makes **no M6
edits**.

**Root's portable repro rerun (2026-10-08, RED).** Root independently reran the
portable M6 coordination reproduction against the current head —
`task-b-ROOT-m6-coordination-RED.log`: **3 of 3 expected failures, exit 1**, run
with the pinned Node `v24.21.0` / npm `11.19.0` toolchain as reported by root
(the log prints no version line, and none was added to it). The failures are the
recorded gaps themselves: Gap 1 hard-rejects a clean generation whose checksum
is the public `sha256:` of the uploaded bytes, Gap 2 still hard-rejects a
generation carrying only the preserved source-token notes, and the control
returns `checksum-mismatch` where `integrity-failed` was expected. The
temporary reproduction test was **removed afterwards**, and **M6 and the domain
are unchanged** — this is a read-only proof of the open gap, not a code change.

**Diagnostic config run (2026-10-08, PASS, not a fix).** Root also ran an
existing external diagnostic config with `COORD-m6-diagnostic.test.ts` —
`task-b-ROOT-m6-diagnostic.log`: **2 of 2 passed, exit 0**, with no
M6 source edits and no activation. It neutralizes **Gap 1 only, in memory**, to
expose the `invalid-unit` / `ambiguous-decimal` rejections; it changes no M6
file and is **not a fix** for either gap.

**Contract/type changes: none.** The only schema-side change in this
milestone's work is the optional storage mapping described above
(`datasetVersionId`/`previousVersionId` capacity plus reader fallback), which
touches no M6 file, no domain type, and no public manifest field. Legacy M3
published rows keep an opaque public `$id` while the inner canonical id is
absent — that is a **known, bounded legacy fallback**, not an M6 activation
claim. The passing combined run is therefore **not** an M6 acceptance and
**not** a cryptographic bundle-hash activation claim.

## Open items before any acceptance claim

1. **Final independent review, then CI and the PR (pending).** The repairs for
   F1, F11 and F9 are **landed and root-verified** at author `9a40644`
   (root full **744 / 47 / 150, exit 0**, clean before and after; author RED
   7 failed / 3 passed of 10 then GREEN 10 passed; gates EXIT 0 each), and the
   current integration `4fcd44f` keeps M6, the domain and the UI unchanged.
   The focused independent F1/F11/F9 repair review is **ACCEPTED (exit 0, zero
   actionable findings, repair scope only)**, while the broad Gemini report
   stays **rejected / not accepted** — no blanket whole-patch claim. **B is not
   claimed ready** until **CI and the PR** are observed green; root owns the
   final integration full run and PR/CI.
2. Optional storage schema migration (`dataset-versions.datasetVersionId` max
   512 with a nullable unique index, plus 512-capacity
   `dataset-bundles.datasetVersionId` and `dataset-versions.previousVersionId`)
   is **NOT executed** and **no live field is confirmed**; it is a separate
   owner-approved prerequisite in [the runbook](APPWRITE_RUNBOOK.md) section 10,
   required before any deploy or any new publication.
3. M6 coordination issue — **posted**:
   <https://github.com/Mujadarah/InterMED/issues/12> (owner-approved,
   root-posted). The FNV-only versus public SHA-256 hard reject and the
   `invalid-unit` / `ambiguous-decimal` note handling are **not fixed here**;
   root's portable repro rerun is RED 3/3 as expected
   (`task-b-ROOT-m6-coordination-RED.log`) and its temporary test was removed.
   Claude fixes them in **a separate PR closing that issue**, with no M6 edits
   in this workstream; **no closure or fix is claimed**.
4. Re-read the operation-intent schema at `01f7a45` before any execution —
   [the runbook](APPWRITE_RUNBOOK.md) section 10.0 still documents `0c16177`.
5. Every future live step requires separate owner approval (schema migration,
   deploy to `intermed-dev`, private synthetic staging/import, bounded
   publication, read-only post-verification) exactly as recorded in
   [the runbook](APPWRITE_RUNBOOK.md) section 10; nothing there has been
   executed.
6. Source rights stay `not-approved` (blocked) and synthetic clinical
   references stay `not-reviewed`; no real source, name, or format can be
   imported until an owner approves rights and review.

## Evidence protocol

Implementation leads attach actual red/green logs and targeted gate results
before any cell changes. The evidence pack README
([`docs/evidence/milestone-5-synthetic-2026-10-07/README.md`](evidence/milestone-5-synthetic-2026-10-07/README.md))
records the copy and redaction policy: copied logs are UTF-8/LF with only
machine path segments redacted to `<repo>/<worktree>/<temp>/<user-home>`, and no
factual line changed — no version line or test result was added to any copied
log. This documentation worker writes only `DOCS-FREE-FINAL-`-prefixed logs of
its own runs and never overwrites root/author logs. The 2026-10-08 updates
copied **only named proof files**: the core/reader/artifact root full logs with
their static reviews and the toolchain recheck, then the handler proof set
(`task-b-ROOT-handler-01f7a45-FULL.log`, the changed-repair static review
renamed `*-report-only.txt`, `task-b-handler-canonical-final-api.md`, the author
`task-b-handler-canonical-red.log` / `-green.log`, and
`task-b-ROOT-docs-bc508cd-FULL.log`), then the authoritative combined run
`task-b-ROOT-integration-4cbc9ed-FULL.log`, the final whole-patch static review
`task-b-FINAL-independent-review-4cbc9ed-report-only.txt` (renamed because it
does not pass `prettier --check` as Markdown; content otherwise byte-identical),
root's portable M6 repro rerun `task-b-ROOT-m6-coordination-RED.log` and its
diagnostic config run `task-b-ROOT-m6-diagnostic.log`, then the approved
first-pass report-only stdout `task-b-approved-free-first-pass-resume.log`, the
Gemini triage capsule stdout `task-b-approved-gemini-triage-capsule.log`, the
public-identifier-only `payload-verification.json` (no values), and the
immutable root RED `task-b-ROOT-review-repair-ba3bff8-RED.log`, then the repair
proof set — root's authoritative full `task-b-ROOT-review-repair-9a40644-FULL.log`,
the author's `task-b-review-repair-recovery-RED.log` / `-GREEN.log` /
`-GATES.log`, and the author report-only
`task-b-review-repair-GREEN-ACT-worker-report-only.txt`, and the accepted focused
review
`task-b-approved-gemini-focused-repair-review-4fcd44f-report-only.txt` — plus the
two superseded handler
failures `0c16177` and `0266d8`. Nothing else from the orchestration store was
copied: no raw worker stdout, no inventory log, and no dirty WIP handler proof
(nonfinal / not authoritative).
Commands that depend on generated output, credentials, deployment, or live
resources are not executable instructions in this documentation. Use relative
repository paths or the placeholders above in future evidence.

## Prior milestone references

- [M3 infrastructure evidence](MILESTONE_3_EVIDENCE.md)
- [M4 domain/data-access evidence](MILESTONE_4_EVIDENCE.md)
- [Appwrite runbook](APPWRITE_RUNBOOK.md)
- [Package boundaries](../packages/README.md)
- [Development checks](DEVELOPMENT.md)
