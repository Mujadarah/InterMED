import { expect, it } from 'vitest';
import {
  catalogueFingerprint,
  sealCatalogue,
  validateReferentialIntegrity,
} from '@intermed/domain';
import {
  document,
  emptyCatalogue,
  ingredient,
  join,
  mustId,
  product,
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
