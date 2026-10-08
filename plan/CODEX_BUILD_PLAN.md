# InterMED sequential build plan

## Status and global rules

This file orders future implementation; the current revision is documentation-only. Do not scaffold the application as part of this revision.

1. Read every repository Markdown file before code changes. REQUIREMENTS controls product scope, ARCHITECTURE controls architecture and CLINICAL_SAFETY is non-negotiable.
2. Implement milestones sequentially in small reviewable commits. Do not start the next milestone until its acceptance evidence is recorded. On document conflict, failed gate or required new authority, stop and report.
3. PWA is canonical: React + TypeScript + Vite; Appwrite Cloud infrastructure starts in milestone 3. Do not require accounts for the medication MVP.
4. Keep domain rules independent of React, browser persistence and vendor SDKs; use injected contracts/mock providers.
5. Use test-first work for behavior changes: record failing test, minimal implementation, passing test and refactor verification. Do not claim tests/build/deployment passed without running the relevant check.
6. Version schemas, datasets, mapping rules, formulas and evidence separately; test migrations and recovery before upgrades.
7. No invented clinical facts, thresholds, doses, interactions, mappings or citations. Clinical-content changes require source/rights/reviewer/version/test metadata.
8. Keep downloaded reference functionality usable offline. Failed updates cannot erase active data.
9. No real patient data in fixtures, logs or medication MVP. No mandatory identity. Patient features are later gated.
10. Pin dependencies and document exact build/test/lint commands as tooling is created; documentation alone does not prove a deployable app.
11. Publication/provisioning/paid provider selection require their own explicit maintainer authorization and rights approvals. Never force-push, merge or release merely to finish a milestone.

## Release interpretation

Milestones 1–10 form the medication/interaction core. Security, device/offline/accessibility, data-rights and clinical review items described in milestone 12 are incorporated progressively and must pass before a public clinical core release. This is a release checklist, not an out-of-order milestone implementation. Milestone 11 adds calculators shortly afterward; milestone 12 then completes/repeats the checklist for that expanded rollout. No patient feature precedes a reliable medication core.

Synthetic-only development may proceed while source rights are unresolved. Real-source ingestion/publication and a clinical interaction feature remain blocked at their rights/content gates; a mock demo cannot satisfy the clinical MVP gate.

## Milestone 1 — Repository/web bootstrap

Tasks: create React/TypeScript/Vite app; establish proposed modules/packages and public boundaries; dependency injection/configuration; React Router/validation foundations; lockfile, formatting/linting, type checks, unit/component/browser test framework and CI. Document safe environment placeholders and contributor mock mode.

Acceptance: reproducible install/build; app launches; type/lint/unit smoke checks run; CI verifies same commands; domain package has no React/browser/Appwrite imports; contributors run without cloud keys/proprietary data. Record commands/results, not aspirational badges.

## Milestone 2 — PWA shell

Tasks: manifest.webmanifest, normal/maskable icons (clearly temporary if placeholders), standalone metadata, scoped service worker and shell cache; offline fallback; update prompt; responsive touch/keyboard layouts, safe areas and tablet/desktop support.

Acceptance: HTTPS installed/tab shell launches on target-browser smoke matrix; post-load offline startup works; first-offline visit is honest; manifest/scope/deep links are correct; new shell does not interrupt work or wipe storage; no secret/privileged data is cached. Record real-device validation needed for final release.

