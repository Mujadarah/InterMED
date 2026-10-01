# InterMED

InterMED is an open-source, offline-first clinical reference and decision-support platform for clinicians. Its first product is an installable Progressive Web App (PWA) for Romanian medication lookup, authoritative drug information and structured drug-interaction checking.

**Planning stage: no application is implemented on main. InterMED is not yet validated for clinical use.** This revision changes the plan, not the deployed product.

## First release

- Search Romanian commercial products, active substances/DCI and available ATC identifiers locally.
- Inspect ingredients, strength, formulation, regulatory provenance and RCP/SmPC/prospect references.
- Expand combination products before checking multiple drugs against a licensed, structured interaction source.
- Keep favorites and recent searches locally without an account.
- Use previously downloaded reference data offline and receive safely validated, versioned updates.

The canonical client is responsive React + TypeScript + Vite, using IndexedDB through Dexie. It targets iPhone/iPad Safari (Share → Add to Home Screen), Android, Windows, macOS and Linux browsers. Installation UI varies by platform; offline use requires an initial successful load/download and available browser storage.

Appwrite Cloud is MVP infrastructure: Sites connected to GitHub, Functions for ingestion, normalized database services and Storage. Frankfurt/EU is preferred. Infrastructure does not imply mandatory Appwrite Auth: no account or anonymous authentication session is required merely to read permitted public reference datasets.

## Safety and data rights

The clinician remains in control. Clinical content must expose sources and versions; missing information is not a normal or safe result. An LLM cannot invent interactions, doses, contraindications or regulatory content. Interaction-provider selection and dataset redistribution/offline rights remain unresolved release gates. Public availability is not permission to redistribute. Do not copy Mediately content.

Calculators follow the medication/interaction core. Later phases retain clinician workspaces, optional accounts, patient longitudinal data, OCR with confirmation, clinical pathways, evidence, AI assistance and external backup. Patient data require separate privacy/security/compliance approval.

## Project documents and contribution

Start with the [planning index](plan/README.md). [Requirements](plan/REQUIREMENTS.md) control product scope, [architecture](plan/ARCHITECTURE.md) controls boundaries, [clinical safety](plan/CLINICAL_SAFETY.md) is non-negotiable, and the [build plan](plan/CODEX_BUILD_PLAN.md) orders future implementation.

Contributions through issues and pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). Documentation-only changes need no Mac, Xcode, proprietary dataset or cloud credentials. See the [source/tool guide](plan/InterMED_SOURCES_AND_SDKS.md) for future implementation references.

## License

First-party code and documentation use [Apache License 2.0](LICENSE). Third-party clinical datasets and documents retain their own rights; Apache-2.0 does not license them.
