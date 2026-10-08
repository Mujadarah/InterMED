import { deriveStableId } from '@intermed/domain';
import {
  canonicalizeConfig,
  ImporterConfigError,
  type CanonicalImporterConfig,
  type ImportIdentity,
  type SHA256Port,
} from './core';
import { normalizeKey } from './normalize';

/**
 * Generation version key derived solely from the raw snapshot SHA and the
 * canonical config SHA. It is computed BEFORE the catalogue is constructed and
 * sealed and never depends on the baseline or on run time.
 */
export function deriveGenerationVersionKey(
  configSha256: string,
  snapshotSha256: string,
  sha256: SHA256Port,
): string {
  return `gen-${sha256.hash(`${configSha256}\u001f${snapshotSha256}`)}`;
}

/**
 * Import identity for one raw snapshot under one canonical config.
 * `datasetVersionId` is derived from the normalized source key and generation
 * version key. Candidate bytes are hashed without parsing or checking their
 * embedded identity; `stage` verifies that the sealed catalogue has this ID.
 * Throws ImporterConfigError if the stable ID cannot be derived, and propagates
 * errors from the supplied hash port.
 */
export function deriveIdentity(
  config: CanonicalImporterConfig,
  snapshotBytes: Uint8Array,
  candidateBytes: Uint8Array,
  sha256: SHA256Port,
): ImportIdentity {
  const configSha256 = sha256.hash(canonicalizeConfig(config));
  const snapshotSha256 = sha256.hash(snapshotBytes);
  const generationVersionKey = deriveGenerationVersionKey(
    configSha256,
    snapshotSha256,
    sha256,
  );
  const derived = deriveStableId(
    'DatasetVersion',
    normalizeKey(config.sourceKey),
    generationVersionKey,
  );
  if (!derived.ok) throw new ImporterConfigError(['config:sourceKey']);
  const candidateSha256 = sha256.hash(candidateBytes);
  return {
    datasetVersionId: derived.id,
    generationVersionKey,
    configSha256,
    snapshotSha256,
    candidateSha256,
  };
}
