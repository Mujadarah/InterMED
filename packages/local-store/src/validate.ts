import {
  MEDICATION_CATALOGUE_SCHEMA_VERSION,
  deserializeCatalogue,
  validateReferentialIntegrity,
  type CatalogueIssueCode,
  type DatasetUpdateFailureReason,
  type MedicationCatalogueSnapshot,
  type PublishedDatasetManifest,
} from '@intermed/domain';

/**
 * Manifest and bundle validation for the update pipeline.
 *
 * Every check runs outside IndexedDB transactions. There are two deliberately
 * separate checksums. The transport checksum (`manifest.checksum`) is the
 * publisher's SHA-256 over the exact uploaded bundle bytes
 * (`sha256:<64 lowercase hex>`, Web Crypto); `checkBundle` recomputes it over
 * the bytes the bundle text re-encodes to, which reproduces the publisher's
 * sequence only when the loader decoded the download strictly — see
 * `decodeBundleBytes`. The internal catalogue checksum
 * (`datasetVersions[0].checksum`, domain `fingerprint`, FNV-1a 64-bit) stays
 * what it always was: an accidental-corruption check inside the catalogue,
 * enforced by `validateReferentialIntegrity`. Neither checksum is a security
 * hash or a source-authority claim: authority comes from trusted HTTPS
 * publication and controlled manifest promotion.
 */

/** Shape the published contract requires of `manifest.checksum`. */
const TRANSPORT_CHECKSUM_PATTERN = /^sha256:[0-9a-f]{64}$/;

/** Shared strict UTF-8 decoder: malformed bytes throw, a BOM is preserved. */
const STRICT_UTF8_DECODER = new TextDecoder('utf-8', {
  fatal: true,
  ignoreBOM: true,
});

/**
 * Strict, lossless text boundary for downloaded bundle bytes.
 *
 * Decodes UTF-8 with `fatal: true` (malformed sequences throw instead of being
 * replaced) and `ignoreBOM: true` (a leading BOM is kept in the text, not
 * stripped), and returns null when the bytes are not valid UTF-8. With both
 * options `new TextEncoder().encode(decoded)` reproduces the original bytes
 * exactly, which is what makes the SHA-256 transport checksum comparable: the
 * publisher hashed the bytes it uploaded, and this boundary hands the pipeline
 * text that re-encodes to those same bytes.
 *
 * Every concrete `PublishedBundleLoader` must decode with this helper and
 * report `unavailable` (for example with reason `invalid-response`) when it
 * returns null, never a lossy replacement: a loader that strips a BOM or
 * substitutes malformed sequences breaks the transport checksum.
 */
export function decodeBundleBytes(bytes: Uint8Array): string | null {
  try {
    return STRICT_UTF8_DECODER.decode(bytes);
  } catch {
    return null;
  }
}

/**
 * SHA-256 transport checksum of bundle bytes: `sha256:<64 lowercase hex>`.
 * Web Crypto exposes no synchronous digest, so callers must await it.
 */
export async function sha256TransportChecksum(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `sha256:${hex}`;
}

/**
 * Referential-integrity codes that are preserved data-quality notes, not
 * activation failures. The domain keeps these source tokens reviewable and
 * the publisher lets them through, so a published generation may carry them.
 * Exactly these two codes are tolerated — no wildcard, no severity
 * inference — and every other code `validateReferentialIntegrity` can emit
 * stays fatal.
 */
export const NON_FATAL_DATA_QUALITY_CODES: readonly CatalogueIssueCode[] = [
  'invalid-unit',
  'ambiguous-decimal',
];

/** Client version compared against `minimumClientVersion` of a manifest. */
export const LOCAL_CLIENT_VERSION = '0.0.0';

/** Manifest schema versions this client can consume. */
export const SUPPORTED_MANIFEST_SCHEMA_VERSIONS: readonly string[] = [
  MEDICATION_CATALOGUE_SCHEMA_VERSION,
];

export type BundleValidation =
  | {
      readonly ok: true;
      readonly snapshot: MedicationCatalogueSnapshot;
      readonly synthetic: boolean;
    }
  | { readonly ok: false; readonly reason: DatasetUpdateFailureReason };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFilledString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseVersion(value: string): readonly [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Whether `minimum` is satisfied by `client`, comparing x.y.z numerically. */
export function isClientCompatible(
  minimum: string,
  client: string = LOCAL_CLIENT_VERSION,
): boolean {
  const left = parseVersion(minimum);
  const right = parseVersion(client);
  if (!left || !right) return false;
  for (let index = 0; index < 3; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a !== b) return a < b;
  }
  return true;
}

const MANIFEST_REQUIRED_STRINGS = [
  'dataset',
  'datasetVersionId',
  'version',
  'checksum',
  'schemaVersion',
  'minimumClientVersion',
  'importedAt',
] as const;

/**
 * Validate a published manifest before anything is downloaded.
 * Returns the failure reason, or null when the manifest may be consumed.
 */
