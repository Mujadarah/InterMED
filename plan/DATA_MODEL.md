# InterMED data model

## Scope and invariants

Medication/reference entities come first; future patient/clinical entities remain below. This is a logical normalized model, not a committed Appwrite physical schema. Required fields have no question mark; optional/missing source fields use `?` and explicit unavailable states in UI. IDs are stable opaque strings; source IDs and canonical IDs are distinct. Each published reference row belongs to an immutable dataset generation.

Keep domain types independent of React, Dexie and Appwrite SDK types. See [MEDICATION_DATA.md](MEDICATION_DATA.md) and [INTERACTIONS.md](INTERACTIONS.md).

## MedicationProduct

```text
MedicationProduct
- id
- sourceId
- sourceProductId
- cim?
- commercialName
- originalDciText?
- strengthText?
- dosageFormId?
- route?
- atcCodeIds[]
- manufacturerIds[]
- marketingAuthorizationHolderId?
- authorizationNumber?
- authorizationDate?
- authorizationStatus?
- presentationOrPackDescription?
- regulatoryDocumentIds[]
- sourceVersion
- datasetVersionId
- firstSeenAt
- lastSeenAt
- status: active | removed | unresolved
```

Do not collapse presentations with distinct source keys/CIM into one brand record. Missing strength/route/clinical fields cannot be invented.

## ActiveIngredient

```text
ActiveIngredient
- id
- preferredName
- originalNames[]
- dci?
- saltOrForm?
- synonyms[]
- externalMappings[]: sourceId, sourceIngredientId, mappingVersion, reviewStatus
- sourceId
- sourceVersion
- datasetVersionId
```

Canonicalization of salts/forms/synonyms needs clinical review; an unresolved crosswalk blocks complete interaction coverage.

## MedicationIngredient

```text
MedicationIngredient
- id
- productId
- ingredientId?
- sourceIngredientText
- strengthValue?
- strengthUnit?
- denominatorValue?
- denominatorUnit?
- strengthOriginalText?
- mappingStatus: confirmed | unresolved
- mappingVersion
- sourceId
- datasetVersionId
```

A confirmed join requires ingredientId; unresolved rows retain original text and block complete interaction coverage. One product can have multiple joins. Preserve units and source concentration expressions; parsing must not silently alter quantity.

## ATCCode and DosageForm

```text
ATCCode
- code
- displayName?
- codeSystem
- classificationVersion?
- sourceId
- datasetVersionId

DosageForm
- id
- displayName
- originalSourceText
- externalCode?
- sourceId
- datasetVersionId
```

Classification content and terminology mappings require source-specific permissions.

## Manufacturer and MarketingAuthorizationHolder

```text
Manufacturer
- id
- name
- country?
- sourceId
- sourceEntityId?
- datasetVersionId

MarketingAuthorizationHolder
- id
- name
- country?
- sourceId
- sourceEntityId?
- datasetVersionId
```

Manufacturer and authorization holder are separate roles, even if the same organization fills both.

## RegulatoryDocument

```text
RegulatoryDocument
- id
- productId
- type: RCP | SmPC | PIL | other
- title?
- url
- language?
- documentVersion?
- publishedAt?
- retrievedAt?
- lastCheckedAt
- sourceId
- sourceVersion
- datasetVersionId
- cachedContentReference?
- cacheRightsStatus: not-assessed | prohibited | permitted
- checksum?
```

A URL does not imply permission to extract/distribute the body. Clinical field excerpts need section/document provenance and separate rights approval.

## DrugInteraction

```text
DrugInteraction
- id
- ingredientAId
- ingredientBId
- severity?
- normalizedSeverity?
- severityMappingVersion?
- clinicalEffect?
- mechanism?
- evidenceLevel?
- management?
- monitoring?
- alternatives?
- contextLimitations[]
- evidenceIds[]
- sourceId
- sourceInteractionId?
- sourceVersion
- datasetVersionId
- lastUpdated
- upstreamUpdatedAt?
```

Canonical pair ordering supports lookup; uniqueness includes source/version/context. All optional clinical fields come from the approved source. lastUpdated is the InterMED record-update time; do not fabricate an upstream update timestamp.

## InteractionEvidence

```text
InteractionEvidence
- id
- interactionId
- sourceId
- sourceReferenceId?
- title?
- organization?
- publicationDate?
- urlOrDoi?
- evidenceLevel?
- sourceTerminology?
- sourceVersion
- retrievedAt
- reviewStatus
```

## DataSource

```text
DataSource
- id
- name
- authority
- jurisdiction?
- url
- licenseOrPermissionReference?
- rightsStatus
- allowedUses[]
- prohibitedUses[]
- permissionExpiresAt?
- attributionRequirements?
- expectedUpdateCadence?
- importMethod
- coverageDescription
- reviewOwner
- reviewedAt
```

