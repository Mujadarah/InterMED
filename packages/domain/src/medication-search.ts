import type { MedicationProduct } from './entities';
import { foldLegacyCedilla } from './identity';

/**
 * Search-only projection of one product in one pinned local generation.
 * Source entities remain verbatim; this projection is never persisted.
 */
export interface MedicationSearchRecord {
  readonly product: MedicationProduct;
  readonly ingredientNames: readonly string[];
  readonly atcCodes: readonly string[];
  readonly dosageFormName: string | null;
  readonly manufacturerNames: readonly string[];
}

export type MedicationSearchMatchRank = 'exact' | 'prefix' | 'partial';

export interface MedicationSearchMatch {
  readonly record: MedicationSearchRecord;
  readonly rank: MedicationSearchMatchRank;
}

export interface MedicationSearchPage {
  readonly matches: readonly MedicationSearchMatch[];
  readonly total: number;
  readonly truncated: boolean;
}

interface IndexedRecord {
  readonly record: MedicationSearchRecord;
  readonly foldedCommercialName: string;
  readonly foldedId: string;
  readonly textTerms: readonly string[];
  readonly atcTerms: readonly string[];
}

/** Fixed upper bound for visible candidates. */
export const MAX_MEDICATION_SEARCH_RESULTS = 50;

/**
 * Apply the same Romanian folding used by the local catalogue indexes.
 * This is an index key only; it never replaces or edits source text.
 */
export function foldForMedicationSearch(value: string): string {
  return foldLegacyCedilla(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Fold a query or search field and normalize surrounding/repeated whitespace. */
export function normalizeMedicationSearchQuery(value: string): string {
  return foldForMedicationSearch(value).trim().replace(/\s+/gu, ' ');
}

/** Opaque, generation-scoped in-memory search index. */
export interface MedicationSearchIndex {
  readonly size: number;
  readonly entries: readonly IndexedRecord[];
}

function uniqueFolded(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const folded: string[] = [];
  for (const value of values) {
    const normalized = normalizeMedicationSearchQuery(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    folded.push(normalized);
  }
  return folded;
}

/** Build a text-only index for one active local generation. */
export function createMedicationSearchIndex(
  records: readonly MedicationSearchRecord[],
): MedicationSearchIndex {
  const entries = records.map((record) => ({
    record,
    foldedCommercialName: normalizeMedicationSearchQuery(
      record.product.commercialName,
    ),
    foldedId: record.product.id,
    textTerms: uniqueFolded([
      record.product.commercialName,
      ...(record.product.originalDciText.status === 'present'
        ? [record.product.originalDciText.value]
        : []),
      ...record.ingredientNames,
      ...record.manufacturerNames,
    ]),
    atcTerms: uniqueFolded(record.atcCodes),
  }));
  return { size: entries.length, entries };
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function textMatchRank(
  terms: readonly string[],
  query: string,
  allowPartial: boolean,
): MedicationSearchMatchRank | null {
  let best: MedicationSearchMatchRank | null = null;
  for (const term of terms) {
    if (term === query) return 'exact';
    if (term.startsWith(query)) best = 'prefix';
    else if (allowPartial && term.includes(query)) best ??= 'partial';
  }
  return best;
}

function rankOrder(rank: MedicationSearchMatchRank): number {
  switch (rank) {
    case 'exact':
      return 0;
    case 'prefix':
      return 1;
    case 'partial':
      return 2;
  }
}

/** Search folded commercial/DCI/manufacturer text and ATC prefixes locally. */
export function searchMedicationIndex(
  index: MedicationSearchIndex,
  query: string,
  limit = MAX_MEDICATION_SEARCH_RESULTS,
): MedicationSearchPage {
  const foldedQuery = normalizeMedicationSearchQuery(query);
  if (!foldedQuery) return { matches: [], total: 0, truncated: false };

  const requestedLimit = Number.isFinite(limit)
    ? Math.max(0, Math.floor(limit))
    : MAX_MEDICATION_SEARCH_RESULTS;
  const resultLimit = Math.min(MAX_MEDICATION_SEARCH_RESULTS, requestedLimit);
  const matches: {
    readonly entry: IndexedRecord;
    readonly rank: MedicationSearchMatchRank;
  }[] = [];

  for (const entry of index.entries) {
    const textRank = textMatchRank(entry.textTerms, foldedQuery, true);
    const atcRank = textMatchRank(entry.atcTerms, foldedQuery, false);
    const rank =
      textRank === null
        ? atcRank
        : atcRank === null || rankOrder(textRank) <= rankOrder(atcRank)
          ? textRank
          : atcRank;
    if (rank !== null) matches.push({ entry, rank });
  }

  matches.sort(
    (left, right) =>
      rankOrder(left.rank) - rankOrder(right.rank) ||
      compareStable(
        left.entry.foldedCommercialName,
        right.entry.foldedCommercialName,
      ) ||
      compareStable(left.entry.foldedId, right.entry.foldedId),
  );

  const total = matches.length;
  return {
    matches: matches
      .slice(0, resultLimit)
      .map(({ entry, rank }) => ({ record: entry.record, rank })),
    total,
    truncated: total > resultLimit,
  };
}
