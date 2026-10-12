import type {
  DrugInteraction,
  InactiveInteractionRecord,
  InteractionEvaluationOptions,
  InteractionIncompleteReason,
  InteractionSourceVersion,
  ProviderResult,
  SeverityMapping,
} from './types';
import type { DatasetVersionId } from '../ids';
import {
  addIncompleteReason,
  addSourceVersion,
  canonicalPair,
  pairKey,
} from './pairs';

export function mapSeverity(
  interaction: DrugInteraction,
  mapping: SeverityMapping | undefined,
): DrugInteraction {
  const {
    normalizedSeverity: existingNormalizedSeverity,
    severityMappingVersion: existingMappingVersion,
    severityMappingReviewed: existingMappingReviewed,
    ...sourceRecord
  } = interaction as DrugInteraction & {
    readonly severityMappingReviewed?: boolean;
  };
  void existingNormalizedSeverity;
  void existingMappingVersion;
  void existingMappingReviewed;
  if (!mapping) return sourceRecord;
  const mappingMetadata = {
    severityMappingVersion: mapping.mappingVersion,
    severityMappingReviewed: mapping.reviewed === true,
  } as const;
  // An unreviewed mapping must not produce a normalized severity value.
  if (mapping.reviewed !== true) return { ...sourceRecord, ...mappingMetadata };
  // Without a source term there is nothing to map, but "unknown" stays
  // explicit so it cannot be confused with "not requested".
  if (interaction.severity === undefined)
    return {
      ...sourceRecord,
      normalizedSeverity: 'unmapped',
      ...mappingMetadata,
    };

  const sourceTerm = interaction.severity;
  const hasExplicitMapping = Object.prototype.hasOwnProperty.call(
    mapping.map,
    sourceTerm,
  );
  const normalizedSeverity = hasExplicitMapping
    ? (mapping.map[sourceTerm] ?? 'unmapped')
    : 'unmapped';
  return {
    ...sourceRecord,
    normalizedSeverity,
    ...mappingMetadata,
  };
}

export function collectValidRecords(
  result: ProviderResult,
  requestedPairs: ReadonlySet<string>,
  reasonSet: Set<InteractionIncompleteReason>,
  sourceVersions: InteractionSourceVersion[],
  options: InteractionEvaluationOptions,
  expectedDatasetVersionId: DatasetVersionId,
  expectedSourceVersion: string,
): {
  readonly validRecords: DrugInteraction[];
  readonly recordsByPair: Map<string, DrugInteraction[]>;
  readonly inactiveRecords: InactiveInteractionRecord[];
  readonly inactiveRecordsByPair: Map<string, DrugInteraction[]>;
} {
  const validRecords: DrugInteraction[] = [];
  const recordsByPair = new Map<string, DrugInteraction[]>();
  const inactiveRecords: InactiveInteractionRecord[] = [];
  const inactiveRecordsByPair = new Map<string, DrugInteraction[]>();
  for (const record of result.records) {
    const pair = canonicalPair(record.ingredientAId, record.ingredientBId);
    const key = pairKey(pair);
    if (pair[0] === pair[1] || !requestedPairs.has(key)) {
      addIncompleteReason(reasonSet, 'record-pair-outside-request');
      continue;
    }
    const { isOutdated: _providerOutdatedFlag, ...sourceRecord } = record;
    void _providerOutdatedFlag;
    const isOutdated = record.sourceVersion !== expectedSourceVersion;
    if (isOutdated)
      addIncompleteReason(reasonSet, 'outdated-record-source-version');
    const canonicalRecord: DrugInteraction = {
      ...sourceRecord,
      ingredientAId: pair[0],
      ingredientBId: pair[1],
      ...(isOutdated ? { isOutdated: true } : {}),
    };
    if (
      record.sourceId !== result.sourceId ||
      record.sourceVersion !== result.sourceVersion
    )
      addIncompleteReason(reasonSet, 'provider-version-mismatch');
    // A record from another dataset generation stays visible with its own
    // version; it is never silently rewritten, but coverage is incomplete.
    if (record.datasetVersionId !== expectedDatasetVersionId)
      addIncompleteReason(reasonSet, 'record-dataset-version-mismatch');
    addSourceVersion(sourceVersions, {
      providerId: result.providerId,
      sourceId: record.sourceId,
      sourceVersion: record.sourceVersion,
    });
    const mappedRecord = mapSeverity(canonicalRecord, options.severityMapping);
    if (mappedRecord.recordStatus !== 'current') {
      inactiveRecords.push({
        record: mappedRecord,
        reason: mappedRecord.recordStatus,
      });
      const pairRecords = inactiveRecordsByPair.get(key) ?? [];
      pairRecords.push(mappedRecord);
      inactiveRecordsByPair.set(key, pairRecords);
      continue;
    }
    validRecords.push(mappedRecord);
    const pairRecords = recordsByPair.get(key) ?? [];
    pairRecords.push(mappedRecord);
    recordsByPair.set(key, pairRecords);
  }
  return {
    validRecords,
    recordsByPair,
    inactiveRecords,
    inactiveRecordsByPair,
  };
}
