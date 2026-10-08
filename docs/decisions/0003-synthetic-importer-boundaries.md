# 0003 — Synthetic-only importer boundaries and publication control

- **Status:** Accepted boundaries for Milestone 5. The importer core, store
  client, and artifact builder are implemented and verified offline
  (2026-10-07); handler review, final acceptance gates, source-rights approval,
  and live deployment remain pending. The decision text below is unchanged.
- **Scope:** The importer core, its injected adapter ports, synthetic fixtures,
  private review material, and the bounded future publication sequence.
- **Non-scope:** Domain types, published-dataset contracts, M6 files, browser
  CSP, production resources, and any real source retrieval.

## Context

Milestone 4 established a dependency-free catalogue domain and a synthetic
data-access boundary. Its catalogue checksum is the FNV-1a fingerprint produced
by `catalogueFingerprint`; it is an internal integrity check, not a transport
security hash. The published reader contract in
`packages/domain/src/published-dataset.ts` is vendor-neutral and read-only.
Milestone 3 established private source/quarantine/run-log resources and public
read-only published resources, but the `import-anmdmr` Function is still a
deliberate 501 stub. No source-rights approval or live M5 action exists.

## Decision

1. M5 uses only obviously fictional, synthetic fixtures. The source format is
   represented by a placeholder label and an explicit synthetic marker. The
   importer never fetches a URL, copies a real catalogue, names a real product,
   or claims a clinical fact. Synthetic rights and clinical references remain
   `not-approved` and `not-reviewed`; they are not publication approval.
2. The core is pure and dependency-light. File, network, Appwrite, credential,
   clock, and logging behavior are injected ports. The parser accepts explicit
   UTF-8, BOM, and Windows-1250 handling, rejects unsupported or malformed
   input, preserves missing/unknown states, and performs exact normalization
   only. NFC, Romanian diacritics, legacy cedilla mapping, duplicate handling,
   conflicts, and combinations remain observable test cases.
3. Candidate identity and bytes are deterministic from raw snapshot bytes,
   canonical importer configuration, stable source metadata, and importer/parser
   version. They do not depend on a baseline, current time, approval, or
   attempt. Review artifacts may bind a baseline, but generation identity may
   not.
4. A complete source is required. Missing, blank, malformed, truncated, empty,
   partial, conflicting, or over-threshold removal input is quarantined. A
   complete source with a large removal requires a reviewed, explicit
   `explicitLargeRemovalApproved` decision and a reason; it cannot be silently
   published. Every candidate, including the first, needs separate approval.
5. Public publication is create-only and immutable. Before any public write,
   the adapter verifies exact bytes, byte size, lowercase `sha256:<64 hex>`,
   serialized catalogue round-trip, referential integrity, counts, provenance,
   and the review/config/source bindings. The order is bundle, descriptor,
   manifest last. Retries may reuse only an already published object whose
   immutable content matches exactly; collisions, stale approvals, and
   mismatches fail closed. A failure never changes or deletes an earlier
   published generation.
6. The sealed catalogue’s internal FNV checksum remains unchanged. The
   published bundle descriptor and manifest checksums remain exact UTF-8
   serialized bundle-byte SHA-256 values. The current M6 PR10 validator checks
   only FNV and is therefore incompatible with the established SHA-256 public
   contract; compatibility is pending upstream coordination and must not be
   claimed here.
7. The future Function remains server/owner-authorized with `execute: []`.
   It must reject forged request-body authority, missing or wrong trusted
   configuration, raw URLs, non-synthetic formats, malicious secret-bearing
   errors, and unauthorized callers. No key, token, credential, or saved
   environment example belongs in the repository or evidence.

## Future approval sequence

Each step is a separately approved change: (1) deploy the reviewed Function
only to `intermed-dev`; (2) stage and privately inspect a fictional synthetic
snapshot; (3) review the diff, approvals, integrity, and immutable payloads;
(4) if explicitly approved, publish one generation; and (5) perform read-only
verification. Publication is never implied by deployment or staging.

