import { validateCalculationInputs } from './inputs';
import type { FormulaRegistry } from './registry';
import type {
  CalculationInvalidInputResult,
  CalculationRequest,
  CalculationResult,
  CalculationResultMetadata,
  FormulaClassification,
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
  if (guard.operator === 'at-least' || guard.operator === 'at-most') {
    return undefined;
  }
  throw new Error(
    `Unknown population guard operator ${(guard as { operator: unknown }).operator}.`,
  );
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

function findPopulationLimitHitsGuarded(
  definition: FormulaDefinition,
  normalizedValues: Readonly<Record<string, number | undefined>>,
): readonly PopulationLimitHit[] | undefined {
  try {
    return findPopulationLimitHits(definition, normalizedValues);
  } catch {
    return undefined;
  }
}

function roundForDisplay(value: number, precision: number): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  if (!Number.isSafeInteger(precision) || precision < 0) return undefined;
  // Half away from zero decided on the exact stored binary value. Scaling a
  // binary double by a power of ten can itself round: the stored 2.675 sits
  // just below the decimal tie, yet 2.675 * 100 evaluates to exactly 267.5
  // in floating point. Rounding that scaled result would promote a spurious
  // tie, so the decision below uses the exact binary expansion of the input
  // instead. Decimal ties stored just below the tie therefore round down
  // (1.005 and 2.675 at precision 2 give 1.00 and 2.67), while exactly
  // representable ties still round away from zero (2.5 gives 3 and -2.5
  // gives -3 at precision 0). The tie rule itself is pending clinical
  // review (roundingRuleReviewed is false).
  const negative = value < 0;
  const bytes = new ArrayBuffer(8);
  const view = new DataView(bytes);
  view.setFloat64(0, Math.abs(value));
  const bits = view.getBigUint64(0);
  const exponentBits = Number((bits >> 52n) & 0x7ffn);
  const fractionBits = bits & ((1n << 52n) - 1n);
  let mantissa: bigint;
  let binaryExponent: number;
  if (exponentBits === 0) {
    mantissa = fractionBits;
    binaryExponent = -1074;
  } else if (exponentBits === 0x7ff) {
    return undefined;
  } else {
    mantissa = fractionBits | (1n << 52n);
    binaryExponent = exponentBits - 1075;
  }
  // |value| is mantissa * 2 ** binaryExponent. Scale by 10 ** precision as
  // an exact rational, then round the scaled magnitude half up.
  const decimalScale = 10n ** BigInt(precision);
  let numerator = mantissa * decimalScale;
  let denominator = 1n;
  if (binaryExponent >= 0) {
    numerator <<= BigInt(binaryExponent);
  } else {
    denominator = 1n << BigInt(-binaryExponent);
  }
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const roundedScaled =
    remainder * 2n >= denominator ? quotient + 1n : quotient;
  // Rebuild the decimal number from its exact decimal digits so the final
  // double is the nearest one to the rounded decimal value.
  const digits = roundedScaled.toString();
  let text: string;
  if (precision === 0) {
    text = digits;
  } else if (digits.length <= precision) {
    text = `0.${digits.padStart(precision, '0')}`;
  } else {
    const point = digits.length - precision;
    text = `${digits.slice(0, point)}.${digits.slice(point)}`;
  }
  const rounded = Number(negative ? `-${text}` : text);
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
  const limitsHit = findPopulationLimitHitsGuarded(
    definition,
    validation.normalizedValues,
  );
  if (limitsHit === undefined) {
    return {
      status: 'unavailable',
      ...metadata,
      reason: 'The pinned formula population limits could not be evaluated.',
    };
  }
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
  let classification: FormulaClassification | undefined;
  if (definition.classify) {
    let rawClassification: unknown;
    try {
      rawClassification = definition.classify(unroundedValue);
    } catch {
      return {
        status: 'unavailable',
        ...metadata,
        reason: 'The pinned formula classification could not be computed.',
      };
    }
    if (
      !rawClassification ||
      typeof rawClassification !== 'object' ||
      typeof (rawClassification as FormulaClassification).code !== 'string' ||
      typeof (rawClassification as FormulaClassification).label !== 'string'
    ) {
      return {
        status: 'unavailable',
        ...metadata,
        reason: 'The pinned formula classification did not return a category.',
      };
    }
    const valid = rawClassification as FormulaClassification;
    classification = Object.freeze({ code: valid.code, label: valid.label });
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
      roundingRuleReviewed: false,
    },
    ...(classification ? { classification } : {}),
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
  const definition = registry.resolveForCalculation(
    formulaId,
    formulaVersion,
  );
  if (!definition) {
    return unavailableWithoutDefinition(formulaId, formulaVersion);
  }
  return calculateKnownFormula(definition, request);
}
