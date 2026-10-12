# Milestone 8 evidence — local favorites and recent searches

Date: 2026-10-09. Implementation commits: `e6af0ec` (bounded recent-search retention in the local store), `6961618` (web favorites and recent searches) and `62797ed` (stale search-URL fix). Follow-up cleanup on the same branch: `ead4953` (drop the Tempo editor helper). Every catalogue and fixture in this evidence is synthetic; favorites and recent searches are development features and do not support care decisions. No Appwrite service or other network service was used for this work.

## Scope

Milestone 8 in [`plan/CODEX_BUILD_PLAN.md`](../plan/CODEX_BUILD_PLAN.md) calls for local favorites and recent searches with stable identifiers, removal status after catalogue changes, retention with clear/delete/export controls, and migration independent of catalogue replacement — with no account and no synchronization.

Requirements covered, from [`plan/REQUIREMENTS.md`](../plan/REQUIREMENTS.md):

- R66: local favorites and recent searches work after a successful compatible download, including offline (verified in the browser scenarios below).
- R68: quota, eviction, private-mode and installed-versus-tab storage differences are acknowledged (disclosure text on `/status` and in the settings section).
- R69: storage failures get explicit recovery paths, and permanent retention or built-in IndexedDB encryption is never claimed (per-action error messages; the settings copy names eviction risks).
- R73: the downloaded dataset, favorites and recent searches stay in IndexedDB through Dexie (one database, existing stores).
- R90: favorites and recent searches remain local and useful without an account (no account exists anywhere in the application).
- R91: favorites use stable product identifiers, show removed/unresolved status after catalogue changes, and never silently remap a medication.
- R92: retention is independent of dataset replacement and supported schema migrations (preference stores carry no generation component).
- R93: clear/delete/export and documented retention controls exist, and browser deletion/eviction risks are disclosed (settings section on `/status`).
- R94: cross-device synchronization is later opt-in account functionality, not an MVP requirement (nothing synchronizes; export produces a local file).

## What was built

### PreferencesService and its wiring

`apps/web/src/application/preferences.ts` defines `PreferencesService`: `listFavorites`, `isFavorite`, `addFavorite`, `removeFavorite`, `listRecentSearches`, `recordOpenedSearch`, `clearRecentSearches`, `exportPreferences` and `clearAllLocalData`. `createPreferencesService(store.preferences, store)` composes the local store with the dataset state source, so presentation never imports `@intermed/local-store`; the boundary check passes with 100 source files.

- `listFavorites` reads the favorites together with the product tombstones: a `removed` favorite shows the tombstone's `removedAt` date, and when no dataset generation is active every favorite is reported as `not-checkable` instead of guessing.
- `recordOpenedSearch` trims the query, rejects an empty query, and keeps a `lastKnownDatasetVersionId` only when the opened result's version id parses as a stable `DatasetVersion` id (`parseStableId`); otherwise it stores `null`.
- `Bootstrap.tsx` memoizes one `PreferencesService` per local store in a `WeakMap`, exactly like the search and detail services, and threads it through `createServices` into `AppServices.preferences`. Isolated view tests inject `unavailablePreferencesService`.

### Favorite toggle on the detail page

The medication detail page renders the toggle once the stored state has been read (`isFavorite !== null`), so nothing is claimed before the browser answers. The button exposes `aria-pressed`, is disabled while a write is pending, and reads "Add to favorites" / "Remove from favorites". Adding a favorite records the stable product id with its last known display name (commercial name) and dataset version id; removal is by stable id. Outcomes are announced politely ("Added to local favorites." / "Removed from local favorites."), and a failed write keeps the previous state and says "Your previous state is unchanged." A failed status read shows "Favorite status could not be read from this browser." The page keys its favorite state by product id, so a pending write can never apply to another product.

### The `/favorites` page and its statuses

`FavoritesPage` states that entries are "Saved in this browser using stable product IDs." Each row shows the last known display name and its reconciliation status:

- `available`: links to `/medication/<id>` and states "Available in the active dataset."
- `removed`: no link — plain text with "No longer in the active dataset." and "Removed on YYYY-MM-DD." from the tombstone ("Removal date unavailable." when no date exists). A favorite is never remapped to a similar product; the row keeps the favorited identity.
- `unresolved`: no link, "Could not be checked against the active dataset."
- when no dataset is active, every favorite reads "Status: Not checkable." and the page states "No active dataset is available. Favorites are not checkable."

