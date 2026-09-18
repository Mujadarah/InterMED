# ClinPath — Codex Project Pack

ClinPath is a local-first clinical decision-support assistant for clinicians. It accepts typed text and photos, organizes patient information into a structured clinical state, tracks changes over time, surfaces medication safety information and clinical pathways, and grounds important outputs in current evidence and guidelines.

## Product direction

- **MVP:** iPhone/iPad, local-first, no account required, no hosted backend required.
- **Optional v1 cloud:** iCloud/CloudKit, disabled by default unless the user enables it.
- **Future:** account creation, Sign in with Apple, Google Sign-In, Appwrite or another backend, Google Drive, OneDrive and Dropbox backup/sync adapters.
- **No hospital-system integration is planned for the MVP.**

## Key principles

1. Local-first and offline-capable.
2. Patient identity fields are optional.
3. Text and photo are first-class inputs.
4. Clinically meaningful outputs must be explainable and traceable to evidence.
5. High-risk clinical logic must not depend solely on an LLM.
6. Modular architecture must support future providers, specialties, guideline sources and storage systems.
7. The app should remain useful without an account, subscription or server.

## Files

- `PRODUCT_SPEC.md` — product definition, personas, workflows and boundaries.
- `REQUIREMENTS.md` — final numbered functional and non-functional requirements.
- `ARCHITECTURE.md` — clean architecture and module boundaries.
- `DATA_MODEL.md` — initial domain/data model and persistence strategy.
- `CLINICAL_SAFETY.md` — medical-safety, evidence and AI rules.
- `ROADMAP.md` — phased product roadmap from MVP to later cloud/account features.
- `CODEX_BUILD_PLAN.md` — implementation sequence for Codex.
- `TESTING.md` — test strategy and acceptance gates.
- `FUTURE_CLOUD_AUTH.md` — future account, Appwrite, OAuth and cloud-storage strategy.

## Recommended first build target

The first usable vertical slice should allow a clinician to:

1. Create a local patient case.
2. Optionally enter a file/admission number.
3. Type or photograph symptoms, vitals or lab data.
4. Review and confirm extracted information.
5. Add diagnosis and/or surgery.
6. See trends and relevant clinical pathways.
7. See evidence-backed next-step considerations.
8. Search medications and check interactions.
9. Lock the app optionally with Face ID/Touch ID/PIN.
10. Use the app without internet access or account creation.

