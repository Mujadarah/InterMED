import { applyConversionPath, findConversionPath } from './units';
import type {
  CalculationInputEcho,
  CalculationRequest,
  CalculationUnitError,
  FormulaDefinition,
  FormulaInputDefinition,
  InputValidationError,
} from './types';

export interface CalculationInputValidationOutcome {
  readonly normalizedValues: Record<string, number | undefined>;
  readonly inputEcho: readonly CalculationInputEcho[];
  readonly errors: readonly InputValidationError[];
  readonly unitErrors: readonly CalculationUnitError[];
}

interface OneInputOutcome {
  readonly echo: CalculationInputEcho;
  readonly normalizedValue?: number;
  readonly error?: InputValidationError;
  readonly unitError?: CalculationUnitError;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function blankEcho(
  definition: FormulaInputDefinition,
  submitted?: unknown,
): CalculationInputEcho {
  const submittedValue = isRecord(submitted) ? submitted.value : undefined;
  const submittedUnit = isRecord(submitted) ? submitted.unit : undefined;
  return {
    inputId: definition.id,
    submittedValue: typeof submittedValue === 'number' ? submittedValue : null,
    submittedUnit: typeof submittedUnit === 'string' ? submittedUnit : null,
    normalizedValue: null,
    normalizedUnit: definition.canonicalUnit,
    conversions: [],
  };
}

function inputError(
  inputId: string,
  code: InputValidationError['code'],
  message: string,
): InputValidationError {
  return { inputId, code, message };
}

function unitError(
  inputId: string,
  code: CalculationUnitError['code'],
  message: string,
): CalculationUnitError {
  return { inputId, code, message };
}

function missingOrMalformedInput(
  definition: FormulaInputDefinition,
  submitted: unknown,
  echo: CalculationInputEcho,
): OneInputOutcome | undefined {
  if (submitted === undefined) {
    return definition.required
      ? {
          echo,
          error: inputError(
            definition.id,
            'missing-required',
            'A required value was not supplied.',
          ),
        }
      : { echo };
  }
  if (!isRecord(submitted)) {
    return {
      echo,
      error: inputError(
        definition.id,
        'invalid-input-shape',
        'Input values must contain a numeric value and a unit.',
      ),
    };
  }
  return undefined;
}

function readFiniteValue(
  definition: FormulaInputDefinition,
  submitted: Record<string, unknown>,
  echo: CalculationInputEcho,
):
  | { readonly valid: true; readonly value: number }
  | { readonly valid: false; readonly outcome: OneInputOutcome } {
  const value = submitted.value;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return {
      valid: false,
      outcome: {
        echo,
        error: inputError(
          definition.id,
          'invalid-value',
          'Input value must be a finite number.',
        ),
      },
    };
  }
  if (value < 0 && definition.allowNegative !== true) {
    return {
      valid: false,
      outcome: {
        echo,
        error: inputError(
          definition.id,
          'negative-not-allowed',
          'Negative values are not allowed for this input.',
        ),
      },
    };
  }
  return { valid: true, value };
}

function readAllowedUnit(
  definition: FormulaInputDefinition,
  submitted: Record<string, unknown>,
  echo: CalculationInputEcho,
):
  | { readonly valid: true; readonly unit: string }
  | { readonly valid: false; readonly outcome: OneInputOutcome } {
  const unit = submitted.unit;
  if (typeof unit !== 'string' || unit.trim() === '') {
    return {
      valid: false,
      outcome: {
        echo,
        unitError: unitError(
          definition.id,
          'unit-missing',
          'A unit is required for this input.',
        ),
      },
    };
  }
  if (!definition.allowedUnits.includes(unit)) {
    return {
      valid: false,
      outcome: {
        echo,
        unitError: unitError(
          definition.id,
          'unit-not-allowed',
          'The submitted unit is not allowed for this input.',
        ),
      },
    };
  }
  return { valid: true, unit };
}

function validatePlausibleRange(
  definition: FormulaInputDefinition,
  value: number,
  unit: string,
  echo: CalculationInputEcho,
): OneInputOutcome | undefined {
  const range = definition.plausibleRangeByUnit[unit];
  if (!range) {
    return {
      echo,
      unitError: unitError(
        definition.id,
        'conversion-unavailable',
        'No plausible range is declared for the submitted unit.',
      ),
    };
  }
  return value < range.min || value > range.max
    ? {
        echo,
        error: inputError(
          definition.id,
          'out-of-range',
          `Input value is outside its declared plausible range for ${unit}.`,
        ),
      }
    : undefined;
}

