import { decodeBytes } from './parser';
import { compareKeys } from './keys';
import { isRecord, deepEqual } from './deep-equal';
import { normalizeKey } from './normalize';
import {
  assertValidConfig,
  boundedIssues,
  type CanonicalImporterConfig,
} from './core';

/** One synthetic source row before domain validation. */
export type RawRow = Record<string, unknown>;

export const ENTITY_LIST_NAMES = [
  'products',
  'activeIngredients',
  'medicationIngredients',
  'atcCodes',
  'dosageForms',
  'manufacturers',
  'marketingAuthorizationHolders',
  'regulatoryDocuments',
] as const;

export type EntityListName = (typeof ENTITY_LIST_NAMES)[number];

/**
 * Typed `anmdmr-synthetic` envelope. Everything is read from `unknown` with
 * explicit narrowing; row payloads stay open records for the domain validator.
 */
export interface RawSnapshotDocument {
  format: string;
  schemaVersion: string;
  synthetic: boolean;
  completeness: string;
  sourceKey: string;
  datasetVersionKey?: string;
  recordCounts: Record<string, number>;
  dataSource: RawRow;
  datasetVersion: RawRow;
  products: RawRow[];
  activeIngredients: RawRow[];
  medicationIngredients: RawRow[];
  atcCodes: RawRow[];
  dosageForms: RawRow[];
  manufacturers: RawRow[];
  marketingAuthorizationHolders: RawRow[];
  regulatoryDocuments: RawRow[];
}

export type ParseQuarantineReason =
  | 'oversized-snapshot'
  | 'undecodable-snapshot'
  | 'malformed-json'
  | 'invalid-envelope'
  | 'config-envelope-mismatch'
  | 'row-bound-exceeded'
  | 'conflicting-duplicate'
  | 'count-mismatch';

export type ParseResult =
  | { status: 'success'; snapshot: RawSnapshotDocument; issues: string[] }
  | { status: 'quarantined'; reason: ParseQuarantineReason; issues: string[] };

const ENVELOPE_FIELDS = new Set<string>([
  'format',
  'schemaVersion',
  'synthetic',
  'completeness',
  'sourceKey',
  'datasetVersionKey',
  'recordCounts',
  'dataSource',
  'datasetVersion',
  ...ENTITY_LIST_NAMES,
]);

const keyFields = new Set([
  'sourceKey',
  'datasetVersionKey',
  'sourceProductId',
  'dosageFormKey',
  'marketingAuthorizationHolderKey',
  'sourceRecordKey',
  'sourceIngredientId',
  'productSourceKey',
  'productSourceKeySource',
  'ingredientKey',
  'previousVersionKey',
  'version',
  'dataset',
]);

const keyArrayFields = new Set([
  'atcKeys',
  'manufacturerKeys',
  'regulatoryDocumentKeys',
]);

const ROW_ID_FIELDS = [
  'sourceProductId',
  'sourceRecordKey',
  'version',
  'sourceIngredientId',
  'sourceKey',
] as const;

/** Narrow a value to a nonempty string. */
function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** Require an array whose entries are non-null, non-array records. */
function isRowArray(value: unknown): value is RawRow[] {
  return Array.isArray(value) && value.every((item) => isRecord(item));
}

/** Recognize a present field-state wrapper containing a string value. */
function isPresentTextField(value: unknown): value is { value: string } {
  return (
    isRecord(value) &&
    value.status === 'present' &&
    typeof value.value === 'string'
  );
}

/**
 * Key material is normalized wherever it appears, including inside field-state
 * wrappers such as `dosageFormKey` and `ingredientKey`. Display text is never
 * touched: source text, diacritics and padding stay verbatim.
 */
function normalizeKeys(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) normalizeKeys(item);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'string' && keyFields.has(key)) {
      value[key] = normalizeKey(child);
    } else if (isPresentTextField(child) && keyFields.has(key)) {
      child.value = normalizeKey(child.value);
    } else if (Array.isArray(child) && keyArrayFields.has(key)) {
      for (let index = 0; index < child.length; index += 1) {
        const item = child[index];
        if (typeof item === 'string') child[index] = normalizeKey(item);
      }
    } else {
      normalizeKeys(child);
    }
  }
}

