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
- The rounding tie-breaking rule needs an explicit, clinically reviewed decision. The source assessment records that nearest integer alone does not select a convention. Today the engine rounds half away from zero on the exact binary value with `roundingRuleReviewed: false`. The owner (a surgeon) is the project's clinical reviewer: the tie rule and the real-formula selection both await the owner's decision.
- Romanian applicability, excluded and uncertain states, missing-data policy, and display conventions need per-formula review.
- The calculator UI, including source, units, limitations, version, deprecation, and review-marker display, is not implemented.
- Real-device, accessibility, privacy, security, and release hardening repeat under Milestone 12 for the expanded rollout.

## BMI and Mosteller BSA candidates (M11b)

Date: 2026-10-12. Branch `codex/m11-bmi-bsa`, implementation verified at `ae64a3b` after merging main. Definitions are in `packages/domain/src/calculators/bmi-bsa.ts`; tests are in `tests/domain/calculators/bmi-bsa.test.ts` and `tests/domain/calculators/calculator-engine.test.ts`. Both exact versions are **UNREVIEWED candidates**, not clinically approved calculators or M11 clinical acceptance. The historical M11a evidence above remains a record of its earlier scope and runs.

### Owner directives, rounding and approval register

The owner's 2026-10-12 directives require explicit approval of each formula version, calculator-specific rounding, and MDCalc only for a manual cross-check. MDCalc is not a primary formula source, an automated oracle, or a source of copied implementation/content.

`FormulaOutputDefinition` now requires `output.rounding: { mode, precision }`. There is no default rounding policy. Registration rejects a missing declaration, unsupported mode, negative precision or non-integer precision. The only implemented mode is `half-away-from-zero`, evaluated on the exact stored binary value; the engine does not implement other calculator-specific modes. Each candidate declares this mode separately: BMI precision **1**, Mosteller BSA precision **2**. These are candidate display policies awaiting owner review, not verified original-paper rounding mandates. Results echo the declared mode and precision; M11b no longer emits the historical `roundingRuleReviewed: false` property. `unroundedValue` remains the compute result, and `displayValue` is display-only.

`packages/domain/src/calculators/approvals.ts` exports the frozen, **empty** `FORMULA_APPROVALS` register. A `clinically-reviewed` definition cannot register without an exact `formulaId` / `formulaVersion` approval record whose `approvedBy` and `approvedOn` match the reviewer's name and review date, and whose `scope` is non-empty. A reviewer/date label alone is rejected. An approval for one `id@version` does not approve another version. No approval record has been added by this work.

`pendingApprovals(registry)` delegates to `listPendingApprovals()`: it returns a frozen, sorted list of unreviewed id/version pairs. Registering these two candidates returns `bmi@1.0.0` and `bsa-mosteller@1.0.0`. Successful arithmetic does not change their `UNREVIEWED` marker.

### Pinned formulas, units and limitations

