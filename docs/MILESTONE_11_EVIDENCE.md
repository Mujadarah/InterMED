# Milestone 11 evidence — versioned calculator engine

Date: 2026-10-12. Branch `codex/m11-calculator-engine`. Commit `1202474` adds the engine; this evidence was verified at `a0c9469`.

## Scope and status

Milestone 11 in `plan/CODEX_BUILD_PLAN.md` calls for a modular formula registry, selected initial tools, formula-specific primary sources, units and population limits, versions and reviewers, ephemeral inputs, deterministic calculations, and accessible limitations. Its acceptance calls for positive, negative, boundary, missing and unit-conversion fixtures, independent formula versions and clinical review, no silent formula switch, visible source, units and limitations on results, and no patient storage, auto-population, or unsourced dosing.

This milestone delivers the engine only, with synthetic formulas. No real clinical formula is implemented. No coefficient, threshold, or worked clinical example from `docs/CALCULATOR_SOURCE_ASSESSMENT.md` appears in the implementation. The synthetic fixtures use invented ids, invented units, and an invented conversion factor that exists only in tests.

The real formulas come after the owner selects them from the source assessment, plus a named clinical review and a rights review for each one. Display and rounding conventions, Romanian applicability, and the calculator UI are also separate reviewed decisions.

Milestone 11 started before Milestone 10 with the owner's agreement. This does not change the Milestone 10 gates or the Milestone 12 hardening checklist.

## Exported API

From `packages/domain/src/calculators` re-exported through `packages/domain/src/index.ts`:

- `calculateFormula(registry, request)` — runs the pinned formula id and version and returns a `CalculationResult`.
- `class FormulaRegistry` — stores versioned definitions; `register`, `get`, and `listVersions`.
- `class FormulaRegistrationError` — structured registration failure with `code` `invalid-definition` or `duplicate-version`.
- `const STANDARD_UNIT_CONVERSIONS` — declared mass and length conversion pairs only.
- `type CalculationInput` — one submitted value plus its unit.
- `type CalculationInputEcho` — submitted value and unit, normalized value and unit, and conversion records.
- `type CalculationInvalidInputResult` — `invalid-input` result with field-level errors.
- `type CalculationOkResult` — `ok` result with display and unrounded values and rounding metadata.
- `type CalculationOutOfPopulationResult` — `out-of-population` result with structured guard hits.
- `type CalculationRequest` — pinned formula id, pinned formula version, and inputs keyed by input id.
- `type CalculationResult` — union of `ok`, `invalid-input`, `out-of-population`, `unit-error`, and `unavailable`.
- `type CalculationResultMetadata` — provenance carried by every result.
- `type CalculationUnitError` — one field-level unit error.
- `type CalculationUnitErrorResult` — `unit-error` result with unit errors.
- `type CalculationUnavailableResult` — `unavailable` result with a sanitized reason.
- `type FormulaDefinition` — pinned id and version, title, reference, inputs, conversions, output, population limits, limitations, review status, optional deprecation, and `compute`.
- `type FormulaDeprecation` — deprecation notice.
- `type FormulaInputDefinition` — input id, label, quantity kind, canonical unit, allowed units, per-unit plausible ranges, required flag, and negative policy.
- `type FormulaOutputDefinition` — output unit and non-negative integer precision.
- `type FormulaPopulationLimits` — descriptive text plus structured guards.
- `type FormulaQuantityKind` — quantity-kind label.
- `type FormulaReference` — citation plus URL or DOI.
- `type FormulaReviewStatus` — `unreviewed` or a clinically-reviewed record with reviewer and date.
- `type FormulaUnitConversions` — conversion rules grouped by quantity kind.
- `type FormulaVersionSummary` — version, deprecated flag, and optional notice.
- `type InputValidationCode` — `missing-required`, `invalid-input-shape`, `invalid-value`, `negative-not-allowed`, `out-of-range`, or `unexpected-input`.
- `type InputValidationError` — one field-level validation error.
- `type PopulationGuard` — `between`, `at-least`, or `at-most` guard on a required input in its canonical unit.
- `type PopulationLimitHit` — one structured guard hit with the actual value.
- `type UnitConversionRecord` — one applied conversion step with input value, converted value, factor, and offset.
- `type UnitConversionRule` — one declared `fromUnit` to `toUnit` rule with factor and optional offset.
- `type UnitErrorCode` — `unit-missing`, `unit-not-allowed`, `conversion-unavailable`, or `conversion-failed`.

