# InterMED Clinical Safety and AI Rules

## Core safety principle

InterMED may assist a clinician, but high-impact clinical decisions must be grounded in validated rules/evidence and remain under clinician control.

## Medication-MVP non-negotiable rules

- Resolve commercial products to confirmed active ingredients before interaction analysis; expand all combination components and show unresolved mappings.
- Use licensed/permitted structured interaction sources, with explicit evaluated coverage. No LLM is the primary authority for whether an interaction exists.
- Severity comes from source terminology or an explicitly documented, versioned, clinically reviewed normalization. Missing severity stays unknown.
- No record is not proof of safety. Distinguish documented interactions, insufficient information (including source-covered no reported record without an explicit evaluation conclusion), source-supported evaluated-without-identified-interaction, conflicting/uncertain evidence, and withdrawn/superseded/outdated records; also distinguish unavailable/offline provider states. Only an explicit source-supported evaluation can establish evaluated-without-identified-interaction within its stated scope; absence of a record never means safe.
- Show source, regulatory document/reference, dataset version/age, import/retrieval date and evidence level where supplied. Catalogue currency does not imply interaction currency.
- Doses, contraindications, renal/hepatic adjustments and pregnancy/lactation information must be traceable. AI cannot fill missing official fields or invent citations.
- Generated explanations cannot silently alter severity, dose, management, uncertainty or clinical meaning. Keep approved source facts accessible.
- Failed dataset updates preserve the prior usable version; stale/incomplete results remain visibly qualified.
- Medication selection is not a patient case. No patient data/identifiers are collected in this MVP.

## Output categories

### 1. Patient facts

Entered or confirmed by the clinician.

### 2. Derived values

Examples:

- BMI;
- eGFR/CrCl;
- percentage change;
- postoperative day;
- trend slope.

These must be deterministic and tested.

### 3. Safety alerts

Generated only by validated deterministic rules or authoritative medication-safety data.

### 4. Clinical considerations

Possible relevant conditions/pathways. These should use cautious wording and expose the trigger logic.

### 5. Evidence recommendations

Summaries of guidelines/evidence. Include provenance.

### 6. AI explanation

The AI can explain and summarize the above, but cannot silently change their severity or source.

## Mandatory rules

1. Do not let an LLM invent a medication dose.
2. Do not let an LLM invent a drug interaction.
3. Do not let an LLM independently declare a surgical indication as a high-certainty fact.
4. Do not let an LLM convert OCR output into accepted clinical data without clinician confirmation.
5. Every high-impact rule must have tests.
6. Every guideline-backed recommendation must point to the evidence source/version.
7. Show when evidence is old, superseded or conflicting.
8. Preserve provenance for generated clinical signals.
9. Never hide missing data that materially limits a recommendation.
10. Do not interpret absence of data as a normal result.

## Alert hierarchy

### Critical/safety

Reserved for validated scenarios where immediate attention may be needed.

### Warning/clinical consideration

Relevant pattern requiring clinician evaluation.

### Informational/evidence

Reference or guideline information.

Avoid excessive red alerts.

## OCR/photo safety

Workflow:

```text
Capture → OCR/extract → candidate fields → review → clinician edits → confirm → persist
```

For medication scanning, always show at minimum:

- detected name;
- active ingredient;
- strength;
- formulation;
- confidence/ambiguity when relevant.

If multiple matches exist, require selection.

## Guideline safety

Each clinical recommendation should store:

- guideline/source;
- organization;
- publication date/version;
- section/reference where possible;
- strength/certainty if published;
- last reviewed date;
- internal content version.

## Medication safety

Medication data sources must be licensed/permitted for the intended distribution.

Do not scrape or copy proprietary databases such as Mediately.

The architecture should allow multiple `DrugInteractionProvider` implementations.

## Calculator safety

Every released formula needs a named primary source, explicit version, units, intended population, limitations and boundary/missing-data tests. Do not silently switch formulas or treat a renal estimate as a complete prescribing decision. Initial calculator inputs are ephemeral, without patient profiles.

Rounding and classification rules are calculator-specific and must be documented and tested for each version. Apply classification thresholds to unrounded values; never reuse display-rounded values in calculations. Any formula-prescribed intermediate rounding is a separate, explicitly sourced rule, not display rounding.

## Clinical content governance

Owner directives (2026-10-12): clinical components are approved only through explicit approval by the owner (the project clinical reviewer) for each component and version, supported by documented references, reproducible tests and version tracking. Clinically relevant behaviour changes require a new version and revalidation; approval does not carry over from a previous version.

Each rule/content change should include:

- author;
- clinical reviewer;
- evidence reference;
- test cases;
- version;
- date.

## Data/privacy

Medication MVP collects no patient data and works without identity or an account. Favorites/recent searches remain local; avoid identity-linked medication analytics and query logs.

When identifiers are entered, treat them as highly sensitive. Avoid sending raw identifiable data to cloud AI services by default.

## Intended-use evolution

Define intended use and assess clinical risk/regulatory obligations before any public clinical medication/interaction release. Repeat and extend that formal review as InterMED moves toward calculators or patient-specific diagnosis/treatment recommendations. Do not assume a disclaimer alone removes medical-device obligations.
