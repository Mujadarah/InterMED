/**
 * Post-commit maintenance: preference reconciliation and generation collection
 * run after a committed pointer switch and can never fail one. Their failures
 * are reported here as non-fatal diagnostics and retried later, as are the
 * failures of fire-and-forget background work (Codacy review fix 4).
 */

/** One maintenance task: what the diagnostics and the retry queue refer to. */
export type MaintenanceTask =
  | {
      readonly kind: 'preference-reconciliation';
      readonly generationId: string;
    }
  | { readonly kind: 'generation-gc' }
  /** Fire-and-forget background work that failed (Codacy review fix 4). */
  | { readonly kind: 'background'; readonly label: string };

/**
 * A non-fatal maintenance failure. A committed activation or rollback is never
 * turned into a failure by one: it is reported here and retried later.
 */
export interface MaintenanceFailure {
  readonly task: MaintenanceTask;
  readonly occurredAt: string;
  /** `storage-quota` for `QuotaExceededError`, `error` for anything else. */
  readonly reason: 'storage-quota' | 'error';
  readonly message: string;
}

/** Maintenance diagnostics, deliberately separate from the update state. */
export interface MaintenanceStatus {
  /** True while a failed maintenance task waits for a later retry. */
  readonly pending: boolean;
  /** The most recent maintenance failure, or null when none happened. */
  readonly lastFailure: MaintenanceFailure | null;
}

/** Post-commit maintenance reporting and retry (never an update failure). */
export interface MaintenanceDiagnostics {
  getStatus(): MaintenanceStatus;
  subscribe(listener: () => void): () => void;
  /** Run the maintenance tasks that failed earlier again. */
  retry(): Promise<void>;
}

/** The maintenance runner the store composes with its other modules. */
export interface MaintenanceRunner extends MaintenanceDiagnostics {
  /** Run one task in isolation; failures are reported and queued for retry. */
  run(task: MaintenanceTask, work: () => Promise<void>): Promise<void>;
  /** Record one failure and notify the diagnostics subscribers. */
  report(failure: MaintenanceFailure): void;
  /** Run fire-and-forget work whose failure becomes a diagnostic. */
  background(label: string, work: () => Promise<unknown>): void;
}

/** Everything the maintenance runner needs from the rest of the store. */
export interface MaintenanceDeps {
  readonly now: () => number;
  /** Whether an error reports an exhausted storage quota. */
  readonly isQuotaError: (error: unknown) => boolean;
}

export function createMaintenanceRunner(
  deps: MaintenanceDeps,
): MaintenanceRunner {
  const listeners = new Set<() => void>();
  const pending = new Map<
    string,
    { readonly task: MaintenanceTask; readonly work: () => Promise<void> }
  >();
  let lastFailure: MaintenanceFailure | null = null;

  function keyOf(task: MaintenanceTask): string {
    if (task.kind === 'background') return `background#${task.label}`;
    return task.kind === 'generation-gc'
      ? 'generation-gc'
      : `preference-reconciliation#${task.generationId}`;
  }

  function report(failure: MaintenanceFailure): void {
    lastFailure = failure;
    for (const listener of [...listeners]) listener();
  }

  function reportBackgroundFailure(label: string, error: unknown): void {
    report({
      task: { kind: 'background', label },
      occurredAt: new Date(deps.now()).toISOString(),
      reason: deps.isQuotaError(error) ? 'storage-quota' : 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }

  async function run(
    task: MaintenanceTask,
    work: () => Promise<void>,
  ): Promise<void> {
    try {
      await work();
      pending.delete(keyOf(task));
    } catch (error) {
      pending.set(keyOf(task), { task, work });
      report({
        task,
        occurredAt: new Date(deps.now()).toISOString(),
        reason: deps.isQuotaError(error) ? 'storage-quota' : 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    getStatus: () => ({ pending: pending.size > 0, lastFailure }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    retry: async () => {
      for (const entry of [...pending.values()])
        await run(entry.task, entry.work);
    },
    run,
    report,
    background: (label, work) => {
      // Every unawaited promise is caught here: its failure becomes a
      // diagnostic and never an unhandled rejection.
      void work().catch((error: unknown) =>
        reportBackgroundFailure(label, error),
      );
    },
  };
}
