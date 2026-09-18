# ClinPath — Codex Build Plan

This file is intended to be fed directly to Codex as the implementation roadmap.

## Global rules for Codex

1. Read `PRODUCT_SPEC.md`, `REQUIREMENTS.md`, `ARCHITECTURE.md`, `DATA_MODEL.md` and `CLINICAL_SAFETY.md` before implementing features.
2. Do not introduce a backend in MVP.
3. Do not require user accounts.
4. Keep all patient identity fields optional.
5. Keep hospital integration out of scope.
6. Keep provider-specific SDK code out of the domain layer.
7. Do not hard-code clinical rules inside SwiftUI views.
8. Add migrations for every database schema change.
9. Add tests for every clinical calculation/rule.
10. Do not implement unvalidated medication dosing or treatment rules from model knowledge alone.
11. Preserve offline functionality.
12. Prefer small, reviewable commits.

## Milestone 1 — Project bootstrap

Tasks:

- Create iOS project using Swift + SwiftUI.
- Establish folder/module boundaries from `ARCHITECTURE.md`.
- Add formatting/linting if desired.
- Add test targets.
- Create CI workflow for build + tests.
- Add app configuration abstraction.
- Add dependency container.

Acceptance:

- app launches;
- tests run;
- no backend SDK;
- domain module has no SwiftUI dependency.

## Milestone 2 — Local persistence and case management

Tasks:

- Add SQLite/GRDB (preferred) or equivalent explicit-schema persistence.
- Implement migrations.
- Implement `PatientCase`.
- Add generated case ID.
- Add optional name/surname/age/national ID/file number/admission number/ward/bed/alias.
- Build case list/search/create/edit/archive/delete.

Acceptance:

- case can be created with zero personal identity fields;
- case persists after restart;
- search works by file number/alias/name when present;
- migration tests exist.

## Milestone 3 — Timeline, vitals and labs

Tasks:

- Observation model.
- LaboratoryResult model.
- Manual entry screens.
- Time-series history.
- trend calculations;
- charts;
- unit normalization foundation.

Acceptance:

- enter multiple BP and CRP/creatinine values;
- view timeline;
- previous values are not overwritten;
- trend calculations have unit tests.

## Milestone 4 — Diagnoses and procedures

Tasks:

- Diagnosis model/UI.
- Procedure model/UI.
- automatic POD calculation.
- procedure context.
- allergy model.

Acceptance:

- create right hemicolectomy dated yesterday;
- app displays POD 1 correctly;
- app can attach diagnosis and allergy.

## Milestone 5 — Security/privacy MVP

Tasks:

- local encryption strategy;
- Keychain secrets;
- optional Face ID/Touch ID lock;
- optional PIN/password lock;
- lock interval settings;
- app-switcher privacy screen;
- delete-all-data.

Acceptance:

- app works with no lock;
- lock can be enabled/disabled;
- biometric failure does not destroy data;
- sensitive data absent from logs.

## Milestone 6 — Photo/OCR pipeline

Tasks:

- camera/photo picker;
- Vision/VisionKit OCR;
- generic extraction result model;
- review/edit/confirm screen;
- provenance linking.

Start with:

- lab sheet;
- BP monitor;
- medication package;
- radiology report text.

Acceptance:

- extracted value is never persisted until confirmed;
- user can correct OCR before saving.

## Milestone 7 — Clinical rule engine

Tasks:

- rule DSL/model;
- rule evaluator;
- `ClinicalState` builder;
- `ClinicalSignal` model;
- missing-data output;
- provenance;
- rule-version metadata.

Initial non-prescriptive rules:

- rising creatinine/AKI pathway trigger;
- falling Hb/bleeding consideration;
- fever + tachycardia + rising inflammatory markers postoperative pathway;
- hyperkalemia safety signal using validated thresholds/content.

Acceptance:

- synthetic cases trigger expected signals;
- false controls remain negative;
- every signal has `Why` data.

## Milestone 8 — Evidence library

Tasks:

- EvidenceReference model.
- local bundled evidence metadata.
- guideline search.
- pathway-to-source linkage.
- version/date display.
- last-reviewed date.

Acceptance:

- every sample pathway output can open its supporting source metadata.

## Milestone 9 — Medication module

Tasks:

- Medication model/catalog abstraction.
- MedicationStatement patient list.
- scan/search/add flow.
- DrugInteractionProvider interface.
- interaction result UI.
- allergy cross-check.
- renal/hepatic hooks.

Do not scrape Mediately.

Acceptance:

- app can use a mock/open/licensed provider interchangeably;
- domain layer does not depend on a specific vendor SDK.

## Milestone 10 — AI assistant abstraction

Tasks:

- `AIProvider` protocol.
- local/mock provider for development.
- natural-language extraction into candidates.
- explanation generation from deterministic results.
- patient-change summary.

Acceptance:

- app works without AI configured;
- AI cannot directly persist extracted clinical facts;
- outputs cite structured rule/evidence data when discussing clinical actions.

## Milestone 11 — iCloud

Tasks:

- `SyncProvider` protocol.
- CloudKit adapter.
- sync queue/status.
- conflict strategy.
- opt-in setting.
- account availability/error handling.

Acceptance:

- app remains functional offline;
- local-only user never needs iCloud;
- conflict cannot silently discard newer data.

## Milestone 12 — Beta hardening

Tasks:

- synthetic regression suite;
- export/import;
- diagnostics screen;
- crash/log redaction;
- accessibility;
- localization foundations;
- TestFlight configuration;
- privacy documentation.

## Deferred explicitly

Do not implement until separate approval/specification:

- Appwrite backend;
- account creation;
- Sign in with Apple;
- Google Sign-In;
- Google Drive/Dropbox/OneDrive;
- hospital EHR/FHIR connection;
- raw CT image diagnosis;
- autonomous prescribing;
- oncology treatment recommendation engine beyond sourced pathway navigation.

