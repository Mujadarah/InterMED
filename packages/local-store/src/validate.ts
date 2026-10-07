import {
  MEDICATION_CATALOGUE_SCHEMA_VERSION,
  deserializeCatalogue,
  fingerprint,
  validateReferentialIntegrity,
  type DatasetUpdateFailureReason,
  type MedicationCatalogueSnapshot,
  type PublishedDatasetManifest,
} from '@intermed/domain';

/**
 * Manifest and bundle validation for the update pipeline.
 *
 * Every check runs outside IndexedDB transactions. The checksum comparison is
 * an accidental-corruption check (domain `fingerprint`, FNV-1a 64-bit), not a
 * security hash and not a source-authority claim: authority comes from trusted
 * HTTPS publication and controlled manifest promotion.
 */

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
 */
export function checkBundle(
  manifest: PublishedDatasetManifest,
  bundleText: string,
): BundleValidation {
  if (fingerprint(bundleText) !== manifest.checksum)
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
  if (validateReferentialIntegrity(snapshot).length > 0)
    return { ok: false, reason: 'integrity-failed' };
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
