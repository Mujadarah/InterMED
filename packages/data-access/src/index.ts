import type { BootstrapInfoProvider } from '@intermed/domain';

export const mockBootstrapProvider: BootstrapInfoProvider = {
  getInfo: () => ({
    label: 'Contributor mock mode',
    referenceData: 'unavailable',
  }),
};
