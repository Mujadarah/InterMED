import type { DiagnosticsStorage } from '../application/diagnostics';

/** Read origin-wide storage metadata only. Never request persistence or upload it. */
export async function readBrowserStorageDiagnostics(
  storage: Partial<StorageManager> | undefined = globalThis.navigator?.storage,
): Promise<DiagnosticsStorage> {
  const [estimate, persisted] = await Promise.all([
    (async () => {
      try {
        return await storage?.estimate?.();
      } catch {
        return undefined;
      }
    })(),
    (async () => {
      try {
        return await storage?.persisted?.();
      } catch {
        return undefined;
      }
    })(),
  ]);
  return {
    usageBytes: estimate?.usage ?? null,
    quotaBytes: estimate?.quota ?? null,
    persisted: persisted ?? null,
  };
}
