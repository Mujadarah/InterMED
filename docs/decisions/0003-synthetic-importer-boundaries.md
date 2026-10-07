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
