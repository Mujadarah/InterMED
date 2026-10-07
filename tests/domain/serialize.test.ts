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

it('round-trips padded source text without trimming it', () => {
  const paddedName = 'Fictivol ';
  const leadingDci = ' Fictivolinum';
  const paddedStrength = ' 500 mg ';
  const paddedRoute = ' oral fictional ';
  const whitespaceOnly = ' ';
  const paddedComma = ` ${commaName} `;
  const paddedCedilla = 'Fict\u0103\u015F\u0163 ';
  const spacedPreferred = 'Fictivolinum  hydrochloride';
  const row = product('SP-PADDED', paddedName, {
    originalDciText: { status: 'present', value: leadingDci },
    strengthText: { status: 'present', value: paddedStrength },
    route: { status: 'present', value: paddedRoute },
    authorizationNumber: { status: 'present', value: ' AUTH-FICT-0001 ' },
    presentationOrPackDescription: {
      status: 'present',
      value: whitespaceOnly,
    },
    sourceVersion: ' synthetic-1 ',
  });
  const substance = ingredient('AI-PADDED', spacedPreferred, {
    originalNames: [paddedCedilla],
    synonyms: [paddedComma],
    dci: { status: 'present', value: paddedCedilla },
    saltOrForm: { status: 'present', value: ' hydrochloride ' },
  });
  const form = dosageForm('DF-PADDED', ' Fictional tablet ');
  const maker = manufacturer('MF-PADDED', 'Synthetica Laboratories ');
  const marketing = holder('MAH-PADDED', ' Placebo Holding');
  const doc = document('RD-PADDED', row.id);
  const titled = {
    ...doc,
    title: { status: 'present' as const, value: ' Synthetic note ' },
  };
  const linked = {
    ...row,
    dosageFormId: { status: 'present' as const, value: form.id },
    manufacturerIds: [maker.id],
    marketingAuthorizationHolderId: {
      status: 'present' as const,
      value: marketing.id,
    },
    regulatoryDocumentIds: [titled.id],
  };
  const snapshot = sealCatalogue(
    emptyCatalogue({
      products: [linked],
      activeIngredients: [substance],
      medicationIngredients: [
        join('MI-PADDED', linked.id, ` ${leadingDci} `, {
          ingredientId: { status: 'present', value: substance.id },
          strengthOriginalText: { status: 'present', value: paddedStrength },
          mappingVersion: ' map-synthetic-1 ',
        }),
      ],
      dosageForms: [form],
      manufacturers: [maker],
      marketingAuthorizationHolders: [marketing],
      regulatoryDocuments: [titled],
    }),
  );
  const json = serializeCatalogue(snapshot);
  expect(json).toContain('"commercialName":"Fictivol "');
  expect(json).toContain(paddedCedilla);
  expect(json).toContain(paddedComma);
  const parsed = deserializeCatalogue(json);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  const restored = parsed.snapshot.products[0];
  expect(restored?.commercialName).toBe(paddedName);
  expect(restored?.originalDciText).toEqual({
    status: 'present',
    value: leadingDci,
  });
  expect(restored?.strengthText).toEqual({
    status: 'present',
    value: paddedStrength,
  });
  expect(restored?.route).toEqual({ status: 'present', value: paddedRoute });
  expect(restored?.presentationOrPackDescription).toEqual({
    status: 'present',
    value: whitespaceOnly,
  });
  expect(restored?.sourceVersion).toBe(' synthetic-1 ');
  expect(parsed.snapshot.activeIngredients[0]?.preferredName).toBe(
    spacedPreferred,
  );
  expect(parsed.snapshot.activeIngredients[0]?.originalNames[0]).toBe(
    paddedCedilla,
  );
  expect(parsed.snapshot.activeIngredients[0]?.synonyms[0]).toBe(paddedComma);
  expect(parsed.snapshot.activeIngredients[0]?.dci).toEqual({
    status: 'present',
    value: paddedCedilla,
  });
  expect(parsed.snapshot.dosageForms[0]?.displayName).toBe(
    ' Fictional tablet ',
  );
  expect(parsed.snapshot.dosageForms[0]?.originalSourceText).toBe(
    ' Fictional tablet ',
  );
  expect(parsed.snapshot.manufacturers[0]?.name).toBe(
    'Synthetica Laboratories ',
  );
  expect(parsed.snapshot.marketingAuthorizationHolders[0]?.name).toBe(
    ' Placebo Holding',
  );
  expect(parsed.snapshot.regulatoryDocuments[0]?.title).toEqual({
    status: 'present',
    value: ' Synthetic note ',
  });
  expect(parsed.snapshot.medicationIngredients[0]?.sourceIngredientText).toBe(
    ` ${leadingDci} `,
  );
  expect(parsed.snapshot.medicationIngredients[0]?.mappingVersion).toBe(
    ' map-synthetic-1 ',
  );
  expect(parsed.snapshot).toEqual(snapshot);
});

it('rejects a non-string and an empty required source string', () => {
  const snapshot = sealCatalogue(
    emptyCatalogue({ products: [product('SP-FICTIVOL', 'Fictivol')] }),
  );
  const parsed = JSON.parse(serializeCatalogue(snapshot)) as {
    products: { commercialName: unknown; originalDciText: unknown }[];
  };
  const row = parsed.products[0];
  expect(row).toBeDefined();
  if (!row) return;
  row.commercialName = '';
  expect(deserializeCatalogue(JSON.stringify(parsed)).ok).toBe(false);
  row.commercialName = 'Fictivol';
  row.originalDciText = { status: 'present', value: '' };
  expect(deserializeCatalogue(JSON.stringify(parsed)).ok).toBe(false);
  row.originalDciText = { status: 'missing' };
  row.commercialName = 12;
  expect(deserializeCatalogue(JSON.stringify(parsed)).ok).toBe(false);
  row.commercialName = null;
  expect(deserializeCatalogue(JSON.stringify(parsed)).ok).toBe(false);
});
