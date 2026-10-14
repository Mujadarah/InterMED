# Privacy in the current development build

This describes the browser application in this branch, not a clinical release or
a promise about future integrations. It requires no account. The default runtime
is contributor mock mode and the browser composition does not configure a
remote dataset reader. No patient-record workflow is implemented; do not enter
patient identifiers or real patient information in search fields. Development
fixtures are synthetic and are not for clinical use.

Code: [configuration](../apps/web/src/config.ts),
[composition root](../apps/web/src/Bootstrap.tsx),
[mock provider](../packages/data-access/src/index.ts),
[synthetic fixtures](../packages/data-access/src/synthetic-fixture.ts), and
[application routes](../apps/web/src/presentation/App.tsx).

## What stays in this browser

The IndexedDB database is named **intermed-local**, accessed through Dexie.
Its production schema generation is **1**. The separate generation-2 upgrade
probe is test infrastructure, not the production schema.

| Stores                                                                                                                        | Contents                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| generations                                                                                                                   | Reference dataset generation metadata, versions, provenance, checksums, download time and readiness                       |
| products, ingredients, productIngredients, atcCodes, dosageForms, manufacturers, holders, documents, sources, datasetVersions | Downloaded reference entities and local lookup indexes, keyed by dataset generation                                       |
| meta, writerLock                                                                                                              | Active/previous dataset pointers, update/check state, clear epoch, reconciliation state and temporary writer coordination |
| favorites                                                                                                                     | Stable product ID, last known display name and dataset version ID, creation time and availability status                  |
| recentSearches                                                                                                                | Query text, occurrence time and last known dataset version ID                                                             |
| tombstones                                                                                                                    | Last known information about removed favorite products and removal time                                                   |

Favorites survive dataset replacement. Recent searches are recorded when a result
is opened, rather than on every keystroke; the store retains at most 10 entries
and prunes entries older than 30 days on history reads and writes. Favorites
remain until removed or local data are cleared. Dataset retention preserves
active/previous generations and protects recently activated generations from
premature collection; it is separate from preference retention.

Code: [schema and row fields](../packages/local-store/src/schema.ts),
[preferences and retention limits](../packages/local-store/src/preferences.ts),
[dataset retention](../packages/local-store/src/retention.ts),
[store retention defaults](../packages/local-store/src/store.ts),
[search-result actions](../apps/web/src/presentation/MedicationSearchPage.tsx),
and [preference use cases](../apps/web/src/application/preferences.ts).

The production service worker uses Cache Storage names of the form
**intermed-public-shell-v1-&lt;20-character release identity&gt;**. It caches only
allowlisted public shell HTML, manifest, icons and emitted JavaScript/CSS assets,
with release metadata on the cached index response. It retains a usable prior
shell for recovery. It does not cache searches, preference exports, diagnostics,
dataset/API responses, or fetched source-document bodies. The worker may serve
the same cached shell for supported navigation URLs carrying a single **q**
parameter; it does not add that query URL or its value to the cache.

Code: [worker allowlist, cache lifecycle and fetch handling](../apps/web/pwa/worker.ts)
and [shell build metadata](../apps/web/pwa/shell-build.ts).

The production application does not use localStorage or sessionStorage keys.
Browser-test and manual-validation canary keys described elsewhere are test
fixtures, not application preferences. Search text is synchronized to the
**q** URL parameter, and detail links preserve it to restore navigation. The URL
can therefore be visible in the address bar, browser history, copied links or
a direct navigation request to the host. Search itself uses an in-memory index
of the local dataset, without sending queries to a search service.

Code: [search URL synchronization](../apps/web/src/presentation/MedicationSearchPage.tsx),
[detail navigation](../apps/web/src/presentation/MedicationDetailPage.tsx),
[local search service](../apps/web/src/application/medication-search.ts),
[worker navigation handling](../apps/web/pwa/worker.ts), and
[production source tree](../apps/web/src/).

IndexedDB and Cache Storage are browser-managed storage, not an encryption or
permanent-retention guarantee. The local store asks for persistent storage on a
best-effort basis when it opens; browsers may decline, restrict or evict storage.
The diagnostics reader only inspects the existing persistence status and origin
storage estimate and does not request persistence.

Code: [local store opening and persistence request](../packages/local-store/src/store.ts)
and [diagnostics storage reader](../apps/web/src/infrastructure/browser-diagnostics.ts).

## Network use

Opening or updating the app can fetch its HTML, manifest, icons, worker script
and JavaScript/CSS assets from the serving origin. Worker installation/repair
fetches pinned public assets with credentials omitted and redirects refused;
ordinary page and fallback network requests still follow browser behavior.
The development server also uses Vite's development connection.

The repository includes a read-only published-dataset adapter. If explicitly
wired with a transport and public resource identifiers, it issues GET requests
for published version metadata and bundle descriptors at an Appwrite TablesDB
endpoint, and constructs a Storage bundle URL. Requests include the public
**X-Appwrite-Project** identifier; the adapter adds no account token, server key or
medication-query text. An injected bundle loader and the update pipeline handle
reference bundle download, validation and activation.

**Current wiring limit:** configuration accepts the optional
**VITE_PUBLISHED_DATASETS_ENDPOINT**, **VITE_APPWRITE_PROJECT_ID** and
**VITE_APPWRITE_PUBLISHED_BUCKET_ID** together, but Bootstrap creates the browser
store without a reader or loader. Configuring those values alone does not enable
remote dataset fetches in this build. This diagnostics slice adds no network
calls, accounts or Appwrite changes.

