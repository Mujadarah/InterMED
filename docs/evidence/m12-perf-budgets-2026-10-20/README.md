# M12 performance budget evidence — 2026-10-20

Local, synthetic-only measurements for Milestone 12 on branch
mujadarah/zesty-curry, based on origin/main at 41b4cbc. No push or
deployment. No clinical text, calculator logic, interaction-domain behavior or
runtime application code changed, and no npm dependency was added.

## Environment and install

- Windows 11 Pro, build 26300, x64; Intel Core Ultra 9 275HX (24 reported
  cores/logical processors); 31.4 GiB RAM.
- Node 24.21.0 and npm 11.19.0. Vitest was also configured with the repository
  Node 22.23.2 runtime through INTERMED_NODE22_RUNTIME; its machine-specific
  absolute value is omitted.
- Playwright Chromium 153.0.8010.12.
- The first npm ci attempt used the shell's Node 25.6.1/npm 11.9.0 and was
  rejected by the repository engine requirement. Re-running with the pinned
  Node 24.21.0/npm 11.19.0 succeeded: 378 packages added, 384 audited, zero
  vulnerabilities. The lockfile was unchanged.
- These are measurements from this local Windows run. No CI worker or physical
  phone/tablet was measured.

## Local medication search

The test builds and activates 25,000 fictional products and 512 fictional
ingredients through the existing synthetic bundle builder and the application's
medication-search service. It performs 240 measured queries after warm-up:
eight supported prefix/partial-name queries, eight Romanian-diacritic queries
covering ă, â, î, ș and ț, and eight typo-shaped no-match queries, repeated ten
times each.

| Measurement                |      Result |                      Budget |
| -------------------------- | ----------: | --------------------------: |
| Synthetic indexed products |      25,000 |              25,000 fixture |
| Synthetic ingredients      |         512 |                 512 fixture |
| Measured queries           |         240 |                At least 200 |
| Initial index build        | 6,655.95 ms | Recorded; no separate limit |
| Cached search p50          |     8.56 ms |                    Recorded |
| Cached search p95          |    29.31 ms |               At most 50 ms |

The test uses fake-indexeddb under Vitest and is recorded as the brief's
upper-bound proxy for the IndexedDB-backed search path. This is not a physical
browser or CI latency result. The current search implementation does not
correct spelling; the typo-shaped inputs are deliberate no-match scans and do
not claim typo-correction support.

## Gzip bundle budgets

The build-output test gzips each emitted JavaScript/CSS file and sw.js
individually with Node's zlib.gzipSync, then sums those gzip byte counts. The
per-file budgets are each baseline measurement plus approximately 15%, rounded
up to a 100-byte boundary. The aggregate budget is independently set to the
measured aggregate plus approximately 15%, rounded up; it is not the sum of the
rounded per-file caps.

| Emitted asset                  | Measured gzip bytes | Budget bytes | Remaining bytes |
| ------------------------------ | ------------------: | -----------: | --------------: |
| CalculatorsPage-[hash].js      |               3,123 |        3,600 |             477 |
| MedicationDetailPage-[hash].js |               4,155 |        4,800 |             645 |
| MedicationSearchPage-[hash].js |               3,407 |        4,000 |             593 |
| dexie-vendor-[hash].js         |              31,018 |       35,700 |           4,682 |
| framework-vendor-[hash].js     |              81,244 |       93,500 |          12,256 |
| index-[hash].js                |              39,513 |       45,500 |           5,987 |
| index-[hash].css               |               2,778 |        3,200 |             422 |
| rolldown-runtime-[hash].js     |                 368 |          500 |             132 |
| search-status-[hash].js        |               1,030 |        1,200 |             170 |
| zod-vendor-[hash].js           |              25,478 |       29,300 |           3,822 |
| sw.js                          |               5,139 |        6,000 |             861 |
| **Total**                      |         **197,253** |  **226,900** |      **29,647** |

