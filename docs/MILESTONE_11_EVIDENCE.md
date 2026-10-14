# Milestone 11 evidence — versioned calculator engine

Date: 2026-10-12. Branch `codex/m11-calculator-engine`. Commit `1202474` adds the engine; this evidence was verified at `a0c9469` and extended on the same branch with the PR #22 review fixes (items 1–11, see `### Review fixes (PR #22)`).

> Historical scope: the engine-only sections below record M11a and its PR #22 review evidence. The M11b section at the end records the current BMI/BSA candidates and supersedes earlier statements that no real formula or real-formula test exists, that rounding is implicit, or that a reviewed fixture needs no approval register.

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
- `type CalculationOkResult` — `ok` result with display and unrounded values and rounding metadata, plus an optional `classification` decided from the unrounded value.
- `type CalculationOutOfPopulationResult` — `out-of-population` result with structured guard hits.
- `type CalculationRequest` — pinned formula id, pinned formula version, and inputs keyed by input id.
- `type CalculationResult` — union of `ok`, `invalid-input`, `out-of-population`, `unit-error`, and `unavailable`.
- `type CalculationResultMetadata` — provenance carried by every result.
- `type CalculationUnitError` — one field-level unit error.
- `type CalculationUnitErrorResult` — `unit-error` result with unit errors.
- `type CalculationUnavailableResult` — `unavailable` result with a sanitized reason.
- `type FormulaClassification` — code plus label returned by the optional `classify` hook, decided from the unrounded value.
- `type FormulaDefinition` — pinned id and version, title, reference, inputs, conversions, output, population limits, limitations, review status, optional deprecation, optional `classify`, and `compute`.
- `type FormulaDeprecation` — deprecation notice.
- `type FormulaInputDefinition` — input id, label, quantity kind, canonical unit, allowed units, per-unit plausible ranges, required flag, and negative policy.
- `type FormulaMetadata` — read-only registry view of a formula without the executable `compute` and `classify` hooks; returned by `get`.
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

Definitions are retrieved only by an explicitly pinned formula id and version. `get` takes both fields and returns a frozen read-only metadata view (`FormulaMetadata`) with the executable `compute` and `classify` hooks stripped; the executable definition stays inside the registry behind an internal resolver, so `calculateFormula` is the only path to a number. An unknown id and version combination returns `unavailable` with a null title, null reference, null review status, marker `UNAVAILABLE`, a fixed limitation sentence, and an empty input echo. The test for an unregistered `3.0` version alongside registered `1.0` and `2.0` pins this behaviour.

`listVersions` returns the registered versions with a deprecated flag and optional notice. It does not select a latest version. Registration order is preserved; the suite registers the newer version first and asserts both summaries are listed without promotion.

Registering the same id and version twice throws `FormulaRegistrationError` with code `duplicate-version` instead of replacing the definition.

Registration validates the definition and freezes a snapshot. Required checks include a non-empty id, version, title, and `compute` function, a primary reference with citation and URL or DOI, at least one input with unique ids, unique allowed units that include the canonical unit, a finite plausible range for every allowed unit, declared conversions that connect every allowed unit to its canonical unit, a finite positive conversion factor with a finite offset, no duplicate conversion edge, conversion factors consistent with the standard table, round-trip consistent inverses, and direct pairs that agree with their composed multi-hop chains (all within `1e-12`), guards that reference a required input in its canonical unit with finite bounds, a whitelisted guard operator (`between`, `at-least`, or `at-most`), at least one population guard, at least one non-empty limitation, population-limit text, a valid review status, an optional `classify` hook that is a function when present, an output unit with a non-negative integer precision, and a non-empty deprecation notice when present. Malformed runtime definitions throw with code `invalid-definition`. The snapshot test mutates a range object after registration and confirms the registered calculation still uses the registration-time range.

A pinned deprecated version still resolves. Its result carries `deprecationNotice` in the shared metadata.

### Unit conversions

The shared table `STANDARD_UNIT_CONVERSIONS` declares mass and length pairs only. Mass declares `kg` to `lb` and `lb` to `kg`. Length declares `cm` to `m`, `m` to `cm`, `cm` to `in`, `in` to `cm`, `m` to `in`, and `in` to `m`. There is no clinical analyte factor in the shared table.

Each formula declares its own unit map in `unitConversions`, grouped by quantity kind. A shared pair applies only when the formula declares that quantity kind and includes the pair in its own map. The standard-mass test builds a formula whose mass input declares `kg` and `lb` and copies the shared mass pairs into its own map, then submits pounds and asserts normalization to kilograms.

Conversion uses breadth-first path search over the declared rules for the input quantity kind. Same-unit input returns an empty path. Each applied step computes `current * factor + offset` and records `fromUnit`, `toUnit`, `inputValue`, `convertedValue`, `factor`, and `offset`. A missing path yields `conversion-unavailable`; a non-finite step yields `conversion-failed`. The input echo carries `submittedValue`, `submittedUnit`, `normalizedValue`, `normalizedUnit`, and the ordered conversion records.

Declared factors are cross-checked at registration: a pair that also exists in `STANDARD_UNIT_CONVERSIONS` must agree on factor and offset within `1e-12` relative, every declared pair with a declared inverse must satisfy `|f(a→b) × f(b→a) − 1| ≤ 1e-12` with a matching round-trip offset, and a declared direct pair must agree with its composed multi-hop chain within `1e-12`. Typo'd factors, inconsistent inverses, and disagreeing chains each fail to register.

### Input validation: missing, non-finite, negative, out of range; no clamping

Validation runs in the submitted unit before conversion and never clamps or corrects a value.

