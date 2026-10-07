import { WRITER_LOCK_NAME, type LocalDatasetDatabase } from './schema';

/**
 * Single-writer coordination for dataset updates (R84).
 *
 * The browser implementation uses the Web Locks API with `ifAvailable`, so a
 * second concurrent update is refused instead of queued: a refused update
 * reports `writer-busy` and changes nothing. When the Web Locks API is
 * unavailable, a persistent marker record with a short expiry provides the same
 * refuse-don't-race behaviour across tabs; a marker left behind by a crashed tab
 * expires instead of blocking updates forever.
 */

export type WriterLockOutcome<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false };

export interface DatasetWriterLock {
  /**
   * Run `work` while holding the exclusive dataset writer lock.
   * Returns `ok: false` without running `work` when another writer is active.
   */
  withExclusiveUpdate<T>(work: () => Promise<T>): Promise<WriterLockOutcome<T>>;
}

/** Structural subset of the Web Locks manager, so tests can inject a fake. */
export interface LockManagerLike {
  request<T>(
    name: string,
    options: { readonly ifAvailable: true; readonly mode: 'exclusive' },
    callback: (lock: { readonly name: string } | null) => Promise<T>,
  ): Promise<T>;
}

function defaultLockManager(): LockManagerLike | null {
  const locks = globalThis.navigator?.locks;
  if (!locks || typeof locks.request !== 'function') return null;
  // Structural subset of LockManager; the real API matches this shape.
  return locks as unknown as LockManagerLike;
}

/** The Web Locks implementation, or null when this environment has none. */
export function createWebWriterLock(
  locks: LockManagerLike | null = defaultLockManager(),
): DatasetWriterLock | null {
  if (!locks) return null;
  return {
    async withExclusiveUpdate<T>(
      work: () => Promise<T>,
    ): Promise<WriterLockOutcome<T>> {
      let outcome: WriterLockOutcome<T> = { ok: false };
      await locks.request(
        WRITER_LOCK_NAME,
        { ifAvailable: true, mode: 'exclusive' },
        async (held) => {
          if (!held) return;
          outcome = { ok: true, value: await work() };
        },
      );
      return outcome;
    },
  };
}

const MARKER_TTL_MS = 60_000;

/**
 * Fallback writer lock backed by a `meta` marker record.
 * The claim is atomic inside one read/write transaction, so two tabs (or two
 * concurrent calls in one tab) cannot both win. A stale marker older than the
 * TTL is treated as crashed and can be replaced.
 */
export function createMarkerWriterLock(
  db: LocalDatasetDatabase,
  options: { readonly now: () => number; readonly owner: string },
): DatasetWriterLock {
  let attempt = 0;
  return {
    async withExclusiveUpdate<T>(
      work: () => Promise<T>,
    ): Promise<WriterLockOutcome<T>> {
      attempt += 1;
      const owner = `${options.owner}#${attempt}`;
      const expiresAt = options.now() + MARKER_TTL_MS;
      const claimed = await db.transaction('rw', db.writerLock, async () => {
        const marker = await db.writerLock.get('writer-lock');
        if (marker && marker.expiresAt > options.now()) return false;
        await db.writerLock.put({ key: 'writer-lock', owner, expiresAt });
        return true;
      });
      if (!claimed) return { ok: false };
      try {
        return { ok: true, value: await work() };
      } finally {
        await db.transaction('rw', db.writerLock, async () => {
          const marker = await db.writerLock.get('writer-lock');
          if (marker && marker.owner === owner)
            await db.writerLock.delete('writer-lock');
        });
      }
    },
  };
}

/**
 * The default writer lock: Web Locks when the browser provides them, otherwise
 * the persistent marker fallback.
 */
export function createDefaultWriterLock(
  db: LocalDatasetDatabase,
  options: { readonly now: () => number; readonly owner: string },
): DatasetWriterLock {
  return createWebWriterLock() ?? createMarkerWriterLock(db, options);
}

/**
 * Resolve a writer lock for one strategy.
 * `web` prefers the Web Locks API and falls back to the marker when the
 * environment has none; `marker` always uses the persistent marker.
 */
export function createWriterLock(
  strategy: 'auto' | 'web' | 'marker',
  db: LocalDatasetDatabase,
  options: { readonly now: () => number; readonly owner: string },
): DatasetWriterLock {
  if (strategy === 'marker') return createMarkerWriterLock(db, options);
  return createDefaultWriterLock(db, options);
}