## Consequences and open items

No domain field or public contract changes are permitted. Existing M3 resource
identifiers and four private/public storage boundaries are reused; no physical
schema expansion is authorized by this decision. The generated Node 22
Function artifact is a future build output outside the repository, produced
from the reviewed source and smoke-tested locally with fakes; no generated
artifact command is executable evidence until implementation review supplies
the exact command and result. Environment scope, function configuration,
required future scopes/variables, source-rights approval, and all M5 gates
remain pending.

## Status update — 2026-10-07 (offline verification)

The decision rules above were implemented without any change to domain types,
published-dataset contracts, or M3 public identifiers.

- Importer core (`stage`/`publish`), the Appwrite store client, and the Function
  artifact builder are verified offline by red/green tests and root's
  independent gate runs; see
  [the Milestone 5 evidence record](../MILESTONE_5_EVIDENCE.md) and its
  [evidence pack](../evidence/milestone-5-synthetic-2026-10-07/README.md).
- Deterministic identity binds the canonical parser encoding policy, so the same
  raw bytes and config cannot decode differently across runs. Publication stays
  create-only with bundle, descriptor, then manifest last.
- The Function handler and its operation-intent authority remain **pending**;
  the draft operation-intent schema may still change and no exact command is
  recorded as executable. The positive compiled handler flow is **not yet run**.
- The source format stays a synthetic placeholder label, explicitly to be
  replaced after source-rights approval and review. No real ANMDMR format,
  name, document, or source was fetched, and no M5 live action (raw intents,
  staging, Function execution, deploy, publication, cleanup) was authorized or
  executed.
- The M6 PR10 head `8ef6fd8` validator still checks only the internal FNV
  fingerprint, so the SHA-256 public-contract compatibility gap is **open**;
  no integrated M5/M6 pass is claimed here.

## Status update — 2026-10-07 (final docs preparation)

- M6 PR10 is **merged** (head `8ef6fd8`, merge commit
  `729ccfc797358499398b2bbf811f2f7d87bffa02`); the clean integration `384f5d8`
  retains both the importer and `local-store` workspaces. The FNV-only
  validator conflict with the published SHA-256 contract is a known **hard
  reject**, and the preserved-token notes are recorded; no domain or public
  contract change is proposed here, and the GitHub coordination issue is
  awaiting owner permission before anything is opened.
