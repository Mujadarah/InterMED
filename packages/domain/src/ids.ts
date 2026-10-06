declare const brand: unique symbol;

type Brand<T, B extends string> = T & { readonly [brand]: B };

export type MedicationProductId = Brand<string, 'MedicationProductId'>;
export type ActiveIngredientId = Brand<string, 'ActiveIngredientId'>;
export type MedicationIngredientId = Brand<string, 'MedicationIngredientId'>;
export type AtcCodeId = Brand<string, 'AtcCodeId'>;
export type DosageFormId = Brand<string, 'DosageFormId'>;
export type ManufacturerId = Brand<string, 'ManufacturerId'>;
export type MarketingAuthorizationHolderId = Brand<
  string,
  'MarketingAuthorizationHolderId'
>;
export type RegulatoryDocumentId = Brand<string, 'RegulatoryDocumentId'>;
export type DataSourceId = Brand<string, 'DataSourceId'>;
export type DatasetVersionId = Brand<string, 'DatasetVersionId'>;

export type EntityKind =
  | 'MedicationProduct'
  | 'ActiveIngredient'
  | 'MedicationIngredient'
  | 'AtcCode'
  | 'DosageForm'
  | 'Manufacturer'
  | 'MarketingAuthorizationHolder'
  | 'RegulatoryDocument'
  | 'DataSource'
  | 'DatasetVersion';

export interface IdByKind {
  readonly MedicationProduct: MedicationProductId;
  readonly ActiveIngredient: ActiveIngredientId;
  readonly MedicationIngredient: MedicationIngredientId;
  readonly AtcCode: AtcCodeId;
  readonly DosageForm: DosageFormId;
  readonly Manufacturer: ManufacturerId;
  readonly MarketingAuthorizationHolder: MarketingAuthorizationHolderId;
  readonly RegulatoryDocument: RegulatoryDocumentId;
  readonly DataSource: DataSourceId;
  readonly DatasetVersion: DatasetVersionId;
}

export interface IdIssue {
  readonly code:
    | 'empty-source-key'
    | 'control-character-in-key'
    | 'malformed-id'
    | 'kind-mismatch';
  readonly field: 'sourceId' | 'sourceRecordKey' | 'id';
}

export type DeriveIdResult<K extends EntityKind> =
  | { readonly ok: true; readonly id: IdByKind[K] }
  | { readonly ok: false; readonly issues: readonly IdIssue[] };

export type ParseIdResult<K extends EntityKind> =
  | {
      readonly ok: true;
      readonly id: IdByKind[K];
      readonly sourceId: string;
      readonly sourceRecordKey: string;
    }
  | { readonly ok: false; readonly issues: readonly IdIssue[] };

const UNIT = '\u001f';

const PREFIX: Record<EntityKind, string> = {
  MedicationProduct: 'mp',
  ActiveIngredient: 'ai',
  MedicationIngredient: 'mi',
  AtcCode: 'atc',
  DosageForm: 'df',
  Manufacturer: 'mf',
  MarketingAuthorizationHolder: 'mah',
  RegulatoryDocument: 'rd',
  DataSource: 'ds',
  DatasetVersion: 'dv',
};

function keyIssue(
  value: string,
  field: 'sourceId' | 'sourceRecordKey',
): IdIssue | undefined {
  if (value.trim() === '' || value !== value.trim())
    return { code: 'empty-source-key', field };
  if (hasControlCharacter(value))
    return { code: 'control-character-in-key', field };
  return undefined;
}

function hasControlCharacter(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0);
    if (code === undefined || code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function asId<K extends EntityKind>(kind: K, value: string): IdByKind[K] {
  void kind;
  return value as IdByKind[K];
}

/**
 * Canonical id from entity kind plus source identity.
 * Display names are not accepted as key material. The same inputs always
 * yield the same id; a different source record key never collapses.
 */
export function deriveStableId<K extends EntityKind>(
  kind: K,
  sourceId: string,
  sourceRecordKey: string,
): DeriveIdResult<K> {
  const issues = [
    keyIssue(sourceId, 'sourceId'),
    keyIssue(sourceRecordKey, 'sourceRecordKey'),
  ].filter((issue): issue is IdIssue => issue !== undefined);
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    id: asId(
      kind,
      `${PREFIX[kind]}${UNIT}${sourceId}${UNIT}${sourceRecordKey}`,
    ),
  };
}

/** Reverse a canonical id. Fails closed on a blank, foreign, or mismatched value. */
export function parseStableId<K extends EntityKind>(
  kind: K,
  value: string,
): ParseIdResult<K> {
  const parts = value.split(UNIT);
  if (parts.length !== 3 || parts[0] !== PREFIX[kind])
    return {
      ok: false,
      issues: [{ code: 'malformed-id', field: 'id' }],
    };
  const sourceId = parts[1];
  const sourceRecordKey = parts[2];
  if (sourceId === undefined || sourceRecordKey === undefined)
    return { ok: false, issues: [{ code: 'malformed-id', field: 'id' }] };
  const issues = [
    keyIssue(sourceId, 'sourceId'),
    keyIssue(sourceRecordKey, 'sourceRecordKey'),
  ].filter((issue): issue is IdIssue => issue !== undefined);
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, id: asId(kind, value), sourceId, sourceRecordKey };
}
