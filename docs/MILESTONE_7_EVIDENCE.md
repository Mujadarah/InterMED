# Milestone 7 evidence — local medication search and detail

Part A covers the local medication search; part B covers the medication detail page.

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

## Part A open items (status after part B)

- Build the medication detail content from available source fields, with explicit missing-data labels (addressed in part B, see below).
- Add product-specific RCP/prospect links and show provenance, dataset version and age on the detail page; explain when a link cannot be opened offline (addressed in part B, see below).
- Keep unvalidated or absent fields visibly unavailable; the current route is a placeholder and does not establish clinical-content or source-rights acceptance (addressed in part B, see below).
- Complete the real-device checks under Milestone 12. Browser automation does not establish installed-mode behavior on physical devices.
- The production bundle remains above the build tool’s 500 kB warning threshold (527.64 kB; prior branch measurement 513.68 kB). The build passed, but this size warning remains.

## Part B — medication detail page

Date: 2026-10-08. Branch `codex/m7b-detail`, based on `da68eb0`. Implemented by GPT-6 Luna (Tempo), verified independently by the orchestrator.

### Commits

- `09bca9d` — feat(local-store): add medication detail projection
- `33da031` — feat(web): add local medication detail page
- `bbf19e5` — test(evidence): add redacted M7B verification logs

### Projection

- `GenerationReader.productDetail(productId)` is typed in `packages/domain/src/local-store.ts` and implemented in `packages/local-store/src/retention.ts`. It returns a `MedicationProductDetail` from one pinned generation:
  - the product;
  - ingredient joins, each with its optional canonical active ingredient;
  - the dosage form, ATC codes, manufacturers and marketing authorization holder;
  - the regulatory documents, the data source and the dataset version.
- It returns `null` when the product is not in that generation.
- No Dexie schema change or migration: existing tables answer every read, and `published-dataset.ts` is unchanged.

### Service

- `apps/web/src/application/medication-detail.ts` parses the stable product id; an invalid id is treated as not found.
- It opens one reader, checks that the reader’s generation is still the active one before and after the read, and throws `MedicationDetailGenerationChangedError` otherwise. It always releases the reader.
- It is memoised per store in `Bootstrap.tsx` (WeakMap), like search.
- Presentation does not import `@intermed/local-store`; the boundary checker passes.

### Page

The page is `/medication/:productId` (`MedicationDetailPage.tsx`).

- **Field rules:** every field shows verbatim source text or “Not provided by source”.
- **Banners:** `removed` and `unresolved` products get banners.
- **Composition:** the verbatim `sourceIngredientText`, the mapping status, the DCI/preferred name only when the mapping is confirmed, and the strength as stated by the source. `invalid-unit` and `ambiguous-decimal` are shown as data-quality notes.
- **ATC:** illustrative codes are labelled “illustrative, not an official classification”.
- **Regulatory documents:** the page shows type, title, language, version, dates and caching-rights status. An online `http(s)` URL opens in a new tab with `rel="noopener noreferrer"`; offline, the link is replaced by “needs an internet connection; unavailable while offline”; a missing URL shows “Not provided by source”. A recorded `cachedContentReference` is mentioned but its content is never rendered, because cached-document rights are not approved.
- **Provenance:** source name, authority and rights status; dataset version, published, upstream-published, imported and downloaded dates; local download age; the product’s `sourceVersion`, `firstSeenAt` and `lastSeenAt`. A “Synthetic dataset” label appears for synthetic generations.
- **States:** loading; no local data (reuses the part A wording); not found (a stale link after an update); read error with retry.
- **Navigation:** the back link preserves the search query (`/search?q=…`), and the search page restores `q`.

### Accessibility

- One `h1`: the commercial name or the state title. Focus moves to it on navigation and on state changes.
- Sections are labelled by `h2` headings.
- Link text states its purpose out of context, e.g. “Open source document in a new tab: …”.
- Styles keep touch targets at 44 px or more.

### Red → green

