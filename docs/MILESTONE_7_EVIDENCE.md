# Milestone 7 part A evidence — local medication search

Date: 2026-10-08. Commits: `06193c9` (local search) and `2eb4ef1` (reader rename and link collection fix). Scope: offline medication search, its `/search` route, candidate rows, and the Part B detail placeholder. The catalogue and every fixture in this evidence are synthetic; search is a development feature and does not support care decisions. No Appwrite service or other network service was used for this work.

## Scope and requirement mapping

Milestone 7 in [`plan/CODEX_BUILD_PLAN.md`](../plan/CODEX_BUILD_PLAN.md) calls for local commercial/DCI/ATC/manufacturer search, diacritic handling and safe candidate ranking, candidate disambiguation, medication details and regulatory links, provenance/version/age and explicit missing/offline labels. Acceptance calls for no request per keystroke when local data exist, measured large-catalogue performance, safe candidate choice, honest unavailable fields and offline links, plus touch, keyboard and screen-reader paths.

Part A implements the local search and route-shell portion: normalized commercial name, DCI/ingredient, ATC-prefix and manufacturer matching; ranked distinct candidates with strength, form, route, authorization and manufacturer fields; explicit missing-value labels; a keyboard-accessible `/search` page; and a detail placeholder route. It covers the search and safe-selection portion of requirements 34–39 and the general lookup route in requirement 41. ATC lookup is prefix-only. The implementation does not add typo correction, indication search or clinical details. Requirement 40 remains dependent on data-source support.

Part B remains open for the detail view and its available identification/clinical fields, product-specific RCP/prospect links, provenance and dataset age on the detail page, and explicit offline behavior for those links. The search page already identifies the active dataset version and age. Real-device acceptance remains in Milestone 12; these logs are automated browser evidence, not a real-device result.

## Decisions

- `GenerationReader.searchRecords()` returns a search projection assembled from one pinned generation. The application checks generation identity before and after copying records, releases the reader, and builds a per-generation in-memory index. Search evaluation uses that index; it does not query IndexedDB or a network service for each keystroke.
- The reader extension does not change the Dexie schema or published dataset contract. Commit `2eb4ef1` renames `searchDocuments` to `searchRecords`; its `linksByProduct` collection uses `push`.
- The index is in memory and scoped to the active generation. Query folding shares the local-store Romanian folding rule, removes combining marks, lowercases, and normalizes whitespace without changing source display text.
- Ranking is exact, then prefix, then partial text match; ties use folded commercial name and then product id. ATC codes match by prefix only. Matching does not select a result or substitute a product automatically.
- At most 50 candidates are shown. A truncated result set announces the visible and total counts and asks the user to refine the query.
- Empty or unavailable values are rendered as “Not provided by source.” Candidate rows retain distinct products and show strength, dosage form, route, authorization status, manufacturer and catalogue status where available.
- Input is debounced by 200 ms. A changed query aborts stale work, and results from an old query or generation are ignored.
- A browser test records fetch/XHR requests while typing and asserts that none occur. The search reads the local dataset only.
- `DatasetStatus` has no dataset-download control. The search page describes never-downloaded and unavailable states plainly and links to Dataset status; it does not imply that a catalogue is empty or offer a nonexistent download action.

**Disambiguation (review P1).** Candidate rows also show source ingredient names, pack/presentation and CIM in the visible details and accessible name; fully colliding rows append source product ID, then product ID if needed, so candidates remain distinguishable.

## Test-first evidence

The red logs record the missing behavior before implementation. The green refactor log and the full check record the passing behavior afterwards.

| Red log                                                                       | What failed and what it established                                                                                                                                                                     |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`m7a-red-domain.log`](evidence/milestone-7a-2026-10-08/m7a-red-domain.log)   | Six domain tests failed because query normalization, index creation and search exports did not yet exist; the cases specify folding, ranking, search fields, stable ties, truncation and empty queries. |
| [`m7a-red-reader.log`](evidence/milestone-7a-2026-10-08/m7a-red-reader.log)   | The pinned-generation reader test failed because `searchDocuments()` was absent. It specifies that the projection comes from the reader’s captured generation.                                          |
| [`m7a-red-rename.log`](evidence/milestone-7a-2026-10-08/m7a-red-rename.log)   | After the API rename, the reader test failed because `searchRecords()` was not yet implemented under that name.                                                                                         |
| [`m7a-red-service.log`](evidence/milestone-7a-2026-10-08/m7a-red-service.log) | The application test suite could not resolve the absent search service module.                                                                                                                          |
| [`m7a-red-ui.log`](evidence/milestone-7a-2026-10-08/m7a-red-ui.log)           | The presentation suite could not resolve the absent search page.                                                                                                                                        |

