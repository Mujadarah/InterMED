import type {
  BootstrapInfo,
  BootstrapInfoProvider,
  DatasetStateSource,
} from '@intermed/domain';
import type { AppConfig } from '../config';

export interface AppServices {
  readonly info: BootstrapInfo;
  readonly dataset: DatasetStateSource;
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
): AppServices {
  if (config.mode !== 'mock') throw new Error('Only mock mode is supported');
  return { info: provider.getInfo(), dataset };
}
