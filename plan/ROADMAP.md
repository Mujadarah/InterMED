# ClinPath Roadmap

## Phase 0 — Foundation

Goal: establish architecture and data model.

- repository and CI;
- SwiftUI app shell;
- local database;
- schema migrations;
- domain models;
- case creation;
- optional identifiers;
- settings/preferences;
- optional app lock architecture.

## Phase 1 — Local clinical notebook MVP

Goal: useful without AI or cloud.

- patient/case list;
- symptoms/notes;
- diagnoses;
- surgery/procedure entry;
- vitals;
- labs;
- historical timeline;
- trends;
- local encrypted storage;
- export/delete;
- Face ID/Touch ID/PIN optional lock.

## Phase 2 — Photo input

- camera/document capture;
- OCR;
- lab extraction;
- BP/vitals extraction where reliable;
- medication-name extraction;
- report text extraction;
- confirmation UI;
- provenance.

## Phase 3 — Clinical engine v1

Initial pathways:

- postoperative infection/intra-abdominal infection;
- AKI;
- postoperative bleeding;
- ileus;
- VTE;
- sepsis/organ dysfunction;
- colorectal postoperative complication pathway.

Features:

- deterministic rules;
- missing-data detection;
- "Why am I seeing this?";
- pathway cards;
- synthetic clinical test cases.

## Phase 4 — Evidence library

- guideline metadata;
- evidence search;
- versioning;
- references;
- clinical recommendations linked to sources;
- last-reviewed tracking.

## Phase 5 — Medication module

- medication catalog/search;
- scanned medication confirmation;
- patient medication list;
- allergies;
- interaction provider abstraction;
- interaction UI;
- renal/hepatic restriction hooks;
- calculators used by medication review.

Do not block release on obtaining an expensive proprietary interaction database; make the provider replaceable and clearly limit functionality to licensed data available.

## Phase 6 — AI assistant

- natural-language clinical input parsing;
- patient-change summaries;
- evidence Q&A;
- explanation generation;
- structured extraction from radiology/pathology reports;
- strict confirmation/provenance controls.

Keep safety-critical decisions in deterministic/evidence layers.

## Phase 7 — iCloud

- CloudKit provider;
- optional opt-in sync;
- conflict handling;
- offline queue;
- sync-status UI;
- privacy/storage explanation;
- backup/restore testing.

## Phase 8 — TestFlight clinical beta

- synthetic/deidentified data policy;
- 5–10 internal clinician testers;
- 20–30 external surgical/medical testers;
- usability metrics;
- false-alert feedback;
- clinical-content review workflow.

## Phase 9 — Oncology and broader surgical pathways

- colorectal oncology;
- gastric/upper GI;
- HPB;
- pancreatic;
- emergency surgery;
- treatment-sequencing evidence models.

## Phase 10 — External cloud backup providers

Recommended order:

1. Google Drive encrypted backup;
2. OneDrive encrypted backup;
3. Dropbox encrypted backup.

Start with backup, not live multi-master sync.

## Phase 11 — Accounts/backend (future, optional)

Only after there is a concrete benefit and budget:

- Account abstraction;
- Appwrite evaluation/PoC;
- email/password or passwordless auth;
- Sign in with Apple;
- Google Sign-In;
- account deletion;
- cross-platform sync/service layer if justified.

Accounts should not be introduced merely because they are conventional.

## Phase 12 — Regulatory/production clinical deployment

Before making strong patient-specific treatment recommendations in production:

- formal intended-use definition;
- clinical risk management;
- regulatory classification review;
- validation plan;
- quality-management strategy;
- security/privacy assessment;
- clinical governance;
- post-market/incident strategy as applicable.

