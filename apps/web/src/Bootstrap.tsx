import { mockBootstrapProvider } from '@intermed/data-access';
import type { DatasetStateSource } from '@intermed/domain';
import {
  createLocalDatasetStore,
  type LocalDatasetStore,
} from '@intermed/local-store';
import {
  createMedicationSearchService,
  type MedicationSearchService,
  unavailableMedicationSearch,
} from './application/medication-search';
import { createServices } from './application/services';
import { App } from './presentation/App';
import { parseConfig } from './config';
import type { AppConfig } from './config';
import type { ShellController } from './application/shell';
import { developmentShell } from './application/shell';

/**
 * Composition root: the only production module allowed to construct the local
 * dataset store (enforced by scripts/check-boundaries.mjs). The store is opened
 * once per page and never downloads anything by itself.
 */
let browserDataset: LocalDatasetStore | undefined;

function browserDatasetStore(): LocalDatasetStore {
  browserDataset ??= createLocalDatasetStore();
  return browserDataset;
}

/**
 * Validate the public environment and render the shell with mock services.
 * Render a configuration alert when validation fails.
 * Use the supplied shell controller, defaulting to inert development actions.
 */
export function Bootstrap({
  env,
  shell = developmentShell,
  dataset,
  medicationSearch,
}: {
  env: Record<string, unknown>;
  shell?: ShellController;
  dataset?: DatasetStateSource;
  medicationSearch?: MedicationSearchService;
}) {
  let config: AppConfig;
  try {
    config = parseConfig(env);
  } catch {
    return (
      <div className="shell">
        <p className="development-notice">Development · Not for clinical use</p>
        <main>
          <div role="alert">
            <h1>Configuration unavailable</h1>
            <p>
              Use the documented contributor mock configuration and restart the
              app. No cloud services have been enabled.
            </p>
          </div>
        </main>
      </div>
    );
  }
  const localStore = dataset ? undefined : browserDatasetStore();
  const datasetSource = dataset ?? localStore!;
  const searchService =
    medicationSearch ??
    (localStore
      ? createMedicationSearchService({
          activeGenerationId: () => {
            const state = datasetSource.getState();
            return 'generation' in state
              ? (state.generation?.generationId ?? null)
              : null;
          },
          openReader: () => localStore.openReader(),
        })
      : unavailableMedicationSearch);
  return (
    <App
      services={createServices(
        config,
        mockBootstrapProvider,
        datasetSource,
        searchService,
      )}
      shell={shell}
    />
  );
}
