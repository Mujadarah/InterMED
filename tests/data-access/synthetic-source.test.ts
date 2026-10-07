import { expect, it } from 'vitest';
import type {
  MedicationCatalogueSource,
  MedicationProduct,
} from '@intermed/domain';
import {
  deserializeCatalogue,
  expandProductIngredients,
  findAmbiguousIdentities,
  serializeCatalogue,
  validateReferentialIntegrity,
} from '@intermed/domain';
import {
  createInMemoryMedicationCatalogueSource,
  syntheticMedicationFixture,
  syntheticSwapFixture,
  validateSyntheticSource,
} from '@intermed/data-access';

const commaMark = '\u0219';
const cedillaMark = '\u015F';

function validated() {
  const result = validateSyntheticSource(syntheticMedicationFixture);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('synthetic fixture was rejected');
  return result.snapshot;
}

function named(products: readonly MedicationProduct[], name: string) {
  const product = products.find((item) => item.commercialName === name);
  expect(product).toBeDefined();
  if (!product) throw new Error(`missing ${name}`);
  return product;
}

it('separates one fictional product from its single ingredient', () => {
  const snapshot = validated();
  const fictivol = named(snapshot.products, 'Fictivol');
  const expansion = expandProductIngredients(snapshot, fictivol.id);
  expect(expansion.components).toHaveLength(1);
  const component = expansion.components[0];
  expect(component?.joinId).not.toBe(fictivol.id);
  expect(component?.sourceIngredientText).toBe('Fictivolinum');
  expect(component?.strengthOriginalText).toEqual({
    status: 'present',
    value: '500 mg',
  });
  expect(component?.ingredientId.status).toBe('present');
  const maker = snapshot.manufacturers.find((item) =>
    fictivol.manufacturerIds.includes(item.id),
  );
  const holderId =
    fictivol.marketingAuthorizationHolderId.status === 'present'
      ? fictivol.marketingAuthorizationHolderId.value
      : '';
  const holder = snapshot.marketingAuthorizationHolders.find(
    (item) => item.id === holderId,
  );
  expect(maker?.name).toBe('Synthetica Laboratories');
  expect(holder?.name).toBe('Placebo Holding');
  expect(maker?.id).not.toBe(holder?.id);
  expect(maker?.sourceEntityId).toEqual({ status: 'missing' });
});

it('expands a three-ingredient combination without rewriting strengths', () => {
  const snapshot = validated();
  const placebex = named(snapshot.products, 'Placebex');
  const expansion = expandProductIngredients(snapshot, placebex.id);
  expect(expansion.components.map((part) => part.sourceIngredientText)).toEqual(
    ['Placebexium', 'Synthetinum', 'Fictovolol'],
  );
  expect(
    expansion.components.map((part) =>
      part.strengthOriginalText.status === 'present'
        ? part.strengthOriginalText.value
        : '',
    ),
  ).toEqual(['100 mg', '20 mg', '5 mg']);
  expect(expansion.structuralCoverage).toBe('complete');
  expect(expansion.issues.map((issue) => issue.code)).toContain(
    'ingredient-mapping-unreviewed',
  );
});

it('keeps same-name products and cedilla variants distinct', () => {
  const snapshot = validated();
  const findings = findAmbiguousIdentities(snapshot);
  const synthetica = findings.find((item) => item.name === 'Synthetica');
  expect(synthetica).toMatchObject({
    state: 'ambiguous-not-merged',
    reason: 'same-commercial-name-different-strength-or-form',
    retainedAsDistinct: true,
  });
  expect(synthetica?.entityIds).toHaveLength(2);
  const cedilla = findings.find(
    (item) => item.reason === 'legacy-cedilla-diacritic-variant',
  );
  expect(cedilla?.retainedAsDistinct).toBe(true);
  expect(cedilla?.entityIds.length).toBeGreaterThan(1);
  expect(
    snapshot.products.some((item) => item.commercialName.includes(commaMark)),
  ).toBe(true);
  expect(
    snapshot.products.some((item) => item.commercialName.includes(cedillaMark)),
  ).toBe(true);
});

it('leaves omitted catalogue fields missing', () => {
  const snapshot = validated();
  const vacantol = named(snapshot.products, 'Vacantol');
  expect(vacantol.cim).toEqual({ status: 'missing' });
  expect(vacantol.route).toEqual({ status: 'missing' });
  expect(vacantol.dosageFormId).toEqual({ status: 'missing' });
  expect(vacantol.strengthText).toEqual({ status: 'missing' });
  expect(vacantol.atcCodeIds).toEqual([]);
  expect(vacantol.manufacturerIds).toEqual([]);
  const expansion = expandProductIngredients(snapshot, vacantol.id);
  expect(expansion.components[0]?.strengthValue).toEqual({ status: 'missing' });
  expect(expansion.components[0]?.strengthUnit).toEqual({ status: 'missing' });
  expect(expansion.structuralCoverage).toBe('incomplete');
  expect(JSON.stringify(expansion)).not.toContain('"value":"0"');
});

