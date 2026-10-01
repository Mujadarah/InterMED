# InterMED planning revision audit

## Scope and baseline

Revision date: 2026-10-01. Branch: plan/pwa-appwrite-revision. Baseline: fetched main fdcb56f3f2b93289887780026d7a717962ba5e31. The initial revision was local/documentation-only. Subsequent maintainer authorization published PR #2, configured automated reviews and permitted corrections to its review findings. No React scaffolding, application implementation, cloud provisioning, merge, tag or release is performed by this revision or review correction.

Work is isolated at C:/Users/rabia/.codex/worktrees/intermed-pwa-plan/InterMED. This document records the PWA revision and the subsequent 2026-10-01 maintainer instruction to permanently discard native application work. Native-only future plans/SDK references are removed; useful clinical, web and interoperability references remain. The obsolete untracked native-first source guide in the original checkout is superseded by the committed PWA guide.

## Product decisions

- Canonical responsive installable PWA: React + TypeScript + Vite; no native build prerequisite.
- IndexedDB/Dexie immediate local search, compatible immutable generations and atomic activation; failed updates retain prior usable data.
- Initial Appwrite Cloud infrastructure, preferably Frankfurt/EU; Sites/GitHub deployment, Functions, normalized database services and Storage.
- Medication catalogue first, ANMDMR strategy subject to permission; structured ingredient-level interaction provider, including combination expansion and honest coverage states.
- No mandatory account or anonymous Auth session for public reference reads; local favorites/recent.
- Calculators shortly afterward; optional accounts/clinician workspace, patient/OCR/pathways/evidence/AI/backup/specialties later.

## Changed/new file inventory

| File | Revision purpose |
| --- | --- |
| README.md | Current product, scope/status, infrastructure, no-account use and license boundaries |
| plan/README.md | Canonical navigation, controlling documents and release ordering |
| plan/PRODUCT_SPEC.md | Medication/interaction workflows first, original clinical workflows retained later |
| plan/REQUIREMENTS.md | 372 continuously numbered current/later clinical requirements; native-only requirements retired |
| plan/REQUIREMENTS_TRACEABILITY.md | Disposition of all 300 baseline requirements: 290 mapped and ten explicitly retired |
| plan/ARCHITECTURE.md | PWA layers, modules, injected providers and offline/backend boundaries |
| plan/DATA_MODEL.md | Normalized reference/interaction entities first; all original clinical models retained |
| plan/ROADMAP.md | Medication-first phases, calculators next, gated clinical expansion |
| plan/CODEX_BUILD_PLAN.md | Sequential milestones 1–12, test-first acceptance and release checks |
| plan/FUTURE_CLOUD_AUTH.md | Infrastructure now versus optional Auth, later sync/encrypted backup |
| plan/CLINICAL_SAFETY.md | Preserved mandatory rules plus medication, coverage and calculator constraints |
| plan/TESTING.md | Web/importer/interaction/Dexie/PWA/Appwrite/device evidence; future clinical tests |
| plan/MEDICATION_DATA.md | Source parsing, normalization, provenance, quarantine and safe publication |
| plan/INTERACTIONS.md | Vendor-neutral contracts, ingredient pairs, source-preserving outcomes |
| plan/PWA_OFFLINE.md | Installation, browser storage limits, shell/dataset updates and multitab recovery |
| plan/APPWRITE.md | Sites/Functions/database/Storage, permissions, environments and operations |
| plan/DATA_SOURCES.md | Authority/rights registry and separate distribution/cache/license gates |
| plan/InterMED_SOURCES_AND_SDKS.md | Current primary web/SDK and useful clinical/interoperability references; native SDKs removed |
| CONTRIBUTING.md | Planning/PWA workflow, test-first contributions, synthetic data and source rights |
| SECURITY.md | Web/backend threat boundaries, private reports and later patient-data review |
| .github/pull_request_template.md | Web/domain, provenance, offline, license and no-account checks |
| .github/ISSUE_TEMPLATE/bug_report.yml | Browser/PWA/offline and dataset/version reproduction context |
| .gitignore | Web build/test outputs, local tooling and secrets; native-only exclusions removed |
| plan/REVISION_AUDIT.md | This inventory, preservation record, validation and unresolved gates |

