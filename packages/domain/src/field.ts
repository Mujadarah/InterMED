/** Why a value is absent without substituting a clinical default. */
export type UnknownReason =
  | 'source-marked-unknown'
  | 'ambiguous-decimal'
  | 'not-a-decimal'
  | 'unrecognized-unit'
  | 'conflicting-values'
  | 'not-determinable';

/**
 * Explicit presence. Missing and unknown are never coerced to a usable value.
 */
export type FieldState<T> =
  | { readonly status: 'missing' }
  | { readonly status: 'unknown'; readonly reason: UnknownReason }
  | { readonly status: 'present'; readonly value: T };

export const MISSING: { readonly status: 'missing' } = { status: 'missing' };

/** Record that the source marked a value unknown, or that it cannot be determined. */
export function unknownField(reason: UnknownReason): FieldState<never> {
  return { status: 'unknown', reason };
}

/** Record a source-supplied value without changing it. */
export function presentField<T>(value: T): FieldState<T> {
  return { status: 'present', value };
}