The list has explicit read ("Reading local favorites."), empty ("No favorites yet." with a link to `/search`) and error ("Favorites could not be read from this browser.") states. Each row's Remove button has the accessible name "Remove <name> from favorites" and asks for confirmation through the shared dialog; a failed removal keeps the previous list ("Favorite could not be removed. Your previous state is unchanged.").

### Recent searches

Recent searches are recorded only when a search result is opened: the result link's click handler records the trimmed query together with the opened product's dataset version id. Nothing is recorded for typing alone. The rules are enforced in `packages/local-store/src/preferences.ts`:

- de-duplicated: `addRecentSearch` deletes rows with the same trimmed query before writing the new entry, so re-opening a query moves a single entry to the top;
- bounded: `MAX_RECENT_SEARCHES` = 10 entries per browser profile;
- time-limited: `RECENT_SEARCH_RETENTION_MS` = `30 * 24 * 60 * 60 * 1000` (30 days);
- `pruneRecentSearches` runs on every write and on every read (`listRecentSearches`), so expired and excess legacy rows disappear even when nothing new is written.

Each entry stores the query, the ISO `occurredAt` and the optional `lastKnownDatasetVersionId`; its id is `<occurredAt>#<query>`. The search page shows the list only while the query box is empty, as "Search again for <query>" buttons with their time; choosing one restores the query, the `/search?q=…` URL and the search results. The domain type's contract states that query text is never logged or sent.

### The settings section on `/status`

The controls live in `LocalPreferencesSettings`, a section on `/status`. They are local-data governance actions, so they sit with the dataset status and the storage-difference disclosure that already live there; a separate route would suggest a profile or account surface that does not exist. The section's copy discloses the storage model: favorites and recent searches are stored only in this browser, are not synced, and private mode, quota limits, clearing site data or browser eviction can remove them.

- **Download preferences** exports JSON with `format: "intermed-preferences"`, `version: 1`, `exportedAt`, `favorites` (product id, `createdAt`, last known display name and dataset version id, status) and `recentSearches` (query, `occurredAt`, optional dataset version id), downloaded as `intermed-preferences-YYYY-MM-DD.json` (pretty-printed with a trailing newline via a Blob object URL that is revoked after the click). Success reads "Preferences downloaded."; failure reads "Preferences could not be exported from this browser."
- **Clear recent searches** asks for confirmation, clears the recent-search store and confirms with "Recent searches cleared."
- **Clear all local data** asks for confirmation with a message that names the downloaded dataset, favorites and recent searches, and the multi-tab caveat. Clearing is a writer operation under the dataset writer lock: while another tab is staging or activating it is refused with reason `writer-busy`, and the section then reports "Another tab is updating local data, so this browser's data was not cleared." A completed clear empties the catalogue stores, generations, meta, favorites, recent searches and tombstones in one transaction, bumps the clear epoch so an update already in flight can never undo it, refreshes the dataset state and broadcasts a `cleared` event to other tabs.

Statuses are polite live regions; errors are alerts.

### `ConfirmationDialog` focus management

The shared dialog (`ConfirmationDialog.tsx`) is a `role="alertdialog"` with `aria-modal`, labelled by its title and described by its message, and `aria-busy` while the confirm promise is pending (buttons are disabled then). On open it focuses the Cancel button; on close it restores focus to the previously focused element, falling back to the invoking section's heading when that element is gone. Tab and Shift+Tab cycle between the dialog's enabled buttons, and Escape cancels when no write is pending.

## Privacy and safety

- Everything is browser-local: favorites, recent searches and tombstones live in the same Dexie/IndexedDB database as the downloaded dataset. There is no account, no synchronization and no telemetry, and nothing in this milestone sends data out.
- A browser test spies on the page's requests through the whole flow — staging a dataset, favoriting from search results, reloading, opening a favorite offline, replacing the catalogue — and asserts that no fetch/XHR data request occurs; only the service-worker script request is tolerated.
- The `/status` storage paragraphs and the settings copy disclose private-mode, quota, eviction and installed-versus-tab differences (R68), and permanent retention is never claimed (R69).
- No Dexie schema change was needed, and none was made: the `favorites`, `recentSearches` and `tombstones` stores were already declared in schema version 1 (`packages/local-store/src/schema.ts`), deliberately without a generation component so they survive catalogue replacement (R92). Milestone 8 only reads and writes those existing tables, so no new `version()` and no migration run on installed databases; the v2 schema delta remains a test-only upgrade probe.
- After a dataset activation (and on open, when the active generation was never reconciled), `reconcilePreferences` re-reads the target generation inside one read-write transaction, resolves every favorite by stable product id only, marks it `available` or `removed`, refreshes the display name and dataset version id of available rows, writes or clears tombstones, isolates per-product failures (including quota detection) and marks the generation reconciled only after a complete run, so partial runs are retried. It never remaps a favorite to a similar product (R91).

