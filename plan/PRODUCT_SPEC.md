# ClinPath Product Specification

## 1. Product summary

ClinPath is a **local-first clinical copilot for clinicians**. A clinician enters patient information by typing or taking photos. ClinPath structures the information, tracks the patient over time, identifies relevant clinical problems and pathways, checks medication safety, finds relevant evidence/guidelines and presents the next clinical considerations with explanations and sources.

ClinPath is not intended to be a hospital EHR, HIS, PACS or mandatory cloud service.

## 2. Primary user

Initial user: physician caring for hospital inpatients, with the first specialty focus on **general surgery and perioperative care**.

Future users may include ICU, internal medicine, infectious diseases, oncology, cardiology, vascular surgery and other specialties.

## 3. Core user promise

> Enter what you know by text or photo. ClinPath organizes the patient's current state, shows what changed, identifies relevant clinical pathways, checks medication safety, highlights missing information and presents evidence-backed next-step considerations.

## 4. Core workflows

### A. First encounter

- Create a new patient/case.
- Enter symptoms in natural language or photograph an existing note/document.
- Add available vitals, examination findings and labs.
- ClinPath structures the information.
- ClinPath suggests clinically relevant next steps, missing information, investigations and applicable pathways.

### B. Known diagnosis

- Enter/select diagnosis.
- ClinPath loads applicable guideline pathways.
- The app shows recommended staging/investigations/management options with evidence and rationale.

### C. Oncology

- Add tumor site, pathology, CT findings, TNM/stage and relevant labs.
- ClinPath identifies guideline pathways.
- It can surface treatment sequencing options such as surgery-first, neoadjuvant therapy, additional staging or MDT evaluation when supported by evidence.

### D. Perioperative care

- Record intended/performed operation.
- ClinPath tracks postoperative day.
- Review antibiotic prophylaxis, thromboprophylaxis, medication safety, monitoring and procedure-specific postoperative considerations.

### E. Postoperative deterioration

- Add new vitals/labs/findings by text or photo.
- ClinPath analyzes change over time rather than only isolated values.
- It surfaces relevant complications/pathways and explains what triggered them.

### F. ICU-to-ward transfer

- Record current medications and patient state.
- ClinPath supports medication reconciliation.
- It identifies medications that may need continuation, reassessment, de-escalation or discontinuation based on indication and patient state.

### G. Medication reference

- Search medication by commercial name, active substance, class or indication.
- Scan a box/ampoule/chart.
- View drug information, contraindications, interactions and patient-specific restrictions.

## 5. Input modes

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

## 6. Patient identity philosophy

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

## 7. Storage philosophy

### MVP

- local encrypted database;
- no account;
- no backend;
- no mandatory network dependency;
- no hospital-system integration.

### Optional v1

- iCloud/CloudKit sync/backup, opt-in.

### Future

- user accounts;
- Appwrite or another backend;
- Sign in with Apple;
- Google Sign-In;
- Google Drive;
- OneDrive;
- Dropbox;
- cross-device sync and encrypted cloud backup.

## 8. Clinical philosophy

The system should distinguish:

1. **Facts** — entered or extracted patient data.
2. **Derived values** — trends/calculators.
3. **Safety alerts** — validated deterministic rules.
4. **Clinical considerations** — applicable pathways or differential considerations.
5. **Evidence summaries** — what guidelines say.
6. **AI explanations** — natural-language explanation of structured findings.

The LLM must not silently invent high-risk treatment instructions, doses or surgical indications.

## 9. Initial clinical scope

First focus:

- general surgery;
- perioperative care;
- postoperative monitoring;
- common emergency surgical presentations;
- antimicrobial prophylaxis concepts;
- medication safety;
- colorectal, HPB, pancreatic and acute-care surgery pathways.

## 10. Non-goals for MVP

- EHR/HIS integration;
- PACS integration;
- autonomous CT/MRI image interpretation;
- autonomous prescribing;
- autonomous diagnosis;
- replacing a clinician;
- mandatory cloud account;
- hospital-wide patient database;
- billing/insurance;
- scheduling/rosters.

