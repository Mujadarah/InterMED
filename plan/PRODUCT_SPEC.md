# InterMED product specification

## Product and users

InterMED is an open-source, offline-first clinical reference and decision-support platform. The first useful release is a fast, installable Romanian medication reference and structured drug-interaction PWA for clinicians. It is not a hospital EHR/HIS/PACS, autonomous prescriber or validated clinical product today.

Initial reference users include physicians across specialties, including surgery/perioperative care. iPhone/iPad, Android and desktop browser use are canonical; native clients remain optional future work. No Mac, Xcode or App Store submission is an MVP requirement.

## First-release promise

> Find a Romanian medication locally, inspect what it contains and where the information comes from, check selected active ingredients against licensed structured interaction data, and keep useful references offline without creating an account.

React + TypeScript + Vite provides the PWA; IndexedDB/Dexie provides local datasets. Appwrite Cloud infrastructure starts immediately, preferably Frankfurt/EU, with Sites/GitHub deployment, Functions, normalized database services and Storage. No mandatory Auth or anonymous session is needed for public reference reads.

## Medication and interaction workflows

1. Search a commercial full/partial name, DCI/active substance, available ATC or manufacturer. Local normalized indexes handle Romanian diacritics without losing original display text. Optional typo tolerance offers candidates, never auto-substitutes a medication.
2. Select the precise product/strength/formulation. View ingredients, strengths/units, route, CIM, ATC, manufacturer, authorization holder/status and source/version where supplied.
3. Open authoritative RCP/SmPC and prospect/PIL references. Indications, dosing, administration, contraindications, precautions, adverse effects, pregnancy/lactation and renal/hepatic information are displayed only when validated permitted content exists; missing fields are explicit.
4. Build a temporary multidrug selection from products and/or ingredients. Resolve commercial products and expand combinations through reviewed ingredient mappings before analysis; distinguish duplicates and unresolved identities.
5. Show structured interactions with source-specific severity, effects, mechanism, evidence, management/monitoring/alternatives when supplied. Distinguish unavailable/incomplete coverage from “no reported interaction within the evaluated source/coverage”; never say absence of a record guarantees safety.
6. Save favorites and recent medication searches locally, clear/export them through explicit controls, and use downloaded reference data offline. The selection is not a patient record.
7. Show dataset/version/age and background update state. Invalid, incomplete or failed updates preserve the previously usable generation.

ANMDMR is the canonical initial Romanian source strategy. Import/publication and offline redistribution rights remain gates. No Mediately copying; no interaction provider is selected yet. Regulatory links are not a promise of cached PDF bodies or complete clinical fields.

## First release and next calculators

Medication/interaction scope is milestones 1–10, subject to relevant milestone-12 hardening and rights/clinical/intended-use approval before release. Milestone 11 adds calculators shortly afterward; milestone 12 repeats/completes hardening for that expanded rollout. Patient features cannot leapfrog these gates.

Calculator candidates: BMI, BSA, Cockcroft-Gault CrCl, selected eGFR formula, corrected calcium/sodium when appropriate, Caprini, SOFA/qSOFA, Child-Pugh/MELD, Wells and other validated tools. Selection is not formula approval. Each needs a named primary reference, formula/version, units/population limits, boundary tests and clinical review. Initial inputs are ephemeral; no patient profile or automatic patient-data population in this release.

## Offline and privacy contract

After a successful shell/data download, local search, permitted downloaded detail fields, favorites/recent and licensed interaction data remain usable offline. Regulatory links or online-only providers show offline unavailability. First offline startup, eviction, private-mode/quota restrictions and stale datasets must be explicit. App installability does not guarantee permanent storage.

The MVP collects no patient cases/identifiers and does not link medication searches to identities. Avoid sensitive query analytics and server/console logging. An Appwrite-hosted reference service is compatible with anonymous/local-only use. Hosting/operators still have security, cost and operational duties.

## Preserved later clinical workspace

The original patient-centered promise remains a later-phase goal:

> Enter what you know → confirm the data → see what changed → see what matters → see applicable pathways → see evidence-backed next considerations.

