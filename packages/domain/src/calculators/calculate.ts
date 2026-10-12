import { validateCalculationInputs } from './inputs';
import type { FormulaRegistry } from './registry';
import type {
  CalculationInvalidInputResult,
  CalculationRequest,
  CalculationResult,
  CalculationResultMetadata,
  FormulaDefinition,
  PopulationGuard,
  PopulationLimitHit,
} from './types';

function reviewMarker(
  definition: FormulaDefinition,
): CalculationResultMetadata['reviewMarker'] {
  return definition.reviewStatus === 'unreviewed'
    ? 'UNREVIEWED'
    : 'CLINICALLY REVIEWED';
}

function resultMetadata(
  definition: FormulaDefinition,
  inputEcho: CalculationResultMetadata['inputEcho'],
): CalculationResultMetadata {
  return {
    formulaId: definition.formulaId,
    formulaVersion: definition.formulaVersion,
    formulaTitle: definition.title,
    primaryReference: definition.primaryReference,
    limitations: definition.limitations,
    reviewStatus: definition.reviewStatus,
    reviewMarker: reviewMarker(definition),
    inputEcho,
    ...(definition.deprecated
      ? { deprecationNotice: definition.deprecated.notice }
      : {}),
  };
}

function unavailableWithoutDefinition(
  formulaId: string,
  formulaVersion: string,
): CalculationResult {
  return {
    status: 'unavailable',
    formulaId,
    formulaVersion,
    formulaTitle: null,
    primaryReference: null,
    limitations: Object.freeze([
      'Metadata is unavailable because this exact formula id and version are not registered.',
    ]),
    reviewStatus: null,
    reviewMarker: 'UNAVAILABLE',
    inputEcho: Object.freeze([]),
    reason: 'The requested formula id and version are not registered.',
  };
}

function invalidInputResult(
  metadata: CalculationResultMetadata,
  errors: CalculationInvalidInputResult['errors'],
): CalculationInvalidInputResult {
  return { status: 'invalid-input', ...metadata, errors };
}

function populationLimitHit(
  guard: PopulationGuard,
  actualValue: number,
): PopulationLimitHit | undefined {
  if (guard.operator === 'between') {
    if (actualValue >= guard.minimum && actualValue <= guard.maximum) {
      return undefined;
    }
    return {
      guardId: guard.id,
      inputId: guard.inputId,
      operator: guard.operator,
      actualValue,
      minimum: guard.minimum,
      maximum: guard.maximum,
      unit: guard.unit,
      message: guard.message,
    };
  }
  if (guard.operator === 'at-least' && actualValue < guard.value) {
    return {
      guardId: guard.id,
      inputId: guard.inputId,
      operator: guard.operator,
      actualValue,
      value: guard.value,
      unit: guard.unit,
      message: guard.message,
    };
  }
  if (guard.operator === 'at-most' && actualValue > guard.value) {
    return {
      guardId: guard.id,
      inputId: guard.inputId,
      operator: guard.operator,
      actualValue,
      value: guard.value,
      unit: guard.unit,
      message: guard.message,
    };
  }
  return undefined;
}

function findPopulationLimitHits(
  definition: FormulaDefinition,
  normalizedValues: Readonly<Record<string, number | undefined>>,
): readonly PopulationLimitHit[] {
  const hits = definition.populationLimits.guards.flatMap((guard) => {
    const value = normalizedValues[guard.inputId];
    if (value === undefined) return [];
    const hit = populationLimitHit(guard, value);
    return hit ? [hit] : [];
  });
  return Object.freeze(hits);
}

function roundForDisplay(value: number, precision: number): number | undefined {
  const scale = 10 ** precision;
  const scaled = Math.abs(value) * scale;
  if (!Number.isFinite(scaled)) return undefined;
  const epsilon = Number.EPSILON * Math.max(1, scaled);
  const roundedMagnitude = Math.floor(scaled + 0.5 + epsilon) / scale;
  const rounded = Math.sign(value) * roundedMagnitude;
  if (!Number.isFinite(rounded)) return undefined;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function calculateKnownFormula(
  definition: FormulaDefinition,
  request: CalculationRequest,
): CalculationResult {
  const validation = validateCalculationInputs(definition, request);
  const metadata = resultMetadata(definition, validation.inputEcho);
  if (validation.errors.length > 0) {
    return invalidInputResult(metadata, validation.errors);
  }
  if (validation.unitErrors.length > 0) {
    return {
      status: 'unit-error',
      ...metadata,
      unitErrors: validation.unitErrors,
    };
  }
  const limitsHit = findPopulationLimitHits(
    definition,
    validation.normalizedValues,
  );
  if (limitsHit.length > 0) {
    return { status: 'out-of-population', ...metadata, limitsHit };
  }

  let unroundedValue: unknown;
  try {
    unroundedValue = definition.compute(
      Object.freeze({ ...validation.normalizedValues }),
    );
  } catch {
    return {
      status: 'unavailable',
      ...metadata,
      reason: 'The pinned formula could not be computed.',
    };
  }
  if (typeof unroundedValue !== 'number' || !Number.isFinite(unroundedValue)) {
    return {
      status: 'unavailable',
      ...metadata,
      reason: 'The pinned formula did not return a finite result.',
    };
  }
  const displayValue = roundForDisplay(
    unroundedValue,
    definition.output.precision,
  );
  if (displayValue === undefined) {
    return {
      status: 'unavailable',
      ...metadata,
      reason: 'The pinned formula result could not be rounded safely.',
    };
  }
  return {
    status: 'ok',
    ...metadata,
    displayValue,
    unroundedValue,
    unit: definition.output.unit,
    precision: definition.output.precision,
    rounding: {
      mode: 'half-away-from-zero',
      precision: definition.output.precision,
    },
  };
}

function requestedId(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Run a formula only after resolving the exact pinned id and version. */
export function calculateFormula(
  registry: FormulaRegistry,
  request: CalculationRequest,
): CalculationResult {
  const formulaId = requestedId(request?.formulaId);
  const formulaVersion = requestedId(request?.formulaVersion);
  const definition = registry.get(formulaId, formulaVersion);
  if (!definition) {
    return unavailableWithoutDefinition(formulaId, formulaVersion);
  }
  return calculateKnownFormula(definition, request);
}
