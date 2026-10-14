import type {
  DatasetUpdateState,
  FormulaMetadata,
  PendingFormulaApproval,
} from '@intermed/domain';
import type { ShellState } from './shell';

export interface DiagnosticsStorage {
  readonly usageBytes: number | null;
  readonly quotaBytes: number | null;
  readonly persisted: boolean | null;
}
export interface DiagnosticsSources {
  readonly shellRevision: string;
  readonly runtimeMode: string;
  /** Schema supported by this app, not an assertion that storage opened. */
  readonly schemaVersion: number | null;
  readonly shellState: ShellState;
  readonly datasetState: DatasetUpdateState;
  readonly formulas: readonly Pick<
    FormulaMetadata,
    'formulaId' | 'formulaVersion' | 'reviewStatus'
  >[];
  readonly pendingApprovals: readonly PendingFormulaApproval[];
  readonly storage: DiagnosticsStorage;
  readonly userAgent: string;
  readonly generatedAt: string;
}

/** Explicit allowlist: never serialize source objects, preferences or user inputs. */
export function buildDiagnosticsReport(sources: DiagnosticsSources) {
  const state = sources.datasetState;
  const generation = 'generation' in state ? state.generation : null;
  const elapsed = generation
    ? Date.parse(sources.generatedAt) - Date.parse(generation.downloadedAt)
    : Number.NaN;
  const ageDays =
    Number.isFinite(elapsed) && elapsed >= 0
      ? Math.floor(elapsed / 86_400_000)
      : null;
  const formulas = sources.formulas.map((formula) => ({
    formulaId: formula.formulaId,
    formulaVersion: formula.formulaVersion,
    reviewStatus:
      typeof formula.reviewStatus === 'string'
        ? formula.reviewStatus
        : {
            status: formula.reviewStatus.status,
            reviewer: formula.reviewStatus.reviewer,
            reviewedAt: formula.reviewStatus.reviewedAt,
          },
    pendingApprovalCount: sources.pendingApprovals.filter(
      (approval) =>
        approval.formulaId === formula.formulaId &&
        approval.formulaVersion === formula.formulaVersion,
    ).length,
  }));
  return {
    format: 'intermed-diagnostics' as const,
    version: 1 as const,
    generatedAt: sources.generatedAt,
    app: {
      shellRevision: sources.shellRevision,
      runtimeMode: sources.runtimeMode,
    },
    shell: {
      availability: sources.shellState.availability,
      version: sources.shellState.version ?? null,
      update: sources.shellState.update,
      usingPrior: sources.shellState.usingPrior ?? null,
    },
    localStore: {
      schemaVersion: sources.schemaVersion,
      updateState: state.status,
      failureReason: 'reason' in state ? state.reason : null,
      activeDataset: generation
        ? {
            versionId: generation.generationId,
            version: generation.version,
            schemaVersion: generation.schemaVersion,
            sourceIds: [...generation.sourceIds],
            publishedAt: generation.publishedAt,
            downloadedAt: generation.downloadedAt,
            ageDays,
            synthetic: generation.synthetic,
          }
        : null,
    },
    calculators: {
      formulas,
      pendingApprovalCount: formulas.reduce(
        (total, formula) => total + formula.pendingApprovalCount,
        0,
      ),
    },
    interactionProvider: 'no approved provider' as const,
    storage: {
      usageBytes: finiteBytes(sources.storage.usageBytes),
      quotaBytes: finiteBytes(sources.storage.quotaBytes),
      persisted: sources.storage.persisted,
    },
    userAgent: sources.userAgent,
  };
}

export type DiagnosticsReport = ReturnType<typeof buildDiagnosticsReport>;

function finiteBytes(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value >= 0 ? value : null;
}

function textValue(value: unknown): string {
  if (value === null) return 'unavailable';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** Human-readable plain text of the same allowlisted snapshot as the JSON. */
export function diagnosticsText(report: DiagnosticsReport): string {
  const dataset = report.localStore.activeDataset;
  const lines: readonly (readonly [string, unknown])[] = [
    ['InterMED diagnostics format version', report.version],
    ['Generated at', report.generatedAt],
    ['App shell revision', report.app.shellRevision],
    ['Runtime mode', report.app.runtimeMode],
    ['Shell availability', report.shell.availability],
    ['Shell version', report.shell.version],
    ['Shell update state', report.shell.update],
    ['Shell using prior', report.shell.usingPrior],
    ['Local-store supported schema version', report.localStore.schemaVersion],
    ['Dataset update state', report.localStore.updateState],
    ['Dataset failure reason', report.localStore.failureReason],
    ['Active dataset version id', dataset?.versionId ?? null],
    ['Active dataset version', dataset?.version ?? null],
    ['Dataset schema version', dataset?.schemaVersion ?? null],
    ['Dataset source ids', dataset?.sourceIds ?? null],
    ['Dataset published at', dataset?.publishedAt ?? null],
    ['Dataset downloaded at', dataset?.downloadedAt ?? null],
    ['Dataset age (days since download)', dataset?.ageDays ?? null],
    ['Synthetic dataset (not for clinical use)', dataset?.synthetic ?? null],
    [
      'Calculator pending component approvals',
      report.calculators.pendingApprovalCount,
    ],
    ...report.calculators.formulas.map(
      (formula) =>
        [
          'Calculator ' + formula.formulaId,
          {
            formulaVersion: formula.formulaVersion,
            reviewStatus: formula.reviewStatus,
            pendingApprovalCount: formula.pendingApprovalCount,
          },
        ] as const,
    ),
    ['Interaction provider', report.interactionProvider],
    ['Storage usage (bytes, origin estimate)', report.storage.usageBytes],
    ['Storage quota (bytes, origin estimate)', report.storage.quotaBytes],
    ['Storage persisted', report.storage.persisted],
    ['User agent', report.userAgent],
  ];
  return (
    lines.map(([label, value]) => label + ': ' + textValue(value)).join('\n') +
    '\n'
  );
}