/** Return the first nonempty supported row key, or null when none exists. */
function rowIdentity(row: RawRow): string | null {
  for (const field of ROW_ID_FIELDS) {
    const value = row[field];
    if (isText(value)) return value;
  }
  return null;
}

/**
 * Collapse identical duplicate rows and sort every row collection by its
 * stable key. Conflicting rows under one key fail closed.
 */
function normalizeRowList(
  rows: RawRow[],
  label: string,
  issues: string[],
): RawRow[] | null {
  const seen = new Map<string, RawRow>();
  const deduped: RawRow[] = [];
  for (const row of rows) {
    const id = rowIdentity(row);
    if (id !== null) {
      const existing = seen.get(id);
      if (existing) {
        if (deepEqual(existing, row))
          issues.push(`duplicate-identical-row:${label}`);
        else return null;
        continue;
      }
      seen.set(id, row);
    }
    for (const [key, child] of Object.entries(row)) {
      if (isRowArray(child)) {
        const nested = normalizeRowList(child, label, issues);
        if (nested === null) return null;
        row[key] = nested;
      }
    }
    deduped.push(row);
  }
  deduped.sort((a, b) =>
    compareKeys(rowIdentity(a) ?? '', rowIdentity(b) ?? ''),
  );
  return deduped;
}

/** Collect structural envelope and declared-count issue codes before domain validation. */
function envelopeProblems(root: Record<string, unknown>): string[] {
  const problems: string[] = [];
  for (const key of Object.keys(root)) {
    if (!ENVELOPE_FIELDS.has(key)) {
      problems.push(`unexpected-envelope-field:${key}`);
    }
  }
  if (root.format !== 'anmdmr-synthetic') problems.push('envelope:format');
  if (!isText(root.schemaVersion)) problems.push('envelope:schemaVersion');
  if (typeof root.synthetic !== 'boolean') problems.push('envelope:synthetic');
  if (root.completeness !== 'full' && root.completeness !== 'partial') {
    problems.push('envelope:completeness');
  }
  if (!isText(root.sourceKey)) problems.push('envelope:sourceKey');
  if (root.datasetVersionKey !== undefined && !isText(root.datasetVersionKey)) {
    problems.push('envelope:datasetVersionKey');
  }
  if (!isRecord(root.dataSource)) problems.push('envelope:dataSource');
  if (!isRecord(root.datasetVersion)) problems.push('envelope:datasetVersion');
  for (const name of ENTITY_LIST_NAMES) {
    if (!isRowArray(root[name])) problems.push(`envelope:${name}`);
  }

  const recordCounts = root.recordCounts;
  if (!isRecord(recordCounts)) {
    problems.push('envelope:recordCounts');
  } else {
    const keys = Object.keys(recordCounts);
    const canonical = [...ENTITY_LIST_NAMES].sort();
    if (
      keys.length !== canonical.length ||
      canonical.some((key) => !Object.hasOwn(recordCounts, key))
    ) {
      problems.push('envelope:recordCounts-keys');
    }
    for (const [key, value] of Object.entries(recordCounts)) {
      if (
        typeof value !== 'number' ||
        !Number.isSafeInteger(value) ||
        value < 0
      ) {
        problems.push(`envelope:recordCounts.${key}`);
      }
    }
  }
  return problems;
}

/**
 * Parse one raw snapshot under the finite validated config.
 *
 * Count policy: `recordCounts` declares the UNIQUE rows per entity list, i.e.
 * the row counts AFTER identical duplicate rows have been collapsed. Bounds are
 * enforced against the ACTUAL rows as delivered, never against declared counts.
 * Returns normalized rows and bounded issues on success, or a quarantine
 * reason for decoding, JSON, envelope, duplicate or count failures. This does
 * not validate domain entities or require a full, synthetic snapshot.
 * Throws ImporterConfigError for invalid configuration before parsing.
 */
