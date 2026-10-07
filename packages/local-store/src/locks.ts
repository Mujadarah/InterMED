import type { Table } from 'dexie';
import {
  WRITER_LOCK_NAME,
  type LocalDatasetDatabase,
  type WriterLockRecord,
} from './schema';

/**
 * Single-writer coordination for dataset updates (R84).
 *
 * The browser implementation uses the Web Locks API with `ifAvailable`, so a
 * second concurrent update is refused instead of queued: a refused update
 * reports `writer-busy` and changes nothing. When the Web Locks API is
 * unavailable, a persistent marker record with a short expiry provides the
 * same refuse-don't-race behaviour across tabs; a marker left behind by a
 * crashed tab expires instead of blocking updates forever.
 *
 * A long download or staging run must not lose its claim to a slow expiry, so
 * the marker lease renews itself on a heartbeat well below its TTL. Ownership
 * is revalidated on top of that (`WriterLease.revalidate`): every staging
 * write batch and the pointer switch re-read the marker inside their own
 * transaction and a writer whose lease was taken over stops writing at once
 * instead of racing the new owner. Losing a lease never runs cleanup: the rows
 * on disk may already belong to the writer that took over.
 */

export type WriterLockOutcome<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false };

/** The writer lease held while one exclusive update runs. */
export interface WriterLease {
  /** Token identifying this writer instance. Recorded in the marker record. */
  readonly token: string;
  /**
   * Revalidate that this writer still owns the lease, and extend it when it
   * does. Call it inside the transaction that writes rows or switches the
   * active pointer, passing that transaction's `writerLock` table (with
   * `writerLock` in its scope), so the check and the renewal are one atomic
   * step of that transaction and no second connection races it. The Web Locks
   * lease is held by the platform for the whole callback and is always valid
   * here.
   */
  revalidate(marker: Table<WriterLockRecord, string>): Promise<boolean>;
}

export interface DatasetWriterLock {
  /**
   * Run `work` while holding the exclusive dataset writer lock.
   * Returns `ok: false` without running `work` when another writer is active.
   */
  withExclusiveUpdate<T>(
    work: (lease: WriterLease) => Promise<T>,
  ): Promise<WriterLockOutcome<T>>;
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
  const lease: WriterLease = {
    token: `web-lock-${Math.random().toString(36).slice(2)}`,
    // The platform holds the lock for the whole callback: nothing can take it.
    revalidate: async () => true,
  };
  return {
    async withExclusiveUpdate<T>(
      work: (lease: WriterLease) => Promise<T>,
    ): Promise<WriterLockOutcome<T>> {
      let outcome: WriterLockOutcome<T> = { ok: false };
      await locks.request(
        WRITER_LOCK_NAME,
        { ifAvailable: true, mode: 'exclusive' },
        async (held) => {
          if (!held) return;
          outcome = { ok: true, value: await work(lease) };
        },
      );
      return outcome;
    },
  };
}

/** Default lifetime of one fallback writer claim. */
export const MARKER_TTL_MS = 60_000;

/** Default lease renewal period. Must stay well below the TTL. */
export const MARKER_RENEW_MS = 20_000;

export interface MarkerLockOptions {
  readonly now: () => number;
  readonly owner: string;
  /** Lifetime of one claim before a stale marker counts as crashed. */
  readonly ttlMs?: number;
  /** Heartbeat period of the lease renewal. Defaults to a third of the TTL. */
  readonly renewMs?: number;
  /**
   * Timer seam: schedule `callback` after `ms` and return a cancel function.
   * Tests drive the heartbeat on a simulated clock; a test that never runs the
   * callback models a stalled tab.
   */
  readonly schedule?: (
    callback: () => void | Promise<void>,
    ms: number,
  ) => () => void;
}

function defaultSchedule(
  callback: () => void | Promise<void>,
  ms: number,
): () => void {
  const handle = setInterval(callback, ms);
  return () => {
    clearInterval(handle);
  };
}

/**
 * Fallback writer lock backed by a `meta` marker record.
 * The claim is atomic inside one read/write transaction, so two tabs (or two
 * concurrent calls in one tab) cannot both win. A stale marker older than the
 * TTL is treated as crashed and can be replaced. While work runs, a heartbeat
 * renews the claim so work longer than one TTL keeps its lease.
 */
export function createMarkerWriterLock(
  db: LocalDatasetDatabase,
  options: MarkerLockOptions,
): DatasetWriterLock {
  const ttlMs = options.ttlMs ?? MARKER_TTL_MS;
  const renewMs = options.renewMs ?? Math.max(1, Math.floor(ttlMs / 3));
  const schedule = options.schedule ?? defaultSchedule;
  let attempt = 0;
  return {
    async withExclusiveUpdate<T>(
      work: (lease: WriterLease) => Promise<T>,
    ): Promise<WriterLockOutcome<T>> {
      attempt += 1;
      const token = `${options.owner}#${attempt}`;
      const claimed = await db.transaction(
        'rw',
        db.writerLock,
        async (transaction) => {
          const marker = await transaction.writerLock.get('writer-lock');
          if (marker && marker.expiresAt > options.now()) return false;
          await transaction.writerLock.put({
            key: 'writer-lock',
            owner: token,
            expiresAt: options.now() + ttlMs,
          });
          return true;
        },
      );
      if (!claimed) return { ok: false };

      // Renewing and revalidating are the same atomic marker read/write on the
      // caller's table, so a claim taken over in the meantime is detected here
      // and never overwritten.
      const renewWith = async (
        marker: Table<WriterLockRecord, string>,
      ): Promise<boolean> => {
        const record = await marker.get('writer-lock');
        if (!record || record.owner !== token) return false;
        await marker.put({
          key: 'writer-lock',
          owner: token,
          expiresAt: options.now() + ttlMs,
        });
        return true;
      };
      const renew = async (): Promise<boolean> =>
        db.transaction('rw', db.writerLock, (transaction) =>
          renewWith(transaction.writerLock),
        );

      let lost = false;
      let stopHeartbeat = (): void => {};
      stopHeartbeat = schedule(async () => {
        if (!(await renew())) {
          lost = true;
          stopHeartbeat();
        }
      }, renewMs);

      const lease: WriterLease = {
        token,
        revalidate: async (marker) => {
          if (lost) return false;
          return renewWith(marker);
        },
      };
      try {
        return { ok: true, value: await work(lease) };
      } finally {
        stopHeartbeat();
        await db.transaction('rw', db.writerLock, async (transaction) => {
          const marker = await transaction.writerLock.get('writer-lock');
          if (marker && marker.owner === token)
            await transaction.writerLock.delete('writer-lock');
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
  options: MarkerLockOptions,
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
  options: MarkerLockOptions,
): DatasetWriterLock {
  if (strategy === 'marker') return createMarkerWriterLock(db, options);
  return createDefaultWriterLock(db, options);
}
