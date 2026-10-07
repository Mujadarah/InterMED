import type { DatasetStateSource, DatasetUpdateState } from '@intermed/domain';
import { expect, it } from 'vitest';
import { mockBootstrapProvider } from '@intermed/data-access';
import { createServices } from './services';

const neverDownloaded: DatasetUpdateState = { status: 'never-downloaded' };
const dataset: DatasetStateSource = {
  getState: () => neverDownloaded,
  subscribe: () => () => {},
};

it('uses a substituted provider through the public contract', () => {
  const provider = {
    getInfo: () => ({
      label: 'Synthetic injected provider',
      referenceData: 'unavailable' as const,
    }),
  };
  expect(createServices({ mode: 'mock' }, provider, dataset).info.label).toBe(
    'Synthetic injected provider',
  );
});

it('starts with a mock provider without credentials or clinical data', () => {
  expect(
    createServices({ mode: 'mock' }, mockBootstrapProvider, dataset).info,
  ).toEqual({
    label: 'Contributor mock mode',
    referenceData: 'unavailable',
  });
});

it('exposes the injected local dataset state source unchanged', () => {
  const services = createServices(
    { mode: 'mock' },
    mockBootstrapProvider,
    dataset,
  );
  expect(services.dataset).toBe(dataset);
  expect(services.dataset.getState()).toEqual({ status: 'never-downloaded' });
});
