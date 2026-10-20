import { useMemo, useState } from 'react';
import {
  BMI_FORMULA,
  calculateFormula,
  CKD_EPI_2021_CREATININE_FORMULA,
  COCKCROFT_GAULT_FORMULA,
  FormulaRegistry,
  MOSTELLER_BSA_FORMULA,
} from '@intermed/domain';
import type {
  CalculationInput,
  CalculationInputEcho,
  CalculationResult,
  FormulaDefinition,
  FormulaInputDefinition,
} from '@intermed/domain';
import { useRouteHeadingFocus } from './route-focus';

const DEFINITIONS = {
  bmi: BMI_FORMULA,
  'bsa-mosteller': MOSTELLER_BSA_FORMULA,
  'egfr-ckd-epi-2021-cr': CKD_EPI_2021_CREATININE_FORMULA,
  'crcl-cockcroft-gault': COCKCROFT_GAULT_FORMULA,
} satisfies Record<string, FormulaDefinition>;

type CalculatorId = keyof typeof DEFINITIONS;

const CALCULATOR_CHOICES: readonly {
  readonly id: CalculatorId;
  readonly label: string;
}[] = [
  { id: 'bmi', label: 'Body mass index (adult)' },
  {
    id: 'bsa-mosteller',
    label: 'Body surface area, Mosteller (adult estimate)',
  },
  {
    id: 'egfr-ckd-epi-2021-cr',
    label: 'eGFR, CKD-EPI 2021 creatinine (adult, unreviewed)',
  },
  {
    id: 'crcl-cockcroft-gault',
    label: 'Creatinine clearance, Cockcroft–Gault (adult, unreviewed)',
  },
];

function reviewMarkerOf(definition: FormulaDefinition): string {
  return definition.reviewStatus === 'unreviewed'
    ? 'UNREVIEWED'
    : 'CLINICALLY REVIEWED';
}

function resultLabelFor(formulaId: string): string | null {
  if (formulaId === 'crcl-cockcroft-gault') {
    return 'Creatinine clearance (unindexed)';
  }
  if (formulaId === 'egfr-ckd-epi-2021-cr') {
    return 'eGFR';
  }
  return null;
}

function weightConventionEcho(
  result: CalculationResult,
): CalculationInputEcho | undefined {
  if (result.status !== 'ok') return undefined;
  return result.inputEcho.find((echo) => echo.inputId === 'weightConvention');
}

const WEIGHT_CONVENTION_NOTE =
  'InterMED has not calculated or validated the ideal or adjusted body weight entered, or the method used to derive it.';

function fieldLabelText(input: FormulaInputDefinition): string {
  if (input.kind === 'category') return input.label;
  if (input.id === 'age') return 'Age in years';
  return input.label;
}

function unitLabelText(inputId: string): string {
  return `${inputId.charAt(0).toUpperCase()}${inputId.slice(1)} unit`;
}

function helpText(input: FormulaInputDefinition): string {
  if (input.kind === 'category') return 'Choose one option.';
  switch (input.id) {
    case 'weight':
      return 'Enter the weight as a number, without patient identifiers.';
    case 'height':
      return 'Enter the height as a number, without patient identifiers.';
    case 'age':
      return 'Whole years, 18 or older for this release. No patient identifiers.';
    case 'creatinine':
      return 'Enter the serum creatinine as a number, without patient identifiers.';
    default:
      return `Enter the ${input.label} as a number, without patient identifiers.`;
  }
}

function runCalculation(
  definition: FormulaDefinition,
  rawValues: Readonly<Record<string, string>>,
  units: Readonly<Record<string, string>>,
  selections: Readonly<Record<string, string>>,
  confirmedChecks: readonly string[],
): CalculationResult {
  const registry = new FormulaRegistry();
  registry.register(definition);
  const inputs: Record<string, CalculationInput | undefined> = {};
  for (const input of definition.inputs) {
    if (input.kind === 'category') {
      const selected = selections[input.id];
      inputs[input.id] =
        selected === undefined || selected === ''
          ? undefined
          : { category: selected };
      continue;
    }
    const raw = rawValues[input.id] ?? '';
    if (raw.trim() === '') {
      inputs[input.id] = undefined;
      continue;
    }
    inputs[input.id] = {
      value: Number(raw),
      unit: units[input.id] ?? input.canonicalUnit,
    };
  }
  return calculateFormula(registry, {
    formulaId: definition.formulaId,
    formulaVersion: definition.formulaVersion,
    inputs,
    ...(confirmedChecks.length > 0 ? { confirmedChecks } : {}),
  });
}