## Behaviour

### Registry: pinned versions, no implicit latest, duplicate error, deprecation

Definitions are retrieved only by an explicitly pinned formula id and version. `get` takes both fields. An unknown id and version combination returns `unavailable` with a null title, null reference, null review status, marker `UNAVAILABLE`, a fixed limitation sentence, and an empty input echo. The test for an unregistered `3.0` version alongside registered `1.0` and `2.0` pins this behaviour.

`listVersions` returns the registered versions with a deprecated flag and optional notice. It does not select a latest version. Registration order is preserved; the suite registers the newer version first and asserts both summaries are listed without promotion.

Registering the same id and version twice throws `FormulaRegistrationError` with code `duplicate-version` instead of replacing the definition.

Registration validates the definition and freezes a snapshot. Required checks include a non-empty id, version, title, and `compute` function, a primary reference with citation and URL or DOI, at least one input with unique ids, unique allowed units that include the canonical unit, a finite plausible range for every allowed unit, declared conversions that connect every allowed unit to its canonical unit, a finite positive conversion factor with a finite offset, no duplicate conversion edge, guards that reference a required input in its canonical unit with finite bounds, at least one non-empty limitation, population-limit text, a valid review status, an output unit with a non-negative integer precision, and a non-empty deprecation notice when present. Malformed runtime definitions throw with code `invalid-definition`. The snapshot test mutates a range object after registration and confirms the registered calculation still uses the registration-time range.

A pinned deprecated version still resolves. Its result carries `deprecationNotice` in the shared metadata.

### Unit conversions

The shared table `STANDARD_UNIT_CONVERSIONS` declares mass and length pairs only. Mass declares `kg` to `lb` and `lb` to `kg`. Length declares `cm` to `m`, `m` to `cm`, `cm` to `in`, `in` to `cm`, `m` to `in`, and `in` to `m`. There is no clinical analyte factor in the shared table.

Each formula declares its own unit map in `unitConversions`, grouped by quantity kind. A shared pair applies only when the formula declares that quantity kind and includes the pair in its own map. The standard-mass test builds a formula whose mass input declares `kg` and `lb` and copies the shared mass pairs into its own map, then submits pounds and asserts normalization to kilograms.

Conversion uses breadth-first path search over the declared rules for the input quantity kind. Same-unit input returns an empty path. Each applied step computes `current * factor + offset` and records `fromUnit`, `toUnit`, `inputValue`, `convertedValue`, `factor`, and `offset`. A missing path yields `conversion-unavailable`; a non-finite step yields `conversion-failed`. The input echo carries `submittedValue`, `submittedUnit`, `normalizedValue`, `normalizedUnit`, and the ordered conversion records.

### Input validation: missing, non-finite, negative, out of range; no clamping

Validation runs in the submitted unit before conversion and never clamps or corrects a value.

- Missing required input returns `invalid-input` with code `missing-required`. An omitted optional input is accepted and echoed with null submitted value, null submitted unit, null normalized value, and no conversions.
- A non-object input shape returns `invalid-input-shape`. An `inputs` object that is not a record, an unknown input id, and a malformed field shape are reported at field level; an unknown id uses `unexpected-input`.
- A value that is not a finite number returns `invalid-value`. The suite covers `NaN`, positive `Infinity`, and negative `Infinity`.
- A negative value returns `negative-not-allowed` unless the input sets `allowNegative` to true.
- A value outside the declared plausible range for the submitted unit returns `out-of-range`. Exact minimum and maximum values are accepted.

