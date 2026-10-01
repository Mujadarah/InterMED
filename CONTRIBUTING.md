# Contributing to InterMED

Issues, feature proposals, documentation corrections, accessibility/privacy reviews and focused pull requests are welcome. Never submit real or identifiable patient data or credentials.

## Current stage and workflow

This is a planning-first repository. The canonical direction is React/TypeScript/Vite PWA, IndexedDB/Dexie and Appwrite infrastructure, not a native-iOS-first app. No Mac, Xcode, live Appwrite credentials or proprietary clinical dataset is required for documentation work.

1. Read every repository Markdown file. Start with [plan/README.md](plan/README.md); requirements, architecture and clinical safety are controlling.
2. Propose focused changes from a fork/topic branch through a pull request; do not push directly to main or bypass review/status-check policy.
3. For future behavior changes, add and run a failing test before implementation, then record passing verification. Use synthetic fixtures/mock providers.
4. Keep domain/clinical logic independent of React, browser persistence and Appwrite/provider SDKs.
5. Run the relevant documented checks and complete the PR template. Tooling/build commands will be introduced in milestone 1; do not report nonexistent tests as passing.

For documentation changes, review all changed files, local Markdown links, requirement traceability and cross-file scope consistency. Do not scaffold the application during the current documentation revision.

## Clinical sources and security

Clinical thresholds, formulas, medication doses, interactions and treatment recommendations need a permitted authoritative source, version/provenance, tests and clinical review. Public regulatory data are not automatically redistributable. Do not copy Mediately content or commit proprietary provider responses.

[CLINICAL_SAFETY.md](plan/CLINICAL_SAFETY.md) is mandatory. OCR/AI-derived clinical facts remain candidates until clinician confirmation. Missing interaction records are not proof of safety; LLM output is not dose/interaction authority.

Use original synthetic fixtures; no patient/query content in logs/analytics. Frontend configuration is public: never commit server keys/provider tokens. Report vulnerabilities privately using [SECURITY.md](SECURITY.md).

First-party contributions are Apache-2.0. Third-party data/assets need their own permission/attribution and cannot be relicensed merely by adding them here.
