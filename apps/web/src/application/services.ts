import type {
  BootstrapInfo,
  BootstrapInfoProvider,
  DatasetStateSource,
} from '@intermed/domain';
import type { AppConfig } from '../config';
import {
  unavailableMedicationSearch,
  type MedicationSearchService,
} from './medication-search';
import {
  unavailableMedicationDetail,
  type MedicationDetailService,
} from './medication-detail';

export interface AppServices {
  readonly info: BootstrapInfo;
  readonly dataset: DatasetStateSource;
  readonly medicationSearch: MedicationSearchService;
  readonly medicationDetail: MedicationDetailService;
}

/**
 * Create application services from the injected bootstrap information provider
 * and the injected local dataset state source.
 * @throws {Error} When the configured mode is not mock.
 */
export function createServices(
  config: AppConfig,
  provider: BootstrapInfoProvider,
  dataset: DatasetStateSource,
  medicationSearch: MedicationSearchService = unavailableMedicationSearch,
  medicationDetail: MedicationDetailService = unavailableMedicationDetail,
): AppServices {
  if (config.mode !== 'mock') throw new Error('Only mock mode is supported');
  return {
    info: provider.getInfo(),
    dataset,
    medicationSearch,
    medicationDetail,
  };
}
