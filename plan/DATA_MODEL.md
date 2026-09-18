# ClinPath Initial Data Model

## Design goals

- local-first;
- longitudinal/time-series friendly;
- optional identity;
- FHIR-aware but not dependent on FHIR;
- exportable;
- migration-friendly;
- source/provenance-aware.

## PatientCase

```text
PatientCase
- id: UUID
- createdAt
- updatedAt
- status: active | archived
- generatedDisplayCode
- alias?
- givenName?
- familyName?
- dateOfBirth?
- ageApproximation?
- sex?
- nationalId?
- hospitalFileNumber?
- admissionNumber?
- ward?
- bed?
- notes?
```

All identity fields after `generatedDisplayCode` are optional.

## Encounter

```text
Encounter
- id
- caseId
- type: admission | outpatient | emergency | ICU | ward | other
- startedAt?
- endedAt?
- locationLabel?
```

## Diagnosis

```text
Diagnosis
- id
- caseId
- codeSystem?
- code?
- displayName
- certainty?
- onsetDate?
- resolvedDate?
- source
```

## Procedure

```text
Procedure
- id
- caseId
- name
- codeSystem?
- code?
- performedAt?
- plannedAt?
- urgency?
- approach?
- anastomosis?
- stoma?
- notes?
```

## Observation

General time-series record.

```text
Observation
- id
- caseId
- type
- valueNumeric?
- valueText?
- unit?
- observedAt
- source: manual | OCR | calculated | imported
- sourceDocumentId?
- confirmedByUser
```

Use for vitals and simple measurements.

## LaboratoryResult

May be represented as specialized Observation or own table.

```text
LaboratoryResult
- id
- caseId
- testCode?
- testName
- value
- unit
- referenceLow?
- referenceHigh?
- collectedAt?
- reportedAt?
- source
- confirmedByUser
```

## MedicationStatement

```text
MedicationStatement
- id
- caseId
- medicationId?
- displayName
- activeIngredients[]
- dose?
- doseUnit?
- route?
- frequency?
- startAt?
- stopAt?
- indication?
- status
- source
- confirmedByUser
```

## Allergy

```text
Allergy
- id
- caseId
- substance
- reaction?
- severity?
- certainty?
```

## ClinicalFinding

```text
ClinicalFinding
- id
- caseId
- category
- label
- value?
- observedAt
- source
```

Examples: abdominal tenderness, wound erythema, drain appearance.

## Device/Drain

```text
ClinicalDevice
- id
- caseId
- type
- insertedAt?
- removedAt?
- location?
- notes?
```

## Microbiology

```text
MicrobiologyResult
- id
- caseId
- specimen
- collectedAt?
- organism?
- susceptibilityData?
- status
```

## ReportDocument

```text
ReportDocument
- id
- caseId
- type: radiology | pathology | discharge | consultation | operative | other
- originalText?
- imageReference?
- capturedAt
- extractedStructuredData?
- confirmedByUser
```

Avoid storing raw images indefinitely by default if only the extracted data are needed; make retention configurable later.

## ClinicalState

`ClinicalState` should normally be a computed aggregate, not duplicated storage.

```text
ClinicalState
= PatientCase
+ active encounter
+ diagnoses
+ procedures
+ recent observations/labs
+ current medications
+ allergies
+ findings
+ microbiology
+ reports
```

## ClinicalSignal

```text
ClinicalSignal
- id
- caseId
- type
- severity
- title
- explanation
- triggeredBy[]
- ruleId
- ruleVersion
- generatedAt
- status: active | dismissed | resolved
```

## ClinicalPathwayMatch

```text
ClinicalPathwayMatch
- pathwayId
- pathwayVersion
- caseId
- matchedAt
- reasons[]
- missingData[]
- evidenceRefs[]
```

## EvidenceReference

```text
EvidenceReference
- id
- title
- organization
- publicationDate?
- version?
- doi?
- url?
- license?
- lastReviewedAt
```

## Provenance

Every clinically meaningful derived object should record:

- source input IDs;
- rule/model version;
- evidence package version;
- timestamp;
- whether user confirmed extracted data.

## Export format

Define a versioned JSON export envelope:

```json
{
  "format": "clinpath-case",
  "version": 1,
  "exportedAt": "...",
  "case": {},
  "records": {}
}
```

The encrypted backup bundle may wrap this JSON plus attachments and metadata.

