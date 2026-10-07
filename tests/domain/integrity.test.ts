import { expect, it } from 'vitest';
import {
  catalogueFingerprint,
  sealCatalogue,
  validateReferentialIntegrity,
  type DatasetVersionId,
} from '@intermed/domain';
import {
  document,
  emptyCatalogue,
  ingredient,
  join,
  mustId,
  product,
  sourceId,
  SOURCE_KEY,
  SOURCE_NAMESPACE,
} from './builders';

it('changes the sealed checksum when a source string changes and records counts', () => {
  const plain = emptyCatalogue({ products: [product('SP-A', 'Fictivol')] });
  const sealed = sealCatalogue(plain);
  const renamed = sealCatalogue(
    emptyCatalogue({ products: [product('SP-A', 'Placebex')] }),
  );
  expect(sealed.datasetVersions[0]?.recordCounts.products).toBe(1);
  expect(sealed.datasetVersions[0]?.checksum).toBe(
    catalogueFingerprint(sealed),
  );
  expect(renamed.datasetVersions[0]?.checksum).not.toBe(
    sealed.datasetVersions[0]?.checksum,
  );
});

it('reports dangling catalogue references and accepts a sealed linked product', () => {
  const dangling = product('SP-DANGLEBEX', 'Danglebex', {
    sourceId: mustId('DataSource', SOURCE_NAMESPACE, 'source.missing'),
    datasetVersionId: mustId(
      'DatasetVersion',
      'source.missing',
      'missing-version',
    ),
    dosageFormId: {
      status: 'present',
      value: mustId('DosageForm', SOURCE_KEY, 'DF-MISSING'),
    },
    atcCodeIds: [mustId('AtcCode', SOURCE_KEY, 'ATC-MISSING')],
    manufacturerIds: [mustId('Manufacturer', SOURCE_KEY, 'MF-MISSING')],
    marketingAuthorizationHolderId: {
      status: 'present',
      value: mustId('MarketingAuthorizationHolder', SOURCE_KEY, 'MAH-MISSING'),
    },
    regulatoryDocumentIds: [
      mustId('RegulatoryDocument', SOURCE_KEY, 'RD-MISSING'),
    ],
  });
  const orphanProductId = mustId(
    'MedicationProduct',
    SOURCE_KEY,
    'SP-NO-SUCH-PRODUCT',
  );
  const snapshot = sealCatalogue(
    emptyCatalogue({
      products: [dangling],
      medicationIngredients: [
        join('MI-DANGLE', dangling.id, 'Missingium', {
          ingredientId: {
            status: 'present',
            value: mustId('ActiveIngredient', SOURCE_KEY, 'AI-MISSING'),
          },
          mappingStatus: 'confirmed',
        }),
        join('MI-ORPHAN', orphanProductId, 'Orphanicum'),
      ],
      regulatoryDocuments: [
        document(
          'RD-ORPHAN',
          mustId('MedicationProduct', SOURCE_KEY, 'SP-NO-DOC-PRODUCT'),
        ),
      ],
    }),
  );
  expect(
    [
      ...new Set(
        validateReferentialIntegrity(snapshot).map((issue) => issue.code),
      ),
    ].sort(),
  ).toEqual(
    [
      'dangling-atc',
      'dangling-dataset-version',
      'dangling-dosage-form',
      'dangling-ingredient',
      'dangling-manufacturer',
      'dangling-marketing-authorization-holder',
      'dangling-product',
      'dangling-regulatory-document',
      'dangling-source',
    ].sort(),
  );

  const linkedProduct = product('SP-FICTIVOL', 'Fictivol');
  const linkedIngredient = ingredient('AI-FICTIVOLINUM', 'Fictivolinum');
  const linked = sealCatalogue(
    emptyCatalogue({
      products: [linkedProduct],
      activeIngredients: [linkedIngredient],
      medicationIngredients: [
        join('MI-FICTIVOL', linkedProduct.id, 'Fictivolinum', {
          ingredientId: { status: 'present', value: linkedIngredient.id },
          strengthValue: { status: 'present', value: '500' },
          strengthValueNormalized: { status: 'present', value: '500' },
          strengthUnit: { status: 'present', sourceText: 'mg' },
          strengthOriginalText: { status: 'present', value: '500 mg' },
          mappingStatus: 'confirmed',
        }),
      ],
    }),
  );
  expect(validateReferentialIntegrity(linked)).toEqual([]);
});

