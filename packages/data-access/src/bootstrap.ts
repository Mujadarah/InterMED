import type { BootstrapInfoProvider } from '@intermed/domain';

/** Minimal non-clinical provider for the development shell composition root. */
export const mockBootstrapProvider: BootstrapInfoProvider = {
  getInfo: () => ({
    label: 'Contributor mock mode',
    referenceData: 'unavailable',
  }),
};