export function checkManifest(
  candidate: PublishedDatasetManifest,
  dataset: string,
): DatasetUpdateFailureReason | null {
  const manifest: unknown = candidate;
  if (!isRecord(manifest)) return 'invalid-manifest';
  if (manifest['dataset'] !== dataset) return 'invalid-manifest';
  for (const field of MANIFEST_REQUIRED_STRINGS)
    if (!isFilledString(manifest[field])) return 'invalid-manifest';
  const sourceIds = manifest['sourceIds'];
  if (
    !Array.isArray(sourceIds) ||
    sourceIds.length === 0 ||
    !sourceIds.every(isFilledString)
  )
    return 'invalid-manifest';
  const recordCounts = manifest['recordCounts'];
  if (!isRecord(recordCounts)) return 'invalid-manifest';
  const countKeys = Object.keys(recordCounts);
  if (!countKeys.includes('products')) return 'invalid-manifest';
  for (const key of countKeys) {
    if (!(key in RECORD_COUNT_KEYS)) return 'invalid-manifest';
    const value = recordCounts[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0)
      return 'invalid-manifest';
  }
  if (
    !SUPPORTED_MANIFEST_SCHEMA_VERSIONS.some(
      (supported) => supported === manifest['schemaVersion'],
    )
  )
    return 'incompatible-schema';
  const minimumClientVersion = manifest['minimumClientVersion'];
  if (
    typeof minimumClientVersion === 'string' &&
    !isClientCompatible(minimumClientVersion)
  )
    return 'incompatible-schema';
  return null;
}

/** Published count keys, identical to the snapshot collection names. */
const RECORD_COUNT_KEYS: Readonly<Record<string, true>> = {
  dataSources: true,
  datasetVersions: true,
  products: true,
  activeIngredients: true,
  medicationIngredients: true,
  atcCodes: true,
  dosageForms: true,
  manufacturers: true,
  marketingAuthorizationHolders: true,
  regulatoryDocuments: true,
};

/**
 * Validate one downloaded bundle against its manifest.
 * Rejects corrupted bytes, malformed or non-integral catalogues, a bundle that
 * does not identify the manifest's generation, and published count mismatches.
 * Asynchronous because the SHA-256 transport digest is (Web Crypto).
 *
 * Never throws for the digest itself: a context without `crypto.subtle` (a
 * non-secure origin) or a rejecting `digest` cannot verify the transport
 * checksum, so the bundle fails closed as `checksum-mismatch`. The caller
 * (`stageUnlocked`) has already set `staging` by then, and a throw here would
 * strand the whole pipeline in that state. `sha256TransportChecksum` stays
 * as it is and may reject; the handling belongs to this boundary (issue #12).
 */
export async function checkBundle(
  manifest: PublishedDatasetManifest,
  bundleText: string,
): Promise<BundleValidation> {
  if (!TRANSPORT_CHECKSUM_PATTERN.test(manifest.checksum))
    return { ok: false, reason: 'checksum-mismatch' };
  const bundleBytes = new TextEncoder().encode(bundleText);
  // An unverifiable bundle is one whose checksum cannot be shown to match.
  let transport: string;
  try {
    transport = await sha256TransportChecksum(bundleBytes);
  } catch {
    return { ok: false, reason: 'checksum-mismatch' };
  }
  if (transport !== manifest.checksum)
    return { ok: false, reason: 'checksum-mismatch' };
  const decoded = deserializeCatalogue(bundleText);
  if (!decoded.ok) return { ok: false, reason: 'invalid-bundle' };
  const snapshot = decoded.snapshot;
  const version = snapshot.datasetVersions[0];
  if (
    !version ||
    version.id !== manifest.datasetVersionId ||
    version.dataset !== manifest.dataset
  )
    return { ok: false, reason: 'invalid-bundle' };
  const publishedSources = [...manifest.sourceIds].sort().join('\u001f');
  const snapshotSources = [...version.sourceIds].sort().join('\u001f');
  if (publishedSources !== snapshotSources)
    return { ok: false, reason: 'invalid-bundle' };
  // The embedded dataset version must identify the same schema and client
  // requirement as its manifest (Greptile review fix G9).
  if (
    version.schemaVersion !== manifest.schemaVersion ||
    version.minimumClientVersion !== manifest.minimumClientVersion
  )
    return { ok: false, reason: 'invalid-bundle' };
  // ... and it gets the same compatibility treatment the manifest got.
  if (!SUPPORTED_MANIFEST_SCHEMA_VERSIONS.includes(version.schemaVersion))
    return { ok: false, reason: 'incompatible-schema' };
  if (!isClientCompatible(version.minimumClientVersion))
    return { ok: false, reason: 'incompatible-schema' };
  // Preserved data-quality notes do not reject a generation; everything else
  // `validateReferentialIntegrity` reports does (issue #12).
  const fatalIssues = validateReferentialIntegrity(snapshot).filter(
    (issue) => !NON_FATAL_DATA_QUALITY_CODES.includes(issue.code),
  );
  if (fatalIssues.length > 0) return { ok: false, reason: 'integrity-failed' };
  for (const [key, expected] of Object.entries(manifest.recordCounts)) {
    const collection = snapshot[key as keyof MedicationCatalogueSnapshot];
    if (!Array.isArray(collection) || collection.length !== expected)
      return { ok: false, reason: 'count-mismatch' };
  }
  return {
    ok: true,
    snapshot,
    synthetic: snapshot.dataSources.some((source) =>
      source.allowedUses.includes('automated-test'),
    ),
  };
}
