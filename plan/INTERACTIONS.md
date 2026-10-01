# InterMED structured drug interactions

## Clinical and licensing gate

Drug-interaction checking is first-class MVP scope, but the provider is not selected. Assess medical quality, ingredient/product coverage, severity vocabulary, mechanism, clinical effect, management/monitoring/alternatives, evidence/references, update cadence and online/offline/commercial/redistribution rights. Obtain a documented approval before clinical release.

A mock provider supports development, not clinical use. Without an approved source, show the feature unavailable or an explicitly nonclinical demo; do not describe that as a complete medication-and-interaction MVP. Offline checking is available only for licensed downloaded interaction records.

## Domain interface

DrugInteractionProvider receives resolved canonical ingredient IDs and context supported by its contract. It returns source records plus evaluation metadata: provider/source version, evaluated ingredient/pair coverage, excluded/unresolved input, retrieval time, offline availability and status.

Keep source-specific IDs/types inside adapters. Infrastructure maps identities through a reviewed versioned crosswalk; provider replacement must not change the domain identity scheme or silently rewrite previous results.

## Resolution and pair evaluation

- Resolve the selected product's exact source/version, strength/form and ingredient joins.
- Expand every combination product to all confirmed active ingredients; preserve the selected-product-to-ingredient mapping for explanation.
- Permit direct ingredient input. Unknown/ambiguous mappings require correction or explicit incomplete status, not automatic brand guessing.
- Deduplicate canonical ingredients across products for pair evaluation while flagging repeated ingredients separately. Duplicate ingredient exposure is not a drug interacting with itself; therapeutic duplication needs a separately validated taxonomy/rule.
- Evaluate unordered unique ingredient pairs under documented provider coverage/limits. For n distinct ingredients, the pair set is n(n−1)/2; do not silently truncate.
- Preserve clinically relevant formulation/route/context limitations. A provider incapable of evaluating them must disclose that limitation.

Synthetic product fixtures demonstrate one ingredient and combinations; they are not assertions about a real commercial brand's composition.

## Result contract

DrugInteraction fields include id, ingredientAId/ingredientBId, optional source severity, clinical effect, mechanism, evidence level, management, monitoring, alternatives, sourceId/sourceInteractionId, sourceVersion and lastUpdated. InteractionEvidence carries source references, evidence vocabulary and provenance.

Preserve source terminology and original text. Optional normalized severity requires an explicit documented, versioned, clinically reviewed mapping with unmapped states; never invent a source classification. If providers disagree, show the disagreement and their versions rather than synthesizing a reassuring verdict.

Do not fabricate missing management, monitoring, alternatives, evidence grades or citations. Keep structured clinical facts separate from any future explanatory prose.

## Honest outcome states

| State | Meaning shown to the clinician |
| --- | --- |
| Reported interactions | Source records found for stated evaluated coverage |
| No reported interaction within evaluated coverage | Source evaluated the covered input/pairs and returned no record; **not proof of safety** |
| Incomplete/unknown coverage | Unresolved ingredients, omitted pairs, unsupported context or partial dataset |
| Unavailable | Device is offline and the provider requires an online connection; dataset is missing; rights restrict use; provider errors or times out; or versions are incompatible |

“No record” must not be labeled “no interaction exists.” A stale dataset or partial coverage must remain visible even when other pairs have results. Keep version/coverage attached to saved/displayed results and invalidate/re-evaluate deliberately after source changes.

## Presentation and AI

Show which selected products resolved to which ingredients, severity in source vocabulary, mechanism/effect, evidence and management where supplied, source/reference/version/age, missing fields and coverage. Avoid all-green “safe” banners. Provide authoritative references and clinician-control messaging without disguising limitations.

An LLM is never primary authority for deciding an interaction exists. Correct later flow: structured source → found record → approved facts → optional explanation. Incorrect flow: medications → ask LLM → clinical truth. Generated explanations cannot change severity, doses, management or meaning; source facts remain available.

## Tests and gates

Test known reported and explicit covered-no-record synthetic pairs, unresolved ingredients, provider unavailable, duplicate exposure, combination expansion, source vocabulary, disagreement, stale/incomplete coverage, pair limits and offline rights. An actual clinical provider requires its own clinically reviewed validation set and license-approved fixtures before release.

[CLINICAL_SAFETY.md](CLINICAL_SAFETY.md) is mandatory. [DATA_SOURCES.md](DATA_SOURCES.md) holds rights decisions; [TESTING.md](TESTING.md) defines technical/clinical evidence.
