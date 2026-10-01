# InterMED roadmap

## Ordering and release boundaries

The medication/reference and interaction PWA comes first. No patient notebook, OCR or AI prerequisite is allowed to delay that foundation. All phases remain subject to clinical safety, rights, privacy/security and intended-use review.

Milestones 1–10 build the medication/interaction core sequentially. Applicable hardening checks listed in milestone 12 are also progressive release gates throughout those milestones, not permission to skip milestones. A first clinical reference/interaction release needs those checks and approved sources; calculators follow in milestone 11, then milestone 12 repeats/completes hardening for the expanded rollout. A mock-provider demo is not the clinically usable MVP.

| Phase | Focus | Build relation / exit gate |
| --- | --- | --- |
| 0 | Web/PWA foundation | Milestones 1–3; build, offline shell and safe Appwrite infrastructure |
| 1 | Romanian medication reference | Milestones 4–8; permitted source, validated importer/local datasets/search/favorites |
| 2 | Structured drug interactions | Milestones 9–10; approved provider, coverage/provenance and clinical validation |
| 3 | Clinical calculators shortly afterward | Milestone 11; per-formula source/version/units/tests/review |
| Release hardening | Reliability/security/device evidence | Milestone 12, with applicable checks required before earlier release |
| 4 | Clinician workspace | Optional accounts and opt-in sync; account privacy/deletion gate |
| 5 | Patient/case workspace | Separate local privacy/security and identifiable-backend compliance gates |
| 6 | Labs and longitudinal trends | Validated units/rules, timeline and provenance |
| 7 | Photo/OCR | Confirmation and extraction-quality gate |
| 8 | Pathways and evidence | Versioned deterministic logic and licensed/reviewed sources |
| 9 | AI assistance | Explicit privacy/provider review; no AI clinical authority |
| 10 | External backup | Encrypted portable backup and recovery drills |
| 11+ | Specialties, organizations, interoperability | Separate validated module/organization specifications |
| Production/regulatory evolution | Intended-use and operational maturity | Review before every public clinical expansion, not only at the end |

## Phase 0 — Web/PWA foundation

React + TypeScript + Vite; small bundle; modules/injected providers; Vitest/component/browser test foundations; CI; design/accessibility foundations. Add manifest/icons/standalone shell, HTTPS/service worker, offline fallback and safe-area/tablet/desktop layout.

Provision Appwrite Cloud preferably Frankfurt/EU, Sites/GitHub deployment, environments, least-privilege Functions/database/Storage and Dexie persistence foundation. Record the database/configuration and service-worker choices. Backend infrastructure is now; no mandatory account.

## Phase 1 — Romanian medication reference

ANMDMR source strategy and rights review; normalized commercial products/ingredients/combination joins, CIM/ATC/form/manufacturer/holder, regulatory documents and source versions. Build validated ingestion with quarantine/diff/completeness checks and rollback.

Download compatible versioned compact datasets into IndexedDB/Dexie; search locally, view details/unavailable fields/RCP/prospect links, use local favorites/recent and see update/age/coverage states. A failed update preserves the prior generation.

## Phase 2 — Drug interactions

Vendor-neutral DrugInteractionProvider; assessed/approved structured source; ingredient-level resolution and combination expansion; multidrug pair evaluation; source severity/mechanism/effects/evidence/management/monitoring where supplied.

Expose no-record versus unavailable/incomplete coverage. License-gate offline records. Validate duplicates, unknown identities, disagreements, stale data and provider failure. No LLM-generated interaction authority. Without an approved clinical source, remain explicitly a nonclinical demo or limited reference-only build, not a complete interaction MVP.

## Phase 3 — Clinical calculators

Modular versioned framework; formula-specific validation for selected BMI/BSA/CrCl/eGFR/corrections and risk-score candidates. Record source, units, population/limitations, boundary cases and review. Initial inputs are ephemeral, without a patient profile.

## MVP hardening and staged evaluation

