import 'fake-indexeddb/auto';
import type {
  PublishedBundleDescriptor,
  PublishedBundleLoader,
  PublishedDatasetManifest,
  PublishedDatasetReader,
} from '@intermed/domain';
import {
  deserializeCatalogue,
  fingerprint,
  sealCatalogue,
  serializeCatalogue,
} from '@intermed/domain';
import { createMemoryEventBus, type DatasetEventBus } from './events';
import {
  buildSyntheticCatalogueBundle,
  SYNTHETIC_DATASET,
  type SyntheticBundle,
  type SyntheticBundleOptions,
} from './synthetic-bundle';
import {
  createLocalDatasetStore,
  type LocalDatasetStoreOptions,
} from './store';

/**
 * Shared helpers for the local-store test suites. Every case gets its own
 * database name and its own fake clock, so ordering and shared state cannot
 * make a result ambiguous.
 */

let sequence = 0;

/**
 * Unique database name for one test case. The random suffix matters: Vitest
 * runs several test files in one worker thread, where they share the same
 * in-memory IndexedDB and the same millisecond on the clock.
 */
export function uniqueName(prefix = 'intermed-test'): string {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}-${Math.random().toString(36).slice(2)}`;
}

export interface TestClock {
  readonly now: () => number;
  tick(ms: number): void;
}

/** Deterministic clock; retention and TTL behaviour can be advanced on demand. */
export function testClock(
  startMs = Date.parse('2026-06-01T00:00:00Z'),
): TestClock {
  let current = startMs;
  return {
    now: () => current,
    tick: (ms: number) => {
      current += ms;
    },
  };
}

/** One synthetic bundle. Product names carry the label to tell generations apart. */
export function bundle(
  label: string,
  options: Partial<SyntheticBundleOptions> = {},
): SyntheticBundle {
  return buildSyntheticCatalogueBundle({ label, ...options });
}

/** A store with its own database name; extra options are passed through. */
export function testStore(
  options: Partial<LocalDatasetStoreOptions> = {},
): ReturnType<typeof createLocalDatasetStore> {
  return createLocalDatasetStore({
    name: uniqueName(),
    dataset: SYNTHETIC_DATASET,
    events: createMemoryEventBus(),
    // Node exposes a process-wide Web Locks manager; force the per-database
    // marker lock so concurrent test files cannot see each other's writers.
    lockStrategy: 'marker',
    ...options,
  });
}

/** A shared in-memory event bus, standing in for BroadcastChannel between tabs. */
export function sharedBus(): DatasetEventBus {
  return createMemoryEventBus();
}

/**
 * A bundle that is internally inconsistent: joins point at ingredients that are
 * no longer in the snapshot. Re-sealed and re-checksummed, so only the domain
 * integrity check can reject it.
 */
export function integrityBrokenBundle(bundleToBreak: SyntheticBundle): {
  readonly manifest: PublishedDatasetManifest;
  readonly text: string;
} {
  const decoded = deserializeCatalogue(bundleToBreak.text);
  if (!decoded.ok) throw new Error('The synthetic bundle did not deserialize');
  const sealed = sealCatalogue({
    ...decoded.snapshot,
    activeIngredients: [],
  });
  const text = serializeCatalogue(sealed);
  const version = sealed.datasetVersions[0];
  if (!version) throw new Error('The synthetic bundle has no dataset version');
  return {
    manifest: {
      ...bundleToBreak.manifest,
      checksum: fingerprint(text),
      recordCounts: Object.fromEntries(Object.entries(version.recordCounts)),
    },
    text,
  };
}

/** Published source fake serving exactly one synthetic bundle. */
export function fakePublishedSource(
  syntheticBundle: SyntheticBundle,
  options: {
    readonly descriptor?: PublishedBundleDescriptor;
    readonly manifest?: PublishedDatasetManifest;
    readonly text?: string;
    readonly manifestStatus?: 'available' | 'absent' | 'unavailable';
  } = {},
): {
  readonly reader: PublishedDatasetReader;
  readonly loader: PublishedBundleLoader;
} {
  const manifest = options.manifest ?? syntheticBundle.manifest;
  const descriptor = options.descriptor ?? syntheticBundle.descriptor;
  const text = options.text ?? syntheticBundle.text;
  return {
    reader: {
      getManifest: async () => {
        if (options.manifestStatus === 'absent')
          return { status: 'absent', reason: 'not-published' };
        if (options.manifestStatus === 'unavailable')
          return { status: 'unavailable', reason: 'transport-error' };
        return { status: 'available', value: manifest };
      },
      getBundleDescriptor: async (datasetVersionId) =>
        datasetVersionId === descriptor.datasetVersionId
          ? { status: 'available', value: descriptor }
          : { status: 'absent', reason: 'not-found' },
    },
    loader: {
      loadBundle: async () => ({ status: 'available', text }),
    },
  };
}
