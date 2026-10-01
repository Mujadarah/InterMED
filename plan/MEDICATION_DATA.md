# InterMED Romanian medication data

## Source and scope

ANMDMR Nomenclator is the canonical initial catalogue strategy. The public regulator page provides catalogue consultation and an Excel export; product details link RCP/prospect where available. Source retrieval, transformation, server storage and client/offline redistribution must pass the [rights gate](DATA_SOURCES.md) before real-source ingestion/publication. Official/public does not imply an open-data license.

Do not copy Mediately. Synthetic fixtures support all development/tests while permissions are unresolved. Source fields must be captured only where actually supplied, not filled using model memory.

## Normalized catalogue

Separate commercial MedicationProduct, ActiveIngredient and MedicationIngredient join. Distinguish product/pack presentation identifiers; preserve CIM and upstream keys as supplied. Do not assume a brand is one substance or that the same brand always has the same strength/formulation/ingredients.

Capture original commercial/DCI text, strength/unit, pharmaceutical form, route, ATC, CIM, manufacturer, marketing authorization holder, authorization information/status, regulatory links and source version/date. Missing fields remain unavailable. Catalogue authorization status is not live pharmacy stock or prescribing approval.

Normalization uses documented Unicode/diacritic/case rules for indexes while preserving original display text. Parse combination DCI and concentration syntax only through validated reviewed rules/mappings. Ambiguous or missing ingredient identity, units or product keys enter quarantine/review; do not fuzzy-match into accepted clinical mappings.

Keep manufacturer separate from authorization holder, and active ingredient separate from ATC/class. A source ingredient spelling, salt/form and canonical mapping require provenance; do not silently erase a clinically meaningful distinction.

## Ingestion and publication

1. Approved source retrieval creates a private immutable snapshot with source date, retrieval time and checksum, if storage is permitted.
2. Parser validates encoding, headers/schema, required identifiers, row types, decimal separators/units and bounded content. Reject unexpected layouts rather than best-effort guessing.
3. Normalizer validates stable product/ingredient keys, joins, duplicate/conflicting rows, combination expansion and references. Retain original identifiers/text and transformation version.
4. Compare with the last complete accepted snapshot for additions, changes, renames and removals. Partial/empty source responses or unexpectedly large drops block publication pending review; they must not imply mass product removal.
5. Record source provenance, row counts, rejected rows/reasons, completeness, diff summary and importer version in a private ImportRun. Logs use safe counts/IDs, no user queries or patient information.
6. Clinical/data steward reviews meaningful mappings/content changes and approves rights/coverage. Failed or ambiguous rows are quarantined; a release cannot conceal their coverage impact.
7. Persist a normalized immutable dataset generation, generate compact client records/index inputs, validate checksum/schema/references and publish its version manifest only after approval.
8. Keep the previous approved generation for rollback. A failed importer never overwrites active published data.

Retries are idempotent by source snapshot/version/importer configuration. Publish manifests and bundles consistently; consumers must never see an active pointer to a partial bundle. Full snapshots first; delta optimization needs tested base/version/removal contracts.

## Local search and details

Use local indexes for full/partial commercial names, DCI/ingredients, ATC and manufacturer where present. Ranking can normalize Romanian diacritics; original text remains visible. Typo candidates must show formulation/strength and require selection. Class/indication search is conditional on licensed classification/clinical content.

A detail page separates identification, validated clinical content and regulatory documents. Display indications, usual doses, administration, contraindications, precautions, adverse effects, pregnancy/lactation, renal/hepatic considerations and interaction entry points only as available from an approved source. Unavailable content stays unavailable; no AI-generated replacement labeled official.

RegulatoryDocument records track source URL/type/language/version/date and cached-content rights/status separately. External links need availability checks and safe navigation; offline shell caching must not imply their bodies were downloaded.

## Dataset lifecycle

DatasetVersion distinguishes upstream publication date from InterMED import/publication time. Show version, source, coverage and age. Favorites/recent searches reference stable product IDs; deleted/renamed products need tombstones/status, never silent substitution. [PWA_OFFLINE.md](PWA_OFFLINE.md) specifies atomic client activation and recovery.

See [DATA_MODEL.md](DATA_MODEL.md), [INTERACTIONS.md](INTERACTIONS.md) and [TESTING.md](TESTING.md) for entities, ingredient-level checking and verification.
