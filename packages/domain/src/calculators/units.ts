import type {
  FormulaUnitConversions,
  UnitConversionRule,
  UnitConversionRecord,
} from './types';

export const STANDARD_UNIT_CONVERSIONS: FormulaUnitConversions = Object.freeze({
  mass: Object.freeze([
    Object.freeze({
      fromUnit: 'kg',
      toUnit: 'lb',
      factor: 2.2046226218487757,
    }),
    Object.freeze({ fromUnit: 'lb', toUnit: 'kg', factor: 0.45359237 }),
  ]),
  length: Object.freeze([
    Object.freeze({ fromUnit: 'cm', toUnit: 'm', factor: 0.01 }),
    Object.freeze({ fromUnit: 'm', toUnit: 'cm', factor: 100 }),
    Object.freeze({ fromUnit: 'cm', toUnit: 'in', factor: 1 / 2.54 }),
    Object.freeze({ fromUnit: 'in', toUnit: 'cm', factor: 2.54 }),
    Object.freeze({ fromUnit: 'm', toUnit: 'in', factor: 100 / 2.54 }),
    Object.freeze({ fromUnit: 'in', toUnit: 'm', factor: 2.54 / 100 }),
  ]),
});

export interface ConversionPathResult {
  readonly rules: readonly UnitConversionRule[];
}

export function findConversionPath(
  conversions: FormulaUnitConversions,
  quantityKind: string,
  fromUnit: string,
  toUnit: string,
): ConversionPathResult | undefined {
  if (fromUnit === toUnit) return { rules: [] };
  const rules = conversions[quantityKind] ?? [];
  const visited = new Set<string>([fromUnit]);
  const pending: Array<{
    readonly unit: string;
    readonly path: readonly UnitConversionRule[];
  }> = [{ unit: fromUnit, path: [] }];

  while (pending.length > 0) {
    const current = pending.shift();
    if (!current) continue;
    for (const rule of rules) {
      if (rule.fromUnit !== current.unit || visited.has(rule.toUnit)) continue;
      const path = [...current.path, rule];
      if (rule.toUnit === toUnit) return { rules: path };
      visited.add(rule.toUnit);
      pending.push({ unit: rule.toUnit, path });
    }
  }
  return undefined;
}

export function applyConversionPath(
  value: number,
  path: ConversionPathResult,
):
  | {
      readonly value: number;
      readonly records: readonly UnitConversionRecord[];
    }
  | undefined {
  let currentValue = value;
  const records: UnitConversionRecord[] = [];
  for (const rule of path.rules) {
    const convertedValue = currentValue * rule.factor + (rule.offset ?? 0);
    if (!Number.isFinite(convertedValue)) return undefined;
    records.push({
      fromUnit: rule.fromUnit,
      toUnit: rule.toUnit,
      inputValue: currentValue,
      convertedValue,
      factor: rule.factor,
      offset: rule.offset ?? 0,
    });
    currentValue = convertedValue;
  }
  return { value: currentValue, records };
}
