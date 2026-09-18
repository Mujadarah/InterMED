# ClinPath Testing Strategy

## 1. Unit tests

Required for:

- postoperative-day calculations;
- BMI/eGFR/CrCl and other calculators;
- unit conversions;
- trend calculations;
- rule predicates;
- pathway matching;
- data-model serialization;
- schema migrations.

## 2. Clinical rule tests

Every high-impact rule requires:

- positive case;
- negative case;
- borderline case;
- missing-data case;
- unit variant where applicable;
- regression test for every fixed defect.

## 3. Synthetic case library

Create fixtures such as:

```text
uncomplicated_postop_colorectal.json
postop_infection_pattern.json
possible_anastomotic_leak.json
postop_bleeding.json
aki_stage_pattern.json
hyperkalemia.json
bile_leak.json
pancreatic_fistula.json
mixed_ambiguous_case.json
```

Do not include real identifiable patient data in the repository.

## 4. OCR tests

Create test images for:

- clear lab sheet;
- rotated lab sheet;
- low-light photo;
- decimal comma vs decimal point;
- medication box;
- ambiguous medication strength;
- BP monitor;
- radiology report.

Metrics:

- field extraction accuracy;
- value accuracy;
- unit accuracy;
- false-field rate.

No OCR result should bypass confirmation.

## 5. Persistence tests

- create/read/update/delete;
- migrations from every supported schema version;
- large patient timeline;
- interrupted write handling;
- export/import roundtrip;
- corrupted/invalid import handling.

## 6. Security tests

- app lock disabled;
- Face ID enabled;
- Touch ID enabled where available;
- PIN fallback;
- repeated failure;
- background lock;
- app-switcher redaction;
- keychain reset/device-change behavior;
- delete-all-data.

## 7. iCloud tests

- iCloud unavailable;
- user logged out;
- no network;
- edit on two devices;
- conflicting observation updates;
- interrupted upload;
- insufficient iCloud space;
- disable/re-enable sync.

## 8. Medication provider contract tests

Every interaction provider implementation must return normalized:

- interacting substances;
- severity if available;
- description;
- management text if available;
- evidence/source;
- provider version/date.

## 9. UI tests

Critical paths:

1. create anonymous patient;
2. add file number;
3. enter BP manually;
4. scan lab sheet and correct OCR;
5. add procedure;
6. inspect trend;
7. inspect pathway reason;
8. search medication;
9. enable/disable app lock;
10. export/delete case.

## 10. Clinical-review acceptance

Before exposing a clinical content pack publicly:

- clinical author identified;
- source documented;
- reviewer identified;
- tests pass;
- version assigned;
- review date recorded.