The total covers generated JS/CSS chunks and the service worker; it excludes
HTML, icons, the web manifest, headers and transport overhead. These gzip
figures are build artifacts, not observed network transfers. The existing
public-shell precache metric remains separate: this build reports 16/24 assets
and 649,482/2,097,152 uncompressed bytes.

The Vite build log also prints gzip estimates that differ from the enforced
table's direct zlib.gzipSync byte counts. The budget test and table use the
same direct zlib method.

## Cold first-load budget

The Chromium desktop test uses the production build through the repository's
local production-test server. It seeds two fictional products in IndexedDB,
unregisters service workers and clears Cache Storage before timing a cold
root-path load followed by Medication search navigation. The timer starts
before navigation and ends when the search input is visible and enabled.

| Measurement                      |                 Result |                  Budget |
| -------------------------------- | ---------------------: | ----------------------: |
| HTTP response count              |                     26 |                Recorded |
| Sum of response body bytes       |        1,280,089 bytes | At most 1,500,000 bytes |
| Time to interactive search input |              519.53 ms |       At most 10,000 ms |
| Browser                          | Chromium 153.0.8010.12 |        chromium-desktop |

The byte count sums uncompressed response bodies from the test server. It does
not include headers, TLS, TCP/IP overhead or a real network transfer encoding.
The time includes the cold root-path load and the subsequent route navigation
to the first usable search input. All fixture data is synthetic.

## Verification commands and results

The required verification commands and outcomes were:

| Command                                        | Result                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| npm ci                                         | Passed with pinned runtime; 378 added, 384 audited, zero vulnerabilities |
| npm run format:check                           | Passed                                                                   |
| npm run lint                                   | Passed with zero warnings                                                |
| npm run typecheck                              | Passed for the root, domain and importer TypeScript projects             |
| npx vitest run                                 | 75 test files and 1,504 tests passed                                     |
| npm run check:boundaries                       | Passed; 132 source files checked                                         |
| npm run build                                  | Passed; 16/24 precache assets and 649,482/2,097,152 bytes                |
| npx playwright test --project=chromium-desktop | 63 passed                                                                |

For the full Vitest run, INTERMED_NODE22_RUNTIME was set to the repository's
Node 22.23.2 runtime; its absolute local value is omitted. The separate focused
metric command passed 5/5 tests and printed the measurements above:

    npx vitest run --disableConsoleIntercept apps/web/pwa/build-output.test.ts tests/performance/medication-search-budget.test.ts

The Chromium command recorded 26 responses, 1,280,089 response body bytes and
519.53 ms to the enabled search input. An earlier startup attempt collided
with port 5174 while another worktree was running its offline-deeplinks tests;
the exact command passed after that run released the port. No unrelated
process was stopped. No CI result is implied by a local pass.

## Review follow-up (PR #49)

- Every wait in the first-load test now gets the time left until the shared 10 s first-interactive deadline. A slow but valid load is therefore judged by the budget assertion, instead of failing early on Playwright's default 5 s assertion timeout.
- The byte window now ends only after the service worker reports `activated`, so the total includes the full shell precache. The re-measured total was 1,280,116 bytes over 26 responses (budget 1,500,000), matching the earlier figure within main's latest changes. Repeated 3/3 on chromium-desktop.

## Re-baseline for the M10 checker route (PR #43)

The M10 interaction checker is loaded lazily. This adds two production chunks and grows the shared stylesheet. The new and changed entries below use the same rule as the first baseline: the local build-output measurement plus about 15%, rounded up to the next 100 bytes. All other budgets are unchanged.

| Asset                              | Measured gzip bytes |      Budget bytes |
| ---------------------------------- | ------------------: | ----------------: |
| `InteractionCheckerPage-[hash].js` |               9,601 |            11,100 |
| `route-focus-[hash].js`            |                 430 |               500 |
| `index-[hash].css`                 |               3,445 | 4,000 (was 3,200) |

The aggregate cap rises by the new and changed per-asset budgets, from 226,900 to 239,300 bytes. The measured total was 203,879 bytes. Measurements are from the `M12_BUNDLE_GZIP` line printed by `apps/web/pwa/build-output.test.ts`.