Unit-shape failures return `unit-error` instead: `unit-missing` for an absent or blank unit, `unit-not-allowed` for a unit outside `allowedUnits`, `conversion-unavailable` when no declared path or no declared range connects the submitted unit to the canonical unit, and `conversion-failed` when the declared conversion does not produce a finite value.

### Population guards

Guards run on normalized canonical-unit values after validation passes and before `compute` is called. Supported operators are `between`, `at-least`, and `at-most`. Bounds are inclusive: `between` hits only outside the closed interval, `at-least` hits only below its value, and `at-most` hits only above its value. A hit returns `out-of-population` with structured `limitsHit` entries carrying the guard id, input id, operator, actual value, bound values, unit, and message. The suite asserts `compute` is not called when a guard is hit.

### Result union and always-present metadata

Every result carries `formulaId`, `formulaVersion`, `formulaTitle`, `primaryReference`, `limitations`, `reviewStatus`, `reviewMarker`, `inputEcho`, and an optional `deprecationNotice`. Known formulas echo one entry per declared input. Unknown id and version combinations carry null title, reference, and review status with an empty echo.

The result union is `ok` with display value, unrounded value, unit, precision, and rounding metadata; `invalid-input` with `errors`; `out-of-population` with `limitsHit`; `unit-error` with `unitErrors`; and `unavailable` with a sanitized `reason`.

### Unreviewed marker

A definition with review status `unreviewed` returns marker `UNREVIEWED`. A test-only clinically-reviewed definition returns `CLINICALLY REVIEWED` with its reviewer and date echoed. An unregistered id and version returns `UNAVAILABLE`. All synthetic engine fixtures are unreviewed.

### Throwing formula becomes unavailable

A `compute` function that throws returns `unavailable` with the fixed reason that the pinned formula could not be computed. The exception message is not exposed. A `compute` function that returns a non-number or a non-finite number returns `unavailable` with the fixed reason that the formula did not return a finite result. Nothing is logged.

### Rounding: display versus unrounded

An `ok` result keeps both numbers. `unroundedValue` is the raw finite `compute` output. `displayValue` is that value rounded to the declared output precision. The rounding metadata always reports mode `half-away-from-zero` with the output precision.

The exact tie rule in `roundForDisplay` rounds half away from zero. The implementation scales by ten to the precision, adds one half plus a small epsilon, floors the magnitude, rescales, and restores the sign, converting negative zero to zero. The suite asserts `1.005` displays as `1.01` and `-1.005` displays as `-1.01` at precision two.

The epsilon term is `Number.EPSILON` multiplied by the larger of one and the scaled magnitude. It compensates for binary floating-point representation where a decimal tie is stored just below the tie, so a value intended as an exact tie still rounds away from zero. A rounding step that cannot produce a finite value returns `unavailable` with the fixed reason that the result could not be rounded safely.

## Safety properties

- Ephemeral: `calculateFormula` is pure and synchronous. It stores nothing, logs nothing, and reports no analytics. Definitions are frozen at registration and `compute` receives a frozen copy of the normalized values.
- Console-spy test: the thrown-formula test spies on `log`, `info`, `warn`, `error`, `debug`, and `trace`, asserts none was called, and restores each spy.
- No patient identifiers: an untrusted request carrying extra patient fields returns a result whose serialized form contains neither identifier and whose object has neither property.
- No real formulas or coefficients: fixtures use invented ids, an imaginary output unit, and a synthetic-only conversion factor. The shared table carries only mass and length pairs.
- No LLM: the engine has no language-model import, prompt, or generated clinical authority. Clinical-content rules on invented doses, interactions, and citations remain untriggered because no clinical content is present.

## Synthetic formulas and the contract suite

The fixtures in `tests/domain/calculators/calculator-fixtures.ts` use invented inputs `synthetic-axis` and `synthetic-concentration`, an imaginary output unit, and a synthetic-only concentration factor between `mg/dL` and `µmol/L`:

