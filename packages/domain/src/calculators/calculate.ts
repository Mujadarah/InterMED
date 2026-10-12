import { validateCalculationInputs } from './inputs';
import { applyConversionPath, findConversionPath } from './units';
import type { FormulaRegistry } from './registry';
import type {
  CalculationConfirmationRequiredResult,
  CalculationInvalidInputResult,
  CalculationRequest,
  CalculationResult,
  CalculationResultMetadata,
  FormulaClassification,
  FormulaDefinition,
  FormulaOutputRounding,
  FormulaSoftCheckHit,
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
    componentVersions: definition.componentVersions,
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
  reason = 'The requested formula id and version are not registered.',
): CalculationResult {
  return {
    status: 'unavailable',
    formulaId,
    formulaVersion,
    componentVersions: null,
    formulaTitle: null,
    primaryReference: null,
    limitations: Object.freeze([
      'Metadata is unavailable because this exact formula id and version are not registered.',
    ]),
    reviewStatus: null,
    reviewMarker: 'UNAVAILABLE',
    inputEcho: Object.freeze([]),
    reason,
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

function valueInUnit(
  definition: FormulaDefinition,
  inputId: string,
  targetUnit: string,
  normalizedValues: Readonly<Record<string, number | undefined>>,
): number | undefined {
  const input = definition.inputs.find((candidate) => candidate.id === inputId);
  const value = normalizedValues[inputId];
  if (!input || value === undefined) return undefined;
  const path = findConversionPath(
    definition.unitConversions,
    input.quantityKind,
    input.canonicalUnit,
    targetUnit,
  );
  if (!path) return undefined;
  return applyConversionPath(value, path)?.value;
}

function valueFromUnit(
  definition: FormulaDefinition,
  inputId: string,
  value: number,
  sourceUnit: string,
): number | undefined {
  const input = definition.inputs.find((candidate) => candidate.id === inputId);
  if (!input) return undefined;
  const path = findConversionPath(
    definition.unitConversions,
    input.quantityKind,
    sourceUnit,
    input.canonicalUnit,
  );
  if (!path) return undefined;
  return applyConversionPath(value, path)?.value;
}

function findSoftCheckHits(
  definition: FormulaDefinition,
  normalizedValues: Readonly<Record<string, number | undefined>>,
): readonly FormulaSoftCheckHit[] {
  const hits: FormulaSoftCheckHit[] = [];
  for (const check of definition.softChecks ?? []) {
    if (check.kind === 'input-range') {
      const canonicalValue = normalizedValues[check.inputId];
      if (canonicalValue === undefined) continue;
      const minimum =
        check.minimum === undefined
          ? undefined
          : valueFromUnit(definition, check.inputId, check.minimum, check.unit);
      const maximum =
        check.maximum === undefined
          ? undefined
          : valueFromUnit(definition, check.inputId, check.maximum, check.unit);
      if (
        (check.minimum !== undefined && minimum === undefined) ||
        (check.maximum !== undefined && maximum === undefined)
      ) {
        throw new Error(`Soft check ${check.id} unit conversion failed.`);
      }
      if (
        (minimum !== undefined && canonicalValue < minimum) ||
        (maximum !== undefined && canonicalValue > maximum)
      ) {
        hits.push(
          Object.freeze({
            id: check.id,
            inputIds: Object.freeze([check.inputId]),
            message: check.message,
          }),
        );
      }
      continue;
    }
    if (check.kind === 'implied-bmi-range') {
      const weightKg = valueInUnit(
        definition,
        check.weightInputId,
        'kg',
        normalizedValues,
      );
      const heightM = valueInUnit(
        definition,
        check.heightInputId,
        'm',
        normalizedValues,
      );
      if (
        normalizedValues[check.weightInputId] === undefined ||
        normalizedValues[check.heightInputId] === undefined
      ) {
        continue;
      }
      if (weightKg === undefined || heightM === undefined) {
        throw new Error(`Soft check ${check.id} unit conversion failed.`);
      }
      const bmi = weightKg / (heightM * heightM);
      if (!Number.isFinite(bmi)) {
        throw new Error('The implied BMI was not finite.');
      }
      if (bmi < check.minimum || bmi > check.maximum) {
        hits.push(
          Object.freeze({
            id: check.id,
            inputIds: Object.freeze([check.weightInputId, check.heightInputId]),
            message: check.message,
          }),
        );
      }
    }
  }
  return Object.freeze(hits);
}

function findSoftCheckHitsGuarded(
  definition: FormulaDefinition,
  normalizedValues: Readonly<Record<string, number | undefined>>,
): readonly FormulaSoftCheckHit[] | undefined {
  try {
    return findSoftCheckHits(definition, normalizedValues);
  } catch {
    return undefined;
  }
}

function roundHalfUpDecimal(
  value: number,
  precision: number,
): number | undefined {
  if (
    !Number.isFinite(value) ||
    !Number.isSafeInteger(precision) ||
    precision < 0
  ) {
    return undefined;
  }
  const magnitude = Math.abs(value);
  if (magnitude === 0) return 0;
  // A finite double's shortest round-trip decimal has fewer than 400 places;
  // finer display precision therefore preserves the original numeric value.
  if (precision >= 400) return value;

  const decimal = magnitude.toString().toLowerCase();
  const exponentIndex = decimal.indexOf('e');
  const coefficient =
    exponentIndex === -1 ? decimal : decimal.slice(0, exponentIndex);
  const exponent =
    exponentIndex === -1 ? 0 : Number(decimal.slice(exponentIndex + 1));
  if (!Number.isSafeInteger(exponent)) return undefined;
  const decimalPoint = coefficient.indexOf('.');
  const fractionLength =
    decimalPoint === -1 ? 0 : coefficient.length - decimalPoint - 1;
  const digits = coefficient.replace('.', '');
  const shift = exponent + precision - fractionLength;
  const coefficientInteger = BigInt(digits);
  let roundedScaled: bigint;

  if (shift >= 0) {
    roundedScaled = coefficientInteger * 10n ** BigInt(shift);
  } else {
    const discardedDigits = -shift;
    if (discardedDigits > digits.length + 1) {
      roundedScaled = 0n;
    } else {
      const divisor = 10n ** BigInt(discardedDigits);
      const quotient = coefficientInteger / divisor;
      const remainder = coefficientInteger % divisor;
      roundedScaled = remainder * 2n >= divisor ? quotient + 1n : quotient;
    }
  }

  let roundedText = roundedScaled.toString();
  if (precision > 0) {
    roundedText = roundedText.padStart(precision + 1, '0');
    const decimalIndex = roundedText.length - precision;
    roundedText = `${roundedText.slice(0, decimalIndex)}.${roundedText.slice(decimalIndex)}`;
  }
  const rounded = Number(roundedText);
  if (!Number.isFinite(rounded)) return undefined;
  if (rounded === 0) return 0;
  return value < 0 ? -rounded : rounded;
}

function roundForDisplay(
  value: number,
  rounding: FormulaOutputRounding,
): number | undefined {
  const { precision } = rounding;
  if (!Number.isFinite(value)) return undefined;
  if (rounding.mode === 'half-up-decimal') {
    return roundHalfUpDecimal(value, precision);
  }
  if (
    rounding.mode !== 'half-away-from-zero' ||
    !Number.isSafeInteger(precision) ||
    precision < 0
  ) {
    return undefined;
  }
  // Half away from zero decided on the exact stored binary value. Scaling a
  // binary double by a power of ten can itself round: the stored 2.675 sits
  // just below the decimal tie, yet 2.675 * 100 evaluates to exactly 267.5
  // in floating point. Rounding that scaled result would promote a spurious
  // tie, so the decision below uses the exact binary expansion of the input
  // instead. Decimal ties stored just below the tie therefore round down
  // (1.005 and 2.675 at precision 2 give 1.00 and 2.67), while exactly
  // representable ties still round away from zero (2.5 gives 3 and -2.5
  // gives -3 at precision 0). The declared mode is echoed in the result.
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

function classifyAt(
  definition: FormulaDefinition,
  value: number,
): FormulaClassification | undefined {
  if (!definition.classify) return undefined;
  let rawClassification: unknown;
  try {
    rawClassification = definition.classify(value);
  } catch {
    return undefined;
  }
  if (
    !rawClassification ||
    typeof rawClassification !== 'object' ||
    typeof (rawClassification as FormulaClassification).code !== 'string' ||
    typeof (rawClassification as FormulaClassification).label !== 'string'
  ) {
    return undefined;
  }
  const valid = rawClassification as FormulaClassification;
  return Object.freeze({ code: valid.code, label: valid.label });
}

function formatDisplayValue(value: number, precision: number): string {
  if (precision > 100 || Math.abs(value) >= 1e21) return String(value);
  return value.toFixed(precision);
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
  const checkHits = findSoftCheckHitsGuarded(
    definition,
    validation.normalizedValues,
  );
  if (checkHits === undefined) {
    return {
      status: 'unavailable',
      ...metadata,
      reason: 'The pinned formula confirmation checks could not be evaluated.',
    };
  }
  const confirmedCheckIds = new Set(validation.confirmedCheckIds);
  if (checkHits.some((check) => !confirmedCheckIds.has(check.id))) {
    const result: CalculationConfirmationRequiredResult = {
      status: 'confirmation-required',
      ...metadata,
      checks: checkHits,
    };
    return result;
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
    definition.output.rounding,
  );
  if (displayValue === undefined) {
    return {
      status: 'unavailable',
      ...metadata,
      reason: 'The pinned formula result could not be rounded safely.',
    };
  }
  let classification: FormulaClassification | undefined;
  let classificationNote: string | undefined;
  if (definition.classify) {
    classification = classifyAt(definition, unroundedValue);
    if (!classification) {
      return {
        status: 'unavailable',
        ...metadata,
        reason: 'The pinned formula classification could not be computed.',
      };
    }
    const displayClassification = classifyAt(definition, displayValue);
    if (!displayClassification) {
      return {
        status: 'unavailable',
        ...metadata,
        reason:
          'The pinned formula classification could not be compared with the displayed value.',
      };
    }
    if (classification.code !== displayClassification.code) {
      const classificationLabel =
        classification.label.split(':')[0] ?? classification.label;
      classificationNote = `${classificationLabel} uses the unrounded exact value ${String(unroundedValue)} ${definition.output.unit}; the displayed value ${formatDisplayValue(displayValue, definition.output.rounding.precision)} ${definition.output.unit} would be classified as ${displayClassification.label}.`;
    }
  }
  return {
    status: 'ok',
    ...metadata,
    displayValue,
    unroundedValue,
    unit: definition.output.unit,
    precision: definition.output.rounding.precision,
    rounding: {
      mode: definition.output.rounding.mode,
      precision: definition.output.rounding.precision,
    },
    ...(classification ? { classification } : {}),
    ...(classificationNote ? { classificationNote } : {}),
    confirmedChecks: checkHits,
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
  try {
    if (
      !registry ||
      !request ||
      typeof registry.resolveForCalculation !== 'function'
    ) {
      return unavailableWithoutDefinition(
        requestedId(request?.formulaId),
        requestedId(request?.formulaVersion),
        'The pinned formula request could not be processed.',
      );
    }
    const formulaId = requestedId(request.formulaId);
    const formulaVersion = requestedId(request.formulaVersion);
    const definition = registry.resolveForCalculation(
      formulaId,
      formulaVersion,
    );
    if (!definition) {
      return unavailableWithoutDefinition(formulaId, formulaVersion);
    }
    return calculateKnownFormula(definition, request);
  } catch {
    // Registry lookup, input validation, guard evaluation, and rounding all
    // resolve here with a sanitized reason instead of throwing.
    let formulaId = '';
    let formulaVersion = '';
    try {
      formulaId = requestedId(request?.formulaId);
      formulaVersion = requestedId(request?.formulaVersion);
    } catch {
      // Keep the redacted fallback ids.
    }
    return unavailableWithoutDefinition(
      formulaId,
      formulaVersion,
      'The pinned formula request could not be processed.',
    );
  }
}
