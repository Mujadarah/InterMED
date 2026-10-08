/**
 * Deterministic key comparison by UTF-16 code units. Locale-aware comparison is
 * avoided so row ordering is identical in every runtime.
 */
export function compareKeys(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
