import {
  applyConversionPath,
  findConversionPath,
  STANDARD_UNIT_CONVERSIONS,
} from './units';
import { hasComponentApproval, hasFormulaApproval } from './approvals';
import { FORMULA_COMPONENT_ORDER, getFormulaVersionId } from './types';
import type {
  FormulaComponent,
  FormulaComponentVersions,
  FormulaDefinition,
  FormulaInputDefinition,
  FormulaMetadata,
  PendingFormulaApproval,
  FormulaReviewStatus,
  FormulaSoftCheck,
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

function assertCategoryInput(
  input: Extract<FormulaInputDefinition, { kind: 'category' }>,
): void {
  if (
    !hasText(input.id) ||
    !hasText(input.label) ||
    typeof input.required !== 'boolean'
  ) {
    invalidDefinition(
      'Each category input requires an id, label, and required flag.',
    );
  }
  if (!Array.isArray(input.options) || input.options.length === 0) {
    invalidDefinition(
      `Input ${input.id} requires at least one category option.`,
    );
  }
  const seenOptionIds = new Set<string>();
  for (const option of input.options) {
    if (!option || typeof option !== 'object') {
      invalidDefinition(`Input ${input.id} has a malformed category option.`);
    }
    if (!hasText(option.id) || !hasText(option.label)) {
      invalidDefinition(
        `Input ${input.id} requires a non-empty id and label for every option.`,
      );
    }
    if (seenOptionIds.has(option.id)) {
      invalidDefinition(
        `Input ${input.id} has a duplicate option id ${option.id}.`,
      );
    }
    seenOptionIds.add(option.id);
  }
  const quantityFields = input as unknown as Record<string, unknown>;
  if (
    quantityFields.quantityKind !== undefined ||
    quantityFields.canonicalUnit !== undefined ||
    quantityFields.allowedUnits !== undefined ||
    quantityFields.plausibleRangeByUnit !== undefined ||
    quantityFields.allowNegative !== undefined
  ) {
    invalidDefinition(
      `Input ${input.id} is categorical and must not declare units or ranges.`,
    );
  }
}

function assertInput(input: FormulaInputDefinition): void {
  if (!input || typeof input !== 'object') {
    invalidDefinition('Each formula input must be a structured object.');
  }
  if (
    input.kind !== undefined &&
    input.kind !== 'quantity' &&
    input.kind !== 'category'
  ) {
    invalidDefinition('Each formula input has an unknown input kind.');
  }
  if (input.kind === 'category') {
    assertCategoryInput(input);
    return;
  }
  if (
    'options' in input &&
    (input as unknown as Record<string, unknown>).options !== undefined
  ) {
    invalidDefinition(
      `Input ${input.id} is numeric and must not declare category options.`,
    );
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
    if (input.kind === 'category') continue;
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
    if (input.kind === 'category') continue;
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
    Math.abs(first - second) / Math.max(1, Math.abs(first), Math.abs(second))
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

function composeConversionPath(path: readonly UnitConversionRule[]): {
  readonly factor: number;
  readonly offset: number;
} {
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
    input.kind === 'category' ||
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

function assertComponentVersions(definition: FormulaDefinition): void {
  const versions = definition.componentVersions as
    FormulaComponentVersions | undefined;
  if (!versions || typeof versions !== 'object' || Array.isArray(versions)) {
    invalidDefinition('A formula requires component versions.');
  }
  const keys = Object.keys(versions);
  if (
    keys.some(
      (key) => !FORMULA_COMPONENT_ORDER.includes(key as FormulaComponent),
    )
  ) {
    invalidDefinition(
      'Formula component versions contain an unknown component.',
    );
  }
  for (const component of FORMULA_COMPONENT_ORDER) {
    const version = versions[component];
    const required =
      component === 'formula' ||
      component === 'population' ||
      component === 'presentation';
    if (required && version === undefined) {
      invalidDefinition(`Formula component ${component} requires a version.`);
    }
    if (
      version !== undefined &&
      (!hasText(version) ||
        version !== version.trim() ||
        version.includes('|') ||
        version.includes('='))
    ) {
      invalidDefinition(
        `Formula component ${component} has an invalid version.`,
      );
    }
  }
  const hasClassification = versions.classification !== undefined;
  const hasConfirmation = versions.confirmation !== undefined;
  const hasClassifier = typeof definition.classify === 'function';
  const hasSoftChecks =
    Array.isArray(definition.softChecks) && definition.softChecks.length > 0;
  if (hasClassification !== hasClassifier) {
    invalidDefinition(
      'Classification component versioning must match the declared classifier.',
    );
  }
  if (hasConfirmation !== hasSoftChecks) {
    invalidDefinition(
      'Confirmation component versioning must match the declared soft checks.',
    );
  }
  if (definition.formulaVersion !== getFormulaVersionId(versions)) {
    invalidDefinition(
      'Formula version must identify the exact declared component-version set.',
    );
  }
}

function assertSoftCheck(
  check: FormulaSoftCheck,
  inputsById: ReadonlyMap<string, FormulaInputDefinition>,
  conversions: FormulaUnitConversions,
): void {
  if (
    !check ||
    typeof check !== 'object' ||
    !hasText(check.id) ||
    !hasText(check.message)
  ) {
    invalidDefinition('Soft checks require an id and a confirmation message.');
  }
  if (check.kind === 'input-range') {
    const input = inputsById.get(check.inputId);
    if (input?.kind === 'category') {
      invalidDefinition(
        `Soft check ${check.id} must reference a numeric input.`,
      );
    }
    const quantityInput = input;
    const hasMinimum = check.minimum !== undefined;
    const hasMaximum = check.maximum !== undefined;
    const unitToCanonicalPath =
      quantityInput && hasText(check.unit)
        ? findConversionPath(
            conversions,
            quantityInput.quantityKind,
            check.unit,
            quantityInput.canonicalUnit,
          )
        : undefined;
    const hasSupportedUnit =
      quantityInput !== undefined &&
      hasText(check.unit) &&
      quantityInput.allowedUnits.includes(check.unit) &&
      unitToCanonicalPath !== undefined;
    const canonicalMinimum =
      hasMinimum && unitToCanonicalPath
        ? applyConversionPath(check.minimum as number, unitToCanonicalPath)
            ?.value
        : undefined;
    const canonicalMaximum =
      hasMaximum && unitToCanonicalPath
        ? applyConversionPath(check.maximum as number, unitToCanonicalPath)
            ?.value
        : undefined;
    if (
      !input ||
      !hasSupportedUnit ||
      (!hasMinimum && !hasMaximum) ||
      (hasMinimum && !Number.isFinite(check.minimum)) ||
      (hasMaximum && !Number.isFinite(check.maximum)) ||
      (hasMinimum && !Number.isFinite(canonicalMinimum)) ||
      (hasMaximum && !Number.isFinite(canonicalMaximum)) ||
      (hasMinimum && hasMaximum && check.minimum > check.maximum)
    ) {
      invalidDefinition(
        `Soft check ${check.id} has invalid input-range bounds.`,
      );
    }
    return;
  }
  if (check.kind === 'implied-bmi-range') {
    const weight = inputsById.get(check.weightInputId);
    const height = inputsById.get(check.heightInputId);
    if (
      !weight ||
      !height ||
      weight.kind === 'category' ||
      height.kind === 'category' ||
      weight === height ||
      weight.quantityKind !== 'mass' ||
      height.quantityKind !== 'length' ||
      !Number.isFinite(check.minimum) ||
      !Number.isFinite(check.maximum) ||
      check.minimum > check.maximum ||
      !findConversionPath(
        conversions,
        weight.quantityKind,
        weight.canonicalUnit,
        'kg',
      ) ||
      !findConversionPath(
        conversions,
        height.quantityKind,
        height.canonicalUnit,
        'm',
      )
    ) {
      invalidDefinition(
        `Soft check ${check.id} has invalid implied-BMI bounds.`,
      );
    }
    return;
  }
  invalidDefinition('Formula soft checks contain an unknown kind.');
}

function assertSoftChecks(
  definition: FormulaDefinition,
  inputsById: ReadonlyMap<string, FormulaInputDefinition>,
): void {
  if (definition.softChecks === undefined) return;
  if (!Array.isArray(definition.softChecks)) {
    invalidDefinition('Formula soft checks must be an array.');
  }
  const checkIds = new Set<string>();
  for (const check of definition.softChecks) {
    assertSoftCheck(check, inputsById, definition.unitConversions);
    if (checkIds.has(check.id)) {
      invalidDefinition(`Formula soft check ids must be unique: ${check.id}.`);
    }
    checkIds.add(check.id);
  }
}

function assertReviewStatus(
  status: FormulaReviewStatus,
  formulaId: string,
  componentVersions: FormulaComponentVersions,
): void {
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
  if (!hasFormulaApproval(formulaId, componentVersions)) {
    invalidDefinition(
      `Clinically reviewed formula ${formulaId} requires approval for every current component version.`,
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
  assertComponentVersions(definition);
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
    !definition.output.rounding ||
    typeof definition.output.rounding !== 'object' ||
    (definition.output.rounding.mode !== 'half-away-from-zero' &&
      definition.output.rounding.mode !== 'half-up-decimal') ||
    !Number.isSafeInteger(definition.output.rounding.precision) ||
    definition.output.rounding.precision < 0
  ) {
    invalidDefinition(
      'A formula output requires a unit and an explicit supported rounding mode with non-negative integer precision.',
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
  assertSoftChecks(definition, inputsById);
  if (
    !Array.isArray(definition.limitations) ||
    definition.limitations.length === 0 ||
    definition.limitations.some((limitation) => !hasText(limitation))
  ) {
    invalidDefinition('A formula requires at least one non-empty limitation.');
  }
  assertReviewStatus(
    definition.reviewStatus,
    definition.formulaId,
    definition.componentVersions,
  );
  if (
    definition.classify !== undefined &&
    typeof definition.classify !== 'function'
  ) {
    invalidDefinition('A formula classify hook must be a function.');
  }
  if (definition.deprecated && !hasText(definition.deprecated.notice)) {
    invalidDefinition('A deprecation requires a non-empty notice.');
  }
}

/** Returns a deeply frozen copy, so a definition cannot change after its version is fixed. */
export function freezeDefinition(
  definition: FormulaDefinition,
): FormulaDefinition {
  const inputs = definition.inputs.map((input) => {
    if (input.kind === 'category') {
      return Object.freeze({
        ...input,
        options: Object.freeze(
          input.options.map((option) => Object.freeze({ ...option })),
        ),
      });
    }
    return Object.freeze({
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
    });
  });
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
    componentVersions: Object.freeze({ ...definition.componentVersions }),
    inputs: Object.freeze(inputs),
    unitConversions: conversions,
    output: Object.freeze({
      ...definition.output,
      rounding: Object.freeze({ ...definition.output.rounding }),
    }),
    populationLimits: Object.freeze({
      text: definition.populationLimits.text,
      guards: Object.freeze(
        definition.populationLimits.guards.map((guard) =>
          Object.freeze({ ...guard }),
        ),
      ),
    }),
    limitations: Object.freeze([...definition.limitations]),
    ...(definition.softChecks
      ? {
          softChecks: Object.freeze(
            definition.softChecks.map((check) => Object.freeze({ ...check })),
          ),
        }
      : {}),
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

  get(formulaId: string, formulaVersion: string): FormulaMetadata | undefined {
    const stored = this.resolveForCalculation(formulaId, formulaVersion);
    if (!stored) return undefined;
    const view: Record<string, unknown> = { ...stored };
    delete view.compute;
    delete view.classify;
    return Object.freeze(view) as FormulaMetadata;
  }

  /**
   * @internal Resolves the executable definition for the calculate module.
   * `calculateFormula` stays the only public path to a number.
   */
  resolveForCalculation(
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
        componentVersions: definition.componentVersions,
        deprecated: definition.deprecated !== undefined,
        ...(definition.deprecated
          ? { deprecationNotice: definition.deprecated.notice }
          : {}),
      }));
    return Object.freeze(versions.map((version) => Object.freeze(version)));
  }

  listPendingApprovals(): readonly PendingFormulaApproval[] {
    const pending = [...this.definitions.values()]
      .flatMap((definition) =>
        FORMULA_COMPONENT_ORDER.flatMap((component) => {
          const componentVersion = definition.componentVersions[component];
          if (
            componentVersion === undefined ||
            hasComponentApproval(
              definition.formulaId,
              component,
              componentVersion,
            )
          ) {
            return [];
          }
          return [
            Object.freeze({
              formulaId: definition.formulaId,
              formulaVersion: definition.formulaVersion,
              component,
              componentVersion,
            }),
          ];
        }),
      )
      .sort(
        (first, second) =>
          first.formulaId.localeCompare(second.formulaId) ||
          first.formulaVersion.localeCompare(second.formulaVersion) ||
          FORMULA_COMPONENT_ORDER.indexOf(first.component) -
            FORMULA_COMPONENT_ORDER.indexOf(second.component),
      );
    return Object.freeze(pending);
  }
}
