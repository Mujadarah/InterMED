import type { MedicationCatalogueSnapshot } from './catalogue';
import { catalogueFingerprint } from './checksum';
import type { DatasetRecordCounts } from './entities';
import type { FieldState } from './field';
import { parseStableId } from './ids';
import {
  catalogueIssue,
  type CatalogueEntity,
  type CatalogueIssue,
} from './issues';

const COUNT_KEYS = [
  'dataSources',
  'datasetVersions',
  'products',
  'activeIngredients',
  'medicationIngredients',
  'atcCodes',
  'dosageForms',
  'manufacturers',
  'marketingAuthorizationHolders',
  'regulatoryDocuments',
] as const satisfies readonly (keyof DatasetRecordCounts)[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function malformed(): CatalogueIssue {
  return catalogueIssue(
    'malformed-snapshot',
    'Catalogue',
    '',
    '',
    'The catalogue snapshot could not be read.',
  );
}

function isTimestamp(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/.exec(
    value,
  );
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  )
    return false;
  const instant = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second),
  );
  return (
    instant.getUTCFullYear() === year &&
    instant.getUTCMonth() === month - 1 &&
    instant.getUTCDate() === day
  );
}

function compareIssues(left: CatalogueIssue, right: CatalogueIssue): number {
  return (
    left.code.localeCompare(right.code) ||
    left.entityId.localeCompare(right.entityId) ||
    left.field.localeCompare(right.field) ||
    left.detail.localeCompare(right.detail)
  );
}

/**
 * Referential and structural issues for one catalogue snapshot.
 * Bad rows produce issues. They do not throw and they are not repaired.
 */
export function validateReferentialIntegrity(
  snapshot: MedicationCatalogueSnapshot,
): readonly CatalogueIssue[] {
  try {
    if (!isRecord(snapshot) || !Array.isArray(snapshot.products))
      return [malformed()];
    const required = [
      snapshot.dataSources,
      snapshot.datasetVersions,
      snapshot.activeIngredients,
      snapshot.medicationIngredients,
      snapshot.atcCodes,
      snapshot.dosageForms,
      snapshot.manufacturers,
      snapshot.marketingAuthorizationHolders,
      snapshot.regulatoryDocuments,
    ];
    if (required.some((items) => !Array.isArray(items))) return [malformed()];
    return collect(snapshot).sort(compareIssues);
  } catch {
    return [malformed()];
  }
}