| Candidate             | Implemented formula and output                                      | Declared primary reference                                                                                                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bmi@1.0.0`           | `weightKg / (heightM * heightM)`, output `kg/m²`, precision 1       | Keys A, Fidanza F, Karvonen MJ, Kimura N, Taylor HL. _Indices of relative weight and obesity._ J Chronic Dis. 1972;25:329–343. [DOI 10.1016/0021-9681(72)90027-6](<https://doi.org/10.1016/0021-9681(72)90027-6>). The definition also preserves historical attribution to Quetelet (1835). |
| `bsa-mosteller@1.0.0` | `Math.sqrt((heightCm * weightKg) / 3600)`, output `m²`, precision 2 | Mosteller RD. _Simplified calculation of body-surface area._ N Engl J Med. 1987;317:1098. [DOI 10.1056/NEJM198710223171717](https://doi.org/10.1056/NEJM198710223171717).                                                                                                                   |

Both require manually submitted `weight`, `height`, and `age`. Weight accepts `kg` or `lb`, normalized to `kg`; height accepts `cm`, `m`, or `in`, normalized to `m` for BMI and `cm` for BSA; age accepts `years` only. Their declared mass/length maps use `STANDARD_UNIT_CONVERSIONS` in `packages/domain/src/calculators/units.ts`: `lb × 0.45359237 = kg`, `kg × 2.2046226218487757 = lb`, `in × 2.54 = cm`, and `cm × 0.01 = m`, with the inverse and direct metre/inch pairs also declared. Normalized values feed computation without intermediate display rounding; submitted values, normalized units and conversion steps remain in `inputEcho`.

Both declare the `adult-age` guard: age **at least 18 years**, inclusive. Valid subadult inputs such as `17.999 years` produce `out-of-population` before computation. Age input validation accepts 0–130 years so this guard can distinguish subadult scope from malformed/out-of-range input. The implemented calculated age range is therefore 18–130, with both endpoints tested.

**Engineering plausibility limits — pending owner review:** weight 1–500 kg; height 50–272 cm (0.5–2.72 m); age input 0–130 years with the adult guard above. Pound bounds are `2.2046226218487757` through `500 * 2.2046226218487757`; inch bounds are `50 / 2.54` through `272 / 2.54`. Endpoints are inclusive and tested in every accepted weight/height unit; just-outside values are rejected without clamping. These are engineering validation bounds, not clinically validated normal ranges or population evidence.

BMI limitations explicitly state that it is a screening index, not a direct body-fat measure or diagnosis. Muscle mass, pregnancy, amputation, edema/oedema and body-composition extremes can affect interpretation. No ethnicity-specific thresholds, dose, diagnosis or treatment advice are provided. Mosteller BSA is an estimate with no dosing advice; it differs from Du Bois, with no superiority claim or automatic substitution. Applicability beyond source populations is unvalidated; obesity, pregnancy, amputation, edema/oedema and pediatrics require review. Original-paper rounding/derivation checks and instrument-specific reuse rights remain unverified as recorded in the definitions and `docs/CALCULATOR_SOURCE_ASSESSMENT.md`. No calculator UI, patient persistence or auto-population is added.

### BMI WHO candidate categories — PENDING owner approval

The definition cites WHO Technical Report Series 894 (2000) for candidate adult categories. Their thresholds, labels, intended population and application to ages 18–19 remain **PENDING owner clinical approval**. The code applies them to the **unrounded** result, not the displayed number:

| Unrounded BMI (`kg/m²`) | Code              | Candidate label        |
| ----------------------- | ----------------- | ---------------------- |
| `< 18.5`                | `underweight`     | Underweight            |
| `18.5` to `< 25`        | `normal`          | Normal range           |
| `25` to `< 30`          | `pre-obese`       | Pre-obese (overweight) |
| `30` to `< 35`          | `obese-class-i`   | Obese class I          |
| `35` to `< 40`          | `obese-class-ii`  | Obese class II         |
| `>= 40`                 | `obese-class-iii` | Obese class III        |

Tests cover every exact cutoff and just-below value. For example, unrounded `24.96` displays `25` at precision 1 but retains code `normal`. BSA has no classification hook or returned category.

### Golden vectors and revalidation rule

`tests/domain/calculators/bmi-bsa.test.ts` pins these engineering vectors to each exact version; all use age 30 years. These are arithmetic regression cases, not owner-approved clinical oracles. Display values are numeric, so precision metadata, rather than trailing zero characters, declares the number of decimal places.

| Exact version         | Weight (`kg`) | Height (`cm`) | Expected unrounded value | Expected display value |
| --------------------- | ------------- | ------------- | ------------------------ | ---------------------- |
| `bmi@1.0.0`           | 70            | 175           | `22.857142857142858`     | `22.9`                 |
| `bmi@1.0.0`           | 100           | 200           | `25`                     | `25` (`pre-obese`)     |
| `bmi@1.0.0`           | 56.65625      | 175           | `18.5`                   | `18.5` (`normal`)      |
| `bsa-mosteller@1.0.0` | 70            | 175           | `1.8446619684315546`     | `1.84`                 |
| `bsa-mosteller@1.0.0` | 80            | 180           | `2`                      | `2`                    |
| `bsa-mosteller@1.0.0` | 50            | 160           | `1.4907119849998598`     | `1.49`                 |

Revalidation rule: a change to formula arithmetic, conversion factors, population guards, plausibility limits, rounding or classification requires rerunning that version's golden, boundary, negative, missing-input and conversion cases and reviewing the clinical meaning. A changed formula version needs its own pinned vectors and explicit owner approval; neither golden results nor approval carry forward automatically. Shared engine/conversion changes require revalidation of every affected registered version. The registry enforces exact-version lookup and approval matching; this broader revalidation rule is an owner review/release requirement, not an automatic approval mechanism.

### Contract and failure-path evidence

Both candidates run `describeFormulaContract` from `tests/domain/calculators/describe-formula-contract.ts`. Candidate tests cover positive arithmetic, all six accepted mass/length unit combinations per formula, conversion echoes and round trips, missing inputs, zero/negative weight and height, non-finite values for every input, unsupported units, adult boundaries, inclusive plausibility endpoints and just-outside rejection.

Engine tests additionally pin malformed runtime requests: null/string/number requests return `unavailable`; null/array/string/number `inputs` return `invalid-input` with `invalid-input-shape`; throwing input getters and a null registry are contained. Synthetic `compute` functions returning `NaN`, positive infinity, a string or `undefined` return `unavailable` with the sanitized reason `The pinned formula did not return a finite result.` Private output text is not exposed. These synthetic failure tests verify containment; they do not imply such outputs are valid BMI/BSA results.

### Recorded checks and post-merge verification

All historical logs below are under `docs/evidence/milestone-11-2026-10-12/`:

| Log                                | Recorded result                                                                                                                                                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bmi-bsa-red.log`                  | 2 files failed; 8 failed / 150 passed. Missing candidate exports/approval API and rounding/approval behavior fail before implementation.                                                                             |
| `bmi-bsa-green.log`                | Focused engine/candidate suite: 2 files / 213 passed, exit 0.                                                                                                                                                        |
| `bmi-bsa-full-check-attempt-1.log` | Format passed; lint stopped on `no-loss-of-precision`, exit 1.                                                                                                                                                       |
| `bmi-bsa-full-check-attempt-2.log` | Format/lint passed; typecheck stopped on potentially undefined conversion arrays, exit 2.                                                                                                                            |
| `bmi-bsa-full-check.log`           | Full `npm run check` exit 0: format, lint, typecheck, unit 60 files / 1,152 passed, architecture boundaries (104 source files), audit (0 vulnerabilities), build, distribution scan, browser 160 passed / 2 skipped. |