it('reports a broken count and checksum without throwing on an unusable snapshot', () => {
  const sealed = sealCatalogue(emptyCatalogue());
  const version = sealed.datasetVersions[0];
  expect(version).toBeDefined();
  if (!version) return;
  const broken = {
    ...sealed,
    datasetVersions: [
      {
        ...version,
        recordCounts: { ...version.recordCounts, products: 4 },
      },
    ],
  };
  expect(
    validateReferentialIntegrity(broken)
      .map((issue) => issue.code)
      .sort(),
  ).toEqual(['checksum-mismatch', 'record-count-mismatch']);
  expect(
    validateReferentialIntegrity(undefined as never).map((issue) => issue.code),
  ).toEqual(['malformed-snapshot']);
});

it('reports an invalid unit and an ambiguous decimal and a confirmed join without an ingredient', () => {
  const row = product('SP-UNITOX', 'Unitox');
  const unlinked = product('SP-UNLINKED', 'Unlinkedex');
  const snapshot = sealCatalogue(
    emptyCatalogue({
      products: [row, unlinked],
      medicationIngredients: [
        join('MI-UNITOX', row.id, 'Unitoxinum', {
          strengthValue: { status: 'present', value: '1.000' },
          strengthValueNormalized: {
            status: 'unknown',
            reason: 'ambiguous-decimal',
          },
          strengthUnit: {
            status: 'invalid',
            sourceText: 'xyz-not-a-unit',
            reason: 'not-a-unit-token',
          },
          strengthOriginalText: {
            status: 'present',
            value: '1.000 xyz-not-a-unit',
          },
        }),
        join('MI-UNLINKED', unlinked.id, 'Unlinkedium', {
          mappingStatus: 'confirmed',
        }),
      ],
    }),
  );
  expect(
    validateReferentialIntegrity(snapshot)
      .map((issue) => issue.code)
      .sort(),
  ).toEqual(
    [
      'ambiguous-decimal',
      'confirmed-mapping-missing-ingredient',
      'invalid-unit',
    ].sort(),
  );
});

it('reports a duplicated canonical id', () => {
  const alpha = product('SP-ALPHA', 'Alphaex');
  const copy = product('SP-BETA', 'Betaex', { id: alpha.id });
  const issues = validateReferentialIntegrity(
    sealCatalogue(emptyCatalogue({ products: [alpha, copy] })),
  );
  expect(issues.map((issue) => issue.code)).toContain('duplicate-id');
});

function sealWithPrevious(
  previousVersionId:
    | { readonly status: 'missing' }
    | { readonly status: 'present'; readonly value: DatasetVersionId },
) {
  const base = emptyCatalogue();
  const version = base.datasetVersions[0];
  if (!version) throw new Error('synthetic catalogue has no dataset version');
  return sealCatalogue({
    ...base,
    datasetVersions: [{ ...version, previousVersionId }],
  });
}

it('accepts a previous dataset version id that is outside this snapshot', () => {
  const prior = mustId('DatasetVersion', SOURCE_KEY, 'synthetic-prior');
  const sealed = sealWithPrevious({ status: 'present', value: prior });
  expect(sealed.datasetVersions[0]?.previousVersionId).toEqual({
    status: 'present',
    value: prior,
  });
  expect(prior).not.toBe(sealed.datasetVersions[0]?.id);
  expect(validateReferentialIntegrity(sealed)).toEqual([]);
});

it('rejects a malformed previous dataset version id', () => {
  const sealed = sealWithPrevious({
    status: 'present',
    value: 'not-a-dataset-version-id' as DatasetVersionId,
  });
  const versionId = sealed.datasetVersions[0]?.id;
  expect(versionId).toBeDefined();
  expect(validateReferentialIntegrity(sealed)).toEqual([
    {
      code: 'invalid-previous-dataset-version',
      entity: 'DatasetVersion',
      entityId: versionId,
      field: 'previousVersionId',
      detail:
        'The previous dataset version id is not a DatasetVersion stable id.',
    },
  ]);
});