Status: **accepted for development** by maintainer decision on 2026-10-06, based on the owner-confirmed iPhone/Windows installed, offline close/reopen and A→B update results plus the automated evidence. The remaining open gates were moved, not waived, to the milestone 12 checklist and remain required before any public clinical release. See [Milestone 2 evidence](../docs/MILESTONE_2_EVIDENCE.md#owner-acceptance-decision-2026-10-06).

## Milestone 3 — Appwrite infrastructure

Tasks: with provisioning approval, create isolated development/production configuration, preferably Frankfurt; configure Sites/GitHub branch/root/build/output/deep-link settings; injected backend client; choose normalized database product/configuration and record decision; initial private Function/Storage structures, public-read publication boundary, environment strategy and deployment/rollback pipeline.

Acceptance: authorized test deployment works with exact recorded settings; unauthenticated reader can read only approved public resources without an anonymous session; reader cannot write or execute admin importer; raw/quarantine data remain private; effective resource permissions tested; no server key in bundle/log/config. Production deployment is not implied by this acceptance.

Ordering (maintainer decision, 2026-10-06): milestone 3 may begin. Appwrite configuration/schema **as code** behind an injected backend-client interface may proceed alongside milestone 4 (pure TypeScript domain model with synthetic fixtures); this is an owner-authorized deviation from strict sequencing. Live Appwrite provisioning/deployment still requires fresh explicit approval. The owner merges PRs; agents never merge.

Status (2026-10-07): **code-complete as configuration-as-code; live acceptance pending provisioning approval.** See [Milestone 3 evidence](../docs/MILESTONE_3_EVIDENCE.md) for the exact live checks still open.

## Milestone 4 — Medication domain model

Tasks: MedicationProduct, ActiveIngredient, MedicationIngredient, ATCCode, DosageForm, Manufacturer, MarketingAuthorizationHolder, RegulatoryDocument, DataSource, DatasetVersion, stable IDs and provenance; validated DTOs and synthetic source fixtures.

Acceptance: tested product/ingredient separation, combination expansion, unit/source preservation, missing fields and referential integrity; domain serializes independently of Appwrite; mock source can be swapped. Document ambiguous identity states.

Status (2026-10-07): **implemented with synthetic fixtures; acceptance evidence recorded** in [Milestone 4 evidence](../docs/MILESTONE_4_EVIDENCE.md), pending maintainer review/merge. Milestone 5 remains blocked on source-rights approval.

## Milestone 5 — ANMDMR importer

Tasks: approve source retrieval/storage/transformation/publication scope first; design source parser using synthetic fixtures; authorized Function ingestion, encoding/schema validation, normalization/deduplication, private snapshot/quarantine/run logs, additions/changes/renames/removals, review workflow and immutable version publication.

Acceptance: malformed/missing/duplicate/conflicting/diacritic/combination fixtures tested; partial/empty/large-drop snapshot cannot mass-remove products; retries idempotent; failed import leaves published data untouched; bundle counts/checksums/provenance verified; source rights and clinical/data reviewer approval recorded before real-data publication.

## Milestone 6 — Local IndexedDB/Dexie and updates

Tasks: versioned schema, catalogue/index stores, metadata and independent local preferences; immediate local reads; background version check; compatible staging/validation and atomic pointer activation; multitab coordination, rollback/retention and migrations.

Acceptance: restart/offline reads work after download; interruption, corruption, quota and unsupported schema keep old active data; no clearing active generation for space; concurrent tabs see one coherent generation per evaluation; migration preserves favorites; never-downloaded/evicted/storage-restricted states are visible. Deltas remain deferred until equivalence is tested.

## Milestone 7 — Medication search/detail UI

Tasks: local full/partial commercial/DCI/ATC/manufacturer search, diacritics and safe candidate ranking; strength/form/status disambiguation; detail identification/available clinical fields, RCP/prospect links, provenance/version/age and missing/offline labels.

Acceptance: no query request per keystroke when local data exist; synthetic representative large-catalogue performance budget documented/measured; safe candidate selection; unavailable fields never look official; offline links honestly unavailable; touch/keyboard/screen-reader paths tested.

### Part A — Local search and route shell

Part A status: implemented and verified; the full `npm run check` passes on this branch.

Part A adds offline search against one pinned active IndexedDB generation, ranked local matching for commercial/DCI/ATC/manufacturer fields, disambiguating candidate rows, accessible keyboard navigation, `/search`, and the Part B detail placeholder route. The pinned reader exposes `searchRecords()` and this extension requires no schema migration; the published dataset contract is unchanged. Red/green and final validation logs are checked in under [`npm-run-check.log`](../docs/evidence/milestone-7a-2026-10-08/npm-run-check.log). Scope decisions and performance/browser measurements are recorded in [`MILESTONE_7_EVIDENCE.md`](../docs/MILESTONE_7_EVIDENCE.md).

Part B remains open for medication detail content, source links, and detail provenance requirements.

## Milestone 8 — Favorites and recent searches

Tasks: local favorites/recent, stable identifiers, removal/rename status, retention/clear/delete/export, independent migration; no account/sync.

Acceptance: anonymous use and restart/offline persistence; catalogue replacement does not erase preferences or silently remap drugs; clear/export behavior tested; query contents absent from telemetry/logs.

## Milestone 9 — Interaction-provider abstraction

Tasks: vendor-neutral DrugInteractionProvider, reviewed ingredient crosswalk, structured DrugInteraction/InteractionEvidence, coverage/outcome contract, source-specific optional fields and synthetic providers; assess final source clinical quality/license/cost/offline rights.

Acceptance: interchangeable adapters pass contracts; severity/source/evidence vocabulary preserved; explicit unmapped/incomplete/unavailable states; no LLM-generated interaction authority; final approved provider decision required before clinical milestone-10 release. Do not claim an unselected source is validated.

## Milestone 10 — Multi-drug checker

Tasks: product/direct-ingredient selection, combination expansion, unique-pair evaluation with bounded input/no silent truncation; duplicate exposure; coverage/provenance display, source disagreements, stale/offline/error state and licensed caching.

Acceptance: known reported and covered-no-record fixtures, duplicates, combinations, missing mappings/source, source errors and partial coverage pass; no universal “safe” verdict; display product-to-ingredient resolution. Approved clinical dataset validation and rights evidence must pass for clinical use. Apply the core-release hardening checklist before release.

## Milestone 11 — Clinical calculators

Tasks: modular formula registry and selected initial tools from PRODUCT_SPEC; choose formula-specific primary sources, units/population limits, versions and reviewer; ephemeral inputs, deterministic calculations and accessible limitations.

Acceptance: positive/negative/boundary/missing/unit-conversion fixtures; independent formula versions and clinical review; no silent formula switch; results source/units/limitations visible; no patient storage/auto-population or unsourced dosing.

## Milestone 12 — MVP hardening

Tasks/checklist:
- Full supported-schema/dataset/update/multitab/rollback regression; storage eviction/quota/private modes and first offline startup.
- Installed/tab behavior and real iPhone/iPad Safari validation; Windows Chrome/Edge, Android Chrome, macOS/Linux matrix; deep links and safe SW updates.
- Accessibility, responsive/touch/safe-area/localization foundations; measured search/bundle budgets.
- HTTPS/CSP/headers, dependency/secret scans, sanitization, Function rate limits/authorization and Appwrite permission denial tests.
- Clinical/rights review, provider coverage/version/source display, intended-use/regulatory assessment and limitation wording.
- Privacy documentation, preference export/delete, diagnostics with app/schema/dataset/source versions and update state; no sensitive logs.
- Approved deployment, manifest rollback/restore drill, incident/operational owner, cost monitoring and staged synthetic-data clinician evaluation.
- Moved from milestone 2 (maintainer decision 2026-10-06; required before any public clinical release):
  - reviewed security **response** headers on a header-capable host/edge: CSP header including `frame-ancestors`, CSP on `/sw.js`, Referrer-Policy and Permissions-Policy (the production meta CSP stays);
  - iPad Safari and Android Chrome coverage;
  - VoiceOver/Narrator/screen-reader checks and full safe-area/orientation/input checks;
  - physical-device direct deep-link/reload, multitab, failed-update (corrupted candidate) rejection and storage-eviction behavior;
  - hosted corrupted-candidate rejection repeated against the current build (build E at the time of the decision).

Acceptance: all applicable checks have recorded passing evidence or an explicit maintainer-approved nonclinical scope restriction. An unvalidated clinical capability is not waived by labeling it MVP. Core-release checks apply to milestones 1–10; this milestone repeats them with calculators. Report limitations honestly.

## Explicitly deferred

Optional accounts/social login/passkeys, favorites sync, clinician notes/lists, patient/encounter/diagnosis/procedure/vitals/labs models, patient-specific dosing/allergy checks, OCR, pathways/evidence, AI, encrypted external backup, organizations/interoperability and advanced specialties require later specifications/gates in ROADMAP.

Native iOS/iPadOS implementation is cancelled, including native-only SDKs/builds/synchronization. iPhone/iPad support is through the PWA. Appwrite infrastructure is **not** deferred.

## Evidence record per milestone

Record scope/requirement IDs, changed files, test-first evidence, exact commands/results, source/license/reviewer/version decisions, screenshots using synthetic data, open risks and next gate. Stop on conflicting controlling docs, unsafe migration, missing source permission or required external authority. Passing focused tests is not overall clinical-release approval.
