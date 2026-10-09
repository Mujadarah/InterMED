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

**Budget policy.** Core-search p95 under 100 ms is the product budget, asserted on every machine; it held between 3.4 and 31.6 ms in every measurement. Index build, IndexedDB staging and key-to-render are wall-clock figures. They varied up to about 5× for the same code, with machine load and runner type, so the test asserts them only as broad regression guards: index under 15 s, staging under 120 s (widened from 60 s in part B after the Windows runner measured 26–72 s for unchanged staging code), key-to-render p95 under 750 ms. Their targets (index under 5 s, staging under 5 s, key-to-render p95 under 300 ms including the debounce) are reported, not asserted:

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
- ~~The production bundle remains above the build tool's 500 kB warning threshold (527.64 kB; prior branch measurement 513.68 kB). The build passed, but this size warning remains.~~ Resolved by [Bundle size follow-up](#bundle-size-follow-up).

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

- The mapping model has `confirmed` and `unresolved` but no separate "ambiguous" status, so the page labels that state "Unresolved or ambiguous mapping".
- ~~The bundle grew to 544.41 kB, above the 500 kB advisory. Consider route-level code splitting later.~~ Resolved by [Bundle size follow-up](#bundle-size-follow-up).
- Browser back to `/search` (not via the back link) does not restore the query, because the search input does not write `q` into the URL.
- Real-device checks remain in Milestone 12.
- Clinical-content and source-rights acceptance are still not established; data stays synthetic.

## Bundle size follow-up

Date: 2026-10-09. Branch `codex/bundle-split`, based on `d770ced`. Work in the `bundle-split` worktree; nothing pushed. The catalogue and every fixture stay synthetic; no Appwrite or other network service was used.

### Approach

1. **Measure first.** `vite build --sourcemap` into a temporary directory outside the repository, then a small Node script decoded the sourcemap and attributed generated characters to source modules ([`bundle-attribution-before.log`](evidence/bundle-split-2026-10-09/06-bundle-attribution-before.log)). The single 546,139-byte chunk was 38.2% `react-dom`, 17.5% `dexie`, 16.5% `zod`, 7.0% `react-router`, 1.5% `react`, 0.6% `scheduler` and 18.2% application code, including 11.5 kB of `MedicationDetailPage` and 5.9 kB of `MedicationSearchPage`.
2. **Split by route.** `MedicationSearchPage` and `MedicationDetailPage` load through `React.lazy` behind one `Suspense` boundary with a polite, calm fallback (`role="status"`, `aria-busy`, no heading, no focus move). `main` already has `min-height: 60vh`, so the placeholder does not shift the shell, and the placeholder text is drawn in the muted colour to stay quiet.
3. **Split stable vendors.** `build.rollupOptions.output.manualChunks` separates `framework-vendor` (react, react-dom, scheduler, react-router), `zod-vendor` and `dexie-vendor`. The shell entry keeps only what it needs to paint.
4. `build.chunkSizeWarningLimit` was **not** raised and the warning was not otherwise silenced.

### Chunks before and after

`kB` is decimal, as Vite reports it; Vite counts 1 kB as 1,000 bytes, so the 500 kB advisory is 500,000 bytes and the test asserts exactly that.

Before (`d770ced`), one JavaScript chunk, no vendor split:

| Asset                | Bytes   | kB     | gzip kB |
| -------------------- | ------- | ------ | ------- |
| `assets/index-*.js`  | 546,139 | 546.13 | 165.99  |
| `assets/index-*.css` | 6,574   | 6.57   | 1.83    |
| `index.html`         | 1,587   | 1.59   | 0.64    |

After, ten JavaScript chunks and one stylesheet:

| Asset                                               | Bytes   | kB     | gzip kB |
| --------------------------------------------------- | ------- | ------ | ------- |
| `assets/framework-vendor-*.js`                      | 258,585 | 258.58 | 82.08   |
| `assets/dexie-vendor-*.js`                          | 95,195  | 95.19  | 31.30   |
| `assets/zod-vendor-*.js`                            | 90,913  | 90.91  | 25.65   |
| `assets/index-*.js` (entry)                         | 78,076  | 78.08  | 22.35   |
| `assets/MedicationDetailPage-*.js`                  | 12,692  | 12.69  | 3.58    |
| `assets/MedicationSearchPage-*.js`                  | 7,749   | 7.75   | 2.60    |
| `assets/search-status-*.js` (shared by both routes) | 2,808   | 2.81   | 1.03    |
| `assets/rolldown-runtime-*.js`                      | 589     | 0.59   | 0.36    |
| `assets/index-*.css`                                | 6,574   | 6.57   | 1.83    |
| `index.html`                                        | 1,925   | 1.93   | 0.72    |

The largest chunk drops from 546,139 bytes (533.3 KiB) to 258,585 bytes (252.5 KiB), and every JavaScript chunk is now below the advisory. Total JavaScript is 546,607 bytes, i.e. 468 bytes (0.09%) more than before: the split adds the rolldown runtime and per-chunk wrappers, and nothing was removed from the shell. The first load carries 523,358 bytes of JavaScript instead of 546,139, about 4.2% less, because the two route chunks and their shared helper (23,249 bytes) load only when a route opens. The rest of the shell really does need `react-dom`, `zod` and `dexie` before it can paint: the store is opened and the configuration is parsed during `Bootstrap`, so deferring them would change behaviour.

### Asset count and precache size

|                             | Before  | After   |
| --------------------------- | ------- | ------- |
| Precached assets (cap 16)   | 8       | 15      |
| Precached bytes (cap 2 MiB) | 563,457 | 564,263 |

Both caps hold ([`precache-after.txt`](evidence/bundle-split-2026-10-09/07-precache-after.txt)). The precache grew by one file per emitted chunk and stayed inside the sixteen-asset cap; `apps/web/pwa/shell-build.ts` is unchanged. One asset of headroom remains.

### Offline deep links

The worker served its cached HTML only for `/` and `/status`, so an offline deep link to `/search` failed outright. `apps/web/pwa/worker.ts` now serves the cached HTML for every route the shell renders (`/`, `/status`, `/search` and `/medication/*`). No precache, readiness, activation or integrity logic changed: the same verified release answers the navigation, and the same `publicAsset` rule answers scripts and styles.

### Tests

- **Build output.** `apps/web/pwa/build-output.test.ts` builds into a temporary directory outside the repository and asserts that every emitted `assets/*.js` is under 500 kB (500,000 bytes; Vite counts 1 kB as 1,000 bytes), that every emitted JavaScript and CSS asset appears in the generated `sw.js` precache list, and that the precached release stays within sixteen assets. Red: `index-CJvC-D9w.js is 546139 bytes`; green: 3 passed ([`build-output-red.log`](evidence/bundle-split-2026-10-09/01-build-output-red.log) → [`build-output-green.log`](evidence/bundle-split-2026-10-09/02-build-output-green.log)).
- **Offline deep links.** `tests/browser/offline-deeplinks.spec.ts` stages a synthetic generation, takes the origin offline, then opens `/search` and `/medication/<synthetic id>` in fresh tabs that had visited neither route. Both render from the precache and no document, script or style reaches the origin. Red: `page.goto: net::ERR_INTERNET_DISCONNECTED at .../search`; green: 3 passed on chromium-desktop, webkit-phone and webkit-tablet ([`offline-deeplinks-red.log`](evidence/bundle-split-2026-10-09/03-offline-deeplinks-red.log) → [`offline-deeplinks-green.log`](evidence/bundle-split-2026-10-09/04-offline-deeplinks-green.log)).
- **Worker navigation.** The existing `serves verified index HTML for offline navigation` case now also covers `/search` and `/medication/synthetic-product`; the excluded-request case is unchanged.
- **Existing tests.** Two component tests queried a route heading synchronously. They now wait for the lazy chunk (`findByRole`), which still asserts the same rendering; no assertion was removed or relaxed. The full suites stayed green: 926 unit and component tests in 57 files, and 157 Playwright tests passed with 2 WebKit-only performance cases skipped by design.

### Review fixes (PR #18)

Five review findings on PR #18, one commit each, with evidence in `evidence/bundle-split-2026-10-09/`: four behaviour fixes with red → green evidence, and the chunk-guard finding, which tightened a check that stayed green. No new chunk and no new dependency: the precache still holds fifteen assets and `chunkSizeWarningLimit` is still untouched.

- **`019cdde` — offline navigation with a query string.** The worker's fetch handler returned early on any `url.search`, so an offline deep link to `/search?q=fictivol` or a refresh of `/medication/<id>?q=fictivol` — both URLs the app itself creates — went to the network and failed. A navigation to a shell route now also serves the cached `/index.html` when the query carries a single `q` parameter, exactly as a query-less navigation does; every other query, a repeated `q` and any query on an asset still falls through. Unit red: 4 of 69 worker cases failed on `?q=` for `/`, `/status`, `/search` and a detail route ([`pr18-1-red.log`](evidence/bundle-split-2026-10-09/pr18-1-red.log)); green: 69 passed ([`pr18-1-green.log`](evidence/bundle-split-2026-10-09/pr18-1-green.log)). Browser red on all three projects: `net::ERR_INTERNET_DISCONNECTED at .../search?q=fictivol`, and green: 6 passed ([`pr18-1-offline-query-red.log`](evidence/bundle-split-2026-10-09/pr18-1-offline-query-red.log) → [`pr18-1-offline-query-green.log`](evidence/bundle-split-2026-10-09/pr18-1-offline-query-green.log)).
- **`fd7a28d` — a failing lazy chunk no longer blanks the app.** A rejected `import()` is invisible to `Suspense`, so one failed chunk removed the whole route. `RouteErrorBoundary` now wraps the `Suspense`/`Routes` content, keyed by pathname, and renders a heading with `tabIndex={-1}` ("This page could not be loaded"), text that part of the app is unavailable in this browser right now and may be missing offline files, a Reload button, and a link to `/status`. Header, navigation and footer stay usable and nothing is logged. Covered in `apps/web/src/presentation/route-recovery.test.tsx`; red: the recovery heading never appeared, green: 936 unit and component tests passed in 58 files ([`pr18-2-red.log`](evidence/bundle-split-2026-10-09/pr18-2-red.log) → [`pr18-2-green.log`](evidence/bundle-split-2026-10-09/pr18-2-green.log)).
- **`67141e7` — focus after a lazy route resolves.** On Ubuntu, `App.test.tsx` reported `h1#medication-detail-title` unfocused with focus on `body`: the App's pathname effect ran while the chunk was still loading. The App effect is unchanged, but a pathname change now records that the heading focus is still owed, and a route page's mounted `h1[tabindex="-1"]` claims it through a shared `useRouteHeadingFocus` in `presentation/` while focus is unclaimed (body, `<main>`, the loading placeholder, or a previous state's heading). A user who moved focus keeps it, so the detail page's existing `focusWasMoved` guard still holds. The three static route headings (overview, status, "Page unavailable") and the search heading gained `tabIndex={-1}`, so navigation focus lands on them too, and the placeholder is marked `data-route-loading` so both guards recognise it. Two browser tests asserted that `main` held focus after navigating to `/status` and to `/search`; they now assert the route heading holds it, which is the point of the change. Red: `main` kept focus on the status and search routes ([`pr18-3-red.log`](evidence/bundle-split-2026-10-09/pr18-3-red.log)); green: 259 web tests passed in 16 files ([`pr18-3-green.log`](evidence/bundle-split-2026-10-09/pr18-3-green.log)). The CI-failing case now waits for the focus itself rather than for the heading, which is stricter rather than looser and removes the race with the effect that moves it; `App.test.tsx` ran 20 consecutive times with 20/20 exits 0, and the same mechanism was confirmed on all three browser projects ([`pr18-3-flake-loop.log`](evidence/bundle-split-2026-10-09/pr18-3-flake-loop.log)). An independent re-verification re-ran that loop (20/20 exits 0) and, from an out-of-tree copy with `useRouteHeadingFocus` neutralised, showed these Windows runs do not exercise the pending-claim path — the ordering the Ubuntu CI failure came from — which therefore stays unproven here rather than proven unnecessary ([`pr18-3-flake-loop-verify.txt`](evidence/bundle-split-2026-10-09/pr18-3-flake-loop-verify.txt), [`pr18-3-mechanism-verification.txt`](evidence/bundle-split-2026-10-09/pr18-3-mechanism-verification.txt)).
- **`ae3ddd0` — opening a result no longer bounces back to `/search`.** Route pages load through `React.lazy`, so while the detail chunk arrives React keeps the search page mounted; the new location gives `useSearchParams`'s `setSearchParams` a fresh identity, and the query-to-URL effect depended on both the query and that setter, so it rescheduled its debounced write. The write then fired from the still-mounted search page and replaced the location, which is the Windows CI failure in `tests/browser/medication-search.spec.ts:249`. The debounce now depends on the query alone and reads the latest setter from a ref, records the pathname when it schedules and skips the write if the pathname moved, and cancels a pending write when a result link is activated by click or by keyboard. The test renders the search page under a real router so it survives the navigation, types a query, activates a result while the debounce is still pending, advances the timers and asserts the location is still `/medication/<id>` with no extra `replaceState`: red with a third write, green with none ([`pr18-4-red.log`](evidence/bundle-split-2026-10-09/pr18-4-red.log) → [`pr18-4-green.log`](evidence/bundle-split-2026-10-09/pr18-4-green.log)). The failing browser case ran ten times in a row on chromium-desktop: 10 passed ([`pr18-4-browser.log`](evidence/bundle-split-2026-10-09/pr18-4-browser.log)).
- **`35a1766` — the chunk guard matches Vite's decimal kilobyte.** Vite advertises its chunk-size warning in kilobytes of 1,000 bytes, so the 500 kB advisory is 500,000 bytes and a guard of 512,000 bytes left 12,000 bytes of slack above what Vite would report as oversized. `apps/web/pwa/build-output.test.ts` now asserts `500_000` and its comment says Vite counts 1 kB as 1,000 bytes; the byte conversion and the build-test description in this section said "1 kB = 1024 bytes" and "512,000 bytes" and now state the decimal kilobyte. The largest of the eight emitted JavaScript chunks is 258,585 bytes, so nothing was re-split and the guard stays comfortably clear ([`pr18-5-green.log`](evidence/bundle-split-2026-10-09/pr18-5-green.log), [`pr18-5-precache.txt`](evidence/bundle-split-2026-10-09/pr18-5-precache.txt)).

### Commands

| Command                       | Result                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `npm run format:check`        | Exit 0                                                                          |
| `npm run lint`                | Exit 0                                                                          |
| `npm run typecheck`           | Exit 0                                                                          |
| `npm run test`                | Exit 0; 57 files, 926 tests                                                     |
| `npm run check:boundaries`    | Exit 0; 94 source files                                                         |
| `npm audit --audit-level=low` | 0 vulnerabilities                                                               |
| `npm run build`               | Exit 0, no chunk-size warning                                                   |
| `npm run scan:dist`           | Exit 0                                                                          |
| `npm run test:browser`        | Exit 0; 157 passed, 2 skipped                                                   |
| `npm run check`               | Exit 0 ([`check-full.log`](evidence/bundle-split-2026-10-09/10-check-full.log)) |

Toolchain: Node.js `v24.21.0`, npm `11.19.0`, `INTERMED_NODE22_RUNTIME` = Node.js `v22.23.2`. All logs in `docs/evidence/bundle-split-2026-10-09/` are redacted, UTF-8 without BOM and LF; each was written outside the repository first and then copied in.

After the PR #18 fixes, again with the same toolchain: `npm run check` exit 0 ([`pr18-check-full.log`](evidence/bundle-split-2026-10-09/pr18-check-full.log)) — 939 unit and component tests in 58 files, 96 source files in the boundary check, 0 vulnerabilities, and 162 browser cases with 160 passed and the same 2 WebKit-only performance cases skipped by design.

A note on flakiness: one intermediate full browser run reported two `recovery-update.spec.ts` failures on webkit-tablet while the 20,000-product search case ran on the same three workers. Re-running that spec alone passed all six cases on all three projects, the earlier full run had passed them, and the final full check passed them too, so the same code produced both outcomes. The rerun is recorded in [`recovery-update-rerun.log`](evidence/bundle-split-2026-10-09/09-recovery-update-rerun.log).

### Open items

- React Router is bundled with the React vendor chunk. It could become its own chunk, but that costs one of the sixteen precache slots and the framework loads together on the first paint.
- The shell still needs `zod` and `dexie` before it can paint. Deferring either would change when configuration parsing or the local store starts, which this work deliberately kept unchanged.
