import { MISSING, type FieldState, type UnknownReason } from './field';

/**
 * Structural strength tokens only. Membership is not a clinical equivalence
 * and never authorizes converting one token into another.
 */
const STRUCTURAL_STRENGTH_UNITS: ReadonlySet<string> = new Set([
  'mg',
  'g',
  'mcg',
  'µg',
  'kg',
  'ml',
  'mL',
  'l',
  'L',
  'UI',
  'IU',
  '%',
  'mg/ml',
  'mg/mL',
  'g/l',
  'g/L',
  'mg/g',
  'mcg/ml',
  'µg/ml',
  'mcg/mL',
  'µg/mL',
]);

export type UnitField =
  | { readonly status: 'missing' }
  | { readonly status: 'unknown'; readonly reason: UnknownReason }
  | {
      readonly status: 'invalid';
      readonly sourceText: string;
      readonly reason: 'unrecognized-unit' | 'not-a-unit-token';
    }
  | { readonly status: 'present'; readonly sourceText: string };

/**
 * Keep every fractional digit. A token that is equally readable as thousands
 * or as a decimal stays unknown. No numeric conversion is applied.
 */
export function normalizeDecimalToken(token: string): FieldState<string> {
  if (!/^\d+(?:[.,]\d+)?$/.test(token))
    return { status: 'unknown', reason: 'not-a-decimal' };
  const dot = token.indexOf('.');
  const comma = token.indexOf(',');
  const separator = Math.max(dot, comma);
  if (separator === -1) return { status: 'present', value: token };
  const whole = token.slice(0, separator);
  const fraction = token.slice(separator + 1);
  if (whole.length >= 1 && whole.length <= 3 && fraction.length === 3)
    return { status: 'unknown', reason: 'ambiguous-decimal' };
  return { status: 'present', value: `${whole}.${fraction}` };
}

/** Classify a unit token. The source text is returned unchanged for every branch. */
export function assessUnit(input: FieldState<string>): UnitField {
  if (input.status === 'missing') return MISSING;
  if (input.status === 'unknown')
    return { status: 'unknown', reason: input.reason };
  const sourceText = input.value;
  if (sourceText.trim() === '' || !/^[\p{L}%/]+$/u.test(sourceText))
    return { status: 'invalid', sourceText, reason: 'not-a-unit-token' };
  if (!STRUCTURAL_STRENGTH_UNITS.has(sourceText))
    return { status: 'invalid', sourceText, reason: 'unrecognized-unit' };
  return { status: 'present', sourceText };
}

export interface AssessedQuantity {
  readonly value: FieldState<string>;
  readonly normalized: FieldState<string>;
  readonly unit: UnitField;
  readonly originalText: FieldState<string>;
}

/** Pair a verbatim quantity token with a normalized decimal only when unambiguous. */
export function assessQuantity(input: {
  readonly value: FieldState<string>;
  readonly unit: FieldState<string>;
  readonly originalText: FieldState<string>;
}): AssessedQuantity {
  const normalized =
    input.value.status === 'present'
      ? normalizeDecimalToken(input.value.value)
      : input.value.status === 'missing'
        ? MISSING
        : input.value;
  return {
    value: input.value,
    normalized,
    unit: assessUnit(input.unit),
    originalText: input.originalText,
  };
}
