# Milestone 6 acceptance evidence

Date: 2026-10-07. Branch: `codex/m6-local-store`. Scope: local IndexedDB/Dexie storage, the dataset update pipeline, local preferences and the visible storage states. No search/detail UI (milestone 7), no favorites UI (milestone 8), no importer (milestone 5), no Appwrite or cloud access, and no service-worker change. All data in fixtures, logs and browser tests is synthetic and clearly fictional ("Fictivol", "Placebex", "Synthetica", "Placebo Holding"); nothing here is a clinical fact or an ANMDMR record.

## Requirements addressed

Storage model and visible behaviour: 34 (indexes prepared, search UI stays in milestone 7), 66 (stores ready for offline search/detail/favorites), 67, 68, 69, 70, 72, 73, 74, 75, 76, 77, 78 (control exists as `clearAllLocalData()`, UI in milestone 8), 80, 81, 82, 84, 85 (full snapshots only; deltas stay deferred), 86, 87, 88, 89 (dataset state/version/age on `/status`), and 90–92 at store level (stable product ids, tombstones, independent migration). Requirement 79 is met only in part: startup reads the local database immediately and `checkForUpdate()` performs a manifest-only background check, but no timeout/backoff is implemented yet and mock mode never runs it automatically (maintainer decision 2026-10-07: synthetic data only, no cloud, and no automatic download into a user's browser). Requirement 83 belongs to the milestone 5 importer and is not claimed here.

## Design decisions

### Ports in domain, adapters in local-store

`packages/domain/src/local-store.ts` defines the vendor-neutral contracts the application needs: `LocalCatalogueStore`, `DatasetGenerationRepository`, `GenerationReader`, `DatasetUpdateState`, `DatasetUpdatePipeline`, `LocalPreferencesStore`, `FavoriteEntry`, `RecentSearchEntry`, `ProductTombstone` and `PublishedBundleLoader`. No Dexie type, browser global or network identifier appears there, so the domain package keeps its independent DOM-free compilation. `@intermed/local-store` implements them with Dexie 4.4.6 and depends only on `@intermed/domain` plus `dexie`. `scripts/check-boundaries.mjs` rejects any `@intermed/local-store` import outside `apps/web/src/Bootstrap.tsx` (the composition root), `apps/web/src/dev/**` (the test-only harness) and the package itself; the negative fixtures in `tests/boundaries.test.ts` cover presentation, application, infrastructure, data-access and domain violators. A later change to the published-dataset contract is absorbed in `packages/local-store/src/validate.ts`, the `PublishedBundleLoader` port and the composition root only.

### Schema (Dexie version 1)

Catalogue stores are keyed by `[generationId+id]`, so one generation can be written, read and deleted without any possibility of mixing rows of two generations. Derived fields are index keys only; the verbatim entity is stored unchanged under `entity` and is what readers return.

| Store                                     | Key                 | Indexes                                                                                                      | Content                                                                                                                      |
| ----------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `generations`                             | `generationId`      | `status`, `readyAt`                                                                                          | generation metadata plus `staging`/`ready` status                                                                            |
| `products`                                | `[generationId+id]` | `generationId`, `[generationId+nameFolded]`, `[generationId+dciFolded]`, `[generationId+status]`, `*atcKeys` | products for name/DCI/ATC lookups                                                                                            |
| `ingredients`                             | `[generationId+id]` | `generationId`, `[generationId+nameFolded]`, `[generationId+dciFolded]`                                      | active ingredients (DCI lookup)                                                                                              |
| `productIngredients`                      | `[generationId+id]` | `generationId`, `[generationId+productId]`, `[generationId+ingredientIdValue]`                               | product-to-ingredient links                                                                                                  |
| `atcCodes`                                | `[generationId+id]` | `generationId`, `[generationId+code]`                                                                        | ATC rows (illustrative only)                                                                                                 |
| `dosageForms`, `manufacturers`, `holders` | `[generationId+id]` | `generationId`, `[generationId+nameFolded]`                                                                  | detail-view entities                                                                                                         |
| `documents`                               | `[generationId+id]` | `generationId`, `[generationId+productId]`, `[generationId+type]`                                            | regulatory document links                                                                                                    |
| `sources`, `datasetVersions`              | `[generationId+id]` | `generationId`                                                                                               | provenance rows of the bundle                                                                                                |
| `meta`                                    | `key`               | —                                                                                                            | `dataset-state`: schema generation, active/previous generation ids, `lastSuccessfulCheckAt`, `updateStatus`, `failureReason` |
| `writerLock`                              | `key`               | —                                                                                                            | cross-tab writer marker for the lock fallback                                                                                |
| `favorites`                               | `productId`         | `status`                                                                                                     | favorites, keyed by stable product id, **no generation component**                                                           |
| `recentSearches`                          | `id`                | `occurredAt`                                                                                                 | recent searches, **no generation component**                                                                                 |
| `tombstones`                              | `productId`         | `removedAt`                                                                                                  | tombstones for favorited products a generation dropped                                                                       |

Folding (`foldForIndex`) is an index key only: legacy cedilla → comma-below (domain rule), combining marks removed, lowercased. It never replaces the verbatim name, and Milestone 7 query normalization must use the same helper (`foldForIndex` is exported for that reason).

### Generation identity, immutability and checks

A local generation id is exactly the published dataset version id. `checkManifest` verifies dataset identity, required fields, `schemaVersion` inside the supported range (`medication-catalogue-1`), `minimumClientVersion` against `LOCAL_CLIENT_VERSION` (`0.0.0`), and that `recordCounts` is present, non-negative and keyed by known entities. `checkBundle` then verifies, **outside any IndexedDB transaction**: bundle checksum (`fingerprint` over the bundle text — an accidental-corruption check, explicitly not a security hash and not a source-authority claim), catalog deserialization, bundle/manifest identity (`datasetVersionId`, `dataset`, `sourceIds`), referential integrity via `validateReferentialIntegrity` (which also checks the sealed snapshot checksum and counts), and manifest counts against the actual collections. A generation that is already `ready` is never rewritten: staged records are immutable, and re-staging an existing generation is a no-op.

### Staging and the atomic pointer switch

Staging writes `generations` plus one bulk write per catalogue store, keyed by the new generation id only. Staged rows are invisible to readers (every reader query filters on its pinned generation and `baseState()` only follows the active pointer). Activation is **one short `rw` transaction** over `generations` and `meta`: mark the staged generation `ready` and move the pointer, recording the displaced generation as `previousGenerationId`. The `readyAt` timestamp is computed before the transaction and nothing but IndexedDB work happens inside it. Interruption (thrown mid-staging) and `QuotaExceededError` abort staging, delete only the partial staged generation, never touch the active one, and surface `update-failed`/`interrupted` or `storage-quota`.

### State machine

| State                 | Entered when                                                                                     | Guarantees                                           |
| --------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `opening`             | the local database is being opened                                                               | nothing claimed yet                                  |
| `never-downloaded`    | the store has no active generation                                                               | honest "download required", never an empty catalogue |
| `ready`               | the active generation is present and readable                                                    | version, download time, age and coverage are shown   |
| `checking`            | a manifest check is running                                                                      | the active generation stays usable                   |
| `update-available`    | a newer compatible manifest was published                                                        | nothing downloaded yet                               |
| `downloading`         | a candidate bundle is being loaded                                                               | the active generation stays usable                   |
| `staging`             | a bundle is being written under its own generation id                                            | not active until the pointer switch                  |
| `update-failed`       | manifest/bundle/integrity/identity/size rejection, interruption or a busy writer                 | reason shown; previous generation kept               |
| `storage-unavailable` | no database API is exposed                                                                       | no data written                                      |
| `storage-restricted`  | the browser/profile refuses to open a database (for example private mode)                        | no data written                                      |
| `storage-quota`       | a staging write raised `QuotaExceededError`                                                      | staging aborted; previous generation kept            |
| `evicted`             | the active pointer exists but its rows are gone                                                  | recovery is an explicit re-download                  |
| `unsupported-schema`  | the on-disk schema generation is newer than this client understands                              | data untouched, never deleted or downgraded          |
| `reload-required`     | `versionchange`/`blocked`: another tab or app version changed the database under this connection | connection closed; no data discarded                 |

Dexie would silently "repair" a database written by a newer application (it rewrites the schema and bumps the native version), which would mutate a store this client does not understand. The store therefore reads the logical schema generation with a raw IndexedDB connection first (aborting `onupgradeneeded`, so no empty database is created) and refuses to open Dexie when `meta.dataset-state.schemaGeneration` is greater than `LOCAL_DATASET_SCHEMA_GENERATION`. A Dexie `VersionError` maps to the same state. Every future schema change must bump that generation and add its own Dexie `version()`.

### Retention and rollback

Pins are tracked in memory per tab (`openReader`/`openPinnedReader` pin; `release()` un-pins; an unreleased pin only retains data longer). Other tabs' pins cannot be observed, so the cross-tab rule is deliberately conservative: `collect()` keeps the active generation, the previous generation, every generation pinned in this tab, and **every ready generation activated inside the last 24 hours** (`RETAIN_READY_FOR_MS`). Only generations outside that set are deleted, plus staged leftovers older than 5 minutes (`STALE_STAGING_MS`). The active generation is never deleted, and nothing is ever cleared to make room for a download; `rollback()` switches the pointer back to the retained previous generation in one transaction.

### Multitab

Single writer: `navigator.locks.request('intermed-dataset-update', { ifAvailable: true, mode: 'exclusive' })`, so a second concurrent update is **refused** (`writer-busy`, nothing changed) instead of queued or raced. Where the Web Locks API is missing, a `writerLock` marker record is claimed atomically in one read/write transaction with a 60-second expiry (a crashed tab cannot block updates forever); that fallback is what the Vitest suites use, because Node 24 exposes a process-wide Web Locks manager that would leak across test files (`lockStrategy: 'marker'`). Activation is broadcast on `BroadcastChannel('intermed-dataset-events')`; receiving tabs switch at a safe boundary — new readers immediately use the new generation, pinned readers finish on the generation they captured. Losing a broadcast is safe because every reader creation re-reads the pointer. `versionchange` and `blocked` close the connection and surface `reload-required` instead of blocking an upgrade or discarding data.

### Preferences independent of generations

`favorites`, `recentSearches` and `tombstones` have no generation key and are never rewritten by catalogue replacement. A favorite is identified by its stable `MedicationProductId` only. After activation, each favorite is looked up by that id in the new generation: found → `available` with the new display name and dataset version; not found → `removed` **and** a tombstone recording the last known name. A similarly named replacement product with a different stable id is never adopted. `clearAllLocalData()` performs the explicit delete-all (R78). Migration keeps these stores intact (see below).

### Migrations

Schema generation 2 exists as a **test** schema only (`packages/local-store/src/probe.ts`): it adds a `createdAt` index to `favorites` and bumps `meta.schemaGeneration`. The migration test opens a real v1 database (favorites plus an active generation), upgrades it to generation 2 and reads the favorites, tombstones and the active pointer back unchanged. Re-opening that upgraded database with the production v1 store reports `unsupported-schema` with the data still readable through the probe. Browser tests drive the same upgrade against a real tab and observe `reload-required` there.

### Test-only harness

`apps/web/src/dev/local-store-harness.ts` is added to the application HTML only when a build uses the explicit `harness` mode and `INTERMED_LOCAL_STORE_HARNESS=1` (a plugin in `apps/web/vite.config.ts`). An inherited flag cannot affect a normal production build; Playwright builds a dedicated `artifacts/pwa-harness` fixture with the explicit mode (`scripts/build-pwa-fixtures.mjs`) and serves it as revision `harness` through the existing test-only server. `tests/browser/local-store.spec.ts` asserts that `apps/web/dist` contains neither the harness hook nor synthetic-bundle code, and that the harness fixture does.

## Test-first record

Logs are UTF-8, LF, trailing whitespace stripped, under [docs/evidence/milestone-6-2026-10-07/](evidence/milestone-6-2026-10-07/). Machine-specific path segments in their verbatim output are redacted to repository-neutral placeholders (`<worktree>`, `<repo>`, `<temp>`) as recorded in that folder's README; commands, results and exit codes are unchanged.

Method, stated plainly: this is red/green behaviour-determining evidence, not a claim that every implementation was written test-first. For the status page, boundary rules and browser harness, tests were written and run red against code that did not exist yet, then implemented. The `@intermed/local-store` implementation and its suites were developed together in this session; for those, each red log was captured by running the finished suite **with the implementation withheld** (the store factory replaced by a not-implemented stub, or the single behaviour removed), and each green log with the implementation in place. Every suite was shown to fail with the implementation withheld and pass with it; the implementation was largely written before the suites.

| Behaviour                                                                                                                                                                                                                                                                             | Red log                                                                                                          | Green log                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Staging, atomic pointer switch, validation rejections (checksum, integrity, counts, schema, identity), interruption and quota retention (13 tests)                                                                                                                                    | [red-staging.log](evidence/milestone-6-2026-10-07/red-staging.log)                                               | [green-staging.log](evidence/milestone-6-2026-10-07/green-staging.log)                                     |
| Pinned readers across a switch, rollback, retention/garbage collection, generation-scoped lookups (6 tests)                                                                                                                                                                           | [red-readers.log](evidence/milestone-6-2026-10-07/red-readers.log)                                               | [green-readers.log](evidence/milestone-6-2026-10-07/green-readers.log)                                     |
| Favorites/recent searches across replacement and restart, tombstones without remapping, clear-all (5 tests)                                                                                                                                                                           | [red-preferences.log](evidence/milestone-6-2026-10-07/red-preferences.log)                                       | [green-preferences.log](evidence/milestone-6-2026-10-07/green-preferences.log)                             |
| v1→v2 migration, unsupported newer schema, evicted/never-downloaded/storage states, `versionchange` and `blocked` handling (9 tests of the suite; the persistent-storage test below is its 10th)                                                                                      | [red-migrations.log](evidence/milestone-6-2026-10-07/red-migrations.log)                                         | [green-migrations.log](evidence/milestone-6-2026-10-07/green-migrations.log)                               |
| Single-writer refusal, Web Locks `ifAvailable` semantics, cross-tab safe boundary (3 tests)                                                                                                                                                                                           | [red-multitab.log](evidence/milestone-6-2026-10-07/red-multitab.log)                                             | [green-multitab.log](evidence/milestone-6-2026-10-07/green-multitab.log)                                   |
| Persistent-storage request is best effort and survives denial (1 test; red run with the request removed)                                                                                                                                                                              | [red-persistent-storage.log](evidence/milestone-6-2026-10-07/red-persistent-storage.log)                         | [green-persistent-storage.log](evidence/milestone-6-2026-10-07/green-persistent-storage.log)               |
| Status page wording for all 14 states, synthetic label, no download action, no permanence claim (18 tests; red/green behaviour-determining evidence)                                                                                                                                  | [red-dataset-status-ui.log](evidence/milestone-6-2026-10-07/red-dataset-status-ui.log)                           | [green-dataset-status-ui.log](evidence/milestone-6-2026-10-07/green-dataset-status-ui.log)                 |
| Boundary fixtures confining `@intermed/local-store` (9 new fixtures of 21; red/green behaviour-determining evidence — the 5 negative fixtures fail red without the rule)                                                                                                              | [red-boundary-rules.log](evidence/milestone-6-2026-10-07/red-boundary-rules.log)                                 | [green-boundary-rules.log](evidence/milestone-6-2026-10-07/green-boundary-rules.log)                       |
| Real-IndexedDB browser behaviour: never-downloaded in default mode, restart/offline read, two-tab coherence during an activation, `versionchange` → `reload-required`, production-bundle harness exclusion (5 tests × 3 projects = 15 runs; red/green behaviour-determining evidence) | [red-browser-local-store.log](evidence/milestone-6-2026-10-07/red-browser-local-store.log) (12 failed, 3 passed) | [green-browser-local-store.log](evidence/milestone-6-2026-10-07/green-browser-local-store.log) (15 passed) |

Browser runs cover the Chromium desktop and WebKit phone/tablet projects. The offline case uses the suite's established socket-disconnect failure mode (`server.failure('offline')`) with a cached production shell, and Chromium is included in the same run.

## Review fixes

The local-store harness is now reachable only through the explicit Vite
`harness` mode; inherited environment flags cannot add it to production
builds. A regression test covers both the production-with-flag and fixture
paths. The test-first wording above was corrected to distinguish
behaviour-determining red/green evidence from implementation order.

## Codex review fixes

Five findings from the Codex review of PR #10 were confirmed with a failing
test first (Vitest on `fake-indexeddb`; no finding needed real multi-tab
IndexedDB) and then fixed minimally. **All five were valid**; none was
rejected as invalid. Logs are UTF-8, LF, trailing whitespace stripped, one
section per run with its exact command and exit code:
[red-codex-review.log](evidence/milestone-6-2026-10-07/red-codex-review.log),
[green-codex-review.log](evidence/milestone-6-2026-10-07/green-codex-review.log).

Method, stated plainly: every red section is the named suite run against the
tree immediately before that fix, so it fails on the reported behaviour (for
finding 2 the log also keeps the run without the fault-injection seam and the
run with only that seam present, where the injected `QuotaExceededError`
rejects the committed activation exactly as the finding describes). The
`onMaintenance` seam added for that injection is test scaffolding of the same
kind as the existing `onStaged` seam. Two findings were designed and landed
together with overlapping Greptile findings (G1 with #1, G4 with #4, G6 with
#2); the "Greptile review fixes" subsection below points at those tests.

| #   | Finding (Codex review)                                                                                      | Test(s)                                                                                                                                                                                           | Fix                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1   | fallback writer lease expires mid-update; another tab can take the marker while the first writer still runs | `multitab.test.ts` "renews the fallback writer lease while its work runs so no other writer can take it", "aborts an activation whose writer lease was lost to another tab" (+ the G1 test below) | `041f4bb`: lease heartbeat renewal plus ownership revalidation inside the activation transaction                       |
| 2   | post-commit maintenance failure rejects a committed activation                                              | `staging.test.ts` "keeps a committed activation successful when preference reconciliation fails", "keeps a committed activation successful when post-commit collection fails"                     | `5ad1e69`: refresh and broadcast first, then isolated maintenance with `store.maintenance` diagnostics and later retry |
| 3   | rollback does not refresh the retention timestamp, so a rolled-back generation can be collected immediately | `readers.test.ts` "restarts the retention window when a rollback reactivates a generation"                                                                                                        | `92751fe`: `lastUsedAt` retention anchor written in the pointer-switch transactions                                    |
| 4   | `clearAllLocalData` is not coordinated with writers; it can interleave with another tab's staging loop      | `preferences.test.ts` "refuses clear-all while another tab is staging instead of racing it", "aborts staging cleanly when the local data is cleared underneath it"                                | `7c6edea`: clear-all under the writer lease, guarded staging batches, explicit `local-data-cleared` reason             |
| 5   | no cross-tab notification after a clear; other tabs keep reporting `ready`                                  | `multitab.test.ts` "tells other tabs when one tab clears the local data"                                                                                                                          | `facf926`: `cleared` event on the same channel; subscribers refresh                                                    |

Details that record the choices the findings left open:

- **#1** renews the marker lease on a heartbeat well under its TTL
  (`MARKER_RENEW_MS`, a third of `MARKER_TTL_MS`; the timer is injectable so
  tests drive it on the simulated clock) and revalidates ownership **inside**
  the transaction it guards, through the caller's transaction-bound
  `writerLock` table, so the check, the renewal and the write are one atomic
  step. Activation aborts when the lease is gone, and such a writer stops
  writing and runs **no cleanup** over rows that may already belong to the
  writer that took over (Greptile G1). The failed attempt kept in the green
  log hung on a cross-connection deadlock: the lease first renewed through its
  own connection while the caller's transaction was open.
- **#2** treats the activation as succeeded the moment the pointer switch
  commits: `refresh()` and the `activated` broadcast happen before any
  maintenance, then preference reconciliation and generation collection run
  isolated (`runMaintenanceTask`). A failure is reported as a separate
  non-fatal diagnostic (`store.maintenance.getStatus()`: `pending`,
  `lastFailure` with `storage-quota`/`error`) and `store.maintenance.retry()`
  re-runs it. The test injects the `QuotaExceededError` in the tombstone
  creating reconciliation; the second test injects it in the post-commit
  collection.
- **#3** uses a **dedicated field**, `GenerationRecord.lastUsedAt`, because
  `readyAt` must keep its documented meaning (the first staging-to-ready time,
  shown in diagnostics): every pointer switch - activation and rollback -
  records `lastUsedAt` inside the switching transaction, `collect()` measures
  the 24 h cross-tab window from it, and records written before this change
  fall back to `readyAt`.
- **#4** chose refusal over waiting: `clearAllLocalData()` returns the new
  `ClearLocalDataResult` (`cleared`, or `refused`/`writer-busy` while another
  tab writes) and deletes nothing when refused. Every staging write batch
  re-checks its generation record inside the batch transaction, so a cleared
  generation aborts **before** the batch is written and leaves no orphaned
  rows. Two abort shapes, both deliberate: mid-write the update reports
  `update-failed` with the new `local-data-cleared` reason (the update was cut
  short and says so), while an update that has written nothing yet stops
  quietly on a completed clear and leaves the honest `never-downloaded` state
  (that is the shape the overlapping Greptile G4 test pins down).
- **#5** broadcasts `DatasetStoreEvent` `cleared` on the same
  `BroadcastChannel('intermed-dataset-events')` as activations; subscribers
  now refresh from the persisted state on **any** of those events.

Contract changes: `LocalPreferencesStore.clearAllLocalData()` returns
`ClearLocalDataResult`, `DatasetUpdateFailureReason` gains
`local-data-cleared` (with status-page wording in `DatasetStatus`), and
`DatasetStoreEvent` becomes the `activated` | `cleared` union. The
`meta.dataset-state` record gains `reconciledGenerationId` and `clearEpoch`;
both are plain record fields, so no Dexie schema version or schema generation
change is involved.

Verification after these fixes, with the pinned Node `v24.21.0` / npm
`11.19.0` (each command and its exit code is captured in
[check-after-codex-review.log](evidence/milestone-6-2026-10-07/check-after-codex-review.log)):

| Command                    | Exit | Result                                                                                |
| -------------------------- | ---- | ------------------------------------------------------------------------------------- |
| `npm run format:check`     | 0    | all files use Prettier code style                                                     |
| `npm run lint`             | 0    | no warnings (`--max-warnings 0`)                                                      |
| `npm run typecheck`        | 0    | workspace and domain compile                                                          |
| `npm run test`             | 0    | 355 Vitest tests in 28 files (13 more than before)                                    |
| `npm run check:boundaries` | 0    | 62 source files; dependency-free domain; local-store confined                         |
| `npm run build`            | 0    | web build produced                                                                    |
| `npm run check`            | 0    | every gate above plus `npm audit`, `scan:dist` and 150 Playwright tests in 3 projects |

Only Markdown (this file) was written after that captured `npm run check`
run, and only `npm run format:check` reads Markdown: it was re-run afterwards
and exited 0 (also recorded in the same log).

### Greptile review fixes

Nine findings from the Greptile review, all confirmed with a failing test
first (Vitest on `fake-indexeddb`; none needed real multi-tab IndexedDB).
**All nine were valid**; G1, G4 and G6 were already fixed by the Codex pass
above and are proven by those tests; G2, G3, G5, G7, G8 and G9 are fixed
here. Logs: [red-greptile-review.log](evidence/milestone-6-2026-10-07/red-greptile-review.log),
[green-greptile-review.log](evidence/milestone-6-2026-10-07/green-greptile-review.log)
(same format: one section per run with its command and exit code).

|     | Finding (Greptile review)                                                                                             | Status                                            | Test(s)                                                                                                                                                                                                             | Fix                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| G1  | ownership only renewed, not checked before writes; a lease loser must stop and must not clean up the new owner's rows | already fixed by `041f4bb`                        | `multitab.test.ts` "stops staging and keeps the new writer rows when the lease is lost mid-staging" (+ the Codex #1 tests)                                                                                          | lease revalidated in every staging batch and in the pointer switch                                                 |
| G2  | `collect()` ran without the writer lock and decided from a stale snapshot of pointers/pins                            | fixed (`d50cdc7`, pin handover in `45555f9`)      | `readers.test.ts` "refuses collection while another tab is staging instead of deleting under it", "honours a pin taken while collection is running", "restarts a generation retention window when a reader pins it" | collection under the lease; pointers and pins re-read in the delete transaction; pins refresh the retention anchor |
| G3  | staging wrote its record first; a crash left a partial generation that `activate(id)` accepted                        | fixed (`e0927ca`, cleanup follow-up in `8ca4565`) | `staging.test.ts` "refuses to activate a generation whose staging never completed", "re-verifies the stored row counts before switching the pointer", "removes an incomplete staging generation on the next open"   | `staging` → `staged` completion marker with verified counts; activation re-verifies                                |
| G4  | a download could resume into a completed clear and re-activate                                                        | already fixed by `7c6edea`                        | `preferences.test.ts` "never lets a download resume into a completed clear"                                                                                                                                         | persisted clear epoch checked before staging and in the switch                                                     |
| G5  | reconciliation wrote favorites back from a stale `toArray()` snapshot                                                 | fixed (`ba0d8ff`)                                 | `preferences.test.ts` "keeps a favorite removed that was deleted while reconciliation ran"                                                                                                                          | one read-modify-write transaction, `update` only existing rows                                                     |
| G6  | reconciliation not recoverable after a crash before it ran                                                            | already fixed by `5ad1e69`                        | `staging.test.ts` "finishes a preference reconciliation that a crash interrupted"                                                                                                                                   | `reconciledGenerationId` marker, reconciled on open                                                                |
| G7  | evicted generation could not recover: readers handed out, download skipped                                            | fixed (`45555f9`)                                 | `staging.test.ts` "recovers an evicted generation by re-downloading and replacing its rows"                                                                                                                         | completeness check before every shortcut; re-stage replaces rows                                                   |
| G8  | startup write failures rejected the cached open promise and left `/status` on `opening`                               | fixed (`c72650d`)                                 | `migrations.test.ts` "reports a failed startup write and lets a later open retry"                                                                                                                                   | startup caught; connection closed; open stays retryable                                                            |
| G9  | the embedded dataset version was never compared with its manifest                                                     | fixed (`bd280ae`)                                 | `staging.test.ts` "rejects a bundle whose embedded dataset version disagrees with its manifest", "applies the manifest compatibility checks to the embedded version too"                                            | mismatch → `invalid-bundle`, same compatibility checks → `incompatible-schema`                                     |

Choices worth recording:

- **G2**: collection is refused (nothing collected) while another tab holds
  the writer lease, and each candidate is re-checked **inside** the deleting
  transaction against the pointers and the in-tab pins. `openPinnedReader`
  pins optimistically at call time and hands the pin to the reader, so a pin
  taken while collection runs is already visible to that re-check. Pin
  bookkeeping runs with `Dexie.ignoreTransaction`: Dexie otherwise joins an
  in-flight transaction whose scope does not contain the store (this also
  explains one failed attempt kept in the green log).
- **G3**: the completion marker is `status: 'staged'`, written in one final
  transaction after all batches and after the stored rows match the published
  counts; `activate` requires it and re-verifies the counts inside the pointer
  transaction (`interrupted` for an incomplete staging, `count-mismatch` for
  missing rows). Incomplete staging generations are removed on the next open,
  only past the abandoned-staging grace period.
- **G8**: a quota error reports `storage-quota`, any other startup write
  failure reports `storage-restricted` rather than the suggested
  `storage-unavailable`, because that state's wording claims this browser
  exposes no local database API at all, which is untrue when the API exists
  but the profile refuses writes.

Regression caught and fixed during verification: the first version of the G3
open-time cleanup claimed the writer lease on **every** open, so a second tab
opening refused a legitimate concurrent update (`writer-busy`) and three
WebKit browser tests failed (kept in
[check-after-greptile-review.log](evidence/milestone-6-2026-10-07/check-after-greptile-review.log)).
The cleanup now only claims the lease when it has actually found stale
leftovers, and the full suite passes again. One later full run showed a single
failure in `local-store.spec.ts:99` ("reads a staged generation after a
restart and while offline") on a strict-mode text locator ("Shell available
offline" also matching the informational sentence that contains it): a
pre-existing flake of the shell status UI, unrelated to these changes; the
same test passed 3/3 in isolation and in every other run.

Verification after these fixes, pinned Node `v24.21.0` / npm `11.19.0`
(each command and its exit code in
[check-after-greptile-review.log](evidence/milestone-6-2026-10-07/check-after-greptile-review.log)):

| Command                    | Exit | Result                                                                                            |
| -------------------------- | ---- | ------------------------------------------------------------------------------------------------- |
| `npm run format:check`     | 0    | all files use Prettier code style                                                                 |
| `npm run lint`             | 0    | no warnings (`--max-warnings 0`)                                                                  |
| `npm run typecheck`        | 0    | workspace and domain compile                                                                      |
| `npm run test`             | 0    | 366 Vitest tests in 28 files (11 more than after the Codex pass)                                  |
| `npm run check:boundaries` | 0    | 62 source files; dependency-free domain; local-store confined                                     |
| `npm run build`            | 0    | web build produced                                                                                |
| `npm run check`            | 0    | every gate above plus `npm audit`, `scan:dist` and 150 Playwright tests in 3 projects (final run) |

Only Markdown (this file) is written after that final captured
`npm run check` run, and only `npm run format:check` reads Markdown: it is
re-run afterwards (also recorded in the same log).

## Codacy review fixes and refactor

Nine Codacy items on PR #10, all confirmed with a failing test first where
they are behaviours (items 5, 8 and 9 are hygiene; item 7 is a browser
locator). Logs: [red-codacy-review.log](evidence/milestone-6-2026-10-07/red-codacy-review.log),
[green-codacy-review.log](evidence/milestone-6-2026-10-07/green-codacy-review.log).

|     | Item                                                            | Status | Commit    | Test                                                                                                                                             |
| --- | --------------------------------------------------------------- | ------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `Math.random()`-based tab/writer ids                            | fixed  | `06ec3be` | `multitab.test.ts` "uses unpredictable UUIDs for writer tokens and tab ids"                                                                      |
| 2   | stale tombstones when a product returns                         | fixed  | `234c3b4` | `preferences.test.ts` "clears the tombstone when a tombstoned product comes back"                                                                |
| 3   | one failing product aborted the whole reconciliation            | fixed  | `0f993c1` | `preferences.test.ts` "keeps reconciling other favorites when one product fails"                                                                 |
| 4   | unawaited promises could become unhandled rejections            | fixed  | `7e69a18` | `multitab.test.ts` "reports a failed background refresh instead of an unhandled rejection"                                                       |
| 5   | unnecessary conditions around optional browser APIs             | fixed  | `50cbd24` | no behaviour change; verified by typecheck, lint and the suite (the flagged `event.type` check is gone since `DatasetStoreEvent` became a union) |
| 7   | flaky "Shell available offline" locator (strict-mode violation) | fixed  | `9221078` | `tests/browser/local-store.spec.ts` scoped to the shell status region with exact text; 5× per project                                            |
| 8   | Milestone 6 files exempt from path hygiene                      | fixed  | `212ea21` | `tests/repository-path-hygiene.test.ts` "keeps tracked text and logs UTF-8/LF and free of machine paths"                                         |
| 9   | Playwright MCP output not ignored                               | fixed  | `21147a4` | `.gitignore` and `.prettierignore`                                                                                                               |
| 6   | `store.ts` complexity (216, ~1500 lines)                        | done   | `9787d84` | all 402 Vitest tests pass unchanged (none edited)                                                                                                |

Details:

- **1** `crypto.randomUUID()` replaces `Math.random()` in the Web Locks lease
  token, the tab owner recorded in the fallback marker and the test id
  helpers. Ids were never injectable, so no injection seam was added.
- **2** the same stable product id now deletes its tombstone inside the
  reconciliation transaction; nothing is ever remapped to a similar product
  under another id.
- **3** each favorite is reconciled in its own try/catch inside the
  transaction: the other items are still reconciled, the failing ids are
  reported in the maintenance diagnostics (quota classified as
  `storage-quota`) and `reconciledGenerationId` is only written by a complete
  run, so a partial one stays pending for the retry. A store-level failure
  still aborts the transaction and is retried wholesale.
- **4** every unawaited promise (initial open, cross-tab refresh, pin
  retention, lease heartbeat) has an explicit `.catch` routing to a `background`
  maintenance diagnostic; the heartbeat routes a failed renewal to lease state.
- **8** only exact machine-path prefixes in verbatim logs are replaced with
  `<worktree>`, `<repo>`, `<temp>` and `<home>` (their escaped and forward
  slash spellings too); commands, results, counts, durations and exit codes are
  unchanged, and three CRLF logs were normalised to LF. The evidence folder's
  README records this.
- **6** pure move/extract into `update-pipeline.ts`, `preferences.ts`,
  `retention.ts` and `maintenance.ts`, with `store.ts` reduced from ~1500 to
  ~280 lines as the state machine and composition facade. Public API
  unchanged; no test edited.

Verification, pinned Node `v24.21.0` / npm `11.19.0` (each command and its
exit code in
[check-after-codacy-review.log](evidence/milestone-6-2026-10-07/check-after-codacy-review.log)):

| Command                    | Exit | Result                                                                                |
| -------------------------- | ---- | ------------------------------------------------------------------------------------- |
| `npm run format:check`     | 0    | all files use Prettier code style                                                     |
| `npm run lint`             | 0    | no warnings (`--max-warnings 0`)                                                      |
| `npm run typecheck`        | 0    | workspace and domain compile                                                          |
| `npm run test`             | 0    | 402 Vitest tests in 31 files                                                          |
| `npm run check:boundaries` | 0    | 66 source files; dependency-free domain; local-store confined                         |
| `npm run build`            | 0    | web build produced                                                                    |
| `npm run check`            | 0    | every gate above plus `npm audit`, `scan:dist` and 150 Playwright tests in 3 projects |

Only Markdown is written after that captured `npm run check` run, and only
`npm run format:check` reads Markdown: it is re-run afterwards (also recorded
in the same log).

## Verification results

Local Windows, pinned Node `v24.21.0` with npm `11.19.0` on `PATH`. `dexie@4.4.6` (dependency of `@intermed/local-store`) and `fake-indexeddb@6.2.5` (root dev dependency) were added at exact versions by the previous worker's manifest/lockfile edits and were verified installed before use; no other dependency changed. Logs below were captured with Node (UTF-8), including the exact command and its exit code.

| Command                                               | Exit | Result                                                                                                      |
| ----------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------- |
| `npm run format:check`                                | 0    | [gate-format-check.log](evidence/milestone-6-2026-10-07/gate-format-check.log)                              |
| `npm run lint`                                        | 0    | [gate-lint.log](evidence/milestone-6-2026-10-07/gate-lint.log)                                              |
| `npm run typecheck`                                   | 0    | [gate-typecheck.log](evidence/milestone-6-2026-10-07/gate-typecheck.log)                                    |
| `npm run test`                                        | 0    | [gate-test.log](evidence/milestone-6-2026-10-07/gate-test.log) — 342 tests in 27 files                      |
| `npm run check:boundaries`                            | 0    | [gate-check-boundaries.log](evidence/milestone-6-2026-10-07/gate-check-boundaries.log)                      |
| `npm audit --audit-level=low`                         | 0    | [gate-audit.log](evidence/milestone-6-2026-10-07/gate-audit.log)                                            |
| `npm run build`                                       | 0    | [gate-build.log](evidence/milestone-6-2026-10-07/gate-build.log)                                            |
| `npm run scan:dist`                                   | 0    | [gate-scan-dist.log](evidence/milestone-6-2026-10-07/gate-scan-dist.log)                                    |
| `npm run check` (all of the above plus browser tests) | 0    | [npm-run-check.log](evidence/milestone-6-2026-10-07/npm-run-check.log) — 150 Playwright tests in 3 projects |

65 Vitest tests and 5 Playwright tests (15 runs across the three browser projects) were added in this milestone. `npm run check` chains the gates above with `&&` and then runs the browser suite, so its exit code 0 is the exit code of each step in that run. No gate, lint rule, test or boundary check was weakened or skipped. Only Markdown (this file) was edited after the captured `npm run check` run, and only `npm run format:check` reads Markdown: it was re-run afterwards and exited 0.

Recorded honestly: one earlier `npm run check` run on this tree reported a single failure in the **pre-existing** `tests/browser/activation-failure.spec.ts:64` (`bounds superseded waiting caches while retaining the active shell`), where the cache list still held a superseded waiting cache when the assertion ran. The spec bounds that race itself with a polling probe. It passed 3/3 in isolation, and the full suite passed again afterwards; the `npm-run-check.log` linked above is the final full run (150/150). This is reported as a pre-existing flake under parallel load, not hidden and not worked around: the service-worker code it covers was not touched by this milestone (`apps/web/pwa/**` is out of scope for milestone 6).

## Open risks

- Storage eviction, quota exhaustion, private-mode restriction and installed-versus-tab storage differences are **emulated** (`fake-indexeddb`, injected `QuotaExceededError`, stubbed `navigator.storage`). Real iPhone/iPad Safari and Windows Chrome/Edge behaviour belongs to the milestone 12 checklist; Playwright WebKit is not Safari.
- Quota failure is simulated through the staging seam. A real over-quota write may additionally surface different error names per browser; `isQuotaError` matches `QuotaExceededError` only.
- Node 24 exposes a Web Locks manager whose semantics are not the browsers'. Vitest runs force the marker lock for hermeticity; the Web Locks path is covered by a fake-manager unit test and by the browser runs.
- `checkForUpdate()` has no timeout/backoff yet and is deliberately not run automatically in mock mode. Wiring it to a real published reader (and its rights/availability rules) is milestone 5/9 work.
- The published-dataset contract is being reviewed on another branch. This milestone depends on it only through `PublishedDatasetManifest`/`PublishedBundleDescriptor`, the `PublishedBundleLoader` port and `packages/local-store/src/validate.ts`.
- The migration proof uses a test schema generation 2 (one added index). Production ships generation 1 only; any future migration must bump `meta.dataset-state.schemaGeneration` and add its own Dexie `version()`.
- Deltas remain deferred (R85): full validated snapshots only.
- The shown age is measured from the local download time; publication/import timestamps are retained in the generation record for later diagnostics work.

## Next gate

Maintainer review and merge of this milestone. The next implementation gate is **Milestone 7 (medication search/detail UI)**, which builds on `GenerationReader` and the generation-scoped name/DCI/ATC indexes. Milestone 5 stays blocked on source-rights approval. Real-device storage/eviction, private-mode and installed-mode checks remain on the **Milestone 12** pre-release checklist and are not claimed here.