export function parseRawSnapshot(
  bytes: Uint8Array,
  config: CanonicalImporterConfig,
): ParseResult {
  assertValidConfig(config);

  if (bytes.length > config.maxRawBytes) {
    return {
      status: 'quarantined',
      reason: 'oversized-snapshot',
      issues: [`raw-bytes-over-limit`],
    };
  }

  let text: string;
  try {
    text = decodeBytes(bytes, config.parserEncoding);
  } catch {
    return {
      status: 'quarantined',
      reason: 'undecodable-snapshot',
      issues: ['undecodable-snapshot'],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      status: 'quarantined',
      reason: 'malformed-json',
      issues: ['malformed-json'],
    };
  }

  if (!isRecord(parsed)) {
    return {
      status: 'quarantined',
      reason: 'invalid-envelope',
      issues: ['envelope:root'],
    };
  }

  const envelopeIssues = envelopeProblems(parsed);
  if (envelopeIssues.length > 0) {
    return {
      status: 'quarantined',
      reason: 'invalid-envelope',
      issues: boundedIssues(envelopeIssues),
    };
  }

  if (
    parsed.schemaVersion !== config.schemaVersion ||
    normalizeKey(parsed.sourceKey as string) !== normalizeKey(config.sourceKey)
  ) {
    return {
      status: 'quarantined',
      reason: 'config-envelope-mismatch',
      issues: ['envelope:config-mismatch'],
    };
  }

  // Bounds use the actual rows as delivered, never the declared counts.
  const deliveredRows = ENTITY_LIST_NAMES.reduce(
    (total, name) => total + (parsed[name] as RawRow[]).length,
    0,
  );
  if (deliveredRows > config.maxRows) {
    return {
      status: 'quarantined',
      reason: 'row-bound-exceeded',
      issues: ['rows-over-limit'],
    };
  }

  normalizeKeys(parsed);

  const issues: string[] = [];
  for (const name of ENTITY_LIST_NAMES) {
    const rows = normalizeRowList(parsed[name] as RawRow[], name, issues);
    if (rows === null) {
      return {
        status: 'quarantined',
        reason: 'conflicting-duplicate',
        issues: boundedIssues([...issues, `conflicting-duplicate:${name}`]),
      };
    }
    parsed[name] = rows;
  }

  // Declared counts describe the unique rows after identical deduplication.
  const recordCounts = parsed.recordCounts as Record<string, number>;
  for (const name of ENTITY_LIST_NAMES) {
    const declared = recordCounts[name];
    const actual = (parsed[name] as RawRow[]).length;
    if (declared !== actual) {
      return {
        status: 'quarantined',
        reason: 'count-mismatch',
        issues: boundedIssues([
          ...issues,
          `count-mismatch:${name}:declared=${declared}:actual=${actual}`,
        ]),
      };
    }
  }

  const snapshot: RawSnapshotDocument = {
    format: parsed.format as string,
    schemaVersion: parsed.schemaVersion as string,
    synthetic: parsed.synthetic as boolean,
    completeness: parsed.completeness as string,
    sourceKey: parsed.sourceKey as string,
    recordCounts,
    dataSource: parsed.dataSource as RawRow,
    datasetVersion: parsed.datasetVersion as RawRow,
    products: parsed.products as RawRow[],
    activeIngredients: parsed.activeIngredients as RawRow[],
    medicationIngredients: parsed.medicationIngredients as RawRow[],
    atcCodes: parsed.atcCodes as RawRow[],
    dosageForms: parsed.dosageForms as RawRow[],
    manufacturers: parsed.manufacturers as RawRow[],
    marketingAuthorizationHolders:
      parsed.marketingAuthorizationHolders as RawRow[],
    regulatoryDocuments: parsed.regulatoryDocuments as RawRow[],
  };
  if (parsed.datasetVersionKey !== undefined) {
    snapshot.datasetVersionKey = parsed.datasetVersionKey as string;
  }
  return { status: 'success', snapshot, issues: boundedIssues(issues) };
}
