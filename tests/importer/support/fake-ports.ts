import { createHash } from 'node:crypto';
import type {
  PublishedBundleDescriptor,
  PublishedDatasetManifest,
} from '@intermed/domain';
import type {
  BaselineBinding,
  PublishPorts,
  PublicationLock,
  ReviewData,
  RunSummary,
  SHA256Port,
  StagePorts,
} from '../../../packages/importer/src/core';
import {
  AmbiguousWriteError,
  PublicationConflictError,
} from '../../../packages/importer/src/core';

/**
 * Stateful in-memory fake of the importer I/O ports.
 *
 * Only I/O is faked: the domain validator, serializer and deserializer stay
 * real everywhere in these tests. The store keeps real state across stage and
 * publish calls so retries, idempotency, resume and baseline advancement are
 * exercised against stateful ports.
 */

export interface FaultSpec {
  error: unknown;
  /** Apply the write first, then throw (a lost backend response). */
  applyBeforeThrow?: boolean;
}

export interface QuarantineRecord {
  runId: string;
  bytes: Uint8Array;
  reason: string;
  issues: string[];
}

const sha256Port: SHA256Port = {
  hash: (data) =>
    createHash('sha256')
      .update(typeof data === 'string' ? data : Buffer.from(data))
      .digest('hex'),
};

function reformatInstant(value: string): string {
  return new Date(value).toISOString().replace('Z', '+00:00');
}

function withRestNoise(value: object): object {
  return {
    $id: 'rest-row-0001',
    $createdAt: '2026-10-07T12:00:00.000+00:00',
    $updatedAt: '2026-10-07T12:00:00.000+00:00',
    $permissions: ['read("any")'],
    $sequence: 1,
    ...value,
  };
}

export class FakeStore {
  raw: Uint8Array | null = null;
  baseline: BaselineBinding = {
    baselineVersionId: null,
    baselineFingerprint: null,
  };
  publicationTimestamp = '2026-10-07T12:00:00Z';
  restNoise = false;
  heldLease: string | null = null;

  readonly quarantines: QuarantineRecord[] = [];
  readonly candidates = new Map<string, Uint8Array>();
  readonly reviews = new Map<string, ReviewData>();
  readonly runSummaries = new Map<string, RunSummary>();
  readonly files = new Map<string, Uint8Array>();
  readonly descriptors = new Map<string, PublishedBundleDescriptor>();
  readonly manifests = new Map<string, PublishedDatasetManifest>();
  readonly logs: string[] = [];
  readonly calls: string[] = [];
  readonly faults = new Map<string, FaultSpec>();
  private leaseCounter = 0;

  setFault(name: string, spec: FaultSpec | null): void {
    if (spec === null) this.faults.delete(name);
    else this.faults.set(name, spec);
  }

  callsTo(name: string): number {
    return this.calls.filter((entry) => entry === name).length;
  }

  /** JSON-safe copy of everything public, for immutability assertions. */
  publicState(): string {
    return JSON.stringify({
      files: [...this.files.entries()].map(([key, bytes]) => [
        key,
        new TextDecoder().decode(bytes),
      ]),
      descriptors: [...this.descriptors.entries()],
      manifests: [...this.manifests.entries()],
    });
  }

  private guard(name: string, apply?: () => void): void {
    this.calls.push(name);
    const fault = this.faults.get(name);
    if (!fault) {
      if (apply) apply();
      return;
    }
    // A fault models exactly one failed call, so a later retry can succeed.
    this.faults.delete(name);
    if (fault.applyBeforeThrow && apply) apply();
    throw fault.error;
  }

  private assertLease(lease: string): void {
    if (this.heldLease === null || lease !== this.heldLease) {
      throw new Error('wrong-owner: the lease does not hold the publication');
    }
  }

  stagePorts(): StagePorts {
    return {
      sha256: {
        hash: (data) => {
          this.guard('sha256');
          return sha256Port.hash(data);
        },
      },
      log: (message: string) => {
        this.guard('log');
        this.logs.push(message);
      },
      readRawSnapshot: async () => {
        this.guard('readRawSnapshot');
        if (!this.raw) throw new Error('no raw snapshot staged');
        return this.raw;
      },
      readBaseline: async () => {
        this.guard('readBaseline');
        return this.baseline;
      },
      writeQuarantine: async (runId, bytes, reason, issues) => {
        this.guard('writeQuarantine', () => {
          this.quarantines.push({ runId, bytes, reason, issues });
        });
      },
      writeCandidate: async (candidateVersionId, bytes) => {
        this.guard('writeCandidate', () => {
          if (this.candidates.has(candidateVersionId)) {
            throw new PublicationConflictError();
          }
          this.candidates.set(candidateVersionId, bytes);
        });
      },
      writeReview: async (candidateVersionId, reviewData) => {
        this.guard('writeReview', () => {
          if (this.reviews.has(candidateVersionId)) {
            throw new PublicationConflictError();
          }
          this.reviews.set(candidateVersionId, reviewData);
        });
      },
      writeRunSummary: async (runId, summary) => {
        this.guard('writeRunSummary', () => {
          this.runSummaries.set(runId, summary);
        });
      },
    };
  }