- Missing required input returns `invalid-input` with code `missing-required`. An omitted optional input is accepted and echoed with null submitted value, null submitted unit, null normalized value, and no conversions. Omitted optional inputs reach `compute` as `undefined` (never zero-filled); the contract suite spies on `compute` to pin this and asserts an omitted result that differs from the explicit-zero result.
- A non-object input shape returns `invalid-input-shape`. An `inputs` object that is not a record, an unknown input id, and a malformed field shape are reported at field level; an unknown id uses `unexpected-input`.
- A value that is not a finite number returns `invalid-value`. The suite covers `NaN`, positive `Infinity`, and negative `Infinity`.
- A negative value returns `negative-not-allowed` unless the input sets `allowNegative` to true.
- A value outside the declared plausible range for the submitted unit returns `out-of-range`, naming the submitted unit. After conversion the normalized value is also checked against the canonical-unit range when one is declared; a converted value outside it returns `out-of-range` naming the canonical unit. Exact minimum and maximum values are accepted.

Unit-shape failures return `unit-error` instead: `unit-missing` for an absent or blank unit, `unit-not-allowed` for a unit outside `allowedUnits`, `conversion-unavailable` when no declared path or no declared range connects the submitted unit to the canonical unit, and `conversion-failed` when the declared conversion does not produce a finite value.

### Population guards

Guards run on normalized canonical-unit values after validation passes and before `compute` is called. Every formula registers at least one guard. Supported operators are `between`, `at-least`, and `at-most`; any other operator is rejected at registration, and a stored guard with an unmatched operator resolves to `unavailable` instead of silently reporting no hit. Bounds are inclusive: `between` hits only outside the closed interval, `at-least` hits only below its value, and `at-most` hits only above its value. A hit returns `out-of-population` with structured `limitsHit` entries carrying the guard id, input id, operator, actual value, bound values, unit, and message. The suite asserts `compute` is not called when a guard is hit, and pins the inclusive boundary plus the just-outside hit for each operator.

### Result union and always-present metadata

Every result carries `formulaId`, `formulaVersion`, `formulaTitle`, `primaryReference`, `limitations`, `reviewStatus`, `reviewMarker`, `inputEcho`, and an optional `deprecationNotice`. Known formulas echo one entry per declared input. Unknown id and version combinations carry null title, reference, and review status with an empty echo.

The result union is `ok` with display value, unrounded value, unit, precision, rounding metadata, and an optional `classification`; `invalid-input` with `errors`; `out-of-population` with `limitsHit`; `unit-error` with `unitErrors`; and `unavailable` with a sanitized `reason`.

### Unreviewed marker

A definition with review status `unreviewed` returns marker `UNREVIEWED`. A test-only clinically-reviewed definition returns `CLINICALLY REVIEWED` with its reviewer and date echoed. An unregistered id and version returns `UNAVAILABLE`. All synthetic engine fixtures are unreviewed.

### Throwing formulas, registries, and requests become unavailable

A `compute` function that throws returns `unavailable` with the fixed reason that the pinned formula could not be computed. The exception message is not exposed. A `compute` function that returns a non-number or a non-finite number returns `unavailable` with the fixed reason that the formula did not return a finite result. Registry lookup and input validation run inside the same containment: a throwing input getter, or a null registry or request, resolves to `unavailable` with a sanitized reason instead of throwing. Nothing is logged.

### Rounding: display versus unrounded

An `ok` result keeps both numbers. `unroundedValue` is the raw finite `compute` output. `displayValue` is display-only: that value rounded to the declared output precision. Cutoff decisions must use `unroundedValue`; the optional `classify` hook receives only the unrounded value and its frozen result is exposed as `classification` on `ok` results. The rounding metadata always reports mode `half-away-from-zero` with the output precision and `roundingRuleReviewed: false`, marking the tie rule as pending owner review.

Ties are decided half away from zero on the exact stored binary value. Scaling a binary double by a power of ten can itself round (the stored `2.675` sits just below the decimal tie, yet `2.675 * 100` evaluates to exactly `267.5` in floating point), so the implementation decomposes the double into its exact binary expansion and rounds the exact scaled magnitude instead of using an epsilon nudge. Decimal ties stored just below the tie therefore round down: `1.005` and `2.675` at precision two give `1.00` and `2.67`, while exactly representable ties still round away from zero (`2.5` gives `3` and `-2.5` gives `-3` at precision zero; `0.49999999999999994` gives `0`). A rounding step that cannot produce a finite value returns `unavailable` with the fixed reason that the result could not be rounded safely.

### Classification uses the unrounded value

A definition may declare `classify`, invoked once per `ok` calculation with the unrounded compute output only. A synthetic cutoff-25 formula returning `24.999999` at precision two displays `25` while classifying into the below-25 category, pinning that the display value never feeds the decision. A throwing or malformed `classify` resolves to `unavailable` with a sanitized reason.

### Review fixes (PR #22)

An independent review of PR #22 verified every finding below against the engine; each item landed test-first with its red/green logs in `docs/evidence/milestone-11-2026-10-12/`:

1. Unknown guard operators are rejected at registration, and a stored guard with an unmatched operator resolves to `unavailable` (`pr22-1`).
2. Declared conversion factors must agree with the standard table, have round-trip consistent inverses, and agree with their composed chains, all within `1e-12` (`pr22-2`).
3. The canonical-unit plausible range is validated after conversion, with the offending unit named (`pr22-3`).
4. Every formula registers at least one population guard, matching the adult-only v1 decision (`pr22-4`).
5. Rounding is half away from zero on the exact binary value with no epsilon nudge, truthfully reported with `roundingRuleReviewed: false` (`pr22-5`).
6. Classification runs on the unrounded value only; `displayValue` is documented display-only (`pr22-6`).
7. `get` returns a read-only metadata view without `compute`; `calculateFormula` stays the only path to a number (`pr22-7`).
8. The standard conversion table test asserts the exact whole table with every factor pinned (`pr22-8`).
9. `at-least` and `at-most` guards have inclusive-boundary and just-outside cases on the fixtures (`pr22-9`).
10. Registry lookup and input validation failures resolve to `unavailable` with a sanitized reason (`pr22-10`).
11. Omitted optional inputs reach `compute` as `undefined` with a pinned non-zero-filled result (`pr22-11`).