## Bug fixed along the way: stale debounced search-URL update

A Chromium trace showed the application reaching the detail route and then a delayed search-URL update returning it to `/search?q=fictivol`. The cause: typing schedules a 200 ms debounced `setSearchParams` write, and updating `location.search` recreates the `setSearchParams` identity, which re-runs the effect and reschedules the debounce — so a write could still be pending when a result opened and then fired on the detail route, replacing the URL.

The fix (`62797ed`) keeps the latest setter in a ref, cancels the pending timer when a result opens, and skips the write when the pathname changed since the debounce was scheduled. The regression test failed before the fix with an extra `replaceState` after opening a result and advancing the debounce: [`preferences-url-sync-red.log`](evidence/milestone-8-2026-10-09/preferences-url-sync-red.log) (1 failed, 50 skipped) → [`preferences-url-sync-green.log`](evidence/milestone-8-2026-10-09/preferences-url-sync-green.log) (1 passed).

## Tests

The milestone's full check ([`full-check-green.log`](evidence/milestone-8-2026-10-09/full-check-green.log)) ran on Node 24.21.0 with npm 11.19.0 and the pinned Node 22.23.2 secondary runtime, and exited 0: format check, lint and typecheck passed; 949 unit and component tests in 59 Vitest files passed; the architecture boundary check passed (100 source files); `npm audit` found 0 vulnerabilities; the production build passed (176 modules transformed; main JavaScript bundle 560.29 kB, 169.42 kB gzip, above Vite's non-fatal 500 kB advisory); the distribution scan found no credential-shaped strings in 9 files; and Playwright ran 165 tests across chromium-desktop, webkit-phone and webkit-tablet with 163 passed, 2 skipped (WebKit performance skips) and 0 failed.

Red → green evidence, all under Vitest v4.1.11:

- [`preferences-retention-red.log`](evidence/milestone-8-2026-10-09/preferences-retention-red.log): 3 of 16 local-store tests failed before implementation — trimming a repeated search, keeping at most ten entries while dropping older-than-30-days rows on write, and pruning expired/excess legacy rows on read. [`preferences-retention-green.log`](evidence/milestone-8-2026-10-09/preferences-retention-green.log): the same 3 pass; the full store suite passes 16 ([`preferences-suite-green.log`](evidence/milestone-8-2026-10-09/preferences-suite-green.log)).
- [`preferences-ui-red.log`](evidence/milestone-8-2026-10-09/preferences-ui-red.log): 7 UI cases failed before implementation (favorites and local-preferences UI, search/detail interactions). [`preferences-ui-green.log`](evidence/milestone-8-2026-10-09/preferences-ui-green.log): the focused suite passes 114 tests in 9 files.
- The URL-sync regression pair above.

Browser scenarios ([`tests/browser/preferences.spec.ts`](../../tests/browser/preferences.spec.ts)):

1. **Keeps a favorite across reload and opens it while offline.** Stage the synthetic alpha dataset, favorite two products from search results, reload, go offline, open `/favorites`, assert a rendered favorite link target of at least 44 px, and open a favorite offline. Then stage beta without one of the products: the removed favorite reads "No longer in the active dataset." with a removal date and has no link, the still-present favorite keeps the same stable product id across generations, no "similar product" wording appears, and zero fetch/XHR data requests were recorded.
2. **Reconciles a removed synthetic product without remapping a present favorite.** After the beta generation omits a product, the favorites page shows the removed entry without a link and the present entry with its unchanged product id.
3. **Persists opened searches and clears them with keyboard-accessible confirmation.** A query appears in recent searches only after a result is opened, survives reload, and "Search again for <query>" restores the query and the `/search?q=…` URL. Clearing works by keyboard: Enter opens the dialog, Cancel is focused, Escape closes and restores focus to the invoking button, and confirming clears the list; the cleared state survives reload.

Performance numbers from the same check, measured on Chromium with 20,000 synthetic products: search indexing took 718.6 ms; key-to-render p95 was 265.5 / 268.3 / 263.3 ms and core-search p95 was 6.0 / 5.7 / 5.6 ms for one-, two- and four-character queries; the fixture build took 2,216.5 ms and local-store staging 6,228 ms. The WebKit projects skipped the performance measurement by design.

