import { foldLegacyCedilla } from '@intermed/domain';

/**
 * Canonical parser encodings. The policy lives in the importer config and is
 * hashed into the generation identity, so one raw snapshot under one config can
 * never decode into two different candidates.
 */
export const SUPPORTED_ENCODINGS = ['utf-8', 'windows-1250'] as const;

export type SupportedEncoding = (typeof SUPPORTED_ENCODINGS)[number];

/** Canonical encoding name, or null when the encoding is not supported. */
export function canonicalEncodingName(value: string): SupportedEncoding | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'utf-8' || normalized === 'utf8') return 'utf-8';
  if (normalized === 'windows-1250') return 'windows-1250';
  return null;
}

/**
 * Decode raw bytes under one canonical encoding.
 *
 * Text policy matches the domain: a BOM is stripped, legacy cedilla letters are
 * folded to comma-below forms and the text is returned NFC. All other source
 * text, including șțăâî, padding and internal whitespace, is preserved.
 */
export function decodeBytes(bytes: Uint8Array, encoding: string): string {
  const enc = canonicalEncodingName(encoding);
  if (enc === null) {
    throw new Error(`Unsupported encoding: ${encoding}`);
  }

  const decoder = new TextDecoder(enc, { fatal: true });
  try {
    let text = decoder.decode(bytes);
    // Strip BOM if present
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }
    return foldLegacyCedilla(text).normalize('NFC');
  } catch (error) {
    throw new Error(`Failed to decode bytes as ${enc}: ${error}`);
  }
}