  publishPorts(): PublishPorts {
    return {
      sha256: {
        hash: (data) => {
          this.guard('sha256');
          return sha256Port.hash(data);
        },
      },
      log: (message: string) => {
        this.guard('log');
        this.logs.push(message);
      },
      readCandidate: async (candidateVersionId) => {
        this.guard('readCandidate');
        return this.candidates.get(candidateVersionId) ?? null;
      },
      readReview: async (candidateVersionId) => {
        this.guard('readReview');
        return this.reviews.get(candidateVersionId) ?? null;
      },
      readBaseline: async () => {
        this.guard('readBaseline');
        return this.baseline;
      },
      acquirePublicationLock: async (): Promise<PublicationLock> => {
        this.guard('acquirePublicationLock');
        if (this.heldLease !== null) {
          throw new Error(
            'lock-contention: another publication holds the lock',
          );
        }
        this.leaseCounter += 1;
        const lease = `lease-${this.leaseCounter}`;
        this.heldLease = lease;
        return {
          lease,
          release: () => {
            this.guard('release');
            this.heldLease = null;
          },
        };
      },
      readPublishedBundleFile: async (datasetVersionId, fileName) => {
        this.guard('readPublishedBundleFile');
        return this.files.get(`${datasetVersionId}/${fileName}`) ?? null;
      },
      readPublishedDescriptor: async (datasetVersionId) => {
        this.guard('readPublishedDescriptor');
        const value = this.descriptors.get(datasetVersionId);
        if (!value) return null;
        if (!this.restNoise) return value;
        return {
          ...withRestNoise({ ...value }),
        } as PublishedBundleDescriptor;
      },
      readPublishedManifest: async (datasetVersionId) => {
        this.guard('readPublishedManifest');
        const value = this.manifests.get(datasetVersionId);
        if (!value) return null;
        if (!this.restNoise) return value;
        return {
          ...withRestNoise({
            ...value,
            importedAt: reformatInstant(value.importedAt),
            publishedAt:
              value.publishedAt === null
                ? null
                : reformatInstant(value.publishedAt),
            upstreamPublishedAt:
              value.upstreamPublishedAt === null
                ? null
                : reformatInstant(value.upstreamPublishedAt),
          }),
        } as PublishedDatasetManifest;
      },
      publicBaseUrl: 'https://published.invalid',
      publicationTimestamp: this.publicationTimestamp,
      writeBundleFile: async (
        lease,
        datasetVersionId,
        fileName,
        bytes,
      ): Promise<void> => {
        this.assertLease(lease);
        const key = `${datasetVersionId}/${fileName}`;
        this.guard('writeBundleFile', () => {
          if (this.files.has(key)) throw new PublicationConflictError();
          this.files.set(key, bytes);
        });
      },
      writeDescriptorRow: async (lease, datasetVersionId, descriptor) => {
        this.assertLease(lease);
        this.guard('writeDescriptorRow', () => {
          if (this.descriptors.has(datasetVersionId)) {
            throw new PublicationConflictError();
          }
          this.descriptors.set(datasetVersionId, descriptor);
        });
      },
      writeManifestRow: async (lease, datasetVersionId, manifest) => {
        this.assertLease(lease);
        this.guard('writeManifestRow', () => {
          if (this.manifests.has(datasetVersionId)) {
            throw new PublicationConflictError();
          }
          this.manifests.set(datasetVersionId, manifest);
        });
      },
    };
  }
}

export const sha256 = sha256Port;

export function ambiguousFault(applyBeforeThrow = true): FaultSpec {
  return { error: new AmbiguousWriteError(), applyBeforeThrow };
}

/** Fault classified by typed code instead of class identity. */
export function codedAmbiguousFault(applyBeforeThrow = true): FaultSpec {
  return {
    error: Object.assign(new Error('write result unknown'), {
      code: 'ambiguous-write',
    }),
    applyBeforeThrow,
  };
}

export function transportFault(message: string): FaultSpec {
  return { error: new Error(message) };
}
