import { expect, it } from 'vitest';
import { mockBootstrapProvider } from '@intermed/data-access';
import { createServices } from './services';

it('uses a substituted provider through the public contract', () => {
  const provider = {
    getInfo: () => ({
      label: 'Synthetic injected provider',
      referenceData: 'unavailable' as const,
    }),
  };
  expect(createServices({ mode: 'mock' }, provider).info.label).toBe(
    'Synthetic injected provider',
  );
});

it('starts with a mock provider without credentials or clinical data', () => {
  expect(createServices({ mode: 'mock' }, mockBootstrapProvider).info).toEqual({
    label: 'Contributor mock mode',
    referenceData: 'unavailable',
  });
});