- **Projection:** 5 new tests failed because `productDetail` was missing (12 existing tests passed), then 17 passed ([`projection-red.log`](evidence/milestone-7b-2026-10-08/projection-red.log) → [`projection-green.log`](evidence/milestone-7b-2026-10-08/projection-green.log)).
- **Service:** [`service-red.log`](evidence/milestone-7b-2026-10-08/service-red.log) → [`service-green.log`](evidence/milestone-7b-2026-10-08/service-green.log).
- **Page:** [`detail-page-red.log`](evidence/milestone-7b-2026-10-08/detail-page-red.log) → [`detail-ui-green.log`](evidence/milestone-7b-2026-10-08/detail-ui-green.log). The focused UI suite has 72 tests in 6 files.
- **Browser:** the focused browser flow passed on chromium-desktop, webkit-phone and webkit-tablet ([`browser-focused-green.log`](evidence/milestone-7b-2026-10-08/browser-focused-green.log)). Its two WebKit-only performance runs are intentionally skipped, following the part A policy.
- All logs are in `docs/evidence/milestone-7b-2026-10-08/`, redacted, UTF-8 without BOM, LF.
- A full check after the GPT-6 review fixes: [`gpt6-full-check-green.log`](evidence/milestone-7b-2026-10-08/gpt6-full-check-green.log) (921 unit/component tests in 56 files, 154 browser tests passed and 2 skipped, exit 0). Written outside the repository, redacted, then copied in as UTF-8 without BOM, LF.

### Full check

`npm run check` passed with Node 24.21.0, npm 11.19.0 and `INTERMED_NODE22_RUNTIME` = Node 22.23.2:

- format, lint and typecheck passed;
- 905 unit/component tests in 56 files passed;
- the boundary check passed (91 source files);
- the audit found 0 vulnerabilities;
- the build passed, with a Vite advisory that the 544.41 kB JavaScript chunk is above 500 kB;
- the dist secret scan passed (9 files);
- Playwright: 154 passed, 2 skipped.

Log: [`full-check-green.log`](evidence/milestone-7b-2026-10-08/full-check-green.log). The orchestrator re-ran `npm run check` independently on `bbf19e5` with the same toolchain and got identical results: 905 unit/component tests, 154 browser passed, 2 skipped, exit 0.

### Review fixes (GPT-6)

- `b0b558e` — **Fail closed on unresolved detail references.** `productDetail` now runs every read inside one read-only Dexie transaction over all the tables it touches, so the projection is atomic. Inside one pinned, published generation every reference was integrity-checked at import, so a reference that does not resolve is local data damage: the read rejects with `MedicationDetailIntegrityError` (new in `@intermed/domain`; the message names the entity kind and carries no product data) instead of dropping the row for ATC codes, manufacturers, regulatory documents, the dosage form, the holder, the source, the dataset version and an ingredient’s `activeIngredient`. A field the source marked absent or unknown is untouched and still reads “Not provided by source”. The page shows “Some locally stored records for this product are missing or damaged. The source may have provided them. Check dataset status.” and keeps the retry button and the status link ([`gpt6-1-red.log`](evidence/milestone-7b-2026-10-08/gpt6-1-red.log) → [`gpt6-1-green.log`](evidence/milestone-7b-2026-10-08/gpt6-1-green.log)).
- `6c971f5` — **Show source DCI text in detail composition.** The Composition section always states “Active ingredient(s) as stated by source” from the verbatim `originalDciText`, before the ingredient rows. With no join rows, a present DCI text is shown together with “No individual ingredient records are available in the local dataset.”; “Not provided by source” is used only when the source provided neither. Rows are unchanged when they exist ([`gpt6-2-red.log`](evidence/milestone-7b-2026-10-08/gpt6-2-red.log) → [`gpt6-2-green.log`](evidence/milestone-7b-2026-10-08/gpt6-2-green.log)).
- `a306430` — **Keep user focus when detail loading settles.** Focus moves to the heading on a state change only when it was never moved by the user (it rests on `document.body`, on `<main>`, on the page section, or on the heading of a previous state). Anything else keeps its focus, so a read that settles while the user is on the back link no longer pulls focus back ([`gpt6-3-red.log`](evidence/milestone-7b-2026-10-08/gpt6-3-red.log) → [`gpt6-3-green.log`](evidence/milestone-7b-2026-10-08/gpt6-3-green.log), with the App focus tests).

### Open items

- The mapping model has `confirmed` and `unresolved` but no separate “ambiguous” status, so the page labels that state “Unresolved or ambiguous mapping”.
- The bundle grew to 544.41 kB, above the 500 kB advisory. Consider route-level code splitting later.
- Browser back to `/search` (not via the back link) does not restore the query, because the search input does not write `q` into the URL.
- Real-device checks remain in Milestone 12.
- Clinical-content and source-rights acceptance are still not established; data stays synthetic.