Credit for finding these goes to the independent review; the implementation above addresses each one.

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
- `synthetic-optional-input` adds an optional third input that contributes `7` when omitted. It exercises omission of a non-required input with a result distinct from the zero-filled one.
- `synthetic-divergent-narrow` and `synthetic-divergent-wide` reuse the linear compute with divergent concentration ranges. They exercise the canonical-range check in both directions.
- `synthetic-at-least-guard` and `synthetic-at-most-guard` add inclusive floor and ceiling guards on the concentration. They exercise the `at-least` and `at-most` boundary paths.
- `synthetic-versioned` `1.0` is deprecated and sums both inputs; `2.0` halves the concentration term. The pair exercises pinned resolution, version listing, and deprecation.
- `synthetic-throwing` throws with a message containing private input text. It exercises sanitized `unavailable` handling and the no-logging assertion.

`describeFormulaContract` in `tests/domain/calculators/describe-formula-contract.ts` runs the same contract against each fixture: the declared positive case with provenance and optional expected value, exact minimum and maximum range boundaries, `negative-not-allowed`, `out-of-range`, `missing-required`, `invalid-value` for `NaN` and both infinities, declared conversion recorded in the input echo with a normalized value assertion, `unit-not-allowed` for an unlisted unit, a structured `out-of-population` hit, canonical-range cases for the divergent fixtures, and, for the optional fixture, omission pinned by a compute spy with a value distinct from the zero-filled result. Every case also asserts provenance: formula id and version, primary reference, limitations, review status, review marker, and input-echo length.

## Traceability

Test names below are the current suite names. `contract` rows run once per fixture through `describeFormulaContract`.

