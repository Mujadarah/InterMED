import type { MedicationCatalogueSnapshot } from './catalogue';
import type { DatasetRecordCounts } from './entities';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Stable JSON for fingerprints. Key order is lexicographic and arrays keep their order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(orderValue(value)) ?? 'null';
}

function orderValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(orderValue);
  if (!isRecord(value)) return value;
  const ordered: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort())
    ordered[key] = orderValue(value[key]);
  return ordered;
}

/**
 * Non-cryptographic FNV-1a 64-bit fingerprint.
 * It detects accidental snapshot edits in tests. It is not a security hash.
 */
export function fingerprint(text: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const char of text) {
    const point = char.codePointAt(0);
    if (point === undefined) continue;
    hash ^= BigInt(point);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

/** Fingerprint the snapshot with every dataset checksum blanked out. */
export function catalogueFingerprint(
  snapshot: MedicationCatalogueSnapshot,
): string {
  const versions = Array.isArray(snapshot?.datasetVersions)
    ? snapshot.datasetVersions
    : [];
  const cleared = {
    ...snapshot,
    datasetVersions: versions.map((version) =>
      isRecord(version) ? { ...version, checksum: '' } : version,
    ),
  };
  return fingerprint(canonicalJson(cleared));
}

function counts(snapshot: MedicationCatalogueSnapshot): DatasetRecordCounts {
  return {
    dataSources: snapshot.dataSources.length,
    datasetVersions: snapshot.datasetVersions.length,
    products: snapshot.products.length,
    activeIngredients: snapshot.activeIngredients.length,
    medicationIngredients: snapshot.medicationIngredients.length,
    atcCodes: snapshot.atcCodes.length,
    dosageForms: snapshot.dosageForms.length,
    manufacturers: snapshot.manufacturers.length,
    marketingAuthorizationHolders:
      snapshot.marketingAuthorizationHolders.length,
    regulatoryDocuments: snapshot.regulatoryDocuments.length,
  };
}

/** Fill record counts and the integrity checksum on the first dataset version. */
export function sealCatalogue(
  snapshot: MedicationCatalogueSnapshot,
): MedicationCatalogueSnapshot {
  try {
    const version = snapshot.datasetVersions[0];
    if (!version) return snapshot;
    const withCounts: MedicationCatalogueSnapshot = {
      ...snapshot,
      datasetVersions: snapshot.datasetVersions.map((item, index) =>
        index === 0
          ? { ...item, recordCounts: counts(snapshot), checksum: '' }
          : item,
      ),
    };
    const checksum = catalogueFingerprint(withCounts);
    return {
      ...withCounts,
      datasetVersions: withCounts.datasetVersions.map((item, index) =>
        index === 0 ? { ...item, checksum } : item,
      ),
    };
  } catch {
    return snapshot;
  }
}
