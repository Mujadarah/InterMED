import { DATASET_EVENTS_CHANNEL } from './schema';

/**
 * Cross-tab notification channel for dataset changes.
 *
 * Activation only publishes a fact ("this generation is now active"), and a
 * completed clear publishes "everything local is gone". Other tabs apply both
 * at a safe boundary: new readers immediately use the new state while already
 * pinned readers finish on the generation they captured. Losing a message is
 * safe, because every tab re-reads the persisted state when opening a reader.
 */

export type DatasetStoreEvent =
  | { readonly type: 'activated'; readonly generationId: string }
  /** Every local dataset and preference record was deleted explicitly. */
  | { readonly type: 'cleared' };

export interface DatasetEventBus {
  post(event: DatasetStoreEvent): void;
  subscribe(handler: (event: DatasetStoreEvent) => void): () => void;
  close(): void;
}

function isDatasetStoreEvent(value: unknown): value is DatasetStoreEvent {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as { readonly type?: unknown }).type;
  if (type === 'cleared') return true;
  return (
    type === 'activated' &&
    typeof (value as { readonly generationId?: unknown }).generationId ===
      'string'
  );
}

/** In-memory bus for tests: several "tabs" can share one instance. */
export function createMemoryEventBus(): DatasetEventBus {
  const handlers = new Set<(event: DatasetStoreEvent) => void>();
  return {
    post: (event) => {
      for (const handler of [...handlers]) handler(event);
    },
    subscribe: (handler) => {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    close: () => {
      handlers.clear();
    },
  };
}

/** BroadcastChannel-backed bus; falls back to a no-op where unsupported. */
export function createBroadcastEventBus(
  channelName: string = DATASET_EVENTS_CHANNEL,
): DatasetEventBus {
  if (typeof BroadcastChannel === 'undefined') return createNoopEventBus();
  const channel = new BroadcastChannel(channelName);
  const handlers = new Set<(event: DatasetStoreEvent) => void>();
  channel.onmessage = (event: MessageEvent) => {
    if (!isDatasetStoreEvent(event.data)) return;
    for (const handler of [...handlers]) handler(event.data);
  };
  return {
    post: (event) => {
      channel.postMessage(event);
    },
    subscribe: (handler) => {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    close: () => {
      handlers.clear();
      channel.close();
    },
  };
}

/** Bus used where no channel exists: activations stay local to this tab. */
export function createNoopEventBus(): DatasetEventBus {
  return {
    post: () => {},
    subscribe: () => () => {},
    close: () => {},
  };
}

/** Default bus for the current environment. */
export function createDefaultEventBus(): DatasetEventBus {
  return typeof BroadcastChannel === 'undefined'
    ? createNoopEventBus()
    : createBroadcastEventBus();
}
