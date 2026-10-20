# 0005 — Measured performance budgets

- **Status:** Accepted for local implementation on 2026-10-20; verification
  results are recorded in the evidence README.
- **Scope:** Build-output budget tests, synthetic local-search measurement, and
  the Chromium desktop cold first-load test. No clinical text, calculator
  logic, interaction-domain behavior, runtime application code or npm
  dependencies changed.

## Context

Milestone 12 calls for performance budgets with recorded measurements. Decision
0004 already bounds the public-shell precache by asset count and uncompressed
bytes, but does not constrain individual gzip bundle sizes, aggregate gzip
size, local-search latency or first-load time to an interactive search input.
Speculative limits would either allow silent regressions or risk encoding a
budget unrelated to this build.

## Decision

Use the current production build as the baseline and enforce per-asset gzip
budgets for every emitted JavaScript/CSS chunk and sw.js, plus a separate
aggregate gzip budget. Set each cap at approximately 15% above its measured
size, rounded up to 100 bytes; derive the aggregate cap independently from the
measured aggregate.

Measure the medication-search service used by MedicationSearchPage against
25,000 synthetic products with at least 200 mixed queries. Enforce a 50 ms
cached-search p95 limit. Because search data is IndexedDB-backed, run the
fixture with fake-indexeddb in Vitest and treat it as an upper-bound proxy, not
as physical-browser or CI evidence.

Measure a cold production-build / load followed by navigation to the
interactive search input in Chromium desktop. Count response body bytes and
enforce limits of 1,500,000 bytes and 10,000 ms. Keep the existing 2 MiB
uncompressed precache decision separate.

## Alternatives considered

- **Keep only the precache limit.** It cannot catch a large individual lazy
  chunk, a change in aggregate gzip size, slow local search or a delayed first
  interactive search input.
- **Use only one aggregate gzip cap.** A small change in one chunk could be
  hidden by reductions elsewhere, so it would not identify which asset
  regressed.
- **Choose limits without a measured baseline.** This would make the thresholds
  harder to explain and more likely to be either ineffective or flaky.

## Verification evidence

See [M12 performance budget evidence](../evidence/m12-perf-budgets-2026-10-20/README.md)
for each measured number, the budget table, environment, commands and local
verification results.

## Consequences

Missing or over-budget bundle assets fail the build-output test with the asset
name and overage. Search p95 and first-load limits provide separate regression
signals for the local search path and the first usable search input. Threshold
changes require a new recorded baseline. The recorded measurements establish
only the tested local synthetic conditions; CI and physical-device performance
remain unmeasured.
