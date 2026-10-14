import { mockBootstrapProvider } from '@intermed/data-access/bootstrap';
import type { DatasetStateSource } from '@intermed/domain';
import {
  createLocalDatasetStore,
  LOCAL_DATASET_SCHEMA_GENERATION,
  type LocalDatasetStore,
} from '@intermed/local-store';
import {
  createMedicationSearchService,
  type MedicationSearchService,
  unavailableMedicationSearch,
} from './application/medication-search';
import {
  createMedicationDetailService,
  type MedicationDetailService,
  unavailableMedicationDetail,
} from './application/medication-detail';
import {
  createPreferencesService,
  type PreferencesService,
  unavailablePreferencesService,
} from './application/preferences';
import {
  type InteractionCheckerService,
  unavailableInteractionChecker,
} from './application/interaction-checker-contract';
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
const medicationDetailServices = new WeakMap<
  LocalDatasetStore,
  MedicationDetailService
>();
const preferencesServices = new WeakMap<
  LocalDatasetStore,
  PreferencesService
>();
const interactionCheckerServices = new WeakMap<
  LocalDatasetStore,
  InteractionCheckerService
>();

function browserDatasetStore(): LocalDatasetStore {
  browserDataset ??= createLocalDatasetStore();
  return browserDataset;
}

/** The shared reader closures both medication services need from a store. */
function readerDependencies(store: LocalDatasetStore) {
  return {
    activeGenerationId: () => {
      const state = store.getState();
      return 'generation' in state
        ? (state.generation?.generationId ?? null)
        : null;
    },
    openReader: () => store.openReader(),
  };
}

function medicationSearchFor(
  store: LocalDatasetStore,
): MedicationSearchService {
  let service = medicationSearchServices.get(store);
  if (!service) {
    service = createMedicationSearchService(readerDependencies(store));
    medicationSearchServices.set(store, service);
  }
  return service;
}

function medicationDetailFor(
  store: LocalDatasetStore,
): MedicationDetailService {
  let service = medicationDetailServices.get(store);
  if (!service) {
    service = createMedicationDetailService(readerDependencies(store));
    medicationDetailServices.set(store, service);
  }
  return service;
}

function preferencesFor(store: LocalDatasetStore): PreferencesService {
  let service = preferencesServices.get(store);
  if (!service) {
    service = createPreferencesService(store.preferences, store);
    preferencesServices.set(store, service);
  }
  return service;
}

function interactionCheckerFor(
  store: LocalDatasetStore,
): InteractionCheckerService {
  let service = interactionCheckerServices.get(store);
  if (!service) {
    if (import.meta.env.DEV) {
      let developmentService: Promise<InteractionCheckerService> | undefined;
      service = {
        availability: 'synthetic-preview',
        evaluate: async (productIds, online) => {
          developmentService ??=
            import('./application/interaction-checker').then(
              async ({ createInteractionCheckerService }) => {
                const { developmentSyntheticInteractionProvider } =
                  await import('./dev/synthetic-interaction-provider');
                return createInteractionCheckerService(
                  readerDependencies(store),
                  async () => developmentSyntheticInteractionProvider,
                );
              },
            );
          return (await developmentService).evaluate(productIds, online);
        },
      };
    } else service = unavailableInteractionChecker;
    interactionCheckerServices.set(store, service);
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
  medicationDetail,
  interactionChecker,
}: {
  env: Record<string, unknown>;
  shell?: ShellController;
  dataset?: DatasetStateSource;
  localStore?: LocalDatasetStore;
  medicationSearch?: MedicationSearchService;
  medicationDetail?: MedicationDetailService;
  interactionChecker?: InteractionCheckerService;
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
  const detailService =
    medicationDetail ??
    (localStore
      ? medicationDetailFor(localStore)
      : unavailableMedicationDetail);
  const preferencesService = localStore
    ? preferencesFor(localStore)
    : unavailablePreferencesService;
  const checkerService =
    interactionChecker ??
    (localStore
      ? interactionCheckerFor(localStore)
      : unavailableInteractionChecker);
  return (
    <App
      services={createServices(
        config,
        mockBootstrapProvider,
        datasetSource,
        searchService,
        detailService,
        preferencesService,
        localStore ? LOCAL_DATASET_SCHEMA_GENERATION : null,
        checkerService,
      )}
      shell={shell}
    />
  );
}
