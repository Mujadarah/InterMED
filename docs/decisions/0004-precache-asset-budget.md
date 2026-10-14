# 0004 — Public-shell precache asset budget

- **Status:** Accepted for local implementation on 2026-10-14; verification results recorded below.
- **Scope:** Build/PWA policy and its tests. Preserves the 2 MiB byte budget and offline route-chunk precaching.

## Context

The baseline at commit `8c913c1` precaches **15/16 assets**, totaling
**593,664/2,097,152 bytes** (uncompressed file bytes). The Calculators page
and M10 checker are expected to add at least one route chunk each; one remaining
slot cannot accommodate both. M8 already kept favorites/settings eager to avoid
this recurring count constraint. These other branches are not integrated here.

M2's [latency review](../MILESTONE_2_EVIDENCE.md#subsequent-review-and-latencytest-quality-fixes---october-6)
records 400 ms of synthetic latency per cache read. Serial full-release reads
exceeded the three-second readiness deadline. The correction verifies assets in
bounded parallel for navigation, readiness and activation; static requests verify
the metadata-bearing index and exact requested asset. Sixteen was the previous
resource/request bound, not a cryptographic requirement.

Measured baseline and final asset inventory (unchanged by this policy change):

| Precached URL                              |       Bytes |
| ------------------------------------------ | ----------: |
| `/assets/dexie-vendor-IbC1YGSs.js`         |      95,195 |
| `/assets/framework-vendor-b34q1Hby.js`     |     258,585 |
| `/assets/index-BLy0wwGa.css`               |       9,013 |
| `/assets/index-tbvF__MU.js`                |     100,432 |
| `/assets/MedicationDetailPage-7WU8On9o.js` |      14,512 |
| `/assets/MedicationSearchPage-Bb8td9UD.js` |      10,535 |
| `/assets/rolldown-runtime-CbXtAM7H.js`     |         589 |
| `/assets/search-status-BRMNX2ez.js`        |       2,808 |
| `/assets/zod-vendor-C0xu5dkI.js`           |      90,913 |
| `/icons/apple-touch-180.png`               |         835 |
| `/icons/icon-192.png`                      |         882 |
| `/icons/icon-512.png`                      |       3,359 |
| `/icons/maskable-512.png`                  |       3,359 |
| `/index.html`                              |       1,925 |
| `/manifest.webmanifest`                    |         722 |
| **Total (15 assets)**                      | **593,664** |

The inventory comes from evaluating the emitted worker's release descriptor and
measuring every named file, including HTML, manifest and icons. The worker itself
is not precached and is excluded from this budget. [Machine-readable measurements](../evidence/precache-budget-2026-10-14/measurement.json)
retain the release identities: baseline `2fc468dd520cb0d0eca6`, updated policy
`a5068b4d3f6ba170174c` (default development revision).

## Decision

Choose **option (b): a fixed cap of 24 assets**, retaining the **2,097,152-byte
(2 MiB)** cap. Both build emission and generated-worker metadata validation use
`apps/web/pwa/shell-budget.ts`, preventing a build/worker count mismatch.

Twenty-four permits nine additional assets on this baseline without imposing
route-group coupling or extra first-page downloads. It raises the maximum
per-release verification fan-out and installation request count by 50% from 16,
rather than doubling them to 32. Installation remains sequential and uses exactly
one credential-free, no-store request per pinned asset. The current build still
makes 15 such requests; padding to 24 is confined to the browser test server.

The following validation policy stays intact: exact public-asset allowlist;
per-asset SHA-256, exact MIME and size checks; aggregate byte validation;
duplicate/malformed metadata rejection; full-release identity covering every
asset and worker policy; verified-response reuse; no stale verification memo;
no runtime response caching or data precaching; existing activation/retention
rules. The numeric resource bound changes, but stays hard and finite. Every
emitted JS/CSS chunk must still be precached for offline deep links.

The build now reports count/bytes and both remaining budgets. Exceeding either
budget fails with an error naming the public-shell precache budget and actual
versus allowed values. The real-build test checks both budgets and reports the
same headroom; unit tests exercise exactly 24/25 assets and exactly 2 MiB/+1 byte.
Unique, valid worker metadata fixtures isolate the 24/25 boundary; corruption of
the last asset at the cap must still remove readiness.

## Alternatives considered

- **(a) Group tools/routes into a small fixed number of chunks; keep 16.** Could
  save slots, but couples independently developed routes and downloads sibling
  page code on first use. Shared dependencies can still emit additional chunks.
  The current byte usage does not justify that coupling, and future additions
  would keep requiring chunk-layout intervention.
- **(b) Raise the fixed cap.** Chosen with 24 as a moderate finite growth bound,
  conditional on unchanged validation and rerun deadline/regression evidence.
  A cap of 18 or 20 leaves little room after the pending tools; 32 doubles the
  previous request/fan-out bound without a demonstrated need.
- **(c) Group routes and raise the cap.** Adds both request-bound and chunk-layout
  changes without a current byte or measured latency need. Reconsider deliberate
  grouping if future measurements show loading/verification pressure.

## Verification evidence

- Pinned `npm ci`: success, zero vulnerabilities.
- Test-first boundary/diagnostic regressions: four intended failures before the
  implementation, then **95/95** PWA/build tests passed. Build boundaries cover
  24/25 assets and 2 MiB/+1 byte; worker fixtures use unique valid URLs/pins and
  reject corruption of the last asset at the cap.
- Restoring only the old 16-entry worker cap made both full-cap Chromium
  readiness scenarios fail; restoring 24 returned them to green.
- Cache/latency/update/integrity browser selection, `--repeat-each=5` across
  all three projects: **480/480 passed**. After additionally excluding network
  fallback, the full-cap slow-cache cases repeated five times passed **30/30**,
  retaining the original 400 ms per-read delay and 3,000 ms deadline.
- Exact required `npm run check`: **exit 0**; formatting, lint, typecheck,
  **1,383/1,383 unit tests**, architecture boundaries, zero-vulnerability audit,
  production build, distribution scan, and **172 passed / 2 existing skips** in
  the full browser suite. No retries, skips or deadlines were added or changed.
- An earlier full-unit run timed out in the repository path-hygiene test
  (1,382 passed / 1 failed). The focused rerun passed 98/98 including hygiene,
  and the final full gate passed. The brief's known importer OS-temp failure
  did not reproduce; no importer code was changed.

[Repository evidence](../evidence/precache-budget-2026-10-14/README.md) includes
exact commands, redacted logs, asset measurements and the original failed run.

## Consequences

Current headroom is **9 assets and 1,503,488 bytes**. If Calculators and M10 each
add exactly one asset, the combined shell would use **17/24 assets**, leaving
**7 slots** for future pages/shared chunks. Their final bytes and any additional
shared chunks must be measured after integration; no byte estimate or route
acceptance is inferred here. The unchanged byte cap is the final backstop.

Future additions fail at either hard budget, with actionable diagnostics. Any
further cap increase requires renewed latency/resource evidence. Synthetic
400 ms cache reads and local Chromium/WebKit tests establish only their tested
conditions, not worst-case 2 MiB verification or physical-device performance.
The route declarations in `App.tsx` remain outside this change.