LICENSE, feature-request template and issue routing remain unchanged. No generated application folders are created.

## Preservation evidence

All 300 original requirement IDs are accounted for: 290 map exactly once to active requirements and ten native-only IDs (209, 211, 212, 213, 217, 230, 231, 240, 275, 284) are explicitly retired under the maintainer's permanent-discard instruction. There are 82 additions, total 372. The traceability document identifies each active revised ID, adaptation and retirement. All non-native clinical intent remains.

All 16 original clinical model names and 143 original field declarations are retained, including PatientCase, Encounter, Diagnosis, Procedure, Observation, LaboratoryResult, MedicationStatement, Allergy, ClinicalFinding, ClinicalDevice, MicrobiologyResult, ReportDocument, ClinicalState, ClinicalSignal, ClinicalPathwayMatch and EvidenceReference. Observation/finding models additionally permit unknown observed time with explicit recorded time; no timestamp is invented. The planned export identifier uses InterMED; runtime migration is not implemented.

Preserved functionality includes optional patient identity, symptoms/examination, diagnosis/allergy, surgery/POD, oncology/staging/biomarkers/MDT, vitals/labs/history/trends, devices/drains/fluid balance/microbiology, report capture, OCR confirmation, patient medication lists/reconciliation, antimicrobial distinctions, pathways/missing-data/why explanations, evidence disagreement/versioning, calculators, AI constraints, portable encrypted backup and future adapters. Patient/backend/AI use remains separately gated.

All ten original mandatory safety rules remain. First-party Apache-2.0 license is unchanged.

## Validation method and results

A temporary, read-only Node audit outside the repository parses Markdown with the existing bundled Marked library and compares requirements/models/safety/source URLs against baseline git content. It checks Markdown heading/fence structure, local link targets, continuous numbering, one-to-one active traceability plus explicit native retirements, sequential milestones, license preservation and documentation-only scope. The PR template is intentionally a heading fragment.

Final validation checks cover 22 Markdown files. Broken local links: 0. Unbalanced code fences/invalid heading structure: 0. Requirement-map omissions/duplicates: 0. Original model/field loss: 0. Milestones are sequential 1–12. git diff --check reports no whitespace errors. Application build/tests are not run: no application has been implemented.

No cancelled native SDK/tool references remain in the active planning documents.

No native source/build/test files exist in the PWA worktree. The ten cancelled native-only requirements are retired, not deferred. References to iPhone/iPad/Safari are PWA support, not a native application plan. Shared Git history is not rewritten.

Contradictions fixed: native-first versus cross-platform client; no backend versus initial Appwrite; cloud infrastructure versus mandatory identity; patient-first versus medication-first sequencing; native security guarantees versus browser capabilities; absent interaction records versus safety; public source visibility versus redistribution permission; calculator scope versus patient-data auto-population. Milestone-12 release checks apply progressively before a core clinical release and repeat after milestone 11; this does not reorder implementation milestones.

Internal links and structure are validated. Relevant external reference URLs are retained/attributed, not all live-endpoint audited; current Appwrite, Dexie, ANMDMR and browser-policy facts used for this revision were checked through primary documentation/Context7. No proprietary clinical dataset was copied.

## Open decisions and stop gates

