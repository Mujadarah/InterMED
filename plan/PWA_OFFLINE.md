# InterMED PWA and offline lifecycle

## Installable client

Provide `manifest.webmanifest` with name/short name, start URL, scope, standalone display, theme/background colors and normal/maskable icons. Register a scoped service worker over HTTPS. Include accessible responsive layouts, touch targets, iPhone safe-area insets, tablet/desktop navigation and installation help.

On iPhone/iPad Safari, guide users through Share → Add to Home Screen. On supported desktop/Android browsers, expose installation guidance using available browser capabilities. Do not promise identical install prompts, background scheduling or native APIs on all platforms. Installed and browser-tab modes both remain usable. Do not assume their IndexedDB contents or favorites are shared; test initial download and migration/help in each mode.

No native build or App Store submission is required to develop/deploy the PWA. Real iPhone/iPad testing is still a release verification requirement.

## Offline contract and limits

After one successful application-shell load and compatible medication dataset download, search, downloaded details, local favorites/recent searches and licensed downloaded interactions work without a network round-trip. A first-ever offline visit to a never-visited origin has no cached app code: the browser shows its native offline error and InterMED cannot render. Once the shell is cached but no compatible medication dataset has been downloaded, show an honest download-required/unavailable status, not empty results implying a complete catalogue (R67, amended by maintainer decision 2026-10-06).

Regulatory links and provider-only interaction results unavailable offline must be labeled unavailable. Only explicitly permitted document bodies/interaction records may be cached. Show active dataset source/version/date, last successful update and coverage; an old dataset is not silently described as current.

IndexedDB and Cache Storage are browser-managed and may be evicted or restricted by quota/private mode. Request persistent storage where available as best effort, not a guarantee. Detect storage failure, missing datasets, eviction and incompatible schemas. Explain recovery; do not claim guaranteed permanent storage or built-in database encryption. Favorites exports/recovery need explicit user controls; browser data deletion may destroy an unexported local copy.

## Application shell

Cache only versioned static shell assets and approved public resources. Do not cache privileged/admin requests, future authentication responses, secrets or patient records in a broad service-worker fetch handler. Bound cache sizes; external regulatory URLs require explicit caching/rights rules.

A service-worker release and a clinical dataset release are separate version streams. Show update availability; activate a compatible shell at a safe reload boundary after user action, not during an unfinished selection/form/check. Keep old working assets until replacement is usable. Define rollback compatibility before rollout; rolling back a shell must not blindly delete or downgrade the user's database.

## Dataset activation

1. Open Dexie and use the active local generation immediately.
2. Check a small published manifest in the background with timeout/backoff.
3. Select a newer compatible generation. Validate manifest schema, dataset/source identity, rights/coverage, expected counts, size and integrity metadata.
4. Download and validate outside IndexedDB transactions. A checksum detects corruption, not source authority by itself; use trusted HTTPS publication and controlled manifest promotion.
5. Stage immutable records keyed by generation. Validate uniqueness, references, ingredient resolution, count/completeness and compatibility before promotion.
6. In one short atomic Dexie transaction, mark the generation ready and switch the active-generation pointer.
7. Readers pin a single generation throughout search/detail/interaction evaluation. Refresh tabs only at safe boundaries and preserve source/version on existing results.
8. Retain the previous compatible generation for rollback and existing readers; garbage-collect only when safe under documented retention/space rules.

Never clear the active dataset to make room for a download. Timeout, partial download, malformed content, write error, quota failure or incompatible release leaves the prior usable dataset selected. If no prior dataset exists, show unavailable/download-needed status.

Use full validated snapshots initially. Deltas are an optimization only after base-version/checksum, deletion semantics and rollback equivalence are tested; an incomplete upstream snapshot must not manufacture removals.

## Schema and multitab behavior

Version Dexie schemas independently from content datasets and application releases. Test migrations from every supported schema; preserve favorites/recent independently of catalogue replacement. Store stable product identifiers and tombstones so removed/renamed products are visible; never silently remap a favorite to a similar drug.

Handle `versionchange`/blocked upgrades, tabs running old application code, concurrent update attempts and stale readers. Use a single-writer coordination design and generation checks; a tab that cannot migrate must explain reload/recovery rather than silently discard data. No network waits inside the pointer-switch transaction. IndexedDB transaction lifetime is not a network synchronization mechanism.

## Visible states

Expose: never downloaded, ready/current, ready/stale, update available, downloading, validating, failed with old version retained, incompatible update, storage unavailable and coverage incomplete. Interaction coverage can differ from medication coverage; do not infer it from the catalogue being present.

## References

[Apple iPhone web-app installation](https://support.apple.com/guide/iphone/iphea86e5236/ios), [Dexie atomic transactions](https://dexie.org/docs/Tutorial/Best-Practices), [Dexie schema versions](https://dexie.org/docs/Tutorial/Design), [Dexie versionchange](https://dexie.org/docs/Dexie/Dexie.on.versionchange), [WebKit storage quotas and eviction](https://webkit.org/blog/14403/updates-to-storage-policy/). Verify target-device behavior through [TESTING.md](TESTING.md); documentation is not a substitute for a real-device test.