it('preserves a decimal comma, a microgram token and an invalid unit', () => {
  const snapshot = validated();
  const quantix = named(snapshot.products, 'Quantix');
  const quantixPart = expandProductIngredients(snapshot, quantix.id)
    .components[0];
  expect(quantixPart?.strengthValue).toEqual({
    status: 'present',
    value: '0,5',
  });
  expect(quantixPart?.strengthValueNormalized).toEqual({
    status: 'present',
    value: '0.5',
  });
  expect(quantixPart?.strengthUnit).toEqual({
    status: 'present',
    sourceText: 'µg',
  });
  const unitox = named(snapshot.products, 'Unitox');
  const unitoxPart = expandProductIngredients(snapshot, unitox.id)
    .components[0];
  expect(unitoxPart?.strengthValue).toEqual({
    status: 'present',
    value: '1.000',
  });
  expect(unitoxPart?.strengthValueNormalized).toEqual({
    status: 'unknown',
    reason: 'ambiguous-decimal',
  });
  expect(unitoxPart?.strengthUnit).toEqual({
    status: 'invalid',
    sourceText: 'xyz-not-a-unit',
    reason: 'not-a-unit-token',
  });
});

it('reports dangling ingredient, manufacturer and source ids without throwing', () => {
  const snapshot = validated();
  const issues = validateReferentialIntegrity(snapshot);
  const codes = issues.map((issue) => issue.code);
  expect(codes).toEqual(
    expect.arrayContaining([
      'dangling-ingredient',
      'dangling-manufacturer',
      'dangling-source',
    ]),
  );
  expect(codes).not.toContain('checksum-mismatch');
  expect(() => validateSyntheticSource(null)).not.toThrow();
  expect(validateSyntheticSource(null).ok).toBe(false);
});

it('marks every ATC row synthetic and illustrative', () => {
  const snapshot = validated();
  expect(snapshot.atcCodes.map((item) => item.code).sort()).toEqual([
    'SYN-FICT-01',
    'SYN-FICT-02',
  ]);
  expect(
    snapshot.atcCodes.every(
      (item) =>
        item.illustrative === true &&
        item.codeSystem === 'synthetic-illustrative',
    ),
  ).toBe(true);
});

it('round-trips the validated snapshot as JSON with no Appwrite payload', () => {
  const snapshot = validated();
  const json = serializeCatalogue(snapshot);
  expect(json.toLowerCase()).not.toContain('appwrite');
  const parsed = deserializeCatalogue(json);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  expect(parsed.snapshot).toEqual(snapshot);
});

it('swaps an in-memory catalogue source without changing domain code', () => {
  const primary = validateSyntheticSource(syntheticMedicationFixture);
  const alternate = validateSyntheticSource(syntheticSwapFixture);
  expect(primary.ok && alternate.ok).toBe(true);
  if (!primary.ok || !alternate.ok) return;
  const names = (source: MedicationCatalogueSource) =>
    source.load().products.map((item) => item.commercialName);
  const first = createInMemoryMedicationCatalogueSource(primary.snapshot);
  const second = createInMemoryMedicationCatalogueSource(alternate.snapshot);
  expect(names(first)).toContain('Fictivol');
  expect(names(second)).toEqual(['Swapex']);
  expect(names(first)).not.toEqual(names(second));
});

it('round-trips padded source text from a catalogue the validator accepted', () => {
  const document = structuredClone(syntheticMedicationFixture);
  const row = document.products.find(
    (item) => item.sourceProductId === 'SP-FICTIVOL',
  );
  expect(row).toBeDefined();
  if (!row) return;
  const paddedName = 'Fictivol ';
  const paddedDci = ' Fictivolinum ';
  const editable = row as {
    commercialName: string;
    originalDciText: { status: 'present'; value: string };
  };
  editable.commercialName = paddedName;
  editable.originalDciText = { status: 'present', value: paddedDci };
  const validated = validateSyntheticSource(document);
  expect(validated.ok).toBe(true);
  if (!validated.ok) return;
  const stored = validated.snapshot.products.find(
    (item) => item.sourceProductId === 'SP-FICTIVOL',
  );
  expect(stored?.commercialName).toBe(paddedName);
  expect(stored?.originalDciText).toEqual({
    status: 'present',
    value: paddedDci,
  });
  const parsed = deserializeCatalogue(serializeCatalogue(validated.snapshot));
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  const restored = parsed.snapshot.products.find(
    (item) => item.sourceProductId === 'SP-FICTIVOL',
  );
  expect(restored?.commercialName).toBe(paddedName);
  expect(restored?.originalDciText).toEqual({
    status: 'present',
    value: paddedDci,
  });
  expect(parsed.snapshot).toEqual(validated.snapshot);
});

it('rejects an empty required commercial name', () => {
  const document = structuredClone(syntheticMedicationFixture);
  const row = document.products[0];
  expect(row).toBeDefined();
  if (!row) return;
  (row as { commercialName: string }).commercialName = '';
  expect(validateSyntheticSource(document).ok).toBe(false);
});

it('rejects a non-synthetic document and an ATC row that claims an official code system', () => {
  const notSynthetic = structuredClone(syntheticMedicationFixture) as {
    synthetic: boolean;
  };
  notSynthetic.synthetic = false;
  expect(validateSyntheticSource(notSynthetic).ok).toBe(false);
  const official = structuredClone(syntheticMedicationFixture) as {
    atcCodes: { codeSystem: string }[];
  };
  const atc = official.atcCodes[0];
  expect(atc).toBeDefined();
  if (!atc) return;
  atc.codeSystem = 'WHO-ATC';
  const rejected = validateSyntheticSource(official);
  expect(rejected.ok).toBe(false);
  if (!rejected.ok)
    expect(
      rejected.issues.some((issue) => issue.path.includes('atcCodes')),
    ).toBe(true);
});