Use scopes distinguish retrieval, server storage, transformation, display, redistribution, offline cache and commercial use. Unresolved rights do not authorize publication.

## DatasetVersion

```text
DatasetVersion
- id
- dataset
- sourceIds[]
- upstreamVersion?
- version
- publishedAt?
- upstreamPublishedAt?
- importedAt
- checksum
- schemaVersion
- minimumClientVersion
- recordCounts
- coverage
- rightsApprovalReference
- clinicalReviewReference
- previousVersionId?
- status: staging | validated | published | rejected | withdrawn
```

Bundle integrity checksum is required before client activation. Upstream dates and InterMED publication dates are not interchangeable; snapshot manifest identifies all compatible component versions.

## FavoriteMedication and RecentMedicationSearch

```text
FavoriteMedication
- id
- productId
- createdAt
- lastKnownDisplayName
- lastKnownDatasetVersionId
- status: available | removed | unresolved

RecentMedicationSearch
- id
- queryOrSelectedProductId
- occurredAt
- lastKnownDatasetVersionId?
```

These are local-only MVP data, independently migrated/retained across catalogue replacement. Retention/clear/export controls are explicit. No patient or account identifier is required; opt-in account ownership is a later migration.

## Update and evaluation metadata

```text
ImportRun
- id
- sourceId
- snapshotVersion
- importerVersion
- startedAt
- completedAt?
- counts
- validationFailures[]
- diffSummary
- completenessStatus
- approvalReference?
- publicationStatus

LocalDatasetState
- activeGenerationId?
- previousGenerationId?
- schemaVersion
- lastSuccessfulCheckAt?
- updateStatus
- failureReason?

InteractionEvaluation
- selectedProductToIngredientMappings[]
- evaluatedIngredientIds[]
- unresolvedInputs[]
- evaluatedPairCoverage
- sourceVersions[]
- generatedAt
- status: reported | no-reported-record | incomplete | unavailable
- interactionIds[]
```

No clinical conclusion can be stronger than the stated source coverage. Pin one dataset generation per evaluation.

## Future clinical/patient models — retained, not MVP

The following original model fields are preserved. Identity is optional; phase 5 requires privacy/security/intended-use approval before even local patient functionality, and a separate backend-hosting gate before identifiable upload. IndexedDB is not inherently encrypted. FHIR-awareness and licensed terminology mapping remain future goals.

### PatientCase

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

### Encounter

```text
Encounter
- id
- caseId
- type: admission | outpatient | emergency | ICU | ward | other
- startedAt?
- endedAt?
- locationLabel?
```

### Diagnosis

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

### Procedure

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

### Observation

General time-series record.

```text
Observation
- id
- caseId
- type
- valueNumeric?
- valueText?
- unit?
- observedAt?
- recordedAt
- source: manual | OCR | calculated | imported
- sourceDocumentId?
- confirmedByUser
```

Use for vitals and simple measurements. observedAt is the measurement time when known; recordedAt is the InterMED entry/import time and must never substitute for observedAt. Missing observedAt remains unknown and recordedAt must not be used to infer measurement order, intervals or clinical trends.

### LaboratoryResult

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

### MedicationStatement

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

### Allergy

```text
Allergy
- id
- caseId
- substance
- reaction?
- severity?
- certainty?
```

### ClinicalFinding

```text
ClinicalFinding
- id
- caseId
- category
- label
- value?
- observedAt?
- recordedAt
- source
```

Examples: abdominal tenderness, wound erythema, drain appearance. Use the same observedAt/recordedAt distinction as Observation; an unknown finding time is not its entry/import time.

### Device/Drain

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

### Microbiology

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

### ReportDocument

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

### ClinicalState

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

### ClinicalSignal

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

### ClinicalPathwayMatch

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

### EvidenceReference

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

### Provenance

Every clinically meaningful derived object should record:

- source input IDs;
- rule/model version;
- evidence package version;
- timestamp;
- whether user confirmed extracted data.

### Export format

Define a versioned JSON export envelope:

```json
{
  "format": "intermed-case",
  "version": 1,
  "exportedAt": "...",
  "case": {},
  "records": {}
}
```

The encrypted backup bundle may wrap this JSON plus attachments and metadata.


### Future-model implementation notes

Preserve missing timestamps/units as unknown rather than invent them. Observation and ClinicalFinding explicitly separate optional observedAt from recordedAt entry/import provenance; UI and trend calculations must preserve that distinction. Identifiable fields, originals/attachments and derived clinical outputs require reviewed retention, encryption/key management, access controls and delete/export semantics. A later export implementation must decide compatibility/migration for any preexisting legacy envelopes; this planning rename is not an implemented data migration.

