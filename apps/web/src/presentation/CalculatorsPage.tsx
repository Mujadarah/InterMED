import { useMemo, useState } from 'react';
import {
  BMI_FORMULA,
  calculateFormula,
  FormulaRegistry,
  MOSTELLER_BSA_FORMULA,
} from '@intermed/domain';
import type {
  CalculationInput,
  CalculationResult,
  FormulaDefinition,
} from '@intermed/domain';
import { useRouteHeadingFocus } from './route-focus';

const DEFINITIONS: Record<'bmi' | 'bsa-mosteller', FormulaDefinition> = {
  bmi: BMI_FORMULA,
  'bsa-mosteller': MOSTELLER_BSA_FORMULA,
};

type CalculatorId = keyof typeof DEFINITIONS;

function inputDefinition(definition: FormulaDefinition, inputId: string) {
  const found = definition.inputs.find((input) => input.id === inputId);
  if (!found) throw new Error(`Missing input definition: ${inputId}.`);
  return found;
}

function reviewMarkerOf(definition: FormulaDefinition): string {
  return definition.reviewStatus === 'unreviewed'
    ? 'UNREVIEWED'
    : 'CLINICALLY REVIEWED';
}

function parseField(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  return Number(raw);
}

function runCalculation(
  definition: FormulaDefinition,
  values: {
    weight: number | undefined;
    height: number | undefined;
    age: number | undefined;
  },
  units: { weight: string; height: string; age: string },
  confirmedChecks: readonly string[],
): CalculationResult {
  const registry = new FormulaRegistry();
  registry.register(definition);
  const inputs: Record<string, CalculationInput | undefined> = {
    weight:
      values.weight === undefined
        ? undefined
        : { value: values.weight, unit: units.weight },
    height:
      values.height === undefined
        ? undefined
        : { value: values.height, unit: units.height },
    age:
      values.age === undefined
        ? undefined
        : { value: values.age, unit: units.age },
  };
  return calculateFormula(registry, {
    formulaId: definition.formulaId,
    formulaVersion: definition.formulaVersion,
    inputs,
    ...(confirmedChecks.length > 0 ? { confirmedChecks } : {}),
  });
}

/**
 * Development-only calculators for BMI and Mosteller BSA.
 * Inputs are ephemeral component state: never persisted, never pre-filled,
 * cleared on unmount. Results are display-only and never reused.
 */