function echoDescription(echo: CalculationInputEcho) {
  if (echo.kind === 'category') {
    return (
      <>
        Submitted {echo.submittedCategory ?? 'none'}; selected{' '}
        {echo.selectedOptionId ?? 'none'}
        {echo.selectedOptionLabel ? ` (${echo.selectedOptionLabel})` : ''}.
      </>
    );
  }
  return (
    <>
      Submitted {echo.submittedValue} {echo.submittedUnit}; normalized{' '}
      {echo.normalizedValue} {echo.normalizedUnit}
      {echo.conversions.map((conversion, index) => (
        <span key={index}>
          ; converted {conversion.fromUnit} to {conversion.toUnit} (factor{' '}
          {String(conversion.factor)}, input {String(conversion.inputValue)} →
          converted {String(conversion.convertedValue)})
        </span>
      ))}
      .
    </>
  );
}

/**
 * Development-only calculators for BMI, Mosteller BSA and the unreviewed
 * renal candidates. Inputs are ephemeral component state: never persisted,
 * never pre-filled, cleared on unmount. Results are display-only and never
 * reused.
 */
export function CalculatorsPage() {
  const [calculatorId, setCalculatorId] = useState<CalculatorId>('bmi');
  const definition = DEFINITIONS[calculatorId];

  const [rawValues, setRawValues] = useState<Record<string, string>>({});
  const [units, setUnits] = useState<Record<string, string>>({});
  const [selections, setSelections] = useState<Record<string, string>>({});
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
    // Never reinterpret an entered value under a different unit. The rule
    // applies per input id across calculators: an empty field takes the next
    // calculator's canonical unit; an entered value keeps its unit when the
    // next calculator declares the same input id and accepts the unit, and is
    // cleared otherwise. Values for inputs the next calculator does not have
    // are cleared so they cannot leak into another calculator. The previous
    // result belonged to the other calculator.
    const nextDefinition = DEFINITIONS[next];
    const currentById = new Map(
      definition.inputs.map((item) => [item.id, item]),
    );
    const nextRaw: Record<string, string> = {};
    const nextUnits: Record<string, string> = {};
    const nextSelections: Record<string, string> = {};
    for (const input of nextDefinition.inputs) {
      if (input.kind === 'category') {
        const kept = selections[input.id];
        if (kept) nextSelections[input.id] = kept;
        continue;
      }
      const raw = rawValues[input.id] ?? '';
      const current = currentById.get(input.id);
      const unit =
        units[input.id] ??
        (current && current.kind !== 'category'
          ? current.canonicalUnit
          : input.canonicalUnit);
      if (raw.trim() === '' || !input.allowedUnits.includes(unit)) {
        nextUnits[input.id] = input.canonicalUnit;
        continue;
      }
      nextRaw[input.id] = raw;
      nextUnits[input.id] = unit;
    }
    setCalculatorId(next);
    setRawValues(nextRaw);
    setUnits(nextUnits);
    setSelections(nextSelections);
    setResult(null);
  }

  function submit(confirmedChecks: readonly string[]) {
    setResult(
      runCalculation(definition, rawValues, units, selections, confirmedChecks),
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
  const okResultLabel =
    result?.status === 'ok' ? resultLabelFor(result.formulaId) : null;
  const conventionEcho =
    result?.status === 'ok' ? weightConventionEcho(result) : undefined;
  const conventionLabel = conventionEcho?.selectedOptionLabel ?? undefined;
  const showWeightConventionNote =
    conventionEcho?.selectedOptionId === 'ideal' ||
    conventionEcho?.selectedOptionId === 'adjusted';

  return (
    <section className="calculators-page" aria-labelledby="calculators-title">
      <h1 id="calculators-title" tabIndex={-1}>
        Calculators
      </h1>
      <p className="lead">
        Body mass index, body surface area, CKD-EPI 2021 eGFR and
        Cockcroft–Gault creatinine clearance estimates for development and
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
          {CALCULATOR_CHOICES.map((choice) => (
            <label key={choice.id}>
              <input
                type="radio"
                name="calculator"
                value={choice.id}
                checked={calculatorId === choice.id}
                onChange={() => selectCalculator(choice.id)}
              />{' '}
              {choice.label}
            </label>
          ))}
        </fieldset>

        {definition.inputs.map((input) => {
          if (input.kind === 'category') {
            const helpId = `calculator-${input.id}-help`;
            const errorId = `calculator-${input.id}-error`;
            const inputErrors = fieldErrors[input.id];
            return (
              <fieldset
                key={input.id}
                className="calculator-field calculator-category"
                aria-describedby={inputErrors ? `${helpId} ${errorId}` : helpId}
              >
                <legend>{input.label}</legend>
                {input.options.map((option) => (
                  <label key={option.id}>
                    <input
                      type="radio"
                      name={`calculator-${input.id}`}
                      value={option.id}
                      checked={(selections[input.id] ?? '') === option.id}
                      onChange={() => {
                        setSelections((previous) => ({
                          ...previous,
                          [input.id]: option.id,
                        }));
                        clearResult();
                      }}
                    />{' '}
                    {option.label}
                  </label>
                ))}
                <p id={helpId} className="calculator-help">
                  {helpText(input)}
                </p>
                {inputErrors && (
                  <p
                    id={errorId}
                    className="calculator-field-error"
                    role="alert"
                  >
                    {inputErrors.join(' ')}
                  </p>
                )}
              </fieldset>
            );
          }
          const fieldId = `calculator-${input.id}`;
          const helpId = `${fieldId}-help`;
          const errorId = `${fieldId}-error`;
          const unitId = `${fieldId}-unit`;
          const raw = rawValues[input.id] ?? '';
          const unit = units[input.id] ?? input.canonicalUnit;
          const inputErrors = fieldErrors[input.id];
          return (
            <div key={input.id} className="calculator-field">
              <label htmlFor={fieldId}>{fieldLabelText(input)}</label>
              {input.allowedUnits.length > 1 ? (
                <div className="calculator-value-unit">
                  <input
                    id={fieldId}
                    type="text"
                    inputMode={input.id === 'age' ? 'numeric' : 'decimal'}
                    autoComplete="off"
                    value={raw}
                    aria-describedby={
                      inputErrors ? `${helpId} ${errorId}` : helpId
                    }
                    onChange={(event) => {
                      const entered = event.currentTarget.value;
                      setRawValues((previous) => ({
                        ...previous,
                        [input.id]: entered,
                      }));
                      clearResult();
                    }}
                  />
                  <label className="calculator-unit-label" htmlFor={unitId}>
                    {unitLabelText(input.id)}
                  </label>
                  <select
                    id={unitId}
                    value={unit}
                    onChange={(event) => {
                      const selected = event.currentTarget.value;
                      setUnits((previous) => ({
                        ...previous,
                        [input.id]: selected,
                      }));
                      clearResult();
                    }}
                  >
                    {input.allowedUnits.map((allowed) => (
                      <option key={allowed} value={allowed}>
                        {allowed}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <input
                  id={fieldId}
                  type="text"
                  inputMode={input.id === 'age' ? 'numeric' : 'decimal'}
                  autoComplete="off"
                  value={raw}
                  aria-describedby={
                    inputErrors ? `${helpId} ${errorId}` : helpId
                  }
                  onChange={(event) => {
                    const entered = event.currentTarget.value;
                    setRawValues((previous) => ({
                      ...previous,
                      [input.id]: entered,
                    }));
                    clearResult();
                  }}
                />
              )}
              <p id={helpId} className="calculator-help">
                {helpText(input)}
              </p>
              {inputErrors && (
                <p id={errorId} className="calculator-field-error" role="alert">
                  {inputErrors.join(' ')}
                </p>
              )}
            </div>
          );
        })}

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
            {okResultLabel && (
              <p className="calculator-result-label">{okResultLabel}</p>
            )}
            <p className="calculator-value">
              Result: {result.displayValue.toFixed(result.precision)}{' '}
              {result.unit}
              {conventionLabel ? ` — weight entered: ${conventionLabel}` : ''}
            </p>
            {showWeightConventionNote && (
              <p className="calculator-weight-convention-note">
                {WEIGHT_CONVENTION_NOTE}
              </p>
            )}
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
                    <dd>{echoDescription(echo)}</dd>
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
            tabIndex={0}
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
