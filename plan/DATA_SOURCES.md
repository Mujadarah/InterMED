# InterMED data-source registry

## Rights are a publication gate

First-party software is Apache-2.0; clinical source data are not automatically covered. A public website, downloadable spreadsheet or official regulatory document is not proof of permission to reproduce, normalize, cache or redistribute it. No Mediately database copying/scraping is permitted.

For each source, document authority, jurisdiction, exact URL/document, upstream identifiers/version/date, retrieval/import date, expected update cadence, import method, attribution, rights evidence and review owner/date. Record separately permission to retrieve, server-store, transform, display excerpts, redistribute derived datasets, cache offline, distribute PDF/document bodies and use commercially. Unresolved permissions block the affected import/publication; synthetic fixtures may proceed.

## Initial registry (checked 2026-10-01)

| Source | Role/authority | Rights and allowed use | Cadence / method / provenance |
| --- | --- | --- | --- |
| [ANMDMR Nomenclator](https://nomenclator.anm.ro/medicamente) | Canonical initial Romanian regulator catalogue and regulatory links | Public consultation/download exists; redistribution, derivative database and offline rights **unresolved**. The page includes a rights-reserved notice; obtain documented permission/legal assessment before ingestion/publication | Page showed update 30.09.2026; no guaranteed update SLA. Evaluate official Excel export and permitted document/detail endpoints; retain source version/date, raw identifiers, retrieval and checksum |
| ANMDMR-linked RCP/SmPC and prospect/PIL | Official product-specific regulatory references | Linking and any extraction/cache/body distribution require separate rights assessment; do not bundle all PDFs by default | Preserve exact source URL, document type/language/date/version where supplied and last checked |
| [WHO Collaborating Centre ATC/DDD](https://atcddd.fhi.no/atc_ddd_index/) | Classification reference | Assess current terms before importing classifications/DDD content; presence of ATC in the regulator export does not license another database | Preserve source/year/version and code system; check official release policy during selection |
| Interaction provider, not selected | Structured ingredient-level interaction knowledge | Clinical quality, references, coverage and all online/offline/commercial/redistribution rights unresolved; no live licensed dataset required for contributor tests | Assess freshness/versioning, response contract, provenance and updates before selection; use synthetic provider until approved |
| [DrugBank documentation](https://docs.drugbank.com/v1) | Candidate to assess, not a selected supplier | Documentation access does not grant data/API/offline rights. No coverage or severity assumptions | Obtain applicable product/license details; do not hard-code vendor IDs into domain logic |
| Calculator references, per formula | Published validated formula/score sources | Select permitted original references individually; formula/content reuse and intended-use review required | Formula ID/version, population/units, reviewer/date and boundary fixtures |
| Future guidelines/terminologies | Evidence packages; ICD/LOINC/UCUM/SNOMED CT where appropriate | Check each jurisdiction/license/redistribution right; no wholesale copyrighted guideline copying | Organization/version/publication date, section/link, evidence certainty as supplied, last review |

The upstream date is evidence of that page snapshot, not an InterMED dataset release or an assertion that a scheduled importer exists.

## Source decision record

Every approved source needs:

- Rights evidence URL or written permission/contract reference, scope, expiry/restrictions and attribution requirements.
- Clinical quality and coverage assessment; unresolved fields/ingredients and excluded populations/interaction types.
- Import schema, change detection, source outage behavior, expected refresh/review cadence and removal policy.
- Reviewer/approval state: proposed, rights-pending, clinical-review-pending, approved for specified use, suspended or retired.
- Clear limits: online display may be permitted while offline redistribution is not.

Stop publication on expired permission, unresolved license, unexplained source change, failed validation or missing clinical review. Revoking a source requires a documented handling plan for published bundles/local copies; software rollback cannot erase copies already distributed.

## Contributor datasets

Use original synthetic records and licensed/open fixtures with recorded rights. Never commit real patient records, proprietary provider responses or copied regulatory documents without permission. Mock “known pair” tests are contract fixtures, not a clinical interaction database.

## Source versus clinical truth

Authoritative catalogue status does not imply marketed stock availability, completeness of clinical fields or a licensed interaction database. A missing field remains unavailable. Preserve original source terminology; transformations must be documented and clinically reviewed. AI cannot fill gaps with invented official content.