export function CalculatorsPage() {
  const [calculatorId, setCalculatorId] = useState<CalculatorId>('bmi');
  const definition = DEFINITIONS[calculatorId];
  const weightInput = inputDefinition(definition, 'weight');
  const heightInput = inputDefinition(definition, 'height');
  const ageInput = inputDefinition(definition, 'age');

  const [weight, setWeight] = useState('');
  const [weightUnit, setWeightUnit] = useState(weightInput.canonicalUnit);
  const [height, setHeight] = useState('');
  const [heightUnit, setHeightUnit] = useState(heightInput.canonicalUnit);
  const [age, setAge] = useState('');
  const [result, setResult] = useState<CalculationResult | null>(null);

  // This route's chunk resolves after the App's pathname effect, so the
  // heading takes the pending route focus once it is in the document.
  useRouteHeadingFocus();

  const fieldErrors = useMemo(() => {
    const messages: Record<string, string[]> = {};
    if (!result) return messages;
    if (result.status === 'invalid-input') {
      for (const error of result.errors) {
        messages[error.inputId] = [
          ...(messages[error.inputId] ?? []),
          error.message,
        ];
      }
    }
    if (result.status === 'unit-error') {
      for (const error of result.unitErrors) {
        messages[error.inputId] = [
          ...(messages[error.inputId] ?? []),
          error.message,
        ];
      }
    }
    return messages;
  }, [result]);

  function clearResult() {
    setResult(null);
  }

  function selectCalculator(next: CalculatorId) {
    if (next === calculatorId) return;
    setCalculatorId(next);
    // Never reinterpret an entered value under a different unit. An empty
    // field takes the next calculator's canonical unit; an entered value keeps
    // its unit when the next calculator accepts it and is cleared otherwise.
    // The previous result belonged to the other calculator.
    const nextHeight = inputDefinition(DEFINITIONS[next], 'height');
    if (height.trim() === '') {
      setHeightUnit(nextHeight.canonicalUnit);
    } else if (!nextHeight.allowedUnits.includes(heightUnit)) {
      setHeight('');
      setHeightUnit(nextHeight.canonicalUnit);
    }
    const nextWeight = inputDefinition(DEFINITIONS[next], 'weight');
    if (weight.trim() === '') {
      setWeightUnit(nextWeight.canonicalUnit);
    } else if (!nextWeight.allowedUnits.includes(weightUnit)) {
      setWeight('');
      setWeightUnit(nextWeight.canonicalUnit);
    }
    setResult(null);
  }

  function submit(confirmedChecks: readonly string[]) {
    setResult(
      runCalculation(
        definition,
        {
          weight: parseField(weight),
          height: parseField(height),
          age: parseField(age),
        },
        { weight: weightUnit, height: heightUnit, age: ageInput.canonicalUnit },
        confirmedChecks,
      ),
    );
  }

  const confirmationIds =
    result?.status === 'confirmation-required'
      ? result.checks.map((check) => check.id)
      : [];

  // Once calculated, the badge reflects the returned result (which pins the
  // exact formula id and version); before any calculation it reflects the
  // selected definition.
  const reviewBadge = result ? result.reviewMarker : reviewMarkerOf(definition);

  return (
    <section className="calculators-page" aria-labelledby="calculators-title">
      <h1 id="calculators-title" tabIndex={-1}>
        Calculators
      </h1>
      <p className="lead">
        Body mass index and body surface area estimates for development and
        review. Synthetic use only.
      </p>
      <p className="calculator-banner" role="note">
        Development preview — not for clinical use.
      </p>

      <form
        className="calculator-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit([]);
        }}
      >
        <fieldset className="calculator-choice">
          <legend>Choose a calculator</legend>
          <label>
            <input
              type="radio"
              name="calculator"
              value="bmi"
              checked={calculatorId === 'bmi'}
              onChange={() => selectCalculator('bmi')}
            />{' '}
            Body mass index (adult)
          </label>
          <label>
            <input
              type="radio"
              name="calculator"
              value="bsa-mosteller"
              checked={calculatorId === 'bsa-mosteller'}
              onChange={() => selectCalculator('bsa-mosteller')}
            />{' '}
            Body surface area, Mosteller (adult estimate)
          </label>
        </fieldset>

        <div className="calculator-field">
          <label htmlFor="calculator-weight">Weight</label>
          <div className="calculator-value-unit">
            <input
              id="calculator-weight"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={weight}
              aria-describedby={
                fieldErrors['weight']
                  ? 'calculator-weight-help calculator-weight-error'
                  : 'calculator-weight-help'
              }
              onChange={(event) => {
                setWeight(event.currentTarget.value);
                clearResult();
              }}
            />
            <label
              className="calculator-unit-label"
              htmlFor="calculator-weight-unit"
            >
              Weight unit
            </label>
            <select
              id="calculator-weight-unit"
              value={weightUnit}
              onChange={(event) => {
                setWeightUnit(event.currentTarget.value);
                clearResult();
              }}
            >
              {weightInput.allowedUnits.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </div>
          <p id="calculator-weight-help" className="calculator-help">
            Enter the weight as a number, without patient identifiers.
          </p>
          {fieldErrors['weight'] && (
            <p
              id="calculator-weight-error"
              className="calculator-field-error"
              role="alert"
            >
              {fieldErrors['weight'].join(' ')}
            </p>
          )}
        </div>

        <div className="calculator-field">
          <label htmlFor="calculator-height">Height</label>
          <div className="calculator-value-unit">
            <input
              id="calculator-height"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={height}
              aria-describedby={
                fieldErrors['height']
                  ? 'calculator-height-help calculator-height-error'
                  : 'calculator-height-help'
              }
              onChange={(event) => {
                setHeight(event.currentTarget.value);
                clearResult();
              }}
            />
            <label
              className="calculator-unit-label"
              htmlFor="calculator-height-unit"
            >
              Height unit
            </label>
            <select
              id="calculator-height-unit"
              value={heightUnit}
              onChange={(event) => {
                setHeightUnit(event.currentTarget.value);
                clearResult();
              }}
            >
              {heightInput.allowedUnits.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </div>
          <p id="calculator-height-help" className="calculator-help">
            Enter the height as a number, without patient identifiers.
          </p>
          {fieldErrors['height'] && (
            <p
              id="calculator-height-error"
              className="calculator-field-error"
              role="alert"
            >
              {fieldErrors['height'].join(' ')}
            </p>
          )}
        </div>

        <div className="calculator-field">
          <label htmlFor="calculator-age">Age in years</label>
          <input
            id="calculator-age"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={age}
            aria-describedby={
              fieldErrors['age']
                ? 'calculator-age-help calculator-age-error'
                : 'calculator-age-help'
            }
            onChange={(event) => {
              setAge(event.currentTarget.value);
              clearResult();
            }}
          />
          <p id="calculator-age-help" className="calculator-help">
            Whole years, 18 or older for this release. No patient identifiers.
          </p>
          {fieldErrors['age'] && (
            <p
              id="calculator-age-error"
              className="calculator-field-error"
              role="alert"
            >
              {fieldErrors['age'].join(' ')}
            </p>
          )}
        </div>

        <button type="submit">Calculate</button>
      </form>

      <section
        className="calculator-result"
        aria-label="Calculation result"
        aria-live="polite"
        aria-atomic="true"
      >
        {!result && <p>No result yet. Enter values and choose Calculate.</p>}

        {result?.status === 'ok' && (
          <>
            <p className="calculator-value">
              Result: {result.displayValue.toFixed(result.precision)}{' '}
              {result.unit}
            </p>
            {result.classification && (
              <div className="calculator-classification">
                <p>Classification: {result.classification.label}</p>
                {result.classificationNote && (
                  <p>{result.classificationNote}</p>
                )}
              </div>
            )}
            <details className="calculation-details">
              <summary>Calculation details</summary>
              <dl>
                <div>
                  <dt>Unrounded value</dt>
                  <dd>
                    {String(result.unroundedValue)} {result.unit}
                  </dd>
                </div>
                {result.inputEcho.map((echo) => (
                  <div key={echo.inputId}>
                    <dt>{echo.inputId}</dt>
                    <dd>
                      Submitted {echo.submittedValue} {echo.submittedUnit};
                      normalized {echo.normalizedValue} {echo.normalizedUnit}
                      {echo.conversions.map((conversion, index) => (
                        <span key={index}>
                          ; converted {conversion.fromUnit} to{' '}
                          {conversion.toUnit} (factor{' '}
                          {String(conversion.factor)}, input{' '}
                          {String(conversion.inputValue)} → converted{' '}
                          {String(conversion.convertedValue)})
                        </span>
                      ))}
                      .
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          </>
        )}

        {result?.status === 'confirmation-required' && (
          <div className="calculator-confirmation">
            <p>These values need explicit confirmation before calculation:</p>
            <ul>
              {result.checks.map((check) => (
                <li key={check.id}>{check.message}</li>
              ))}
            </ul>
            <button type="button" onClick={() => submit(confirmationIds)}>
              I confirm these values
            </button>
          </div>
        )}

        {result?.status === 'invalid-input' && (
          <div className="calculator-errors" role="alert">
            <p>These inputs cannot be calculated:</p>
            <ul>
              {result.errors.map((error, index) => (
                <li key={`${error.inputId}-${index}`}>{error.message}</li>
              ))}
            </ul>
          </div>
        )}

        {result?.status === 'unit-error' && (
          <div className="calculator-errors" role="alert">
            <p>These units cannot be used:</p>
            <ul>
              {result.unitErrors.map((error, index) => (
                <li key={`${error.inputId}-${index}`}>{error.message}</li>
              ))}
            </ul>
          </div>
        )}

        {result?.status === 'out-of-population' && (
          <div className="calculator-errors" role="alert">
            <p>Outside this release&apos;s scope:</p>
            <ul>
              {result.limitsHit.map((hit) => (
                <li key={hit.guardId}>{hit.message}</li>
              ))}
            </ul>
          </div>
        )}

        {result?.status === 'unavailable' && (
          <div className="calculator-errors" role="alert">
            <p>{result.reason}</p>
          </div>
        )}
      </section>

      <section className="calculator-meta" aria-label="Formula information">
        <p className="review-badge">Review status: {reviewBadge}</p>
        <h2>{definition.title}</h2>
        <p>Formula version: {definition.formulaVersion}</p>
        <p>
          Primary reference: {definition.primaryReference.citation}{' '}
          <a
            href={definition.primaryReference.urlOrDoi}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open primary reference in a new tab
          </a>
        </p>
        <h3>Limitations</h3>
        <ul>
          {definition.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </section>
    </section>
  );
}
