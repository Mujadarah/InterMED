import { expect, it } from 'vitest';
import { presentField } from '@intermed/domain';
import { product as makeProduct } from '../../../../tests/domain/builders';
import type { MedicationSearchMatch } from '@intermed/domain';
import { createDisambiguatedSearchResults } from './search-disambiguation';

function candidate(
  sourceProductId: string,
  overrides: Parameters<typeof makeProduct>[2] = {},
  ingredientNames: readonly string[] = ['Fictivolinum'],
): MedicationSearchMatch {
  return {
    record: {
      product: makeProduct(sourceProductId, 'Fictivol', overrides),
      ingredientNames,
      atcCodes: [],
      dosageFormName: 'fictional tablet',
      manufacturerNames: ['Synthetica Laboratories'],
    },
    rank: 'exact',
  };
}

it('uses sorted verbatim ingredients to distinguish otherwise matching candidates', () => {
  const rows = createDisambiguatedSearchResults([
    candidate('SP-INGREDIENT-A', {}, ['Zetium', 'Fictivolinum']),
    candidate('SP-INGREDIENT-B', {}, ['Placebexium', 'Fictivolinum']),
  ]);

  expect(rows.map((row) => row.ingredients)).toEqual([
    'Fictivolinum, Zetium',
    'Fictivolinum, Placebexium',
  ]);
  expect(rows.every((row) => !row.sourceProductIdSuffix)).toBe(true);
});

it('shows pack and CIM without adding identity suffixes when they distinguish rows', () => {
  const rows = createDisambiguatedSearchResults([
    candidate('SP-PACK-10', {
      presentationOrPackDescription: presentField('10 tablets'),
      cim: presentField('CIM-10'),
    }),
    candidate('SP-PACK-100', {
      presentationOrPackDescription: presentField('100 tablets'),
      cim: presentField('CIM-100'),
    }),
  ]);

  expect(rows.map((row) => [row.pack, row.cim])).toEqual([
    ['10 tablets', 'CIM-10'],
    ['100 tablets', 'CIM-100'],
  ]);
  expect(rows.every((row) => !row.sourceProductIdSuffix)).toBe(true);
});

it('adds source product ids when every visible source field collides', () => {
  const rows = createDisambiguatedSearchResults([
    candidate('SP-SAME-A'),
    candidate('SP-SAME-B'),
  ]);

  expect(rows.map((row) => row.sourceProductIdSuffix)).toEqual([
    'SP-SAME-A',
    'SP-SAME-B',
  ]);
});

it('adds product ids when source product ids also collide', () => {
  const rows = createDisambiguatedSearchResults([
    candidate('SP-SAME', { id: makeProduct('PRODUCT-A', 'Fictivol').id }),
    candidate('SP-SAME', { id: makeProduct('PRODUCT-B', 'Fictivol').id }),
  ]);

  expect(rows.map((row) => row.sourceProductIdSuffix)).toEqual([
    'SP-SAME',
    'SP-SAME',
  ]);
  expect(rows.map((row) => row.productIdSuffix)).toEqual([
    makeProduct('PRODUCT-A', 'Fictivol').id,
    makeProduct('PRODUCT-B', 'Fictivol').id,
  ]);
});
