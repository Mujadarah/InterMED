// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { readBrowserStorageDiagnostics } from './browser-diagnostics';

afterEach(() => vi.restoreAllMocks());

it('reads estimate and persisted independently without requesting persistence', async () => {
  const persist = vi.fn();
  const result = await readBrowserStorageDiagnostics({
    estimate: async () => ({ usage: 50, quota: 100 }),
    persisted: async () => false,
    persist,
  });
  expect(result).toEqual({ usageBytes: 50, quotaBytes: 100, persisted: false });
  expect(persist).not.toHaveBeenCalled();
});

it('keeps persisted status when estimate rejects without exposing the error', async () => {
  expect(
    await readBrowserStorageDiagnostics({
      estimate: async () => {
        throw new Error('PRIVATE_STORAGE_ERROR');
      },
      persisted: async () => true,
    }),
  ).toEqual({ usageBytes: null, quotaBytes: null, persisted: true });
});

it('keeps the estimate when persisted status rejects', async () => {
  expect(
    await readBrowserStorageDiagnostics({
      estimate: async () => ({ usage: 0, quota: 200 }),
      persisted: async () => {
        throw new Error('denied');
      },
    }),
  ).toEqual({ usageBytes: 0, quotaBytes: 200, persisted: null });
});

it('reports unknown values when the browser omits the APIs or fields', async () => {
  expect(await readBrowserStorageDiagnostics({})).toEqual({
    usageBytes: null,
    quotaBytes: null,
    persisted: null,
  });
  expect(
    await readBrowserStorageDiagnostics({ estimate: async () => ({}) }),
  ).toEqual({ usageBytes: null, quotaBytes: null, persisted: null });
});
