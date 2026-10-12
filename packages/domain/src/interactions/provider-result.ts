import type { PairCoverageStatus, ProviderResult } from './types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const PAIR_COVERAGE_STATUSES: readonly PairCoverageStatus[] = [
  'reported',
  'covered-no-record',
  'not-covered',
  'unsupported-context',
];

/** Record fields every downstream reader treats as strings. */
const REQUIRED_STRING_RECORD_FIELDS = [
  'id',
  'ingredientAId',
  'ingredientBId',
  'sourceId',
  'sourceVersion',
  'datasetVersionId',
] as const;

/** Optional record metadata that is surfaced verbatim, never inferred. */
const OPTIONAL_STRING_RECORD_FIELDS = [
  'severity',
  'normalizedSeverity',
  'severityMappingVersion',
  'clinicalEffect',
  'mechanism',
  'evidenceLevel',
  'management',
  'monitoring',
  'alternatives',
  'sourceInteractionId',
  'upstreamUpdatedAt',
] as const;

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

function isAbsentOrTyped(
  value: Record<string, unknown>,
  field: string,
  type: 'string' | 'boolean',
): boolean {
  return !Object.hasOwn(value, field) || typeof value[field] === type;
}

function isPairCoverage(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isStringArray(value.pair) || value.pair.length !== 2) return false;
  if (!PAIR_COVERAGE_STATUSES.includes(value.status as PairCoverageStatus))
    return false;
  if (!isAbsentOrTyped(value, 'retrievedAt', 'string')) return false;
  if (!isAbsentOrTyped(value, 'reason', 'string')) return false;
  if (!isAbsentOrTyped(value, 'stale', 'boolean')) return false;
  return true;
}

function isInteractionRecord(value: unknown): boolean {
  if (!isRecord(value)) return false;
  for (const field of REQUIRED_STRING_RECORD_FIELDS)
    if (typeof value[field] !== 'string') return false;
  for (const field of OPTIONAL_STRING_RECORD_FIELDS)
    if (!isAbsentOrTyped(value, field, 'string')) return false;
  if (!isAbsentOrTyped(value, 'severityMappingReviewed', 'boolean'))
    return false;
  if (!isAbsentOrTyped(value, 'sourceStatesUncertainEvidence', 'boolean'))
    return false;
  if (!isAbsentOrTyped(value, 'supersededBy', 'string')) return false;
  if (!isAbsentOrTyped(value, 'statusChangedAt', 'string')) return false;
  if (!isStringArray(value.evidenceIds)) return false;
  if (!isStringArray(value.contextLimitations)) return false;
  if (
    value.recordStatus !== 'current' &&
    value.recordStatus !== 'superseded' &&
    value.recordStatus !== 'withdrawn'
  )
    return false;
  if (!Array.isArray(value.updateHistory)) return false;
  for (const entry of value.updateHistory) {
    if (!isRecord(entry)) return false;
    if (typeof entry.sourceVersion !== 'string') return false;
    if (typeof entry.changedAt !== 'string') return false;
    if (
      entry.change !== 'created' &&
      entry.change !== 'updated' &&
      entry.change !== 'superseded' &&
      entry.change !== 'withdrawn'
    )
      return false;
  }
  return true;
}

/**
 * Structural guard for provider payloads. It is shared by the evaluation,
 * merge and assessment paths so a malformed payload is reported as
 * unavailable rather than throwing or being partially trusted. Coverage rows
 * must carry a two-id pair and a known status, and records must expose string
 * identifiers, list fields and verbatim string severity terms.
 */
export function isProviderResult(value: unknown): value is ProviderResult {
  try {
    if (!isRecord(value)) return false;
    if (typeof value.providerId !== 'string') return false;
    if (typeof value.sourceId !== 'string') return false;
    if (typeof value.sourceVersion !== 'string') return false;
    if (value.status !== 'available' && value.status !== 'unavailable')
      return false;
    if (!Array.isArray(value.pairCoverage)) return false;
    if (!value.pairCoverage.every(isPairCoverage)) return false;
    if (!Array.isArray(value.records)) return false;
    if (!value.records.every(isInteractionRecord)) return false;
    if (!Array.isArray(value.evidence)) return false;
    if (typeof value.retrievedAt !== 'string') return false;
    if (!isAbsentOrTyped(value, 'reason', 'string')) return false;
    return true;
  } catch {
    return false;
  }
}
