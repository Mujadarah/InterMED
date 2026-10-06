import { expect, it } from 'vitest';
import {
  deserializeCatalogue,
  parseStableId,
  sealCatalogue,
  serializeCatalogue,
} from '@intermed/domain';
import {
  atc,
  document,
  dosageForm,
  emptyCatalogue,
  holder,
  ingredient,
  join,
  manufacturer,
  product,
} from './builders';

const commaName = 'Fict\u0103\u0219\u021B-\u0102\u00E2\u00EE';

function sample() {
  const row = product('SP-FICTIVOL', 'Fictivol', {
    originalDciText: { status: 'present', value: 'Fictivolinum' },
    strengthText: { status: 'present', value: '500 mg' },
    dosageFormId: {
      status: 'present',
      value: dosageForm('DF-TABLET', 'Fictional tablet').id,
    },
    atcCodeIds: [atc('ATC-SYN-01', 'SYN-FICT-01').id],
    manufacturerIds: [manufacturer('MF-SYNTH', 'Synthetica Laboratories').id],
    marketingAuthorizationHolderId: {
      status: 'present',
      value: holder('MAH-PLACEBO', 'Placebo Holding').id,
    },
    regulatoryDocumentIds: [],
  });
  const doc = document('RD-FICTIVOL', row.id);
  const withDoc = { ...row, regulatoryDocumentIds: [doc.id] };
  const substance = ingredient('AI-FICTIVOLINUM', 'Fictivolinum');
  const diacritic = product('SP-DIAC', commaName);
  return sealCatalogue(
    emptyCatalogue({
      products: [withDoc, diacritic],
      activeIngredients: [substance],
      medicationIngredients: [
        join('MI-FICTIVOL', withDoc.id, 'Fictivolinum', {
          ingredientId: { status: 'present', value: substance.id },
          strengthValue: { status: 'present', value: '0,5' },
          strengthValueNormalized: { status: 'present', value: '0.5' },
          strengthUnit: { status: 'present', sourceText: 'µg' },
          strengthOriginalText: { status: 'present', value: '0,5 µg' },
          mappingStatus: 'confirmed',
        }),
        join('MI-AMBIG', diacritic.id, 'Unitoxinum', {
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
      ],
      atcCodes: [atc('ATC-SYN-01', 'SYN-FICT-01')],
      dosageForms: [dosageForm('DF-TABLET', 'Fictional tablet')],
      manufacturers: [manufacturer('MF-SYNTH', 'Synthetica Laboratories')],
      marketingAuthorizationHolders: [holder('MAH-PLACEBO', 'Placebo Holding')],
      regulatoryDocuments: [doc],
    }),
  );
}

it('round-trips catalogue JSON without an Appwrite dependency', () => {
  const snapshot = sample();
  const json = serializeCatalogue(snapshot);
  expect(json).toContain('Fictivol');
  expect(json).toContain(commaName);
  expect(json.toLowerCase()).not.toContain('appwrite');
  const parsed = deserializeCatalogue(json);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  expect(parsed.snapshot).toEqual(snapshot);
  const productId = parsed.snapshot.products[0]?.id ?? '';
  expect(parseStableId('MedicationProduct', productId).ok).toBe(true);
  const altered = JSON.parse(json) as Record<string, unknown>;
  altered.appwrite = true;
  expect(deserializeCatalogue(JSON.stringify(altered)).ok).toBe(false);
});

it('returns issues for malformed JSON instead of throwing', () => {
  expect(() => deserializeCatalogue('not-json')).not.toThrow();
  const result = deserializeCatalogue('not-json');
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.issues.length).toBeGreaterThan(0);
  const missing = deserializeCatalogue(JSON.stringify({ products: [] }));
  expect(missing.ok).toBe(false);
  if (!missing.ok) expect(missing.issues.length).toBeGreaterThan(0);
});