The following workflows are retained for phases 5–11+, after the relevant privacy, evidence and content-validation gates. They are not medication-MVP features.

### Core workflows

#### A. First encounter

- Create a new patient/case.
- Enter symptoms in natural language or photograph an existing note/document.
- Add available vitals, examination findings and labs.
- InterMED structures the information.
- InterMED suggests clinically relevant next steps, missing information, investigations and applicable pathways.

#### B. Known diagnosis

- Enter/select diagnosis.
- InterMED loads applicable guideline pathways.
- The app shows recommended staging/investigations/management options with evidence and rationale.

#### C. Oncology

- Add tumor site, pathology, CT findings, TNM/stage and relevant labs.
- InterMED identifies guideline pathways.
- It can surface treatment sequencing options such as surgery-first, neoadjuvant therapy, additional staging or MDT evaluation when supported by evidence.

#### D. Perioperative care

- Record intended/performed operation.
- InterMED tracks postoperative day.
- Review antibiotic prophylaxis, thromboprophylaxis, medication safety, monitoring and procedure-specific postoperative considerations.

#### E. Postoperative deterioration

- Add new vitals/labs/findings by text or photo.
- InterMED analyzes change over time rather than only isolated values.
- It surfaces relevant complications/pathways and explains what triggered them.

#### F. ICU-to-ward transfer

- Record current medications and patient state.
- InterMED supports medication reconciliation.
- It identifies medications that may need continuation, reassessment, de-escalation or discontinuation based on indication and patient state.

#### G. Medication reference

- Search medication by commercial name, active substance, class or indication.
- Scan a box/ampoule/chart.
- View drug information, contraindications, interactions and patient-specific restrictions.

### Input modes

### Text

- Free-text natural language.
- Structured forms.
- Search/autocomplete.
- Numerical values.

### Photo

- Vitals monitor.
- Blood-pressure display.
- Laboratory sheet.
- Medication box/ampoule.
- Medication chart.
- Radiology report.
- Pathology report.
- Discharge or consultation note.

All extracted clinical content requires user confirmation before becoming part of the patient state.

### Patient identity philosophy

Patient identity is **optional**, not mandatory.

Supported optional identifiers:

- name;
- surname;
- age/date of birth;
- national/personal ID number;
- hospital medical-file number;
- admission number;
- ward/bed;
- clinician-defined alias.

The app should always be able to work with an anonymous generated case ID.

The hospital medical-file/admission number should be easy to enter because it is often more useful operationally than a patient's name.

### Specialty scope retained

General surgery, perioperative care, postoperative monitoring, common emergency surgical presentations, antimicrobial prophylaxis concepts, colorectal, HPB, pancreatic and acute-care surgery pathways remain future priorities. ICU, internal medicine, infectious diseases, oncology, cardiology, vascular surgery and other specialties can extend the platform.

Daily review preserves longitudinal changes, medication reconciliation and ICU-to-ward de-escalation based on documented indications/evidence. Evidence-backed surgical sequencing must preserve alternatives, prerequisites, staging, optimization, biopsy, neoadjuvant options and MDT review rather than declare an unsourced single answer.

## Clinical principles and non-goals

Separate confirmed facts, deterministic derived values, validated safety alerts, clinical considerations, evidence summaries and optional AI explanations. Clinicians control acceptance. AI may not invent interactions/doses, substitute for absent official content or silently alter clinical meaning.

MVP excludes patient cases, OCR scanning, patient-specific dosing/allergy checks, hospital-wide databases, EHR/FHIR/PACS integration, autonomous imaging diagnosis/prescribing, AI clinical authority, mandatory accounts, billing and rosters. General permitted pregnancy/renal/hepatic reference information is in scope; patient-specific restriction/adjustment decisions are later gated functionality.

Future optional accounts/sync and encrypted Drive/OneDrive/Dropbox backup do not make identity mandatory. Identifiable patient backend storage requires a separate privacy/security/compliance and operational review; cloud AI needs another explicit approval. See [FUTURE_CLOUD_AUTH.md](FUTURE_CLOUD_AUTH.md).