- Final interaction provider, medical coverage, source taxonomy and cost; clinical validation and online/offline/redistribution permissions.
- ANMDMR retrieval/transformation/storage/derivative/offline rights; document-body/excerpt permissions and ATC/terminology rights.
- Final Appwrite database product/configuration, physical schema/indexes/transactions, region provisioning, quotas/costs and restore plan.
- Domain, production Sites branch/root/build/output/settings, environment separation and deployment approvers.
- Service-worker tooling, supported browser/OS versions, performance budgets, real-device evidence and storage recovery UX.
- Initial calculator formulas/populations, references, reviewers and intended-use risk assessment.
- Later account mechanisms, passkey support, sync/conflicts/key recovery and patient-data hosting/privacy/compliance architecture.

Any source/license purchase, provisioning, merge or release remains a separate maintainer decision. Publication of this branch as PR #2 was subsequently authorized; it does not authorize those other actions.

## Permanent native cleanup — 2026-10-01

The maintainer explicitly rejected recoverable archiving and cancelled native application work permanently. The obsolete native-first untracked source guide was deleted after verifying it contained no newer changes; useful non-native source references remain in the committed PWA guide.

The abandoned native PR #1 was closed and its branch removed locally and from GitHub. The local archive snapshot reference and all 129 native-only Git objects were deleted; the latter occupied 40,801 compressed bytes. Main and the PWA branch/history remain intact; Git integrity checks pass. No new PWA-plan publication was performed.

The old checkout, generated environment/cache and worktree marker are absent. Only an empty parent directory remains because its shell removal was blocked. Codex still lists archived-worktree metadata; the app exposes no supported permanent-removal operation for that metadata. This is not a retained application checkout/snapshot. Historical closed-PR information may remain on GitHub; this cleanup does not claim secure erasure from GitHub or SSD hardware.

## Repository/reviewer snapshot — 2026-10-01

These are dated observations from PR #2 publication/review at head bd81ccea333358b92831116e412cdb539a1113eb, not guarantees of current service state. Recheck access, dashboard settings, eligibility, quotas and actual latest-head review results before relying on them.

- The repository was public and Apache-2.0, with issues/fork PRs available; Mujadarah was the only human collaborator. Main required PRs even for administrators, conversation resolution and linear history; force-push/deletion were disabled. Installed apps retained their separately granted permissions.
- CodeRabbit loaded the all-target-branch configuration but initially skipped automatic review because the repository had fewer than ten stars. A supported manual trigger later produced a completed review on the stated head, with three actionable comments and one nitpick. The review also reported its included hourly review allowance exhausted; a successful check alone is not proof of future review availability.
- Greptile was installed but disabled in its dashboard. InterMED was enabled; all-event triggers and no global branch filters were verified. Its completed review on the stated head reported the patient-phase conflict.
- Qodo's open-source app was installed, but no completed PR review was verified. Its [published OSS eligibility](https://github.com/marketplace/qodo-merge-pro-for-open-source) mentioned 200+ stars. Its repository configuration loads from the default branch, so the policy added in PR #2 awaits merge. No paid upgrade or suspended commercial app was activated.
- DeepSource Code Review and secrets detection were enabled, with no main-only filter observed. No language analyzers were enabled because the application had not been scaffolded. Its secrets check passed on the stated head; that is not evidence of a completed AI review, which has separate account/plan constraints.

## PR #2 review corrections — 2026-10-01

The verified findings were corrected without changing numbered normative requirement text: patient-linked requirements 265–268 and 270–273 and their traceability now require Phase 5 or later/privacy approval; scanning also retains the Phase 7 OCR gate. Requirement 269 remains a separately reviewed non-patient extension. Observation and ClinicalFinding now explicitly allow unknown observedAt and retain a separate recordedAt that cannot imply measurement time/order. The unavailable interaction-provider state names device-offline/online-required behavior and preserves all other failure cases. Transient reviewer/access observations were moved from CONTRIBUTING into the dated snapshot above.

The external read-only documentation audit includes focused regression checks for these corrections alongside its preservation/structure/link checks. The focused checks reproduced the findings before correction. Application builds/tests remain inapplicable to this documentation-only PR; passing documentation checks is not clinical validation or approval to merge.
