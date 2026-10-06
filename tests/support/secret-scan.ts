/**
 * Credential-shape scanning for configuration as code and frontend build
 * output. Entropy patterns are reported only outside public-value context: the
 * application shell intentionally embeds SHA-256 asset integrity digests and
 * its public revision identifier, both provenance/security features rather than
 * secrets. Key patterns are never tolerated anywhere.
 */

export interface SecretPattern {
  readonly label: string;
  readonly pattern: RegExp;
  /** Entropy patterns may be public digests; key patterns never are. */
  readonly allowPublicValueContext: boolean;
}

export const secretPatterns: readonly SecretPattern[] = [
  {
    label: 'Appwrite standard_ API key',
    pattern: /standard_[A-Za-z0-9._-]{16,}/,
    allowPublicValueContext: false,
  },
  {
    label: 'API key assignment carrying a value',
    pattern: /(?:APPWRITE_API_KEY|X-Appwrite-Key)["']?\s*[:=]\s*["']?[^\s"']+/i,
    allowPublicValueContext: false,
  },
  {
    label: 'long hexadecimal secret',
    pattern: /\b[a-fA-F0-9]{40,}\b/,
    allowPublicValueContext: true,
  },
  {
    label: 'long base64 secret',
    pattern: /(?<![A-Za-z0-9+/=])[A-Za-z0-9+]{56,}={0,2}(?![A-Za-z0-9+/=])/,
    allowPublicValueContext: true,
  },
];

/**
 * Names of public values that legitimately carry high-entropy strings: asset
 * integrity digests and the public build/revision provenance marker.
 */
const publicValueMarker =
  /\b(?:hash|sha-?1|sha-?256|sha-?512|md5|checksum|integrity|digest|revision|version)\b/i;

const publicValueWindow = 64;

/**
 * Report the first credential-shaped match in a source text. A long digest is
 * tolerated only when the text before it names a checksum or revision value;
 * key-shaped matches are never tolerated anywhere.
 * @returns The pattern label of the finding, or null when the text is clean.
 */
export function findCredentialShape(source: string): string | null {
  for (const { label, pattern, allowPublicValueContext } of secretPatterns) {
    const matches = source.matchAll(new RegExp(pattern.source, 'g'));
    for (const match of matches) {
      const start = match.index ?? 0;
      const prefix = source.slice(
        Math.max(0, start - publicValueWindow),
        start,
      );
      if (allowPublicValueContext && publicValueMarker.test(prefix)) continue;
      return label;
    }
  }
  return null;
}