Test-side changes: `tests/browser/medication-search.spec.ts` now expects the search page to focus its heading (not `main`); `tests/browser/pwa.spec.ts` reads `INTERMED_VITE_DEV_URL` for the development-server URL; `tests/browser/production-server.ts` maps `/favorites` to `index.html`.

After the cleanup commit removed the Tempo editor helper, the full check was repeated with the same toolchain and passed again; the log is [`full-check-cleanup.log`](evidence/milestone-8-2026-10-09/full-check-cleanup.log).

## Accessibility

- Controls meet the 44 px minimum target height: the favorite toggle, favorite name links and plain names, remove buttons, recent-search buttons, settings action buttons and dialog buttons (`styles.css`); a browser test asserts the rendered favorite link height.
- Dialogs manage keyboard focus: Cancel is focused on open, focus is restored to the invoking control on close, Tab and Shift+Tab stay inside the dialog, and Escape cancels. Page headings carry `tabindex="-1"` and receive focus on navigation; the browser suite now asserts the search page's focused heading.
- Polite status announcements: favorite add/remove notices, recent-search notices, settings statuses and search statuses use `role="status"` with `aria-live="polite"`; errors use `role="alert"`. The favorite toggle exposes its state through `aria-pressed`, and remove/recent buttons carry descriptive accessible names ("Remove <name> from favorites", "Search again for <query>").

These are automated browser checks. Manual screen-reader and real-device confirmation remains part of the later acceptance work (Milestone 12).

## Integration with the bundle split

M8 was developed on top of `f5382bd`; PR #18 (bundle split, `597d1a5`) landed first, so `origin/main` was merged into this branch in `a6985e1`. Git reported six content conflicts. Every resolution kept both branches' behaviour; the per-file notes are in [`integration-merge-resolution.log`](evidence/milestone-8-2026-10-09/integration-merge-resolution.log).

- **`App.tsx`**: main's structure is kept (lazy search and detail routes behind one `Suspense`, the pathname-keyed `RouteErrorBoundary`, the `RouteFocusContext` provider, focusable static headings), with M8's `preferences` props, the `/favorites` route and nav link, and `LocalPreferencesSettings` on `/status` added into it.
- **Eager imports**: `FavoritesPage` and `LocalPreferencesSettings` are imported eagerly. The precache was one asset below its 16-asset cap, and another lazy chunk would have taken the last slot. After the merge the entry chunk is 89.41 kB, the largest chunk is `framework-vendor` at 258.58 kB, there are 15 precached assets, and the build prints no chunk-size warning.
- **`MedicationSearchPage.tsx`**: both branches had fixed the same stale debounced URL write. One implementation is kept, using main's naming. Activating a result, by click or Enter, cancels the pending URL write **and** records the recent search. Both branches' regression tests are kept.
- **`MedicationDetailPage.tsx`**: M8's favorite toggle and main's `useRouteHeadingFocus()` are both present.
- **Offline `/favorites`** (`75a42f6`): the service worker serves the cached shell for cold offline navigations to `/favorites`, test-first.
  - The worker unit test failed before the fix (1 of 70) and passed after (70 of 70).
  - The offline deep-link browser test failed before the fix (3 failed) and passed after (9 passed).
  - Logs: [`integration-worker-red.log`](evidence/milestone-8-2026-10-09/integration-worker-red.log), [`-green`](evidence/milestone-8-2026-10-09/integration-worker-green.log), [`integration-browser-red.log`](evidence/milestone-8-2026-10-09/integration-browser-red.log), [`-green`](evidence/milestone-8-2026-10-09/integration-browser-green.log).
- **Favorites heading focus**: the merged `App.test.tsx` already asserts that navigating to `/favorites` focuses the Favorites heading, so no further change was needed.
- **Full check** at `1bfd02b`, run by the orchestrator: format, lint, typecheck, 968 unit tests in 61 files, boundaries (103 files), audit (0 vulnerabilities), build, the dist secret scan, and Playwright (172 passed, 2 skipped). See [`integration-full-check.log`](evidence/milestone-8-2026-10-09/integration-full-check.log).
- **After merging main again** (`5c4bee7`, which brings in #19–#21, docs and the domain): format, lint, typecheck, unit tests (1,078 in 63 files) and boundaries pass. The browser suite runs in CI.

## Open items

- The implementation carried a Tempo editor helper — `tempo-sdk` as an `apps/web` devDependency plus `defineControls` blocks in the five touched components — which was out of scope. Commit `ead4953` removes it entirely; the post-cleanup check above confirms all gates still pass.
