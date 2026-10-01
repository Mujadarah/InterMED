# InterMED planning index

## Current direction and authority

Implementation priority: **Romanian medication reference + structured drug-interaction checker + offline PWA**. React/TypeScript/Vite and IndexedDB/Dexie are the canonical client direction. Appwrite Cloud infrastructure starts in the MVP; user accounts do not.

This repository is planning/documentation-first. The files below describe intended behavior, not completed implementation or clinical validation. The PWA supersedes the previous native-iPhone-first plan. Native clients are optional future adapters, not MVP prerequisites.

Read every repository Markdown file before changing code. Treat REQUIREMENTS as product requirements, ARCHITECTURE as mandatory architectural guidance and CLINICAL_SAFETY as non-negotiable constraints. Execute CODEX_BUILD_PLAN sequentially. If these documents conflict, stop and report the conflict rather than silently selecting one.

## Document map

| Document | Purpose |
| --- | --- |
| [PRODUCT_SPEC.md](PRODUCT_SPEC.md) | User workflows, release boundaries and preserved clinical vision |
| [REQUIREMENTS.md](REQUIREMENTS.md) | Current and later numbered requirements |
| [REQUIREMENTS_TRACEABILITY.md](REQUIREMENTS_TRACEABILITY.md) | Disposition and new ID of every original requirement |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Layers, provider contracts and proposed module structure |
| [DATA_MODEL.md](DATA_MODEL.md) | Normalized medication models, then preserved future clinical models |
| [ROADMAP.md](ROADMAP.md) | Product phases and gates |
| [CODEX_BUILD_PLAN.md](CODEX_BUILD_PLAN.md) | Sequential implementation milestones and verification |
| [CLINICAL_SAFETY.md](CLINICAL_SAFETY.md) | Medication, calculator, OCR, evidence and AI constraints |
| [TESTING.md](TESTING.md) | Web/PWA, importer, interaction and future clinical verification |
| [MEDICATION_DATA.md](MEDICATION_DATA.md) | ANMDMR ingestion, normalization and publication |
| [INTERACTIONS.md](INTERACTIONS.md) | Ingredient-level resolution and source-preserving results |
| [PWA_OFFLINE.md](PWA_OFFLINE.md) | Installation, storage limits and safe update lifecycle |
| [APPWRITE.md](APPWRITE.md) | MVP infrastructure, deployment and permission boundaries |
| [DATA_SOURCES.md](DATA_SOURCES.md) | Source registry, rights checks and evidence links |
| [FUTURE_CLOUD_AUTH.md](FUTURE_CLOUD_AUTH.md) | Optional accounts, later sync/backup and patient-data gates |
| [InterMED_SOURCES_AND_SDKS.md](InterMED_SOURCES_AND_SDKS.md) | Primary documentation and SDK/tool selection guidance |
| [REVISION_AUDIT.md](REVISION_AUDIT.md) | Revision preservation, consistency checks and open decisions |

## Scope and release discipline

Medication/interaction MVP comprises milestones 1–10 with its hardening/release checks applied before any clinical release. Milestone 11 adds validated calculators shortly afterward; milestone 12 completes/repeats hardening for that expanded rollout. This does not permit skipping milestone acceptance gates or releasing an unlicensed interaction checker.

Patient/case management and broader clinical functionality remain planned, not deleted. No real patient data enter development fixtures. Patient hosting, AI processing and specialty recommendations require explicit later reviews. Appwrite deployment, source ingestion and public clinical release are separate authorized implementation steps, not performed by this documentation revision.