[`m7a-green-refactor.log`](evidence/milestone-7a-2026-10-08/m7a-green-refactor.log) then passed 16 tests in two files after the reader API/refactor, including the updated record projection and link handling. The final [`npm-run-check.log`](evidence/milestone-7a-2026-10-08/npm-run-check.log) passed all quality gates and the browser suite. Red/green logs establish the recorded behavior; they do not imply every implementation line was written only after its test.

## Commands and results

The pinned toolchain was Node.js `v24.21.0` and npm `11.19.0`; the compiled-artifact runtime was Node.js `v22.23.2`.

| Command                                            | Result                                                                                                                                                                                                      |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                    | Exit 0. Prettier, lint, typecheck, Vitest (53 files, 856 tests), architecture boundaries (84 source files), `npm audit` (0 vulnerabilities), production build, distribution scan and Playwright all passed. |
| Playwright browser suite (part of `npm run check`) | 154 passed; two Chromium-only performance cases were skipped on WebKit by design. Search coverage includes offline keyboard navigation and checks that typing generated no fetch/XHR request.               |
| `npm run build` (part of `npm run check`)          | Passed with the existing chunk-size warning. Main JavaScript bundle: 527.64 kB, compared with 513.68 kB before Part A.                                                                                      |

The browser check ran the search keyboard path against synthetic data after taking the page offline: focus the search route, enter a query, tab to a candidate, and open the detail placeholder with Enter. The test also checked the polite status message, the explicit unavailable-value label, and a minimum 44 px height for the search field and candidate link.

## Performance budget and measurements

Measurements use 20,000 synthetic products: the prior local run recorded core-search p95 of 6.8/6.0/3.4 ms and key-to-render p95 of 259.5/252/245.5 ms (1/2/4 characters, including the 200 ms debounce), with a 0.6–0.84 s index; CI measured Ubuntu staging 16,720 ms, index 1,929 ms and key-to-render p95 329/400/406 ms, and Windows staging 26,427 ms, index 2,766 ms and key-to-render p95 333/299/314 ms, with reported core-search p95 values of 13.5/31.6 ms and 12.9/9.3 ms respectively (four-character values were not provided). A later run on the same workstation under load measured staging at 10.30 and 10.49 s, and a full-suite run measured 13.32 s staging, 1.61 s index and core-search p95 of 13.9 / 8.6 / 8.1 ms.

**Budget policy.** Core-search p95 under 100 ms is the product budget, asserted on every machine; it held between 3.4 and 31.6 ms in every measurement. Index build, IndexedDB staging and key-to-render are wall-clock figures. They varied up to about 5× for the same code, with machine load and runner type, so the test asserts them only as broad regression guards: index under 15 s, staging under 60 s, key-to-render p95 under 750 ms. Their targets (index under 5 s, staging under 5 s, key-to-render p95 under 300 ms including the debounce) are reported, not asserted:

- index build and key-to-render met their targets on the workstation;
- staging met its target only in isolation (4.81 s);
- a dedicated, quiet performance environment remains open, so this target can be enforced before release (Milestone 12).

## Accessibility checks

The browser path is keyboard-driven from the application navigation through the search field to a result and the detail placeholder. Search status is exposed through a polite live region. The search field and result link meet the tested 44 px minimum target height. WebKit testing found that result links needed explicit `tabIndex={0}` to be reachable in the tested tab sequence, so the links declare it. A native `type="search"` input can add a browser-provided clear-button tab stop; keyboard testing must account for it when advancing focus.

These are automated keyboard and browser checks. Manual screen-reader and real-device confirmation remains part of the later acceptance work.

## Open items and risks for part B

- Build the medication detail content from available source fields, with explicit missing-data labels.
- Add product-specific RCP/prospect links and show provenance, dataset version and age on the detail page; explain when a link cannot be opened offline.
- Keep unvalidated or absent fields visibly unavailable; the current route is a placeholder and does not establish clinical-content or source-rights acceptance.
- Complete the real-device checks under Milestone 12. Browser automation does not establish installed-mode behavior on physical devices.
- The production bundle remains above the build tool’s 500 kB warning threshold (527.64 kB; prior branch measurement 513.68 kB). The build passed, but this size warning remains.
