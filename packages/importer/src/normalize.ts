/** Normalize keys to NFC, fold Romanian cedillas to comma-below forms and lowercase. */
export function normalizeKey(key: string): string {
  // NFC, fold legacy cedilla to comma-below, fold case
  return key
    .normalize('NFC')
    .replace(/\u015E/g, '\u0218') // Ş -> Ș
    .replace(/\u015F/g, '\u0219') // ş -> ș
    .replace(/\u0162/g, '\u021A') // Ţ -> Ț
    .replace(/\u0163/g, '\u021B') // ţ -> ț
    .toLowerCase(); // Case folding
}
