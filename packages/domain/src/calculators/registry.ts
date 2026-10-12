import { findConversionPath, STANDARD_UNIT_CONVERSIONS } from './units';
import type {
  FormulaDefinition,
  FormulaInputDefinition,
  FormulaReviewStatus,
  FormulaUnitConversions,
  FormulaVersionSummary,
  PopulationGuard,
  UnitConversionRule,
} from './types';

export class FormulaRegistrationError extends Error {
  readonly code: 'invalid-definition' | 'duplicate-version';

  constructor(
    code: 'invalid-definition' | 'duplicate-version',
    message: string,
  ) {
    super(message);
    this.name = 'FormulaRegistrationError';
    this.code = code;
  }
}

function invalidDefinition(message: string): never {
  throw new FormulaRegistrationError('invalid-definition', message);
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function assertReference(definition: FormulaDefinition): void {
  if (
    !definition.primaryReference ||
    !hasText(definition.primaryReference.citation) ||
    !hasText(definition.primaryReference.urlOrDoi)
  ) {
    invalidDefinition(
      'A formula requires a primary reference citation and URL or DOI.',
    );
  }
}

function assertInput(input: FormulaInputDefinition): void {
  if (!input || typeof input !== 'object') {
    invalidDefinition('Each formula input must be a structured object.');
  }
  if (
    !hasText(input.id) ||
    !hasText(input.label) ||
    !hasText(input.quantityKind) ||
    !hasText(input.canonicalUnit) ||
    typeof input.required !== 'boolean'
  ) {
    invalidDefinition(
      'Each formula input requires an id, label, kind, unit, and required flag.',
    );
  }
  if (
    !Array.isArray(input.allowedUnits) ||
    !input.plausibleRangeByUnit ||
    typeof input.plausibleRangeByUnit !== 'object'
  ) {
    invalidDefinition(
      `Input ${input.id} requires allowed units and per-unit ranges.`,
    );
  }
  if (
    input.allowNegative !== undefined &&
    typeof input.allowNegative !== 'boolean'
  ) {
    invalidDefinition(
      `Input ${input.id} has an invalid negative-value policy.`,
    );
  }
  if (
    input.allowedUnits.length === 0 ||
    new Set(input.allowedUnits).size !== input.allowedUnits.length ||
    !input.allowedUnits.includes(input.canonicalUnit)
  ) {
    invalidDefinition(
      `Input ${input.id} must list unique allowed units including its canonical unit.`,
    );
  }
  for (const unit of input.allowedUnits) {
    const range = input.plausibleRangeByUnit[unit];
    if (
      !range ||
      !Number.isFinite(range.min) ||
      !Number.isFinite(range.max) ||
      range.min > range.max
    ) {
      invalidDefinition(
        `Input ${input.id} needs a valid plausible range for ${unit}.`,
      );
    }
  }
}

function assertConversionRules(
  inputs: readonly FormulaInputDefinition[],
  conversions: FormulaUnitConversions,
): void {
  const unitsByKind = new Map<string, Set<string>>();
  for (const input of inputs) {
    const units = unitsByKind.get(input.quantityKind) ?? new Set<string>();
    input.allowedUnits.forEach((unit) => units.add(unit));
    unitsByKind.set(input.quantityKind, units);
  }

  for (const [kind, rules] of Object.entries(conversions)) {
    const units = unitsByKind.get(kind);
    if (!units || !Array.isArray(rules)) {
      invalidDefinition(
        `Unit conversions for ${kind} do not match a formula quantity kind.`,
      );
    }
    const seenEdges = new Set<string>();
    for (const rule of rules) {
      assertConversionRule(kind, rule, units, seenEdges);
    }
    assertStandardAgreement(kind, rules);
    assertInverseConsistency(kind, rules);
    assertChainConsistency(kind, rules, conversions);
  }

  for (const input of inputs) {
    for (const unit of input.allowedUnits) {
      if (
        !findConversionPath(
          conversions,
          input.quantityKind,
          unit,
          input.canonicalUnit,
        )
      ) {
        invalidDefinition(
          `Input ${input.id} cannot convert ${unit} to ${input.canonicalUnit}.`,
        );
      }
    }
  }
}

function assertConversionRule(
  kind: string,
  rule: UnitConversionRule,
  units: ReadonlySet<string>,
  seenEdges: Set<string>,
): void {
  if (!rule || typeof rule !== 'object') {
    invalidDefinition(`Unit conversion for ${kind} must be a structured rule.`);
  }
  if (
    !hasText(rule.fromUnit) ||
    !hasText(rule.toUnit) ||
    rule.fromUnit === rule.toUnit ||
    !units.has(rule.fromUnit) ||
    !units.has(rule.toUnit) ||
    !Number.isFinite(rule.factor) ||
    rule.factor <= 0 ||
    !Number.isFinite(rule.offset ?? 0)
  ) {
    invalidDefinition(`Unit conversion for ${kind} contains an invalid rule.`);
  }
  const edge = `${rule.fromUnit}\u0000${rule.toUnit}`;
  if (seenEdges.has(edge)) {
    invalidDefinition(
      `Unit conversion for ${kind} contains a duplicate route.`,
    );
  }
  seenEdges.add(edge);
}

const CONVERSION_CONSISTENCY_TOLERANCE = 1e-12;

function conversionEdge(fromUnit: string, toUnit: string): string {
  return `${fromUnit}\u0000${toUnit}`;
}

function relativeDifference(first: number, second: number): number {
  return (
    Math.abs(first - second) /
    Math.max(1, Math.abs(first), Math.abs(second))
  );
}

function assertStandardAgreement(
  kind: string,
  rules: readonly UnitConversionRule[],
): void {
  const standard = STANDARD_UNIT_CONVERSIONS[kind];
  if (!standard) return;
  const standardByEdge = new Map(
    standard.map((rule) => [conversionEdge(rule.fromUnit, rule.toUnit), rule]),
  );
  for (const rule of rules) {
    const match = standardByEdge.get(
      conversionEdge(rule.fromUnit, rule.toUnit),
    );
    if (!match) continue;
    const offset = rule.offset ?? 0;
    const standardOffset = match.offset ?? 0;
    if (
      relativeDifference(rule.factor, match.factor) >
        CONVERSION_CONSISTENCY_TOLERANCE ||
      Math.abs(offset - standardOffset) >
        CONVERSION_CONSISTENCY_TOLERANCE *
          Math.max(1, Math.abs(offset), Math.abs(standardOffset))
    ) {
      invalidDefinition(
        `Unit conversion for ${kind} from ${rule.fromUnit} to ${rule.toUnit} disagrees with the standard table.`,
      );
    }
  }
}

function assertInverseConsistency(
  kind: string,
  rules: readonly UnitConversionRule[],
): void {
  const byEdge = new Map(
    rules.map((rule) => [conversionEdge(rule.fromUnit, rule.toUnit), rule]),
  );
  for (const rule of rules) {
    const inverse = byEdge.get(conversionEdge(rule.toUnit, rule.fromUnit));
    if (!inverse) continue;
    if (
      Math.abs(rule.factor * inverse.factor - 1) >
      CONVERSION_CONSISTENCY_TOLERANCE
    ) {
      invalidDefinition(
        `Unit conversion for ${kind} from ${rule.fromUnit} to ${rule.toUnit} is not round-trip consistent with its inverse.`,
      );
    }
    const roundTripOffset =
      (rule.offset ?? 0) * inverse.factor + (inverse.offset ?? 0);
    if (
      Math.abs(roundTripOffset) >
      CONVERSION_CONSISTENCY_TOLERANCE *
        Math.max(
          1,
          Math.abs((rule.offset ?? 0) * inverse.factor),
          Math.abs(inverse.offset ?? 0),
        )
    ) {
      invalidDefinition(
        `Unit conversion for ${kind} from ${rule.fromUnit} to ${rule.toUnit} is not round-trip consistent with its inverse.`,
      );
    }
  }
}

function composeConversionPath(
  path: readonly UnitConversionRule[],
): { readonly factor: number; readonly offset: number } {
  let factor = 1;
  let offset = 0;
  for (const rule of path) {
    offset = offset * rule.factor + (rule.offset ?? 0);
    factor *= rule.factor;
  }
  return { factor, offset };
}

function assertChainConsistency(
  kind: string,
  rules: readonly UnitConversionRule[],
  conversions: FormulaUnitConversions,
): void {
  for (const rule of rules) {
    const withoutDirect = rules.filter((other) => other !== rule);
    const alternative = findConversionPath(
      { ...conversions, [kind]: withoutDirect },
      kind,
      rule.fromUnit,
      rule.toUnit,
    );
    if (!alternative || alternative.rules.length === 0) continue;
    const composed = composeConversionPath(alternative.rules);
    const offset = rule.offset ?? 0;
    if (
      relativeDifference(rule.factor, composed.factor) >
        CONVERSION_CONSISTENCY_TOLERANCE ||
      Math.abs(offset - composed.offset) >
        CONVERSION_CONSISTENCY_TOLERANCE *
          Math.max(1, Math.abs(offset), Math.abs(composed.offset))
    ) {
      invalidDefinition(
        `Unit conversion for ${kind} from ${rule.fromUnit} to ${rule.toUnit} disagrees with its composed chain.`,
      );
    }
  }
}
function assertGuard(
  guard: PopulationGuard,
  inputsById: ReadonlyMap<string, FormulaInputDefinition>,
): void {
  if (!guard || typeof guard !== 'object') {
    invalidDefinition('Population guards must be structured objects.');
  }
  const input = inputsById.get(guard.inputId);
  if (
    !hasText(guard.id) ||
    !hasText(guard.message) ||
    !input ||
    !input.required ||
    guard.unit !== input.canonicalUnit
  ) {
    invalidDefinition(
      `Population guard ${guard.id} must reference a required input in its canonical unit.`,
    );
  }
  if (guard.operator === 'between') {
    if (
      !Number.isFinite(guard.minimum) ||
      !Number.isFinite(guard.maximum) ||
      guard.minimum > guard.maximum
    ) {
      invalidDefinition(`Population guard ${guard.id} has invalid bounds.`);
    }
    return;
  }
  if (guard.operator !== 'at-least' && guard.operator !== 'at-most') {
    const operator = (guard as { readonly operator: unknown }).operator;
    const guardId = (guard as { readonly id: unknown }).id;
    invalidDefinition(
      `Population guard ${String(guardId)} has an unknown operator ${String(operator)}.`,
    );
  }
  if (!Number.isFinite(guard.value)) {
    invalidDefinition(`Population guard ${guard.id} requires a finite limit.`);
  }
}

function assertReviewStatus(status: FormulaReviewStatus): void {
  if (status === 'unreviewed') return;
  if (
    !status ||
    typeof status !== 'object' ||
    status.status !== 'clinically-reviewed' ||
    !hasText(status.reviewer) ||
    !hasText(status.reviewedAt) ||
    !Number.isFinite(Date.parse(status.reviewedAt))
  ) {
    invalidDefinition(
      'Clinically reviewed formulas require a reviewer and valid review date.',
    );
  }
}

function validateDefinition(definition: FormulaDefinition): void {
  if (
    !definition ||
    !hasText(definition.formulaId) ||
    !hasText(definition.formulaVersion) ||
    !hasText(definition.title) ||
    typeof definition.compute !== 'function'
  ) {
    invalidDefinition(
      'A formula requires a pinned id and version, title, and compute function.',
    );
  }
  assertReference(definition);
  if (!Array.isArray(definition.inputs) || definition.inputs.length === 0) {
    invalidDefinition('A formula requires at least one input definition.');
  }
  const inputsById = new Map<string, FormulaInputDefinition>();
  for (const input of definition.inputs) {
    assertInput(input);
    if (inputsById.has(input.id)) {
      invalidDefinition(`Formula input ids must be unique: ${input.id}.`);
    }
    inputsById.set(input.id, input);
  }
  if (
    !definition.unitConversions ||
    typeof definition.unitConversions !== 'object'
  ) {
    invalidDefinition(
      'Formula unit conversions must be declared by quantity kind.',
    );
  }
  assertConversionRules(definition.inputs, definition.unitConversions);
  if (
    !definition.output ||
    typeof definition.output !== 'object' ||
    !hasText(definition.output.unit) ||
    !Number.isSafeInteger(definition.output.precision) ||
    definition.output.precision < 0
  ) {
    invalidDefinition(
      'A formula output requires a unit and non-negative integer precision.',
    );
  }
  if (
    !definition.populationLimits ||
    !hasText(definition.populationLimits.text) ||
    !Array.isArray(definition.populationLimits.guards)
  ) {
    invalidDefinition(
      'A formula requires population-limit text and structured guards.',
    );
  }
  if (definition.populationLimits.guards.length === 0) {
    invalidDefinition(
      'A formula requires at least one population guard; adult-only v1 carries at least an age guard.',
    );
  }
  const guardIds = new Set<string>();
  for (const guard of definition.populationLimits.guards) {
    assertGuard(guard, inputsById);
    if (guardIds.has(guard.id)) {
      invalidDefinition(`Population guard ids must be unique: ${guard.id}.`);
    }
    guardIds.add(guard.id);
  }
  if (
    !Array.isArray(definition.limitations) ||
    definition.limitations.length === 0 ||
    definition.limitations.some((limitation) => !hasText(limitation))
  ) {
    invalidDefinition('A formula requires at least one non-empty limitation.');
  }
  assertReviewStatus(definition.reviewStatus);
  if (definition.deprecated && !hasText(definition.deprecated.notice)) {
    invalidDefinition('A deprecation requires a non-empty notice.');
  }
}

function freezeDefinition(definition: FormulaDefinition): FormulaDefinition {
  const inputs = definition.inputs.map((input) =>
    Object.freeze({
      ...input,
      allowedUnits: Object.freeze([...input.allowedUnits]),
      plausibleRangeByUnit: Object.freeze({
        ...Object.fromEntries(
          Object.entries(input.plausibleRangeByUnit).map(([unit, range]) => [
            unit,
            Object.freeze({ ...range }),
          ]),
        ),
      }),
    }),
  );
  const conversions = Object.freeze(
    Object.fromEntries(
      Object.entries(definition.unitConversions).map(([kind, rules]) => [
        kind,
        Object.freeze(rules.map((rule) => Object.freeze({ ...rule }))),
      ]),
    ),
  ) as FormulaUnitConversions;
  const reviewStatus =
    typeof definition.reviewStatus === 'string'
      ? definition.reviewStatus
      : Object.freeze({ ...definition.reviewStatus });
  return Object.freeze({
    ...definition,
    primaryReference: Object.freeze({ ...definition.primaryReference }),
    inputs: Object.freeze(inputs),
    unitConversions: conversions,
    output: Object.freeze({ ...definition.output }),
    populationLimits: Object.freeze({
      text: definition.populationLimits.text,
      guards: Object.freeze(
        definition.populationLimits.guards.map((guard) =>
          Object.freeze({ ...guard }),
        ),
      ),
    }),
    limitations: Object.freeze([...definition.limitations]),
    reviewStatus,
    ...(definition.deprecated
      ? { deprecated: Object.freeze({ ...definition.deprecated }) }
      : {}),
  });
}

function formulaKey(formulaId: string, version: string): string {
  return JSON.stringify([formulaId, version]);
}

/** Registry entries are retrieved only by an explicitly pinned id and version. */
export class FormulaRegistry {
  private readonly definitions = new Map<string, FormulaDefinition>();

  register(definition: FormulaDefinition): void {
    validateDefinition(definition);
    const key = formulaKey(definition.formulaId, definition.formulaVersion);
    if (this.definitions.has(key)) {
      throw new FormulaRegistrationError(
        'duplicate-version',
        `Formula ${definition.formulaId}@${definition.formulaVersion} is already registered.`,
      );
    }
    this.definitions.set(key, freezeDefinition(definition));
  }

  get(
    formulaId: string,
    formulaVersion: string,
  ): FormulaDefinition | undefined {
    return this.definitions.get(formulaKey(formulaId, formulaVersion));
  }

  listVersions(formulaId: string): readonly FormulaVersionSummary[] {
    const versions = [...this.definitions.values()]
      .filter((definition) => definition.formulaId === formulaId)
      .map((definition) => ({
        version: definition.formulaVersion,
        deprecated: definition.deprecated !== undefined,
        ...(definition.deprecated
          ? { deprecationNotice: definition.deprecated.notice }
          : {}),
      }));
    return Object.freeze(versions.map((version) => Object.freeze(version)));
  }
}