- `synthetic-linear` adds the axis to one third of the concentration. It exercises the standard positive, boundary, validation, conversion, and provenance path.
- `synthetic-population-guard` uses a `µmol/L` canonical concentration and divides by nine. It exercises the guard path with a different canonical unit.
- `synthetic-optional-input` adds an optional third input. It exercises omission of a non-required input.
- `synthetic-versioned` `1.0` is deprecated and sums both inputs; `2.0` halves the concentration term. The pair exercises pinned resolution, version listing, and deprecation.
- `synthetic-throwing` throws with a message containing private input text. It exercises sanitized `unavailable` handling and the no-logging assertion.

`describeFormulaContract` in `tests/domain/calculators/describe-formula-contract.ts` runs the same contract against each fixture: the declared positive case with provenance and optional expected value, exact minimum and maximum range boundaries, `negative-not-allowed`, `out-of-range`, `missing-required`, `invalid-value` for `NaN` and both infinities, declared conversion recorded in the input echo with a normalized value assertion, `unit-not-allowed` for an unlisted unit, a structured `out-of-population` hit, and, for the optional fixture, omission echoed as absent. Every case also asserts provenance: formula id and version, primary reference, limitations, review status, review marker, and input-echo length.

## Traceability

Test names below are the current suite names. `contract` rows run once per fixture through `describeFormulaContract`.

| Requirement or rule                                                                                                                   | Tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Status                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M11 acceptance: positive, negative, boundary, missing, and unit-conversion fixtures                                                   | contract `computes the declared positive case with provenance`; contract `accepts exact minimum range boundary`; contract `accepts exact maximum range boundary`; contract `returns negative-not-allowed`, `returns out-of-range`, `returns missing-required`, `rejects NaN input values`, `rejects infinite input values`, `rejects negative infinite input values`; contract `records declared unit conversions in the input echo`; contract `rejects undeclared units with a field-level unit error` | Covered for synthetic fixtures                                                                                                                            |
| M11 acceptance: independent formula versions and clinical review                                                                      | `lists registered versions explicitly without selecting one as latest`; `resolves a pinned deprecated version and includes its notice in the result`; `includes reviewer and date metadata for a test-only reviewed status`; contract positive and provenance checks for both `synthetic-versioned` versions                                                                                                                                                                                            | Covered for synthetic versions and a test-only review record. Gap: no real formula has a named clinical reviewer or review date.                          |
| M11 acceptance and safety: no silent formula switch                                                                                   | `requires an explicit id and version without substituting a registered version`; `rejects duplicate id/version registration instead of replacing a formula`; `rejects malformed runtime definitions with structured registration errors`; `keeps a registration-time snapshot of plausible input ranges`                                                                                                                                                                                                | Covered for the engine mechanism                                                                                                                          |
| M11 acceptance: results show source, units, and limitations                                                                           | contract provenance assertion on every case; `makes the unreviewed marker explicit on every result`; `rounds only the display value and retains the unrounded result`; conversion echo assertions                                                                                                                                                                                                                                                                                                       | Covered for synthetic provenance                                                                                                                          |
| M11 acceptance: no patient storage, auto-population, or unsourced dosing                                                              | `does not return patient identifiers or other request metadata`; `does not log thrown formula errors or expose the exception message`; no dosing path exists in the engine                                                                                                                                                                                                                                                                                                                              | Covered for the engine mechanism. Gap: no UI auto-population path exists yet to test.                                                                     |
| Clinical safety: named primary source, explicit version, units, intended population, limitations, boundary and missing-data tests     | contract boundary, missing, conversion, and population cases; provenance assertions; population text and guard assertions in the registry                                                                                                                                                                                                                                                                                                                                                               | Partly covered for synthetic definitions. Gap: intended population is fictional fixture text; no real indication, exclusion, or population review exists. |
| Clinical safety: do not treat a renal estimate as a complete prescribing decision                                                     | No renal estimate exists in the engine                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Gap: no renal formula is implemented, so no dosing-inference wording is exercised.                                                                        |
| Clinical safety: initial inputs ephemeral, without patient profiles                                                                   | Engine holds no storage; identifier tests above                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Covered for the engine. Gap: the later patient workspace auto-population rule is out of scope.                                                            |
| Clinical safety: every high-impact rule has tests; preserve provenance; never hide missing data; do not interpret absence as normal   | contract missing, unexpected-input, population, and unavailable cases; metadata assertions on every branch including unknown versions                                                                                                                                                                                                                                                                                                                                                                   | Covered for synthetic engine branches                                                                                                                     |
| Clinical safety: guideline-backed recommendations point to evidence source and version; show old, superseded, or conflicting evidence | `resolves a pinned deprecated version and includes its notice in the result`; provenance carries the primary reference and limitations                                                                                                                                                                                                                                                                                                                                                                  | Partly covered as a deprecation mechanism. Gap: no guideline recommendation or supersession wording is implemented.                                       |
| Testing: conversions and invalid and out-of-range handling                                                                            | `provides explicit standard mass and length conversion pairs only`; `applies a standard conversion only when the formula declares its unit map`; contract conversion and range cases                                                                                                                                                                                                                                                                                                                    | Covered for synthetic and standard pairs                                                                                                                  |
| Testing: prevent silent substitution; inputs remain ephemeral                                                                         | Registry pinning tests; identifier and logging tests                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Covered for the engine                                                                                                                                    |
| Testing: clinically review reference cases                                                                                            | Contract expected values are synthetic arithmetic, not clinical oracles                                                                                                                                                                                                                                                                                                                                                                                                                                 | Gap: no clinically reviewed reference case exists.                                                                                                        |
| Testing and requirements: BMI, BSA, eGFR, CrCl, corrections, Caprini, SOFA and qSOFA, Child-Pugh and MELD, Wells, and other tools     | No test covers a real tool                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Gap: deferred until the owner selects real formulas and each passes clinical and rights review.                                                           |
| Requirements: modular framework with documented and tested versions; formula tests and boundary cases                                 | Public API test; contract suite; full gate below                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Covered for the framework only                                                                                                                            |