| Requirement or rule                                                                                                                   | Tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Status                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M11 acceptance: positive, negative, boundary, missing, and unit-conversion fixtures                                                   | contract `computes the declared positive case with provenance`; contract `accepts exact minimum range boundary`; contract `accepts exact maximum range boundary`; contract `returns negative-not-allowed`, `returns out-of-range`, `returns missing-required`, `rejects NaN input values`, `rejects infinite input values`, `rejects negative infinite input values`; contract `records declared unit conversions in the input echo`; contract `rejects undeclared units with a field-level unit error`                                                                                                                                                                                                                          | Covered for synthetic fixtures                                                                                                                            |
| M11 acceptance: independent formula versions and clinical review                                                                      | `lists registered versions explicitly without selecting one as latest`; `resolves a pinned deprecated version and includes its notice in the result`; `includes reviewer and date metadata for a test-only reviewed status`; contract positive and provenance checks for both `synthetic-versioned` versions                                                                                                                                                                                                                                                                                                                                                                                                                     | Covered for synthetic versions and a test-only review record. Gap: no real formula has a named clinical reviewer or review date.                          |
| M11 acceptance and safety: no silent formula switch                                                                                   | `requires an explicit id and version without substituting a registered version`; `rejects duplicate id/version registration instead of replacing a formula`; `rejects malformed runtime definitions with structured registration errors`; `keeps a registration-time snapshot of plausible input ranges`                                                                                                                                                                                                                                                                                                                                                                                                                         | Covered for the engine mechanism                                                                                                                          |
| M11 acceptance: results show source, units, and limitations                                                                           | contract provenance assertion on every case; `makes the unreviewed marker explicit on every result`; `rounds only the display value and retains the unrounded result`; conversion echo assertions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Covered for synthetic provenance                                                                                                                          |
| M11 acceptance: no patient storage, auto-population, or unsourced dosing                                                              | `does not return patient identifiers or other request metadata`; `does not log thrown formula errors or expose the exception message`; no dosing path exists in the engine                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Covered for the engine mechanism. Gap: no UI auto-population path exists yet to test.                                                                     |
| Clinical safety: named primary source, explicit version, units, intended population, limitations, boundary and missing-data tests     | contract boundary, missing, conversion, and population cases; provenance assertions; population text and guard assertions in the registry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Partly covered for synthetic definitions. Gap: intended population is fictional fixture text; no real indication, exclusion, or population review exists. |
| Clinical safety: do not treat a renal estimate as a complete prescribing decision                                                     | No renal estimate exists in the engine                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Gap: no renal formula is implemented, so no dosing-inference wording is exercised.                                                                        |
| Clinical safety: initial inputs ephemeral, without patient profiles                                                                   | Engine holds no storage; identifier tests above                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Covered for the engine. Gap: the later patient workspace auto-population rule is out of scope.                                                            |
| Clinical safety: every high-impact rule has tests; preserve provenance; never hide missing data; do not interpret absence as normal   | contract missing, unexpected-input, population, and unavailable cases; metadata assertions on every branch including unknown versions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Covered for synthetic engine branches                                                                                                                     |
| Clinical safety: guideline-backed recommendations point to evidence source and version; show old, superseded, or conflicting evidence | `resolves a pinned deprecated version and includes its notice in the result`; provenance carries the primary reference and limitations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Partly covered as a deprecation mechanism. Gap: no guideline recommendation or supersession wording is implemented.                                       |
| Testing: conversions and invalid and out-of-range handling                                                                            | `pins the exact standard mass and length conversion table`; `applies a standard conversion only when the formula declares its unit map`; contract conversion and range cases; `rejects values that convert outside the canonical plausible range`; `rejects out-of-range submitted values even when the canonical value is plausible`                                                                                                                                                                                                                                                                                                                                                                                            | Covered for synthetic and standard pairs                                                                                                                  |
| Testing: prevent silent substitution; inputs remain ephemeral                                                                         | Registry pinning tests; identifier and logging tests                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Covered for the engine                                                                                                                                    |
| Testing: clinically review reference cases                                                                                            | Contract expected values are synthetic arithmetic, not clinical oracles                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Gap: no clinically reviewed reference case exists.                                                                                                        |
| Testing and requirements: BMI, BSA, eGFR, CrCl, corrections, Caprini, SOFA and qSOFA, Child-Pugh and MELD, Wells, and other tools     | No test covers a real tool                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Gap: deferred until the owner selects real formulas and each passes clinical and rights review.                                                           |
| Requirements: modular framework with documented and tested versions; formula tests and boundary cases                                 | Public API test; contract suite; full gate below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Covered for the framework only                                                                                                                            |
| Review fixes (PR #22, independent review)                                                                                             | `rejects a guard with an unknown operator at registration`; `returns unavailable when a stored guard has an unknown operator`; conversion consistency rejections (standard typo, inverses, chain); canonical-range contract cases; `rejects registration with an empty population guard list`; binary-value rounding table; `classifies from the unrounded value, not the display value`; `exposes only metadata without compute from get`; `pins the exact standard mass and length conversion table`; `at-least`/`at-most` boundary cases; `returns unavailable when reading inputs throws`; `returns unavailable for a null registry without throwing`; `omits the optional input from compute values with a distinct result` | Covered for the synthetic engine; see `### Review fixes (PR #22)`                                                                                         |

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
| `pr22-1-red.log` / `pr22-1-green.log`             | Unknown guard operators are rejected, then contained as unavailable.                                        |
| `pr22-2-red.log` / `pr22-2-green.log`             | Conversion consistency checks reject typo'd, inverse-breaking, and chain-breaking factors.                  |
| `pr22-3-red.log` / `pr22-3-green.log`             | The canonical plausible range is validated after conversion.                                                |
| `pr22-4-red.log` / `pr22-4-green.log`             | Registration requires at least one population guard.                                                        |
| `pr22-5-red.log` / `pr22-5-green.log`             | Rounding decides ties on the exact binary value with an unreviewed-rule flag.                               |
| `pr22-6-red.log` / `pr22-6-green.log`             | Classification runs on the unrounded value only.                                                            |
| `pr22-7-red.log` / `pr22-7-green.log`             | `get` returns a metadata view without `compute`.                                                            |
| `pr22-8-red.log` / `pr22-8-green.log`             | The vacuous table checks fail on a typo while the exact table pins every factor.                            |
| `pr22-9-red.log` / `pr22-9-green.log`             | The contract helper cannot type `at-least`/`at-most` guards, then models and bounds them.                   |
| `pr22-10-red.log` / `pr22-10-green.log`           | Lookup and validation failures escape, then resolve to unavailable.                                         |
| `pr22-11-red.log` / `pr22-11-green.log`           | Omitted optional inputs are zero-filled, then pinned as undefined with a distinct result.                   |

Focused calculator results: one file, 153 tests passed, recorded in the `pr22-11-green.log` log (89 before the review fixes).

Full gate results from the implementer's log: format, lint, typecheck, unit tests, architecture boundaries, audit, production build, distribution scan, and browser tests all passed. The unit suite recorded 59 files with 1,028 tests passed. The browser suite recorded 160 tests passed and 2 skipped.

The orchestrator re-ran the gate at `a0c9469`: format, lint, typecheck, unit tests (59 files, 1,028 passed), and boundaries all passed under Node `24.21.0` and Node `22.23.2`.

The review-fix worker re-ran the gates on this branch from PowerShell: format, lint, typecheck, and boundaries pass. The unit suite records 59 files with 1,092 tests, 1,091 passed; the single failure is the pre-existing `tests/importer/artifact.test.ts` OS-temp case, which fails only under PowerShell-launched `threads` workers whose environment lacks `SystemRoot` (the same test passes under `forks` and plain Node, and its build step succeeds). It is unrelated to the calculator engine and lives in an area this milestone must not touch.

## Open items

- Selection of real formulas belongs to the owner, starting from the source assessment.
- Each selected formula needs a named clinical reviewer with a review date, and a per-formula rights review covering implementation, wording, attribution, adaptation, translation, commercial distribution, and offline scope.
- At the M11a review snapshot, the tie-breaking rule and real-formula selection still awaited the owner's decision; the engine used exact-binary rounding with `roundingRuleReviewed: false`. The M11b owner-decision section below supersedes that snapshot with the current calculator-specific presentation and component sign-off requirements.
- Romanian applicability, excluded and uncertain states, missing-data policy, and display conventions need per-formula review.
- The calculator UI, including source, units, limitations, version, deprecation, and review-marker display, is not implemented.
- Real-device, accessibility, privacy, security, and release hardening repeat under Milestone 12 for the expanded rollout.

## BMI and Mosteller BSA candidates (M11b)

Date: 2026-10-12. Branch `codex/m11-bmi-bsa`, PR #26, implementation verified at `0e93856` after merging main. Commit `ee56daa` applies the owner's decisions, `36d4fed` records their checks, and `0e93856` clarifies adult-only release scope. Definitions are in `packages/domain/src/calculators/bmi-bsa.ts`; engine, types, registry and approval logic are in the same directory. Tests are in `tests/domain/calculators/bmi-bsa.test.ts` and `tests/domain/calculators/calculator-engine.test.ts`. Both candidates remain `unreviewed` with marker **UNREVIEWED**: implementing the decisions does not supply final clinical sign-off. The M11a sections above describe historical behavior, not the current candidate policies below.

### Owner directives and component approvals

The owner's 2026-10-12 directives require explicit versioned approval, calculator-specific rounding, and MDCalc only for manual cross-checking. MDCalc is not a primary reference, automated oracle or source of copied implementation/content.

`FormulaComponentVersions` separates formula arithmetic, population scope, classification, presentation and confirmation. Current component versions are:

| Component        | BMI (`bmi`) | Mosteller BSA (`bsa-mosteller`) |
| ---------------- | ----------- | ------------------------------- |
| `formula`        | `1.0.0`     | `1.0.0`                         |
| `population`     | `2.1.0`     | `2.1.0`                         |
| `classification` | `2.0.0`     | Absent: no classifier           |
| `presentation`   | `2.0.0`     | `2.0.0`                         |
| `confirmation`   | `1.0.0`     | `1.0.0`                         |

`getFormulaVersionId` in `types.ts` produces the exact composite lookup version in formula/population/classification/presentation/confirmation order, omitting absent components:

- BMI: `formula=1.0.0|population=2.1.0|classification=2.0.0|presentation=2.0.0|confirmation=1.0.0`.
- BSA: `formula=1.0.0|population=2.1.0|presentation=2.0.0|confirmation=1.0.0`.

The exported `BMI_FORMULA` and `MOSTELLER_BSA_FORMULA` definitions are deeply frozen at module load (commit `8518b6b`, review follow-up), so their inputs, limitations, output and compute cannot be mutated before registration under an unchanged composite id. These composite strings, together with the formula id, pin calculations and golden vectors; the former plain `1.0.0` lookup is not the current registered candidate version. Registration rejects a composite id inconsistent with its component set, unknown/malformed components, a classification version without a classifier (or the reverse), and a confirmation version without non-empty soft checks (or the reverse).

At this PR #26 snapshot, `packages/domain/src/calculators/approvals.ts` exported a frozen, **empty** `FORMULA_APPROVALS` register; the current register is described under "Owner approval (2026-10-14)" below. Approval records now identify `formulaId`, `component`, `componentVersion`, `approvedBy`, `approvedOn` and `scope`. A component approval requires an exact id/component/version match, non-empty approver/scope and a parseable approval date. Registering a `clinically-reviewed` definition also requires a reviewer and valid review date, plus approval for **every declared current component version**. Approval of arithmetic alone cannot approve population, classification, presentation or confirmation behavior. The previous whole-version reviewer/date equality check is no longer the approval model.

`pendingApprovals(registry)` returns frozen pending entries containing the formula id, composite formula version, component and component version, sorted by id/version and component order. At the PR #26 snapshot, with both candidates registered and the register empty, all **nine** declared components were pending (five BMI, four BSA); it is no longer a list of just two unreviewed id/version pairs.

### Formula references, units and release scope

| Calculator    | Implemented arithmetic and output               | Declared reference                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BMI           | `weightKg / (heightM * heightM)`, `kg/m²`       | Formula citation: Keys A, Fidanza F, Karvonen MJ, Kimura N, Taylor HL. _Indices of relative weight and obesity._ J Chronic Dis. 1972;25:329–343, with historical attribution to Quetelet (1835). The definition now also cites WHO _Obesity: Preventing and Managing the Global Epidemic_, Technical Report Series 894 (2000), and its reference URL is the [WHO publication record](https://iris.who.int/handle/10665/42330). |
| Mosteller BSA | `Math.sqrt((heightCm * weightKg) / 3600)`, `m²` | Mosteller RD. _Simplified calculation of body-surface area._ N Engl J Med. 1987;317:1098. [DOI 10.1056/NEJM198710223171717](https://doi.org/10.1056/NEJM198710223171717).                                                                                                                                                                                                                                                      |

Both require manually submitted `weight`, `height` and `age`. Weight accepts `kg`/`lb` and normalizes to `kg`; height accepts `cm`/`m`/`in` and normalizes to `m` for BMI or `cm` for BSA; age accepts `years` only. Declared `STANDARD_UNIT_CONVERSIONS` retain `lb × 0.45359237 = kg`, `kg × 2.2046226218487757 = lb`, `in × 2.54 = cm`, and `cm × 0.01 = m`, with inverse and direct metre/inch rules. Computation uses normalized values without intermediate display rounding; `inputEcho` retains submitted values, normalized units and conversion steps.

**Adult-only is product release scope, not a claim of formula invalidity in children.** The current release accepts ages 18 years and older. Population `2.1.0` (commit `a75cd70`, review follow-up) widens the age input's technical range to 0–130 so that under-18 ages reach the inclusive `adult-age` guard: a submitted age of `17.999` (or `0`) returns `out-of-population` (outside this release's adult scope), not `invalid-input`. Negative ages and ages above 130 remain `invalid-input` / `out-of-range`. WHO BMI-for-age references include adolescents up to 19 years; that classification is not implemented. Assessment outside this release's adult scope requires separate evidence/review, and the BSA limitation explicitly avoids implying that Mosteller is inherently invalid for children.

**Technical bounds, not clinically validated plausibility thresholds:** weight **1–500 kg**, height **50–272 cm** (0.5–2.72 m), age **0–130 years** (under-18 ages pass the technical bound and are then stopped by the adult-scope guard). Pound bounds are `2.2046226218487757` through `500 * 2.2046226218487757`; inch bounds are `50 / 2.54` through `272 / 2.54`. Bounds are inclusive; outside values return `invalid-input` without clamping. Passing these technical bounds does not establish clinical plausibility or bypass confirmation checks. Endpoint tests acknowledge triggered checks before expecting an `ok` value, including age 130.

BMI remains a screening index, not a direct body-fat measure or diagnosis; muscle mass, pregnancy, amputation, edema/oedema and body-composition extremes can affect interpretation. The definition explicitly warns that **cardiometabolic risk may occur at lower BMI values in certain populations**. The international adult classification does not implement population-specific thresholds or assessment; any future population-specific assessment needs separate evidence, review and versioning. No ethnicity-specific thresholds, dose, diagnosis or treatment advice are supplied.

Mosteller BSA remains an estimate with no dosing advice, no Du Bois superiority claim and no automatic substitution. Applicability beyond source populations is unvalidated. Its explicit presentation limitation is: **the displayed rounded value must not be used as an implicit input for medication-dose calculations**. Original-paper rounding/derivation and instrument-specific reuse rights remain unverified as stated by the definitions. This change adds no calculator UI, patient persistence or auto-population.

### Confirmation checks (values approved by the owner as confirmation@1.0.0, 2026-10-14)

Both formulas declare the following soft checks inside the technical input bounds. The owner approved these values as confirmation prompts on 2026-10-14 (see "Owner approval" below); they remain confirmation prompts, **not clinically validated plausibility thresholds**:

| Check id                    | Trigger                                                                    |
| --------------------------- | -------------------------------------------------------------------------- |
| `weight-unusual`            | Weight `< 30` or `> 250 kg`                                                |
| `height-unusual`            | Height `< 130` or `> 220 cm`                                               |
| `age-over-110`              | Age `> 110 years`                                                          |
| `implied-bmi-outside-range` | Implied `weightKg / heightM²` `< 12` or `> 70 kg/m²`, for both BMI and BSA |

Exact soft-check endpoints do not trigger their respective check; other simultaneous checks can still trigger. Input-range bounds are converted to canonical units before comparison, and the implied-BMI check uses normalized kilograms/metres. After input validation and population guards, any unacknowledged hit returns the new **`confirmation-required`** status with shared metadata and `checks` (`id`, `inputIds`, `message`), **without** display/unrounded values or classification and before formula computation. The result includes all triggered hits, including already acknowledged hits when another remains outstanding.

The caller resubmits `confirmedChecks` as unique declared string ids. Non-arrays, duplicate/non-string ids and undeclared ids are rejected as invalid input. Every currently triggered check must be acknowledged before calculation proceeds; partial acknowledgement still returns `confirmation-required`. An `ok` result carries the triggered hits in `confirmedChecks` (an empty array when none trigger). Confirmation does not override technical bounds or grant clinical approval. The owner approved these values and this confirmation workflow as `confirmation@1.0.0` on 2026-10-14; the wording-only `confirmation@1.0.1` (messages without "proposed") remains pending separate approval.

### Decimal rounding and classification presentation

Each formula explicitly declares `output.rounding`; there is no default. BMI uses **`half-up-decimal`, precision 1**; BSA uses **`half-up-decimal`, precision 2**. In `calculate.ts`, rounding parses `Math.abs(value).toString()` (the shortest round-trip decimal, including exponent notation), uses `BigInt` coefficient/scale and quotient/remainder arithmetic to round the decimal magnitude, rebuilds decimal text, and converts it back to a finite number. It does not make these candidates' tie decisions from the exact binary expansion or an epsilon adjustment. For the positive candidate values, a decimal half tie rounds up. Results retain raw `unroundedValue`, numeric `displayValue`, units, precision and declared rounding metadata; they do not add trailing-zero characters to the numeric value.

Tests pin BMI `22.85 → 22.9`, and BSA `1.005 → 1.01`, `2.675 → 2.68`, `0.125 → 0.13` (with required confirmations for unusual inputs). These are engineering presentation cases, not original-publication rounding mandates. The engine still supports the earlier binary mode for other explicitly declared definitions; neither current BMI nor BSA candidate selects it.

BMI returns **WHO international adult classification, WHO Technical Report Series 894 (2000)** labels based on the **unrounded** BMI. Each full label starts with that exact phrase followed by `: ` and the suffix below:

| Unrounded BMI (`kg/m²`) | Exact code                                | Label suffix           |
| ----------------------- | ----------------------------------------- | ---------------------- |
| `< 18.5`                | `who-international-adult-underweight`     | Underweight            |
| `18.5` to `< 25`        | `who-international-adult-normal`          | Normal range           |
| `25` to `< 30`          | `who-international-adult-pre-obese`       | Pre-obese (overweight) |
| `30` to `< 35`          | `who-international-adult-obese-class-i`   | Obese class I          |
| `35` to `< 40`          | `who-international-adult-obese-class-ii`  | Obese class II         |
| `>= 40`                 | `who-international-adult-obese-class-iii` | Obese class III        |

The pure classifier is also evaluated on the display value solely to detect a presentation boundary crossing. If its code differs from the actual unrounded classification, `classificationNote` explains both values/units and the display-derived category; the returned `classification` remains unchanged. For example, `24.96` displays `25.0` in the note while retaining `who-international-adult-normal`; the note explains that the display would fall in the pre-obese category. No note is emitted when codes agree. Mosteller BSA has no classifier, classification component, category or classification note. The owner approved this WHO classification behavior and note as BMI `classification@2.0.0` on 2026-10-14; the wording-only `presentation@2.0.1` remains pending separate approval.

### Golden vectors, revalidation and failure paths

`tests/domain/calculators/bmi-bsa.test.ts` pins the following vectors to each candidate's **current composite version above**, with age 30 years. These are engineering regression cases, not owner-approved clinical oracles:

| Calculator | Weight (`kg`) | Height (`cm`) | Expected unrounded value | Expected numeric display                   |
| ---------- | ------------- | ------------- | ------------------------ | ------------------------------------------ |
| BMI        | 70            | 175           | `22.857142857142858`     | `22.9`                                     |
| BMI        | 100           | 200           | `25`                     | `25` (`who-international-adult-pre-obese`) |
| BMI        | 56.65625      | 175           | `18.5`                   | `18.5` (`who-international-adult-normal`)  |
| BSA        | 70            | 175           | `1.8446619684315546`     | `1.84`                                     |
| BSA        | 80            | 180           | `2`                      | `2`                                        |
| BSA        | 50            | 160           | `1.4907119849998598`     | `1.49`                                     |

A change to formula arithmetic, population limits, classification, display/rounding or confirmation policy needs the corresponding component version and exact composite lookup identity, affected golden/boundary/negative/missing/conversion/confirmation tests, and an approval record for each changed component before clinical review can be claimed. Approval of an unchanged component does not approve a changed component. Shared engine/conversion changes require revalidation of every affected candidate. Component identity and approval matching are registry checks; the broader revalidation obligation remains a review/release rule, not automatic clinical approval.

Both candidates still run `describeFormulaContract` and test six accepted mass/length combinations, conversion echoes/round trips, missing/zero/negative and non-finite inputs, unsupported units, technical endpoints and just-outside rejection. Added tests cover composite versioning, per-component pending approvals, decimal rounding, exact/just-below WHO cutoffs and classification notes, each proposed soft-check trigger/endpoints, and partial/full acknowledgement. Engine tests retain malformed null/string/number requests (`unavailable`), malformed null/array/string/number `inputs` (`invalid-input-shape`), throwing getters/null registry containment, and synthetic `compute` outputs `NaN`, positive infinity, string or `undefined` (`unavailable`, sanitized reason `The pinned formula did not return a finite result.`). Private output text is not exposed.

### Recorded checks and post-merge verification

Logs are in `docs/evidence/milestone-11-2026-10-12/`. Earlier `bmi-bsa-*.log` totals describe the initial candidate implementation, not these owner-decision changes.

| Owner-decision log          | Recorded result                                                                                                                                                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `owner-decisions-red.log`   | Focused feature-red run, exit 1: 2 files failed; 157 failed / 87 passed (244 total).                                                                                                                                                                                                 |
| `owner-decisions-green.log` | Focused engine/candidate run, exit 0: 2 files / 244 passed.                                                                                                                                                                                                                          |
| `owner-decisions-check.log` | Full `npm run check`, exit 0: format, lint, typecheck, unit **62 files / 1,293 passed**, boundaries (111 source files), audit (0 vulnerabilities), build, distribution scan, browser **160 passed / 2 skipped**. Toolchain: Node `24.21.0`, npm `11.19.0`, secondary Node `22.23.2`. |

The orchestrator's rerun after merging main reports **1,326 unit tests passed**. This later total is separate from the owner-decision log's pre-merge 1,293 tests; the older M11b documentation run at `ae64a3b` (1,273 tests) is also superseded for the current baseline. No post-merge audit/build/browser rerun is inferred from these unit results. Automated checks do not establish clinical sign-off, source/reuse-rights verification, UI acceptance or real-device acceptance.

The documentation worker independently reran lint, typecheck, unit tests and architecture boundaries at `0e93856` with Node `24.21.0`, npm `11.19.0` and Node `22.23.2` configured through `INTERMED_NODE22_RUNTIME`: **66 files / 1,326 tests passed**, and boundaries passed for **119 source files**. The updated document also passed `npx prettier --write` and `npm run format:check`. Only this evidence document was changed.

### Owner clinical sign-off items (PR #26 snapshot)

These items were presented to the owner for sign-off at PR #26. The per-component approvals were granted on 2026-10-14 (see "Owner approval (2026-10-14)" below); the wording-bump versions `presentation@2.0.1` and `confirmation@1.0.1` remain pending, and the reference/rights evidence gaps in the last item remain open.

- **Per-component approvals:** all current BMI components (`formula@1.0.0`, `population@2.1.0`, `classification@2.0.0`, `presentation@2.0.0`, `confirmation@1.0.0`) and BSA components (`formula@1.0.0`, `population@2.1.0`, `presentation@2.0.0`, `confirmation@1.0.0`), with approver, date and scope. Approved 2026-10-14 and recorded in `FORMULA_APPROVALS`.
- **Population policy and limitations:** adult-only release (age ≥ 18, under-18 returns out-of-population) as product scope, WHO BMI-for-age through 19 not implemented, lower-BMI cardiometabolic-risk population warning and no population-specific thresholds; no claim that Mosteller is invalid for children.
- **Technical bounds and proposed confirmation policy:** bounds 1–500 kg / 50–272 cm / 0–130 years are not clinically validated; proposed soft checks weight `<30`/`>250 kg`, height `<130`/`>220 cm`, age `>110 years`, implied BMI `<12`/`>70 kg/m²`, including endpoint behavior and acknowledgement of every triggered check.
- **WHO classification behavior:** international adult labels/cutoffs applied to the unrounded result, their intended population/application at ages 18–19, and the boundary-crossing `classificationNote`.
- **Presentation:** decimal half-up from the shortest decimal, BMI 1 dp / BSA 2 dp, and the explicit prohibition on using displayed rounded BSA as an implicit medication-dose input.
- **Clinical/reference and rights evidence:** clinical reference vectors, original publication/derivation and instrument-specific reuse rights remain unverified; MDCalc is supplementary manual cross-checking only. Calculator UI and Milestone 12 hardening remain separate acceptance gates.

### Owner approval (2026-10-14)

On 2026-10-14 the owner (a surgeon, the project's clinical reviewer) wrote: "approve #26 all components". This approves exactly these component versions:

| formulaId     | component      | version |
| ------------- | -------------- | ------- |
| bmi           | formula        | 1.0.0   |
| bmi           | population     | 2.1.0   |
| bmi           | classification | 2.0.0   |
| bmi           | presentation   | 2.0.0   |
| bmi           | confirmation   | 1.0.0   |
| bsa-mosteller | formula        | 1.0.0   |
| bsa-mosteller | population     | 2.1.0   |
| bsa-mosteller | presentation   | 2.0.0   |
| bsa-mosteller | confirmation   | 1.0.0   |

These 9 records are frozen in `packages/domain/src/calculators/approvals.ts` with `approvedBy: 'Project owner (surgeon, clinical reviewer)'`, `approvedOn: '2026-10-14'`, and `scope: 'Adult (18+) candidate as presented for PR #26 sign-off; synthetic-data development build only'`.

Wording-only change after approval: soft-check messages drop the word "proposed", `SOFT_CHECK_LIMITATION` becomes "Confirmation is required for: weight below 30 kg or above 250 kg; height below 130 cm or above 220 cm; age above 110 years; implied BMI below 12 or above 70 kg/m².", BMI limitation 1 becomes "WHO international adult classification uses thresholds from WHO Technical Report Series 894 (2000) and applies categories to the unrounded BMI value.", and the BSA "Behavior is proposed, pending owner sign-off." limitation is deleted. No number, threshold, rounding, input, unit or formula changed. This bumps `presentation` 2.0.0 → **2.0.1** and `confirmation` 1.0.0 → **1.0.1** for both formulas.

Presentation 2.0.1 and confirmation 1.0.1 are not approved yet and await separate owner approval, so `reviewStatus` stays `unreviewed` for both candidates. Presentation 2.0.1 also rewords the rounding-boundary `classificationNote` to name the actual category and state the scheme once — e.g. "Classified as Normal range from the unrounded value 24.96 kg/m² (WHO international adult classification, WHO Technical Report Series 894 (2000)). The displayed value 25.0 kg/m² would fall in Pre-obese (overweight); the classification uses the unrounded value." — while the classification behaviour itself is unchanged.

## M11d — CKD-EPI 2021 creatinine candidate (pending owner sign-off)

Date: 2026-10-14. Branch `claude/m11-ckd-epi`. Definition in `packages/domain/src/calculators/ckd-epi.ts`; tests in `tests/domain/calculators/ckd-epi.test.ts`; categorical engine extension in `packages/domain/src/calculators/{types,inputs,calculate,registry}.ts` with fictional coverage in `tests/domain/calculators/calculator-fixtures.ts` and `tests/domain/calculators/calculator-engine.test.ts`. The candidate remains `unreviewed` with marker **UNREVIEWED**: nothing in this work is clinically approved.

### Formula and source

The 2021 race-free CKD-EPI creatinine equation (Inker LA et al. New creatinine- and cystatin C-based equations to estimate GFR without race. _N Engl J Med._ 2021;385:1737–1749, Table 2; [DOI 10.1056/NEJMoa2102953](https://doi.org/10.1056/NEJMoa2102953); coefficients confirmed by NIDDK):

```text
eGFR [mL/min/1.73 m²] = 142 × min(Scr/κ,1)^α × max(Scr/κ,1)^−1.200
                       × 0.9938^age × (1.012 if female)
Scr = IDMS-traceable mg/dL; age = years, ≥ 18
Female: κ = 0.7, α = −0.241; male: κ = 0.9, α = −0.302
```

Inputs are `creatinine` (quantity kind `serum-creatinine`, canonical `mg/dL`, allowed `mg/dL` and `µmol/L`, conversion **µmol/L → mg/dL ÷ 88.4** applied unrounded before the κ branch), `age` (years), and `sex` (category, options `female`/`male`, labelled "Sex used by the equation (female/male coefficients)"). No classification component is declared: KDIGO G-stages are a separate, unapproved decision and are not implemented. No confirmation component is declared: no soft checks were added.

### Engine categorical-input extension

`FormulaInputDefinition` gains an optional discriminant `kind?: 'quantity' | 'category'` (absent means quantity, so every existing BMI/BSA definition is unchanged). A category input declares `options: readonly { id; label }[]` and no units or ranges; registration rejects categorical units/ranges and numeric options. Requests carry e.g. `inputs.sex = { category: 'female' }`: an unknown option or a missing required category returns `invalid-input`, as does a numeric value for a category input or a category for a numeric input. `compute`/`classify` receive categories in a separate typed map (`categories?: Readonly<Record<string, string | undefined>>`), never as magic numbers in `values`. `inputEcho` carries `kind` on every entry and echoes the selected option id and label (`submittedCategory`, `selectedOptionId`, `selectedOptionLabel`); quantity echoes are unchanged apart from the added `kind: 'quantity'`. Population guards and soft checks must reference numeric inputs. BMI/BSA behaviour and versions are untouched.

### Component versions

`egfr-ckd-epi-2021-cr`, composite `formula=1.0.0|population=1.0.0|presentation=1.0.0`: formula `1.0.0`, population `1.0.0`, presentation `1.0.0`, no classification, no confirmation. `FORMULA_APPROVALS` holds only the nine BMI/BSA records from the 2026-10-14 owner approval; this work adds none, so all three CKD-EPI components are pending. Registering a `clinically-reviewed` copy throws without exact approvals.

### Proposed presentation

Output unit `mL/min/1.73 m²`, rounding `half-up-decimal` precision 0 (integer display), proposed pending owner sign-off. Classification is decided from the unrounded value; this candidate has no classifier.

### Limitations

Visible definition text covers: stable adult kidney function only; not for AKI, dialysis or pregnancy; unreliable with extremes of muscle mass, amputation, malnutrition or obesity; requires an IDMS-traceable creatinine assay; the cystatin C equations are separate and not implemented; not Cockcroft–Gault and not for dosing, and de-indexing by BSA does not authorise dosing; no CKD diagnosis or staging from a single value; Romanian population suitability and the sex-coefficient selection need clinical review; display precision is proposed, pending owner sign-off; plus the technical-bounds notice (creatinine 0.1–20 mg/dL / 8.84–1768 µmol/L, age 0–130, labelled not clinically validated).

### Fixtures

Derived fixtures (tolerance 1e-8 on `unroundedValue`, age 60): Scr 1 mg/dL male `86.1626207797`, female `64.4950003539`; male Scr 0.9 `97.7750144829`; female Scr 0.7 `98.9483146567`. Knot continuity within 1e-6 relative on either side of κ per sex. SI check: 88.4 µmol/L equals 1 mg/dL with a visible conversion echo. Age 17 → `out-of-population`, 18 → `ok`. Integer display keeps the unrounded value. The definition is deeply frozen.

### Open owner decisions

1. Integer display (half-up to 0 dp).
2. The sex-coefficient wording ("Sex used by the equation (female/male coefficients)").
3. The adult-only scope (age ≥ 18 `out-of-population`).
4. The technical bounds (creatinine 0.1–20 mg/dL, age 0–130, not clinically validated).
5. Whether to add soft checks (none declared; confirmation component omitted).
6. Romanian applicability, including the sex-coefficient selection.