function collect(snapshot: MedicationCatalogueSnapshot): CatalogueIssue[] {
  const issues: CatalogueIssue[] = [];
  const sourceIds = new Set<string>(
    snapshot.dataSources.map((item) => item.id),
  );
  const datasetIds = new Set<string>(
    snapshot.datasetVersions.map((item) => item.id),
  );
  const productIds = new Set(snapshot.products.map((item) => item.id));
  const ingredientIds = new Set(
    snapshot.activeIngredients.map((item) => item.id),
  );
  const atcIds = new Set(snapshot.atcCodes.map((item) => item.id));
  const formIds = new Set(snapshot.dosageForms.map((item) => item.id));
  const manufacturerIds = new Set(
    snapshot.manufacturers.map((item) => item.id),
  );
  const holderIds = new Set(
    snapshot.marketingAuthorizationHolders.map((item) => item.id),
  );
  const documentIds = new Map(
    snapshot.regulatoryDocuments.map((item) => [item.id, item]),
  );

  const noteDuplicate = (
    entity: CatalogueEntity,
    ids: readonly string[],
  ): void => {
    const seen = new Set<string>();
    const duplicated = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) duplicated.add(id);
      seen.add(id);
    }
    for (const id of duplicated)
      issues.push(
        catalogueIssue(
          'duplicate-id',
          entity,
          id,
          'id',
          'This canonical id is repeated in the collection.',
        ),
      );
  };

  noteDuplicate(
    'DataSource',
    snapshot.dataSources.map((item) => item.id),
  );
  noteDuplicate(
    'DatasetVersion',
    snapshot.datasetVersions.map((item) => item.id),
  );
  noteDuplicate(
    'MedicationProduct',
    snapshot.products.map((item) => item.id),
  );
  noteDuplicate(
    'ActiveIngredient',
    snapshot.activeIngredients.map((item) => item.id),
  );
  noteDuplicate(
    'MedicationIngredient',
    snapshot.medicationIngredients.map((item) => item.id),
  );
  noteDuplicate(
    'ATCCode',
    snapshot.atcCodes.map((item) => item.id),
  );
  noteDuplicate(
    'DosageForm',
    snapshot.dosageForms.map((item) => item.id),
  );
  noteDuplicate(
    'Manufacturer',
    snapshot.manufacturers.map((item) => item.id),
  );
  noteDuplicate(
    'MarketingAuthorizationHolder',
    snapshot.marketingAuthorizationHolders.map((item) => item.id),
  );
  noteDuplicate(
    'RegulatoryDocument',
    snapshot.regulatoryDocuments.map((item) => item.id),
  );

  const requireRef = (
    entity: CatalogueEntity,
    entityId: string,
    field: string,
    code: CatalogueIssue['code'],
    present: boolean,
  ): void => {
    if (!present)
      issues.push(
        catalogueIssue(
          code,
          entity,
          entityId,
          field,
          'The referenced record is not in this snapshot.',
        ),
      );
  };

  const requireSource = (
    entity: CatalogueEntity,
    entityId: string,
    sourceId: string,
    field = 'sourceId',
  ): void => {
    requireRef(
      entity,
      entityId,
      field,
      'dangling-source',
      sourceIds.has(sourceId),
    );
  };

  const requireDataset = (
    entity: CatalogueEntity,
    entityId: string,
    datasetVersionId: string,
  ): void => {
    requireRef(
      entity,
      entityId,
      'datasetVersionId',
      'dangling-dataset-version',
      datasetIds.has(datasetVersionId),
    );
  };

  const requireInstant = (
    entity: CatalogueEntity,
    entityId: string,
    field: string,
    value: string,
  ): void => {
    if (!isTimestamp(value))
      issues.push(
        catalogueIssue(
          'invalid-timestamp',
          entity,
          entityId,
          field,
          'The timestamp must be an explicit UTC instant.',
        ),
      );
  };

  if (snapshot.datasetVersions.length !== 1)
    issues.push(
      catalogueIssue(
        'dataset-version-count',
        'DatasetVersion',
        '',
        'datasetVersions',
        'A catalogue snapshot carries exactly one dataset version.',
      ),
    );

  const version = snapshot.datasetVersions[0];
  if (version) {
    if (version.checksum !== catalogueFingerprint(snapshot))
      issues.push(
        catalogueIssue(
          'checksum-mismatch',
          'DatasetVersion',
          version.id,
          'checksum',
          'The checksum does not match the snapshot fingerprint.',
        ),
      );
    const actual: DatasetRecordCounts = {
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
    const mismatched = COUNT_KEYS.some(
      (key) => version.recordCounts[key] !== actual[key],
    );
    if (mismatched)
      issues.push(
        catalogueIssue(
          'record-count-mismatch',
          'DatasetVersion',
          version.id,
          'recordCounts',
          'Record counts do not match the rows in the snapshot.',
        ),
      );
    for (const sourceId of version.sourceIds)
      requireRef(
        'DatasetVersion',
        version.id,
        'sourceIds',
        'dangling-source',
        sourceIds.has(sourceId),
      );
    if (version.previousVersionId.status === 'present') {
      const previousId = version.previousVersionId.value;
      const parsed = parseStableId('DatasetVersion', previousId);
      if (!parsed.ok)
        issues.push(
          catalogueIssue(
            'invalid-previous-dataset-version',
            'DatasetVersion',
            version.id,
            'previousVersionId',
            'The previous dataset version id is not a DatasetVersion stable id.',
          ),
        );
      else if (previousId === version.id)
        issues.push(
          catalogueIssue(
            'invalid-previous-dataset-version',
            'DatasetVersion',
            version.id,
            'previousVersionId',
            'The previous dataset version id refers to this version.',
          ),
        );
    }
    requireInstant(
      'DatasetVersion',
      version.id,
      'importedAt',
      version.importedAt,
    );
  }

  for (const source of snapshot.dataSources)
    requireInstant('DataSource', source.id, 'reviewedAt', source.reviewedAt);

  for (const product of snapshot.products) {
    requireSource('MedicationProduct', product.id, product.sourceId);
    requireDataset('MedicationProduct', product.id, product.datasetVersionId);
    requireInstant(
      'MedicationProduct',
      product.id,
      'firstSeenAt',
      product.firstSeenAt,
    );
    requireInstant(
      'MedicationProduct',
      product.id,
      'lastSeenAt',
      product.lastSeenAt,
    );
    if (product.dosageFormId.status === 'present')
      requireRef(
        'MedicationProduct',
        product.id,
        'dosageFormId',
        'dangling-dosage-form',
        formIds.has(product.dosageFormId.value),
      );
    for (const atcId of product.atcCodeIds)
      requireRef(
        'MedicationProduct',
        product.id,
        'atcCodeIds',
        'dangling-atc',
        atcIds.has(atcId),
      );
    for (const manufacturerId of product.manufacturerIds)
      requireRef(
        'MedicationProduct',
        product.id,
        'manufacturerIds',
        'dangling-manufacturer',
        manufacturerIds.has(manufacturerId),
      );
    if (product.marketingAuthorizationHolderId.status === 'present')
      requireRef(
        'MedicationProduct',
        product.id,
        'marketingAuthorizationHolderId',
        'dangling-marketing-authorization-holder',
        holderIds.has(product.marketingAuthorizationHolderId.value),
      );
    for (const documentId of product.regulatoryDocumentIds) {
      const linked = documentIds.get(documentId);
      if (!linked)
        issues.push(
          catalogueIssue(
            'dangling-regulatory-document',
            'MedicationProduct',
            product.id,
            'regulatoryDocumentIds',
            'The regulatory document is not in this snapshot.',
          ),
        );
      else if (linked.productId !== product.id)
        issues.push(
          catalogueIssue(
            'regulatory-document-product-mismatch',
            'RegulatoryDocument',
            linked.id,
            'productId',
            'The document points at a different product.',
          ),
        );
    }
  }

  for (const item of snapshot.activeIngredients) {
    requireSource('ActiveIngredient', item.id, item.sourceId);
    requireDataset('ActiveIngredient', item.id, item.datasetVersionId);
    for (let index = 0; index < item.externalMappings.length; index += 1) {
      const mapping = item.externalMappings[index];
      if (!mapping) continue;
      requireSource(
        'ActiveIngredient',
        item.id,
        mapping.sourceId,
        `externalMappings[${index}].sourceId`,
      );
    }
  }

  for (const item of snapshot.medicationIngredients) {
    requireSource('MedicationIngredient', item.id, item.sourceId);
    requireDataset('MedicationIngredient', item.id, item.datasetVersionId);
    requireRef(
      'MedicationIngredient',
      item.id,
      'productId',
      'dangling-product',
      productIds.has(item.productId),
    );
    if (
      item.mappingStatus === 'confirmed' &&
      item.ingredientId.status !== 'present'
    )
      issues.push(
        catalogueIssue(
          'confirmed-mapping-missing-ingredient',
          'MedicationIngredient',
          item.id,
          'ingredientId',
          'A confirmed join requires an ingredient id.',
        ),
      );
    if (item.ingredientId.status === 'present')
      requireRef(
        'MedicationIngredient',
        item.id,
        'ingredientId',
        'dangling-ingredient',
        ingredientIds.has(item.ingredientId.value),
      );
    noteQuantity(issues, item.id, 'strengthUnit', item.strengthUnit);
    noteQuantity(issues, item.id, 'denominatorUnit', item.denominatorUnit);
    noteDecimal(issues, item.id, 'strengthValue', item.strengthValueNormalized);
    noteDecimal(
      issues,
      item.id,
      'denominatorValue',
      item.denominatorValueNormalized,
    );
  }

  for (const item of snapshot.atcCodes) {
    requireSource('ATCCode', item.id, item.sourceId);
    requireDataset('ATCCode', item.id, item.datasetVersionId);
    if (
      item.codeSystem !== 'synthetic-illustrative' ||
      item.illustrative !== true
    )
      issues.push(
        catalogueIssue(
          'atc-not-illustrative',
          'ATCCode',
          item.id,
          'codeSystem',
          'ATC rows in this milestone must stay synthetic and illustrative.',
        ),
      );
  }

  for (const item of snapshot.dosageForms) {
    requireSource('DosageForm', item.id, item.sourceId);
    requireDataset('DosageForm', item.id, item.datasetVersionId);
  }
  for (const item of snapshot.manufacturers) {
    requireSource('Manufacturer', item.id, item.sourceId);
    requireDataset('Manufacturer', item.id, item.datasetVersionId);
  }
  for (const item of snapshot.marketingAuthorizationHolders) {
    requireSource('MarketingAuthorizationHolder', item.id, item.sourceId);
    requireDataset(
      'MarketingAuthorizationHolder',
      item.id,
      item.datasetVersionId,
    );
  }
  for (const item of snapshot.regulatoryDocuments) {
    requireSource('RegulatoryDocument', item.id, item.sourceId);
    requireDataset('RegulatoryDocument', item.id, item.datasetVersionId);
    requireInstant(
      'RegulatoryDocument',
      item.id,
      'lastCheckedAt',
      item.lastCheckedAt,
    );
    requireRef(
      'RegulatoryDocument',
      item.id,
      'productId',
      'dangling-product',
      productIds.has(item.productId),
    );
  }

  return issues;
}

function noteQuantity(
  issues: CatalogueIssue[],
  entityId: string,
  field: string,
  unit: { readonly status: string },
): void {
  if (unit.status === 'invalid')
    issues.push(
      catalogueIssue(
        'invalid-unit',
        'MedicationIngredient',
        entityId,
        field,
        'The unit token was preserved and was not converted.',
      ),
    );
}

function noteDecimal(
  issues: CatalogueIssue[],
  entityId: string,
  field: string,
  value: FieldState<string>,
): void {
  if (value.status === 'unknown' && value.reason === 'ambiguous-decimal')
    issues.push(
      catalogueIssue(
        'ambiguous-decimal',
        'MedicationIngredient',
        entityId,
        field,
        'The numeric token was preserved because it is ambiguous.',
      ),
    );
}
