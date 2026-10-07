import { expect, it } from 'vitest';
import {
  assessUnit,
  deriveStableId,
  normalizeDecimalToken,
  parseStableId,
} from '@intermed/domain';

it('derives the same canonical product id for the same source key', () => {
  const first = deriveStableId(
    'MedicationProduct',
    'source.synthetic',
    'SP-FICT-1',
  );
  const second = deriveStableId(
    'MedicationProduct',
    'source.synthetic',
    'SP-FICT-1',
  );
  expect(first).toEqual({ ok: true, id: second.ok ? second.id : '' });
  expect(first.ok && second.ok && first.id === second.id).toBe(true);
});

it('does not collapse distinct source keys that share a commercial name', () => {
  const low = deriveStableId(
    'MedicationProduct',
    'source.synthetic',
    'SP-SYN-10',
  );
  const high = deriveStableId(
    'MedicationProduct',
    'source.synthetic',
    'SP-SYN-20',
  );
  expect(low.ok).toBe(true);
  expect(high.ok).toBe(true);
  if (!low.ok || !high.ok) return;
  expect(low.id).not.toBe(high.id);
  expect(String(low.id)).not.toContain('Synthetica');
  expect(String(high.id)).not.toContain('Synthetica');
});

it('keeps product and ingredient ids distinct for one source key', () => {
  const product = deriveStableId(
    'MedicationProduct',
    'source.synthetic',
    'ROW-1',
  );
  const ingredient = deriveStableId(
    'ActiveIngredient',
    'source.synthetic',
    'ROW-1',
  );
  expect(
    product.ok && ingredient.ok && String(product.id) !== String(ingredient.id),
  ).toBe(true);
});

it('rejects a blank source key instead of inventing an id', () => {
  expect(
    deriveStableId('MedicationProduct', 'source.synthetic', '   '),
  ).toEqual({
    ok: false,
    issues: [{ code: 'empty-source-key', field: 'sourceRecordKey' }],
  });
});

it('round-trips a derived id back to its source key', () => {
  const derived = deriveStableId('DosageForm', 'source.synthetic', 'FORM-TAB');
  expect(derived.ok).toBe(true);
  if (!derived.ok) return;
  expect(parseStableId('DosageForm', derived.id)).toEqual({
    ok: true,
    id: derived.id,
    sourceId: 'source.synthetic',
    sourceRecordKey: 'FORM-TAB',
  });
});

it('keeps a decimal comma verbatim and normalizes only an unambiguous token', () => {
  expect(normalizeDecimalToken('0,5')).toEqual({
    status: 'present',
    value: '0.5',
  });
  expect(normalizeDecimalToken('1.50')).toEqual({
    status: 'present',
    value: '1.50',
  });
});

it('does not choose a value for an ambiguous thousands-or-decimal token', () => {
  expect(normalizeDecimalToken('1.000')).toEqual({
    status: 'unknown',
    reason: 'ambiguous-decimal',
  });
  expect(normalizeDecimalToken('1,000')).toEqual({
    status: 'unknown',
    reason: 'ambiguous-decimal',
  });
});

it('preserves an unrecognized unit token and does not convert it', () => {
  expect(assessUnit({ status: 'present', value: 'xyz-not-a-unit' })).toEqual({
    status: 'invalid',
    sourceText: 'xyz-not-a-unit',
    reason: 'not-a-unit-token',
  });
  expect(assessUnit({ status: 'present', value: 'mg' })).toEqual({
    status: 'present',
    sourceText: 'mg',
  });
  expect(assessUnit({ status: 'present', value: 'µg' })).toEqual({
    status: 'present',
    sourceText: 'µg',
  });
  expect(assessUnit({ status: 'missing' })).toEqual({ status: 'missing' });
});
