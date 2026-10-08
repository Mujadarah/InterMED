import { describe, expect, it } from 'vitest';
import {
  createMedicationSearchIndex,
  normalizeMedicationSearchQuery,
  searchMedicationIndex,
  type MedicationSearchRecord,
} from '@intermed/domain';
import { product as makeProduct } from './builders';

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function searchRecord(
  key: string,
  commercialName: string,
  options: {
    readonly ingredients?: readonly string[];
    readonly atcCodes?: readonly string[];
    readonly manufacturerNames?: readonly string[];
  } = {},
): MedicationSearchRecord {
  return {
    product: makeProduct(key, commercialName),
    ingredientNames: options.ingredients ?? [],
    atcCodes: options.atcCodes ?? [],
    dosageFormName: null,
    manufacturerNames: options.manufacturerNames ?? [],
  };
}

describe('local medication search', () => {
  it('normalizes Romanian comma-below and legacy cedilla letters and whitespace', () => {
    expect(normalizeMedicationSearchQuery('  Fictășî   Fictăşî\n Ț  ')).toBe(
      'fictasi fictasi t',
    );
  });

  it('ranks exact before prefix before partial and keeps ingredient exact matches', () => {
    const index = createMedicationSearchIndex([
      searchRecord('partial', 'Ultra Fictivol'),
      searchRecord('prefix', 'Fictivol Plus'),
      searchRecord('exact', 'Fictivol'),
      searchRecord('ingredient', 'Other Brand', {
        ingredients: ['Fictivol'],
      }),
    ]);

    const page = searchMedicationIndex(index, 'FICTIVOL');

    expect(page.total).toBe(4);
    expect(
      page.matches.map((match) => match.record.product.sourceProductId),
    ).toEqual(['exact', 'ingredient', 'prefix', 'partial']);
    expect(page.matches.map((match) => match.rank)).toEqual([
      'exact',
      'exact',
      'prefix',
      'partial',
    ]);
  });

  it('searches active ingredient and manufacturer names and matches ATC by prefix only', () => {
    const index = createMedicationSearchIndex([
      searchRecord('matched', 'Brand Fictional', {
        ingredients: ['Imaginary Compound'],
        atcCodes: ['SYN-A10BC02'],
        manufacturerNames: ['Fictional Laboratories'],
      }),
    ]);

    expect(searchMedicationIndex(index, 'compound').total).toBe(1);
    expect(searchMedicationIndex(index, 'laborator').total).toBe(1);
    expect(searchMedicationIndex(index, 'syn-a10').total).toBe(1);
    expect(searchMedicationIndex(index, 'a10').total).toBe(0);
    expect(searchMedicationIndex(index, 'BC02').total).toBe(0);
  });

  it('keeps same-name products distinct and orders ties by folded name then product id', () => {
    const records = [
      searchRecord('same-b', 'Fictivol'),
      searchRecord('same-a', 'Fictivol'),
      searchRecord('accented', 'Fictívöl'),
    ];
    const expected = [...records]
      .sort((left, right) => {
        const leftName = normalizeMedicationSearchQuery(
          left.product.commercialName,
        );
        const rightName = normalizeMedicationSearchQuery(
          right.product.commercialName,
        );
        return (
          compareStable(leftName, rightName) ||
          compareStable(left.product.id, right.product.id)
        );
      })
      .map((record) => record.product.id);

    const page = searchMedicationIndex(
      createMedicationSearchIndex(records),
      'fictivol',
    );

    expect(page.total).toBe(3);
    expect(page.matches.map((match) => match.record.product.id)).toEqual(
      expected,
    );
  });

  it('caps results and reports the full match count when truncated', () => {
    const records = Array.from({ length: 55 }, (_, index) =>
      searchRecord(`product-${index.toString().padStart(2, '0')}`, 'Fictivol'),
    );

    const page = searchMedicationIndex(
      createMedicationSearchIndex(records),
      'fictivol',
      50,
    );

    expect(page.matches).toHaveLength(50);
    expect(page.total).toBe(55);
    expect(page.truncated).toBe(true);
    expect(
      searchMedicationIndex(
        createMedicationSearchIndex(records),
        'fictivol',
        100,
      ).matches,
    ).toHaveLength(50);
  });

  it('returns an empty page for an empty normalized query', () => {
    const page = searchMedicationIndex(
      createMedicationSearchIndex([searchRecord('one', 'Fictivol')]),
      '   \n  ',
    );

    expect(page).toEqual({ matches: [], total: 0, truncated: false });
  });
});