## Tests

Red logs record the missing behaviour before implementation; green and full-check logs record the passing behaviour afterwards. All logs are in `docs/evidence/milestone-11-2026-10-12/`.

| Log                                               | Meaning                                                                                                     |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `calculator-engine-red-initial-api.log`           | The suite fails without the registry and calculation function.                                              |
| `calculator-engine-red-formula-fields.log`        | The suite fails against renamed formula fields.                                                             |
| `calculator-engine-red-test-adjustments.log`      | The suite fails on strict equality, unadjusted population fixtures, and unadjusted conversion expectations. |
| `calculator-engine-red-malformed-definitions.log` | The focused malformed-definition case fails before null-input validation returns a structured error.        |
| `calculator-engine-red-range-snapshot.log`        | The focused range-snapshot case fails before registration freezes the definition.                           |
| `calculator-engine-green-focused.log`             | The focused calculator suite passes.                                                                        |
| `calculator-engine-full-check.log`                | The implementer's full `npm run check` passes.                                                              |

Focused calculator results: one file, 89 tests passed, recorded in the green log.

Full gate results from the implementer's log: format, lint, typecheck, unit tests, architecture boundaries, audit, production build, distribution scan, and browser tests all passed. The unit suite recorded 59 files with 1,028 tests passed. The browser suite recorded 160 tests passed and 2 skipped.

The orchestrator re-ran the gate at `a0c9469`: format, lint, typecheck, unit tests (59 files, 1,028 passed), and boundaries all passed under Node `24.21.0` and Node `22.23.2`.

## Open items

- Selection of real formulas belongs to the owner, starting from the source assessment.
- Each selected formula needs a named clinical reviewer with a review date, and a per-formula rights review covering implementation, wording, attribution, adaptation, translation, commercial distribution, and offline scope.
- The rounding tie-breaking rule needs an explicit, clinically reviewed decision. The source assessment records that nearest integer alone does not select a convention. Today the engine rounds half away from zero.
- Romanian applicability, excluded and uncertain states, missing-data policy, and display conventions need per-formula review.
- The calculator UI, including source, units, limitations, version, deprecation, and review-marker display, is not implemented.
- Real-device, accessibility, privacy, security, and release hardening repeat under Milestone 12 for the expanded rollout.