- The handler schema now pins the publication time to the immutable `approvedAt`
  of the owner approval intent (item 5's retry requirement). Handler acceptance
  is still **pending** repairs and a fresh root full check, so no handler retry
  result is claimed.
- The concrete future owner workflow (build artifact outside the tracked tree,
  deployment to `intermed-dev`, private raw/intent/run-log handling, separate
  stage and publication executions, and prior human diff review) is documented
  with exact commands in [the runbook](../APPWRITE_RUNBOOK.md) section 10 and
  remains **not executed**.

## Status update — 2026-10-08 (canonical identity architecture correction)

- **Cancelled proposal.** The plan to rebase the canonical `DatasetVersionId`
  onto an opaque physical row id so that one value could serve both roles is
  **explicitly cancelled** as a root architecture mistake: it would require a
  domain contract change, which this decision forbids. Root verified the real
  serializer path: canonical ids are exactly three `U+001F`-separated parts
  (`dv U+001F <sourceKey> U+001F <generationVersionKey>`), and `previousVersionId`
  is validated the same way.
- **Actual architecture (no domain, no public contract, no M6 change).** The
  canonical id stays verbatim in the sealed bundle candidate bytes, provenance,
  and the public manifest. Physical Appwrite row ids stay safe and separate
  (`/^[A-Za-z0-9._-]{1,36}$/`), the descriptor id is a deterministic plain hash
  slice (≤ 36), and the file name is `bundle-<descriptorId>.json`. An
  **optional** canonical attribute is added on the storage side only:
  `dataset-versions.datasetVersionId` (max 512) with a **nullable unique
  index**, plus `dataset-bundles.datasetVersionId` and
  `dataset-versions.previousVersionId` extended to 512. The public reader
  prefers that attribute, falls back to `$id` only when it is missing or
  `null` (bounded legacy M3 behavior), and **rejects** a present-but-malformed
  value.
- **Not authorized by this decision.** Item "no physical schema expansion is
  authorized by this decision" still holds: the optional column is a separate
  storage-schema mapping that needs its **own owner approval before any deploy
  or any new publication** (see [the runbook](../APPWRITE_RUNBOOK.md) section
  10). The live migration has **NOT been executed** and no live field is
  confirmed.
- **Offline root proofs (all exit 0):** core `b0fdde8` at synced `2bbbc38` — 452
  tests / 31 files / 135 browser (its log head prints the pinned `v24.21.0` /
  `11.19.0`); storage schema + reader `41034c5` — 415 / 31 / 150; artifact
  `e30e8d1` — 333 / 28 / 135. ROOT launched all three with the pinned toolchain
  on `PATH`; the artifact and reader logs preserve the original `npm run check`
  output and print no version lines (none was added), and the bounded
  `task-b-ROOT-toolchain-recheck-2026-10-08.log` records the current toolchain
  and heads without repeating any suite. The three static reviews are
  **report-only with no blockers**.
- **Superseded later the same day (see the next update):** at the time of this
  correction the handler canonical-mapping repair, the real
  handler/public-reader first and second generation proof and retry, the
  compiled Node 22 positive flow, and final integration were still pending; all
  four are now verified offline (`01f7a45` and `4cbc9ed`, both exit 0). The
  **final whole-patch static review has since been ACCEPTED at `4cbc9ed` (0
  reproducible blockers)**, so what remains pending is **CI and the
  PR**. The `0c16177` root failure (5 of 598) is retained as recorded, and the
  follow-up `0266` run is RED on a **real** canonical mismatch while its middle
  assertion that the canonical id must equal the physical Appwrite `$id` is an
  **invalid root assumption** — this is **not** three production bugs.
- **M6:** PR10 merged (merge `729ccfc`, head `8ef6fd8`); the FNV-only consumer
  versus the established public SHA-256 contract stays a **hard reject**, and
  the intentional `invalid-unit` / `ambiguous-decimal` **note codes** are
  rejected by
  that consumer (the `U+001F` separator is unrelated: it only delimits the
  canonical id). M6 and the domain are unchanged; **contract changes to M6:
  none** (only the optional storage schema mapping above). The coordination
  issue was then **awaiting owner permission** and unopened; it is **now
  authorized with a draft pending root posting** (see the next update), and the
  legacy M3 opaque public `$id` versus inner canonical id is a **known bounded
  fallback**, not an M6 activation claim.
- **Rights and live state:** synthetic rights stay `not-approved`, synthetic
  clinical references stay `not-reviewed`, and no M5 live action (raw intents,
  staging/import, Function execution, deploy, migration, publication, cleanup)
  was authorized or executed.

## Status update — 2026-10-08 (handler proof and combined run)

- **Handler repair verified offline, acceptance not claimed.** At
  `01f7a4556e17608edb0865bacb3d421d23550847` root's immutable full run is exit
  0 with 634 tests / 38 files / 135 browser tests on Node `v24.21.0` / npm
  `11.19.0` and official Node `v22.23.2`, including the real compiled generated
  Node 22 stage → publish → retry path and the real public-reader canonical
  round trip (first and second generation, advancing-clock idempotency,
  `active = self` restaging, baseline tampering). The changed-repair static
  review is **ACCEPTED with no blockers**, scoped to the two changed source
  files and the changed tests, with no new tests by the reviewer — it is not a
  comprehensive whole-patch review. Author red/green logs are copied.
- **Final combined run passed.** Root's immutable full run at the clean
  integration `4cbc9edf89a12590f1fa7821428758ac8ac86bec` with M6 main merged:
  **734 tests / 46 files / 150 browser, exit 0**. The **final independent
  whole-patch static review at `4cbc9ed` is ACCEPTED at 0 reproducible
  blockers** (bounded `git log` / `git diff` / patch analysis) while **CI/PR
  are pending**; the eleven-file first-pass review has since been reported (next
  bullet), so B is not claimed ready and no M5 acceptance is
  recorded here.
- **Honest history kept.** The `0c16177` root failure (5 of 598) and the
  `0266d8` RED run (real canonical mismatch plus the invalid "canonical must
  equal physical `$id`" assertion) are copied and explained; a dirty WIP handler
  proof exists in the orchestration store and is labelled **nonfinal / not
  authoritative**.
- **M6 coordination issue posted.** The owner approved it and root posted it:
  **<https://github.com/Mujadarah/InterMED/issues/12>**. Root also reran the
  portable M6 coordination repro on 2026-10-08 — `task-b-ROOT-m6-coordination-RED.log`,
  **3/3 expected failures, exit 1**, pinned Node `v24.21.0` / npm `11.19.0`, with
  the temporary test removed afterwards and M6/the domain unchanged. The
  FNV-only versus public SHA-256 hard reject and the `invalid-unit` /
  `ambiguous-decimal` note codes are **not fixed here**; Claude will
  fix them in a **separate PR closing that issue**, with no M6 edits in this
  workstream, and **no closure is claimed**. **Contract/type changes: none** —
  the optional storage mapping is
  still schema-only, and the live migration is **still not executed**.
- **First-pass triage (later the same day):** the accepted `4cbc9ed` static
  review is retained as historical record and **superseded by confirmed
  findings** — **F1** (partial/recovery manifest resume bypasses the
  stale-baseline recheck) and **F11** (asymmetric stored-manifest `recordCounts`
  equality) are root-confirmed by the immutable RED
  `task-b-ROOT-review-repair-ba3bff8-RED.log` (5 failed / 2 passed), **F9** is a
  confirmed stale comment the author is correcting; the remaining eight
  (F2-F8, F10) stay **triage, static only** (F2 deliberate fail-closed lock,
  F3 not proven, F4-F6 and F8 false positives, F7 no proven OOM, F10 constant
  500 policy). Author **GREEN with actual source edits is underway, no pass
  yet**, so the code is **NOT ready** until confirmed fixes, a root
  regression/full check, and a fresh independent review. **F2** keeps its
  owner-only recovery prerequisite in [the runbook](../APPWRITE_RUNBOOK.md)
  section 10.0.1 (**NOT EXECUTED**, no TTL stealing). The **Gemini 3.1 Pro
  expanded payload was explicitly owner-approved** (local 42-file scan clean,
  capsule triage complete in ask-b-approved-gemini-triage-capsule.log;
  some line references are inaccurate and **root’s actual references are
  authoritative**); the earlier auto-review rejection is kept only as dated
  history. No blanket first-pass PASS.
- **Repairs verified (later the same day):** F1, F11 and the F9 stale comment
  are **repaired at author `9a40644`** (integrated `421da57`, tests `e61a983`)
  and **root-verified** by an independent full run — **744 tests / 47 files /
  150 browser, exit 0**, pinned `v24.21.0` / `11.19.0` and actual `v22.23.2`,
  clean before and after. The **focused independent repair review is ACCEPTED**
  (exit 0, zero actionable, **repair scope only**; root checked the predicate
  and test-counter lines and the 43 capsule hashes); the earlier **broad**
  review stays **rejected / not accepted** — no blanket whole-patch claim. The
  current integration `4fcd44f` keeps **M6, the domain and the UI unchanged**
  (protected scope: no changes). **CI and the PR remain pending**, so **M5
  acceptance and any live action are NOT claimed**; the optional 512 schema and
  canonical data-access mapping stay PR-flagged with separate owner approval
  required, and M6 **issue #12 keeps both gaps open**.
- **Live state unchanged:** no M5 live action, production untouched, shell
  project untouched, source rights unchanged.