The orchestrator's 2026-10-12 rerun after merging main reports **format, lint, typecheck, unit tests (62 files / 1,273 passed), and architecture boundaries passed** at the supplied implementation baseline `ae64a3b`. This post-merge result is separate from the earlier log totals above; it does not assert a post-merge audit/build/browser rerun. Automated gates and synthetic tests do not establish clinical approval, original-source/rights verification, UI acceptance or real-device acceptance.

The documentation worker independently reran format, lint, typecheck, unit tests and architecture boundaries at `ae64a3b` on 2026-10-12 using Node `24.21.0`, npm `11.19.0` and the existing Node `22.23.2` executable via `INTERMED_NODE22_RUNTIME`. The unit rerun confirmed **62 files / 1,273 passed**; boundaries passed for **111 source files**. An initial unit attempt failed to load the compiled-artifact suite because that environment variable was unset (61 files / 1,272 tests passed, 1 suite failed); the configured rerun passed without code changes. Only this evidence document was edited.

### Pending owner clinical approval

- Separate explicit approval records for `bmi@1.0.0` and `bsa-mosteller@1.0.0`, with reviewer, date and scope; the approval register remains empty.
- Calculator-specific rounding mode and precision, including exact-binary tie behavior; any requested unsupported mode needs implementation and revalidation before use.
- BMI WHO candidate thresholds/labels and their applicability to the chosen adult population, particularly ages 18–19.
- Adult guard, engineering plausibility limits, Romanian applicability and exclusions/uncertain states for each formula.
- Clinical reference vectors, original publication/derivation verification and per-formula reuse/attribution rights; manual MDCalc comparison is supplementary only.
- Clinical interpretation and limitations, with no automatic diagnosis, treatment or dosing decision; calculator presentation and Milestone 12 hardening remain separate gates.
