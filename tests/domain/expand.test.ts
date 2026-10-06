import { expect, it } from 'vitest';
import { expandProductIngredients } from '@intermed/domain';
import {
  emptyCatalogue,
  ingredient,
  join,
  mustId,
  product,
  SOURCE_KEY,
} from './builders';

const fictivol = product('SP-FICTIVOL', 'Fictivol', {
  originalDciText: { status: 'present', value: 'Fictivolinum' },
  strengthText: { status: 'present', value: '500 mg' },
});
const fictivolinum = ingredient('AI-FICTIVOLINUM', 'Fictivolinum');
const fictivolJoin = join('MI-FICTIVOL', fictivol.id, 'Fictivolinum', {
  ingredientId: { status: 'present', value: fictivolinum.id },
  strengthValue: { status: 'present', value: '500' },
  strengthValueNormalized: { status: 'present', value: '500' },
  strengthUnit: { status: 'present', sourceText: 'mg' },
  strengthOriginalText: { status: 'present', value: '500 mg' },
  mappingStatus: 'confirmed',
});

it('keeps a product, its ingredient and the join as separate ids', () => {
  const snapshot = emptyCatalogue({
    products: [fictivol],
    activeIngredients: [fictivolinum],
    medicationIngredients: [fictivolJoin],
  });
  const expansion = expandProductIngredients(snapshot, fictivol.id);
  expect(expansion.components).toHaveLength(1);
  const component = expansion.components[0];
  expect(component?.joinId).not.toBe(fictivol.id);
  expect(component?.ingredientId).toEqual({
    status: 'present',
    value: fictivolinum.id,
  });
  expect(fictivolinum.id).not.toBe(fictivol.id);
  expect(component?.preferredName).toEqual({
    status: 'present',
    value: 'Fictivolinum',
  });
  expect(component?.strengthOriginalText).toEqual({
    status: 'present',
    value: '500 mg',
  });
});

it('retains every confirmed component of a combination with verbatim strengths', () => {
  const placebex = product('SP-PLACEBEX', 'Placebex', {
    strengthText: { status: 'present', value: '100 mg/20 mg/5 mg' },
  });
  const parts = [
    ['AI-PLACEBEXIUM', 'MI-PLACEBEXIUM', 'Placebexium', '100', '100 mg'],
    ['AI-SYNTHETINUM', 'MI-SYNTHETINUM', 'Synthetinum', '20', '20 mg'],
    ['AI-FICTOvolol', 'MI-FICTOvolol', 'Fictovolol', '5', '5 mg'],
  ] as const;
  const activeIngredients = parts.map(([key, , name]) => ingredient(key, name));
  const medicationIngredients = parts.map(
    ([, joinKey, name, value, text], index) =>
      join(joinKey, placebex.id, name, {
        ingredientId: {
          status: 'present',
          value: activeIngredients[index]?.id ?? fictivolinum.id,
        },
        strengthValue: { status: 'present', value },
        strengthValueNormalized: { status: 'present', value },
        strengthUnit: { status: 'present', sourceText: 'mg' },
        strengthOriginalText: { status: 'present', value: text },
        mappingStatus: 'confirmed',
      }),
  );
  const expansion = expandProductIngredients(
    emptyCatalogue({
      products: [placebex],
      activeIngredients,
      medicationIngredients,
    }),
    placebex.id,
  );
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

it('leaves a missing strength missing', () => {
  const vacantol = product('SP-VACANTOL', 'Vacantol');
  const expansion = expandProductIngredients(
    emptyCatalogue({
      products: [vacantol],
      medicationIngredients: [join('MI-VACANTOL', vacantol.id, 'Vacantolum')],
    }),
    vacantol.id,
  );
  expect(expansion.components).toHaveLength(1);
  expect(expansion.components[0]?.strengthValue).toEqual({ status: 'missing' });
  expect(expansion.components[0]?.strengthUnit).toEqual({ status: 'missing' });
  expect(expansion.components[0]?.strengthValueNormalized).toEqual({
    status: 'missing',
  });
  expect(expansion.structuralCoverage).toBe('incomplete');
  expect(expansion.issues.map((issue) => issue.code)).toContain(
    'unresolved-mapping',
  );
  expect(JSON.stringify(expansion)).not.toContain('"value":"0"');
});

it('preserves an invalid unit and an ambiguous decimal without converting either', () => {
  const unitox = product('SP-UNITOX', 'Unitox');
  const substance = ingredient('AI-UNITOXINUM', 'Unitoxinum', {
    externalMappings: [
      {
        sourceId: unitox.sourceId,
        sourceIngredientId: 'AI-UNITOXINUM',
        mappingVersion: 'map-synthetic-1',
        reviewStatus: 'reviewed',
      },
    ],
  });
  const expansion = expandProductIngredients(
    emptyCatalogue({
      products: [unitox],
      activeIngredients: [substance],
      medicationIngredients: [
        join('MI-UNITOX', unitox.id, 'Unitoxinum', {
          ingredientId: { status: 'present', value: substance.id },
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
          mappingStatus: 'confirmed',
        }),
      ],
    }),
    unitox.id,
  );
  const component = expansion.components[0];
  expect(component?.strengthValue).toEqual({
    status: 'present',
    value: '1.000',
  });
  expect(component?.strengthValueNormalized).toEqual({
    status: 'unknown',
    reason: 'ambiguous-decimal',
  });
  expect(component?.strengthUnit).toEqual({
    status: 'invalid',
    sourceText: 'xyz-not-a-unit',
    reason: 'not-a-unit-token',
  });
  expect(JSON.stringify(component)).not.toContain('"value":"1000"');
  expect(JSON.stringify(component)).not.toContain('mcg');
});

it('reports a confirmed join that has no ingredient id and still returns the row', () => {
  const row = product('SP-UNLINKED', 'Unlinkedex');
  const expansion = expandProductIngredients(
    emptyCatalogue({
      products: [row],
      medicationIngredients: [
        join('MI-UNLINKED', row.id, 'Unlinkedium', {
          mappingStatus: 'confirmed',
        }),
      ],
    }),
    row.id,
  );
  expect(expansion.components).toHaveLength(1);
  expect(expansion.structuralCoverage).toBe('incomplete');
  expect(expansion.issues.map((issue) => issue.code)).toContain(
    'confirmed-mapping-missing-ingredient',
  );
});

it('does not throw when the product or the snapshot is unusable', () => {
  const missingProduct = mustId('MedicationProduct', SOURCE_KEY, 'SP-ABSENT');
  const absent = expandProductIngredients(emptyCatalogue(), missingProduct);
  expect(absent.components).toEqual([]);
  expect(absent.issues.map((issue) => issue.code)).toContain(
    'product-not-found',
  );
  const broken = expandProductIngredients(undefined as never, missingProduct);
  expect(broken.structuralCoverage).toBe('incomplete');
  expect(broken.issues.map((issue) => issue.code)).toContain(
    'malformed-snapshot',
  );
});
