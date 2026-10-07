/**
 * Credential-shape scanning for configuration as code and frontend build
 * output. Entropy patterns are reported only outside a genuine checksum
 * context: the application shell intentionally embeds SHA-256 asset integrity
 * digests under its public `hash` field names and its public revision
 * identifier, both provenance/security features rather than secrets. Key
 * patterns are never tolerated anywhere.
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

const publicValueWindow = 64;

/**
 * Checksum labels that legitimately carry high-entropy values: checksum and
 * integrity fields, including the `hash` field names of the shell build
 * manifest (`SHELL.assets[].hash` in `apps/web/dist/sw.js`). The exemption is
 * bound to the label of the value itself (plain, quoted or backslash-escaped
 * JSON/JS syntax), never to a word that merely appears nearby: generic words
 * such as `version`, `revision`, `id` or `name` must not hide a secret behind
 * themselves.
 */
const checksumLabel =
  /(?:^|[^\w-])(?:hash|sha-?1|sha-?256|sha-?384|sha-?512|md5|checksum|integrity|digest)(?:\\?["'])?\s*[:=]\s*(?:\\?["'])?$/i;

/** Explicit subresource-integrity prefixes: `sha256-<digest>`, `sha384-<digest>`. */
const integrityPrefix = /(?:^|[^A-Za-z0-9+/=])sha(?:256|384)-$/i;

/**
 * The shell's public revision metadata attribute — the one build-manifest field
 * besides `hash` that can carry a long identifier:
 * `<meta name="intermed-shell-revision" content="…">`. The exact attribute name
 * is required on purpose: the bare word `revision` exempts nothing.
 */
const shellRevisionAttribute =
  /name\s*=\s*(?:\\?["'])intermed-shell-revision(?:\\?["'])[^<>]*content\s*=\s*(?:\\?["'])$/i;

/**
 * Whether a high-entropy value sits in a genuine public checksum context: it is
 * labelled by a checksum field, carries an explicit integrity prefix, or fills
 * the shell's public revision metadata attribute.
 */
function isPublicChecksumValue(source: string, start: number): boolean {
  const prefix = source.slice(Math.max(0, start - publicValueWindow), start);
  return (
    checksumLabel.test(prefix) ||
    integrityPrefix.test(prefix) ||
    shellRevisionAttribute.test(prefix)
  );
}

/**
 * Report the first credential-shaped match in a source text. A long digest is
 * tolerated only when the value itself is a checksum value (see
 * {@link isPublicChecksumValue}); key-shaped matches are never tolerated
 * anywhere.
 * @returns The pattern label of the finding, or null when the text is clean.
 */
export function findCredentialShape(source: string): string | null {
  for (const { label, pattern, allowPublicValueContext } of secretPatterns) {
    // Rebuilding the matcher must keep every existing flag (notably `i`):
    // dropping it would miss `"x-appwrite-key": "…"` and other case variants.
    const matches = source.matchAll(
      new RegExp(pattern.source, `${pattern.flags.replaceAll('g', '')}g`),
    );
    for (const match of matches) {
      const start = match.index ?? 0;
      if (allowPublicValueContext && isPublicChecksumValue(source, start))
        continue;
      return label;
    }
  }
  return null;
}
