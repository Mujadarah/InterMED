import { foldForMedicationSearch, type FieldState } from '@intermed/domain';

/**
 * Fold a verbatim name into an index key.
 *
 * The folded value is only an index key for name/DCI lookups. It never replaces
 * the verbatim source text, which stays on the entity unchanged. Folding maps
 * legacy Romanian cedilla letters to comma-below (domain rule), removes
 * combining marks after decomposition and lowercases; it does not translate,
 * expand or correct anything.
 */
export function foldForIndex(value: string): string {
  return foldForMedicationSearch(value);
}

/** Fold a present field and return an empty key for missing/unknown values. */
export function foldFieldForIndex(field: FieldState<string>): string {
  return field.status === 'present' ? foldForIndex(field.value) : '';
}
