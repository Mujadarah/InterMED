import type {
  DrugInteraction,
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
  if (!mapping || interaction.severity === undefined) return sourceRecord;

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
    severityMappingVersion: mapping.mappingVersion,
  };
}

export function collectValidRecords(
  result: ProviderResult,
  requestedPairs: ReadonlySet<string>,
  reasonSet: Set<InteractionIncompleteReason>,
  sourceVersions: InteractionSourceVersion[],
  options: InteractionEvaluationOptions,
  expectedDatasetVersionId: DatasetVersionId,
): {
  readonly validRecords: DrugInteraction[];
  readonly recordsByPair: Map<string, DrugInteraction[]>;
} {
  const validRecords: DrugInteraction[] = [];
  const recordsByPair = new Map<string, DrugInteraction[]>();
  for (const record of result.records) {
    const pair = canonicalPair(record.ingredientAId, record.ingredientBId);
    const key = pairKey(pair);
    if (pair[0] === pair[1] || !requestedPairs.has(key)) {
      addIncompleteReason(reasonSet, 'record-pair-outside-request');
      continue;
    }
    const canonicalRecord: DrugInteraction = {
      ...record,
      ingredientAId: pair[0],
      ingredientBId: pair[1],
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
    validRecords.push(mappedRecord);
    const pairRecords = recordsByPair.get(key) ?? [];
    pairRecords.push(mappedRecord);
    recordsByPair.set(key, pairRecords);
  }
  return { validRecords, recordsByPair };
}