it('rejects a previous dataset version id that refers to itself', () => {
  const base = emptyCatalogue();
  const version = base.datasetVersions[0];
  if (!version) throw new Error('synthetic catalogue has no dataset version');
  const sealed = sealCatalogue({
    ...base,
    datasetVersions: [
      {
        ...version,
        previousVersionId: { status: 'present', value: version.id },
      },
    ],
  });
  expect(validateReferentialIntegrity(sealed)).toEqual([
    {
      code: 'invalid-previous-dataset-version',
      entity: 'DatasetVersion',
      entityId: version.id,
      field: 'previousVersionId',
      detail: 'The previous dataset version id refers to this version.',
    },
  ]);
});

function timestampIssues(instant: string): readonly string[] {
  const base = emptyCatalogue();
  const version = base.datasetVersions[0];
  if (!version) throw new Error('synthetic catalogue has no dataset version');
  return validateReferentialIntegrity(
    sealCatalogue({
      ...base,
      datasetVersions: [{ ...version, importedAt: instant }],
    }),
  )
    .filter((issue) => issue.code === 'invalid-timestamp')
    .map((issue) => `${issue.entity}:${issue.field}`);
}

it('rejects 31 February and 31 April as timestamps', () => {
  expect(timestampIssues('2026-02-31T00:00:00Z')).toEqual([
    'DatasetVersion:importedAt',
  ]);
  expect(timestampIssues('2026-04-31T00:00:00Z')).toEqual([
    'DatasetVersion:importedAt',
  ]);
});

it('rejects 29 February outside a leap year and accepts it in a leap year', () => {
  expect(timestampIssues('2026-02-29T00:00:00Z')).toEqual([
    'DatasetVersion:importedAt',
  ]);
  expect(timestampIssues('2024-02-29T00:00:00Z')).toEqual([]);
});

it('reports a dangling external mapping source', () => {
  const substance = ingredient('AI-FICTIVOLINUM', 'Fictivolinum', {
    externalMappings: [
      {
        sourceId: mustId('DataSource', SOURCE_NAMESPACE, 'source.missing-map'),
        sourceIngredientId: 'EXT-FICT-MISSING',
        mappingVersion: 'map-synthetic-1',
        reviewStatus: 'unreviewed',
      },
      {
        sourceId,
        sourceIngredientId: 'EXT-FICT-KEPT',
        mappingVersion: 'map-synthetic-1',
        reviewStatus: 'reviewed',
      },
    ],
  });
  const issues = validateReferentialIntegrity(
    sealCatalogue(emptyCatalogue({ activeIngredients: [substance] })),
  );
  expect(issues).toEqual([
    {
      code: 'dangling-source',
      entity: 'ActiveIngredient',
      entityId: substance.id,
      field: 'externalMappings[0].sourceId',
      detail: 'The referenced record is not in this snapshot.',
    },
  ]);
});

it('accepts an external mapping source that is in the snapshot', () => {
  const base = emptyCatalogue();
  const primary = base.dataSources[0];
  if (!primary) throw new Error('synthetic catalogue has no data source');
  const companionId = mustId(
    'DataSource',
    SOURCE_NAMESPACE,
    'source.companion',
  );
  const substance = ingredient('AI-PLACEBEXIUM', 'Placebexium', {
    externalMappings: [
      {
        sourceId: companionId,
        sourceIngredientId: 'EXT-PLACEBEXIUM',
        mappingVersion: 'map-synthetic-1',
        reviewStatus: 'reviewed',
      },
    ],
  });
  const snapshot = sealCatalogue({
    ...base,
    dataSources: [
      primary,
      {
        ...primary,
        id: companionId,
        sourceKey: 'source.companion',
        name: 'Companion synthetic fixture',
      },
    ],
    activeIngredients: [substance],
  });
  expect(validateReferentialIntegrity(snapshot)).toEqual([]);
});
