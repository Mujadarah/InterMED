import { expect, it } from 'vitest';
import { findAmbiguousIdentities, foldLegacyCedilla } from '@intermed/domain';
import {
  emptyCatalogue,
  ingredient,
  mustId,
  product,
  SOURCE_KEY,
} from './builders';

const commaName = 'Fict\u0103\u0219\u021B-\u0102\u00E2\u00EE';
const cedillaName = 'Fict\u0103\u015F\u0163-\u0102\u00E2\u00EE';

it('folds legacy cedilla letters without treating them as the same product', () => {
  expect(foldLegacyCedilla(cedillaName)).toBe(foldLegacyCedilla(commaName));
  expect(cedillaName).not.toBe(commaName);
});

it('does not merge same-name products whose strength or form differs', () => {
  expect(() => findAmbiguousIdentities(undefined as never)).not.toThrow();
  const low = product('SP-SYN-10', 'Synthetica', {
    strengthText: { status: 'present', value: '10 mg' },
    dosageFormId: {
      status: 'present',
      value: mustId('DosageForm', SOURCE_KEY, 'DF-TABLET'),
    },
  });
  const high = product('SP-SYN-20', 'Synthetica', {
    strengthText: { status: 'present', value: '20 mg' },
    dosageFormId: {
      status: 'present',
      value: mustId('DosageForm', SOURCE_KEY, 'DF-CAPSULE'),
    },
  });
  const names = [low.commercialName, high.commercialName];
  expect(
    findAmbiguousIdentities(emptyCatalogue({ products: [low, high] })),
  ).toEqual([
    {
      state: 'ambiguous-not-merged',
      reason: 'same-commercial-name-different-strength-or-form',
      name: 'Synthetica',
      entity: 'MedicationProduct',
      entityIds: [low.id, high.id],
      retainedAsDistinct: true,
    },
  ]);
  expect([low.commercialName, high.commercialName]).toEqual(names);
  expect(low.id).not.toBe(high.id);
});

it('reports a shared source key inside one strength when the name also has another strength', () => {
  const tablet = {
    status: 'present' as const,
    value: mustId('DosageForm', SOURCE_KEY, 'DF-FICTOCARD-TABLET'),
  };
  const lowA = product('SP-FICTOCARD-10A', 'Fictocard', {
    strengthText: { status: 'present', value: '10 mg' },
    dosageFormId: tablet,
  });
  const lowB = product('SP-FICTOCARD-10B', 'Fictocard', {
    strengthText: { status: 'present', value: '10 mg' },
    dosageFormId: tablet,
  });
  const high = product('SP-FICTOCARD-20', 'Fictocard', {
    strengthText: { status: 'present', value: '20 mg' },
    dosageFormId: tablet,
  });
  expect(
    findAmbiguousIdentities(emptyCatalogue({ products: [lowA, lowB, high] })),
  ).toEqual([
    {
      state: 'ambiguous-not-merged',
      reason: 'same-commercial-name-different-source-key',
      name: 'Fictocard',
      entity: 'MedicationProduct',
      entityIds: [lowA.id, lowB.id],
      retainedAsDistinct: true,
    },
    {
      state: 'ambiguous-not-merged',
      reason: 'same-commercial-name-different-strength-or-form',
      name: 'Fictocard',
      entity: 'MedicationProduct',
      entityIds: [lowA.id, lowB.id, high.id],
      retainedAsDistinct: true,
    },
  ]);
});

it('keeps an identical strength and form under two source keys unresolved', () => {
  const formId = mustId('DosageForm', SOURCE_KEY, 'DF-TABLET');
  const first = product('SP-SAME-1', 'Samex', {
    strengthText: { status: 'present', value: '10 mg' },
    dosageFormId: { status: 'present', value: formId },
  });
  const second = product('SP-SAME-2', 'Samex', {
    strengthText: { status: 'present', value: '10 mg' },
    dosageFormId: { status: 'present', value: formId },
  });
  expect(
    findAmbiguousIdentities(emptyCatalogue({ products: [first, second] })),
  ).toEqual([
    {
      state: 'ambiguous-not-merged',
      reason: 'same-commercial-name-different-source-key',
      name: 'Samex',
      entity: 'MedicationProduct',
      entityIds: [first.id, second.id],
      retainedAsDistinct: true,
    },
  ]);
});

it('reports a repeated source product key and does not collapse Romanian diacritics', () => {
  const first = product('SP-DUP-A', commaName);
  const second = product('SP-DUP-B', commaName, {
    sourceProductId: 'SP-DUP-A',
  });
  const cedilla = product('SP-CEDILLA', cedillaName);
  const findings = findAmbiguousIdentities(
    emptyCatalogue({ products: [first, second, cedilla] }),
  );
  expect(findings).toEqual([
    {
      state: 'ambiguous-not-merged',
      reason: 'duplicate-source-product-id',
      name: commaName,
      entity: 'MedicationProduct',
      entityIds: [first.id, second.id],
      retainedAsDistinct: true,
    },
    {
      state: 'ambiguous-not-merged',
      reason: 'legacy-cedilla-diacritic-variant',
      name: foldLegacyCedilla(commaName),
      entity: 'MedicationProduct',
      entityIds: [first.id, second.id, cedilla.id],
      retainedAsDistinct: true,
    },
  ]);
  expect(first.commercialName).toContain('\u0219');
  expect(first.commercialName).toContain('\u021B');
  expect(first.commercialName).toContain('\u0103');
  expect(first.commercialName).toContain('\u00E2');
  expect(first.commercialName).toContain('\u00EE');
  expect(cedilla.commercialName).toContain('\u015F');
  expect(cedilla.commercialName).toContain('\u0163');
  expect(new Set(findings.flatMap((finding) => finding.entityIds)).size).toBe(
    3,
  );
});

it('does not merge ingredients that share a name and differ by salt or form', () => {
  const base = ingredient('AI-SALT-A', 'Syntheinin', {
    saltOrForm: { status: 'present', value: 'fictional-salt-a' },
  });
  const other = ingredient('AI-SALT-B', 'Syntheinin', {
    saltOrForm: { status: 'present', value: 'fictional-salt-b' },
  });
  expect(
    findAmbiguousIdentities(
      emptyCatalogue({ activeIngredients: [base, other] }),
    ),
  ).toEqual([
    {
      state: 'ambiguous-not-merged',
      reason: 'same-preferred-name-different-salt-or-form',
      name: 'Syntheinin',
      entity: 'ActiveIngredient',
      entityIds: [base.id, other.id],
      retainedAsDistinct: true,
    },
  ]);
});
