# ClinPath Clinical Safety and AI Rules

## Core safety principle

ClinPath may assist a clinician, but high-impact clinical decisions must be grounded in validated rules/evidence and remain under clinician control.

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

## Clinical content governance

Each rule/content change should include:

- author;
- clinical reviewer;
- evidence reference;
- test cases;
- version;
- date.

## Data/privacy

MVP should work without any direct patient identifier.

When identifiers are entered, treat them as highly sensitive. Avoid sending raw identifiable data to cloud AI services by default.

## Intended-use evolution

As ClinPath moves from evidence navigation toward patient-specific diagnosis/treatment recommendations, perform a formal regulatory review before public clinical deployment. Do not assume a disclaimer alone removes medical-device obligations.

