import type { ProviderResult } from './types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Structural guard for provider payloads. It is shared by the evaluation,
 * merge and assessment paths so a malformed payload is reported as
 * unavailable rather than throwing or being partially trusted.
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
    if (!Array.isArray(value.records)) return false;
    for (const record of value.records) {
      if (!isRecord(record)) return false;
      if (
        record.recordStatus !== 'current' &&
        record.recordStatus !== 'superseded' &&
        record.recordStatus !== 'withdrawn'
      )
        return false;
      if (!Array.isArray(record.updateHistory)) return false;
      for (const entry of record.updateHistory) {
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
      if (
        Object.hasOwn(record, 'supersededBy') &&
        typeof record.supersededBy !== 'string'
      )
        return false;
      if (
        Object.hasOwn(record, 'statusChangedAt') &&
        typeof record.statusChangedAt !== 'string'
      )
        return false;
      if (
        Object.hasOwn(record, 'sourceStatesUncertainEvidence') &&
        typeof record.sourceStatesUncertainEvidence !== 'boolean'
      )
        return false;
    }
    if (!Array.isArray(value.evidence)) return false;
    if (typeof value.retrievedAt !== 'string') return false;
    return true;
  } catch {
    return false;
  }
}
