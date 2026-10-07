/**
 * Raw IndexedDB introspection used before the Dexie connection is opened.
 *
 * Dexie "repairs" schema differences when opening a database (including a
 * database written by a *newer* application), which would mutate a store this
 * client does not understand. So the logical schema generation is read with a
 * raw connection first; a newer generation is refused as `unsupported-schema`
 * and nothing is opened or written. Opening a database that does not exist yet
 * is aborted inside `onupgradeneeded`, so no empty database is left behind.
 */

/** On-disk schema generation, `foreign` for a database we do not own. */
export type OnDiskSchema = number | 'foreign' | null;

/** Read the on-disk schema generation without modifying the database. */
export function readOnDiskSchema(
  factory: IDBFactory,
  name: string,
): Promise<OnDiskSchema> {
  return new Promise<OnDiskSchema>((resolve, reject) => {
    let creating = false;
    const request = factory.open(name);
    request.onupgradeneeded = (event) => {
      creating = true;
      (event.target as IDBOpenDBRequest | null)?.transaction?.abort();
    };
    request.onerror = () => {
      if (creating) resolve(null);
      else
        reject(
          request.error ?? new Error('Local database could not be opened'),
        );
    };
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('meta')) {
        database.close();
        resolve('foreign');
        return;
      }
      const transaction = database.transaction('meta', 'readonly');
      const read = transaction.objectStore('meta').get('dataset-state');
      read.onsuccess = () => {
        const record = read.result as
          { schemaGeneration?: unknown } | undefined;
        database.close();
        resolve(
          record && typeof record.schemaGeneration === 'number'
            ? record.schemaGeneration
            : 1,
        );
      };
      read.onerror = () => {
        database.close();
        reject(read.error ?? new Error('Local database could not be read'));
      };
    };
  });
}

/** Whether an error reports a database written at a newer Dexie version. */
export function isVersionError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { readonly name?: unknown }).name === 'VersionError'
  );
}

/** Whether an error reports a exhausted storage quota. */
export function isQuotaError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { readonly name?: unknown }).name === 'QuotaExceededError'
  );
}
