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
const medicationSearchServices = new WeakMap<
  LocalDatasetStore,
  MedicationSearchService
>();

function browserDatasetStore(): LocalDatasetStore {
  browserDataset ??= createLocalDatasetStore();
  return browserDataset;
}

function medicationSearchFor(
  store: LocalDatasetStore,
): MedicationSearchService {
  let service = medicationSearchServices.get(store);
  if (!service) {
    service = createMedicationSearchService({
      activeGenerationId: () => {
        const state = store.getState();
        return 'generation' in state
          ? (state.generation?.generationId ?? null)
          : null;
      },
      openReader: () => store.openReader(),
    });
    medicationSearchServices.set(store, service);
  }
  return service;
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
  localStore: injectedLocalStore,
  medicationSearch,
}: {
  env: Record<string, unknown>;
  shell?: ShellController;
  dataset?: DatasetStateSource;
  localStore?: LocalDatasetStore;
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
  const localStore =
    injectedLocalStore ?? (dataset ? undefined : browserDatasetStore());
  const datasetSource = dataset ?? localStore!;
  const searchService =
    medicationSearch ??
    (localStore
      ? medicationSearchFor(localStore)
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
