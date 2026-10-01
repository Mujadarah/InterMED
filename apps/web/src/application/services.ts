import type { BootstrapInfo, BootstrapInfoProvider } from '@intermed/domain';
import type { AppConfig } from '../config';

export interface AppServices {
  readonly info: BootstrapInfo;
}

export function createServices(
  config: AppConfig,
  provider: BootstrapInfoProvider,
): AppServices {
  if (config.mode !== 'mock') throw new Error('Only mock mode is supported');
  return { info: provider.getInfo() };
}
