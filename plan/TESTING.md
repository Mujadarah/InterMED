# InterMED testing strategy

## Scope and evidence

Use Vitest for unit tests, React Testing Library for components and Playwright for browser/workflow tests; confirm/pin exact versions during milestone 1. This is a planned strategy, not evidence that tests exist or pass.

Contributors use original synthetic fixtures/mock providers without proprietary datasets or Appwrite credentials. Never commit real identifiable patient records or unlicensed provider/source samples. Clinical provider/formula approval requires separate licensed, clinically reviewed evidence.

Test-first behavior changes: failing test → minimal implementation → passing test → refactor verification. Record exact commands/browser/device/schema/source versions. CI quality gates cannot be weakened to make a milestone appear complete.

## Unit and component tests

Search normalization (case/Unicode/Romanian diacritics), ranking/partial names and safe typo candidates; source parser/units/decimal separators; serialization/validation; stable product/ingredient mapping; combinations and duplicate exposure; version compatibility/checksums; source-vocabulary preserving interaction normalization; deterministic formula registry.

UI tests verify unavailable fields, dataset/version/age, source/reference links, coverage labels, no-record versus unavailable, accessible keyboard/screen-reader control, focus/error handling, touch targets and safe-area responsive layouts. No clinical logic belongs in React components.

## Importer fixtures and data governance

Test:
- Duplicate/conflicting drugs, missing CIM/source keys or ingredients, wrong headers/types and malformed rows.
- Encodings/BOM, Romanian diacritics, decimal comma/point, missing/ambiguous strength units and combination DCI.
- Added/changed/renamed/removed products, stable IDs, lost references and malformed regulatory links.
- Empty/partial upstream response, unusual removal spikes, layout changes and incomplete downloads.
- Idempotent retries, quarantine, counts/diff/provenance, source outage, rights expiry and review rejection.
- Immutable publication, manifest/bundle consistency, invalid checksum/schema and rollback to previous accepted generation.

Incomplete snapshots must not cause mass deletion. Clinical mappings/permission approvals are not replaced by a passing parser test.

## Interaction contracts

Every provider adapter needs tests for:
- A synthetic known reported pair and an explicit fully covered no-reported-record pair. The latter tests contract semantics, not universal medical safety.
- Direct ingredients, exact product versions, combination expansion, repeated ingredients across brands and no self-interaction.
- Unresolved/missing ingredient mapping, excluded context, pair/size limits and partial coverage.
- Severity/source/evidence/management preservation, missing fields, reviewed normalization mapping and conflicting providers.
- Missing source metadata, stale versions, provider timeout/error and unavailable/offline online-only service.
- Offline caching rights, unsupported ingredients and independently versioned medication/interaction datasets.

For the selected clinical provider, add permitted clinically reviewed known-positive and covered-negative validation cases with source/version/coverage limitations. Never invent a “non-interacting” clinical assertion from LLM memory.

## IndexedDB/Dexie and dataset updates

Test every supported schema migration; preference retention; failed/interrupted staged write; partial download; invalid checksum/count/reference; quota failure; old active generation retained; snapshot replacement; removal/rename tombstones; delta base mismatch and equivalence if implemented.

Exercise concurrent writers, old readers, multitab pointer consistency, blocked/versionchange migration, old shell/new schema incompatibility, safe garbage collection, app restart and rollback. Simulate eviction/missing databases/private-mode restrictions, persistent-storage denial and user delete-all. Network waits must not span activation transactions.

## PWA/service worker

Verify manifest/icons/scope/standalone installability, first-ever offline browser error and cached-shell/no-dataset download-required status (amended R67), post-download offline launch/search/detail/favorites/checker, uncached regulator links, update prompt, SW replacement and stale shell recovery. Test new shell with old data and vice versa, safe reload boundaries and rollback without database wiping.

Cache tests prove privileged/authenticated requests and server secrets are not stored. Installed and tab modes may have distinct storage: verify onboarding/downloads and do not assume favorites automatically transfer.

## Browser/device release matrix

| Platform | Minimum planned evidence |
| --- | --- |
| iPhone Safari | Real device: tab + Add to Home Screen/standalone; safe areas, offline/restart/update/storage behavior |
| iPad Safari | Real device: installed/tab, responsive portrait/landscape and keyboard/touch |
| Windows Chrome and Edge | Automated browser flows plus installation/manual smoke |
| Android Chrome | Real-device check where available; recorded gap blocks claims of validated Android support |
| macOS Safari/Chrome | Desktop smoke and applicable installation/offline paths |
| Linux Chrome/Firefox | Responsive/offline browser smoke; document install support differences |

Select/version the supported browser/OS policy before release; “latest” alone is not an evidence record. Playwright WebKit is not proof of iPhone/iPad Safari behavior. If devices are unavailable, report the gap and keep clinical release/device-support claims gated.

## Appwrite/backend security

Use an isolated project and synthetic records. Verify anonymous public read without Auth session, denied public writes, denied raw/quarantine access and importer execution. Test effective additive table/row/Storage/Function permissions and source-expired publication denial.

Test Function input validation, authorization despite server key permission bypass, rate limits/concurrency/timeouts, idempotence, safe errors/logs, private API keys, secret scanning and frontend-bundle inspection. Test Sites SPA routes, TLS/CSP/headers/cache policy, preview/production separation and deployment/manifest rollback.

## Calculators (milestone 11)

Every formula needs primary source/version/population/units, positive/negative/borderline/missing-input cases, conversions and invalid/out-of-range handling. Clinically review reference cases; prevent silent formula substitution. Initial inputs remain ephemeral. Preserve tests for BMI/BSA/eGFR/CrCl/corrections and selected surgical/organ-risk scores when approved.

## Preserved future clinical verification

Every high-impact deterministic rule requires positive, negative, borderline, missing-data, unit-variant and defect-regression cases. Retain tests for postoperative day, trend/slope/unit conversions, pathway matching, provenance and alert-fatigue controls.

Synthetic case library retains uncomplicated postoperative colorectal course, infection, possible anastomotic leak, bleeding, AKI, hyperkalemia, bile leak, pancreatic fistula and mixed/contradictory presentations. Test daily changes, reconciliation and ICU-to-ward review, not isolated normal-value assumptions.

OCR fixtures: clear/rotated/low-light labs, decimal comma/point, medication box/ambiguous strength, BP display and radiology/pathology reports. Measure field/value/unit accuracy and false-field rate; no extraction bypasses review/edit/confirmation.

Patient persistence: create anonymous case, optional file/admission/alias lookup, CRUD/archive/timeline/history, large longitudinal records, interrupted writes, upgrade and corrupt export/import. Protect identity, retained originals and delete/export controls.

Patient privacy/account sync: browser-specific encryption/key recovery/session locking, lock disabled/enabled/failure/background limits, account switching/revocation/conflicts, offline queues, export/deletion and provider backup restore. Generic UI locking is not proof of database encryption.

## Clinical-content/release acceptance

Before public clinical content: identify author/reviewer, permitted source, source/version/date/coverage, rights and intended use, positive/negative/boundary fixtures, change history and review date. Test uncertainty/source disagreement and meaning-preserving explanations.

No app build/tests/deployment or clinical validation is claimed by this documentation revision. [CODEX_BUILD_PLAN.md](CODEX_BUILD_PLAN.md) gates future evidence.