function convertedInputOutcome(
  definition: FormulaInputDefinition,
  submittedUnit: string,
  value: number,
  conversions: FormulaDefinition['unitConversions'],
): OneInputOutcome {
  const path = findConversionPath(
    conversions,
    definition.quantityKind,
    submittedUnit,
    definition.canonicalUnit,
  );
  if (!path) {
    return {
      echo: {
        ...blankEcho(definition),
        submittedValue: value,
        submittedUnit,
      },
      unitError: unitError(
        definition.id,
        'conversion-unavailable',
        'No declared conversion connects the submitted and canonical units.',
      ),
    };
  }
  const converted = applyConversionPath(value, path);
  if (!converted) {
    return {
      echo: {
        ...blankEcho(definition),
        submittedValue: value,
        submittedUnit,
      },
      unitError: unitError(
        definition.id,
        'conversion-failed',
        'The declared unit conversion did not produce a finite value.',
      ),
    };
  }
  const canonicalRange =
    definition.plausibleRangeByUnit[definition.canonicalUnit];
  if (
    canonicalRange &&
    (converted.value < canonicalRange.min ||
      converted.value > canonicalRange.max)
  ) {
    return {
      echo: {
        inputId: definition.id,
        submittedValue: value,
        submittedUnit,
        normalizedValue: converted.value,
        normalizedUnit: definition.canonicalUnit,
        conversions: converted.records,
      },
      error: inputError(
        definition.id,
        'out-of-range',
        `Input value is outside its declared plausible range for ${definition.canonicalUnit}.`,
      ),
    };
  }
  return {
    echo: {
      inputId: definition.id,
      submittedValue: value,
      submittedUnit,
      normalizedValue: converted.value,
      normalizedUnit: definition.canonicalUnit,
      conversions: converted.records,
    },
    normalizedValue: converted.value,
  };
}

function validateSubmittedInput(
  definition: FormulaInputDefinition,
  submitted: unknown,
  conversions: FormulaDefinition['unitConversions'],
): OneInputOutcome {
  const echo = blankEcho(definition, submitted);
  const shapeProblem = missingOrMalformedInput(definition, submitted, echo);
  if (shapeProblem) return shapeProblem;
  if (submitted === undefined) return { echo };

  const submittedRecord = submitted as Record<string, unknown>;
  const finite = readFiniteValue(definition, submittedRecord, echo);
  if (!finite.valid) return finite.outcome;
  const allowedUnit = readAllowedUnit(definition, submittedRecord, echo);
  if (!allowedUnit.valid) return allowedUnit.outcome;
  const rangeProblem = validatePlausibleRange(
    definition,
    finite.value,
    allowedUnit.unit,
    echo,
  );
  if (rangeProblem) return rangeProblem;
  return convertedInputOutcome(
    definition,
    allowedUnit.unit,
    finite.value,
    conversions,
  );
}

export function validateCalculationInputs(
  definition: FormulaDefinition,
  request: CalculationRequest,
): CalculationInputValidationOutcome {
  const rawInputs = isRecord(request.inputs) ? request.inputs : undefined;
  const normalizedValues: Record<string, number | undefined> = Object.create(
    null,
  ) as Record<string, number | undefined>;
  const inputEcho: CalculationInputEcho[] = [];
  const errors: InputValidationError[] = [];
  const unitErrors: CalculationUnitError[] = [];

  if (!rawInputs) {
    errors.push(
      inputError(
        'inputs',
        'invalid-input-shape',
        'Calculation inputs must be an object keyed by formula input id.',
      ),
    );
  } else {
    const knownInputIds = new Set(definition.inputs.map((input) => input.id));
    for (const submittedId of Object.keys(rawInputs)) {
      if (!knownInputIds.has(submittedId)) {
        errors.push(
          inputError(
            submittedId,
            'unexpected-input',
            'Input id is not declared by the pinned formula version.',
          ),
        );
      }
    }
  }

  for (const inputDefinition of definition.inputs) {
    const submitted =
      rawInputs &&
      Object.prototype.hasOwnProperty.call(rawInputs, inputDefinition.id)
        ? rawInputs[inputDefinition.id]
        : undefined;
    const outcome = validateSubmittedInput(
      inputDefinition,
      submitted,
      definition.unitConversions,
    );
    inputEcho.push(outcome.echo);
    normalizedValues[inputDefinition.id] = outcome.normalizedValue;
    if (outcome.error) errors.push(outcome.error);
    if (outcome.unitError) unitErrors.push(outcome.unitError);
  }

  return {
    normalizedValues,
    inputEcho: Object.freeze(inputEcho),
    errors: Object.freeze(errors),
    unitErrors: Object.freeze(unitErrors),
  };
}