Test offline/install/update/eviction/rollback, real iPhone/iPad Safari, Windows Chrome/Edge, Android Chrome and desktop macOS/Linux, accessibility, secure headers/permissions/secrets, source rights, clinical provenance and incident/recovery procedures.

Use synthetic-data internal clinician evaluation first. Preserve the earlier staged pilot concept (approximately 5–10 internal then 20–30 external clinician testers if approved), with usability, false-alert/coverage feedback and clinical-content governance. This is a PWA pilot, not a TestFlight requirement; real clinical use needs applicable validation/intended-use approval.

## Phase 4 — Clinician workspace

Optional accounts with a concrete benefit: synchronized preferences/favorites, saved drug lists and appropriately scoped notes. Preserve local-only use. Implement opt-in migration, conflicts, export/deletion, account switching and retention. Prevent notes/lists becoming an unreviewed patient-data store.

## Phase 5 — Patient/case workspace

Preserve generated ID, optional alias/name/surname/DOB/age/national ID/file/admission/ward/bed, case search/archive/delete, encounters, symptoms/examination, diagnoses/allergies, procedures, medication lists and timeline.

Before local health-data storage approve browser-specific encryption/key recovery, XSS/device risks, permissions and retention/export/deletion. Before identifiable backend hosting separately approve legal/compliance/processor/operational design. Appwrite availability is not authorization to upload patient information.

## Phase 6 — Labs and longitudinal trends

Vitals/history, laboratory units/timestamps, baseline/current/peak/nadir/slope, deterministic change rules, charts, devices/drains/fluid balance and microbiology. Daily changes, patient summaries, reconciliation and ICU-to-ward review remain planned. Never overwrite historical measurements or invent missing timestamps/units.

## Phase 7 — Photo/OCR

Camera/files capture within browser capabilities; labs/BP/medication packages/charts, radiology/pathology/discharge/consultation/operative notes. Extraction proposes fields; clinician edits/confirms before persistence. Preserve original provenance, configurable image retention and ambiguity.

## Phase 8 — Pathways and evidence

ClinicalState, versioned rules/signals, missing-data detection, “What should I consider next?” and “Why am I seeing this?”. Preserve postoperative infection/intra-abdominal infection, anastomotic leak, bleeding, AKI, ileus, VTE, sepsis, bile leak and pancreatic fistula; distinguish operation-specific context.

Retain versioned multi-organization evidence, guideline search, source disagreement, strength/certainty, review dates and supersession. Antimicrobial prophylaxis versus treatment and surgical prerequisites/sequencing require validated content. No autonomous single surgical answer.

## Phase 9 — AI assistance

Optional natural-language/OCR candidate structuring, changes summaries, approved-evidence Q&A and explanations. AI cannot directly persist facts, invent doses/interactions or independently declare surgical indications. Configure privacy review before any cloud processing; no raw identifiable data to generic providers by default.

## Phase 10 — External cloud backup

Portable encrypted export/import and individual case export; recovery/rollback testing; BackupProvider adapters for Google Drive, OneDrive, then Dropbox where justified. Start with backup, not live multi-master synchronization. Key loss and provider revocation require explicit recovery design.

## Phase 11+ — Specialty and organizational expansion

Oncology (colorectal, gastric/upper GI, HPB, pancreatic), broader surgery/perioperative/emergency workflows, ICU/internal medicine/infectious diseases/cardiology/vascular specialties. Retain TNM/stage/biomarkers, pathology and evidence-backed treatment sequencing/MDT review.

Organizations, shared workflows and FHIR/terminology/hospital integration need new access-control, licensing and interoperability specifications. Optional native clients/iCloud remain separate, not canonical PWA dependencies.

## Production/regulatory gate

Define intended use, clinical risk management, regulatory classification, validation/quality-management strategy, privacy/security, content governance, operational owners, post-market/incident handling as applicable before public clinical deployment. Repeat for expanded patient-specific recommendations; a disclaimer alone does not remove obligations.