Code: [browser entry point](../apps/web/src/main.tsx),
[shell controller](../apps/web/src/infrastructure/browser-shell.ts),
[worker](../apps/web/pwa/worker.ts),
[public configuration](../apps/web/src/config.ts),
[composition root](../apps/web/src/Bootstrap.tsx),
[published-dataset adapter](../packages/data-access/src/appwrite-published-dataset-reader.ts),
[store dependencies](../packages/local-store/src/store.ts), and
[update pipeline](../packages/local-store/src/update-pipeline.ts).

An available source-document link opens its destination in a new tab only when
chosen, with **noopener noreferrer**; it is disabled while offline. Visiting that
destination makes a request to that site. InterMED does not display/cache source
document bodies just because a reference is present.

Code: [source-document links](../apps/web/src/presentation/MedicationDetailPage.tsx).

The browser application implements no telemetry, analytics, account/sign-in,
preference synchronization or diagnostics upload. This describes application
behavior; it is not a claim about a hosting provider's access-log policy. Page
requests and user-opened external links still reach their respective hosts.

Code: [runtime composition](../apps/web/src/Bootstrap.tsx),
[application services](../apps/web/src/application/services.ts),
[application routes](../apps/web/src/presentation/App.tsx),
[local preferences](../apps/web/src/application/preferences.ts), and
[diagnostics controls](../apps/web/src/presentation/DiagnosticsSection.tsx).

## Export and delete

On **Development status** (/status), under **Local preferences**:

- **Download preferences** saves JSON containing favorites and recent searches,
  with the export time. It contains query text and last known medication names:
  review it before sharing. It does not export the reference dataset.
- **Clear recent searches** asks for confirmation and removes local history.
- Individual favorites can be removed on the Favorites page or medication detail.
- **Clear all local data** asks for confirmation and clears reference catalogue
  rows/generations, favorites, recent searches and tombstones. It resets dataset
  metadata while retaining coordination needed for a safe clear. Another tab
  updating data may prevent the operation; the UI reports that refusal.

This clear-all control does **not** clear the service worker/shell caches,
browser history or already downloaded files/clipboard contents. To remove the
origin's shell caches/worker as well, use the browser's site-data controls for
this origin; browser history and exported files must be removed separately.
There is no export import/restore control in the current UI.

Code: [settings and confirmations](../apps/web/src/presentation/LocalPreferencesSettings.tsx),
[preference export envelope](../apps/web/src/application/preferences.ts),
[clear-all transaction](../packages/local-store/src/preferences.ts),
[favorites page](../apps/web/src/presentation/FavoritesPage.tsx), and
[detail favorite controls](../apps/web/src/presentation/MedicationDetailPage.tsx).

## Diagnostics and calculator inputs

The **Diagnostics** section on /status displays an allowlisted snapshot:

- App shell revision and runtime mode; shell availability, version, update state
  and prior-shell status.
- The local-store schema supported by this app, dataset update/failure state,
  active dataset version ID/version/schema, source IDs, publication/download
  timestamps, age in whole days since download and synthetic-data flag.
- Bundled calculator formula IDs, exact composite versions, recorded
  **reviewStatus**, and pending component-approval counts from **pendingApprovals**.
  These are metadata, not clinical approval.
- Interaction-provider status: **no approved provider**.
- Origin-wide approximate storage usage/quota in bytes, persisted-storage
  status, user-agent string and report generation timestamp.

A supported schema number is not proof the database opened successfully; read
the accompanying dataset state. Missing browser capabilities, shell metadata,
dataset or valid download age are reported as unavailable. Per-source upstream
versions are not exposed by the dataset-state contract and are not inferred from
source IDs or the catalogue version.

**Copy diagnostics** writes plain text to the clipboard only after the user
chooses it. **Download diagnostics JSON** saves the same snapshot locally.
Nothing is uploaded or automatically shared. The user agent and generation
timestamp may describe the browser/session; review the visible report before
choosing to share it. Clipboard failure shows manual-copy/download guidance.
The report excludes favorite/history values, medication names, coverage free
text, search URL/query values and calculator inputs. The storage estimate is measured when this status section opens, not continuously refreshed as storage changes. The report is not persisted by the application.

Code: [pure report allowlist and formatting](../apps/web/src/application/diagnostics.ts),
[bundled formula metadata](../apps/web/src/application/diagnostic-formulas.ts),
[component approval lookup](../packages/domain/src/calculators/approvals.ts),
[storage reader](../apps/web/src/infrastructure/browser-diagnostics.ts),
[presentation and user-triggered exports](../apps/web/src/presentation/DiagnosticsSection.tsx),
and [seeded exclusion regression](../tests/application/diagnostics.test.ts).

Calculator requests/results are ephemeral values: the dependency-free engine
receives inputs for one synchronous evaluation and has no storage or network
adapter. They are never written to local stores or diagnostics. This worktree
does not yet expose calculator input forms; the diagnostics registry stores
formula definitions, not entered values. Patient profiles and patient-linked
calculator storage are outside this implementation.

Code: [calculation request/result contracts](../packages/domain/src/calculators/types.ts),
[calculator evaluation](../packages/domain/src/calculators/calculate.ts),
[formula registry](../packages/domain/src/calculators/registry.ts),
[local schema](../packages/local-store/src/schema.ts), and
[current routes](../apps/web/src/presentation/App.tsx).
