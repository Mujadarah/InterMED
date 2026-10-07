import { describe, expect, it } from 'vitest';
import {
  catalogueFingerprint,
  deserializeCatalogue,
  validateReferentialIntegrity,
} from '@intermed/domain';
import { publish } from '../../packages/importer/src/publisher';
import { stage } from '../../packages/importer/src/stage';
import { FakeStore } from './support/fake-ports';
import { stageGeneration } from './support/harness';
import {
  buildRawDocument,
  fictivolProduct,
  placebexProduct,
  rawBytes,
  testConfig,
} from './support/synthetic-raws';

/**
 * Canonical public generation id and lineage repair tests.
 *
 * Domain stable identity uses canonical IDs with U+001F separator.
 * Appwrite TablesDB resource ID limits apply to descriptor.id (<= 36 chars),
 * and published bundle fileName must not contain U+001F.
 * Core canonical DatasetVersionId is never opaque or rebased.
 */

/** Appwrite TablesDB resource id grammar: 1..36 chars of a-z A-Z 0-9 . _ -. */
const APPWRITE_RESOURCE_ID = /^[A-Za-z0-9._-]{1,36}$/;

function raw(overrides = {}) {
  return buildRawDocument({
    products: [fictivolProduct(), placebexProduct()],
    ...overrides,
  });
}

describe('canonical public generation id', () => {
  it('preserves canonical domain ID with U+001F while descriptor has safe id and filename without U+001F', async () => {
    const store = new FakeStore();
    const gen = await stageGeneration(store, raw());
    expect(gen.candidateVersionId).toContain('\u001f');

    const published = await publish({
      config: gen.config,
      candidateVersionId: gen.candidateVersionId,
      approval: gen.approval,
      ports: store.publishPorts(),
    });
    expect(published.status).toBe('published');

    const descriptor = store.descriptors.get(gen.candidateVersionId);
    expect(descriptor).toBeDefined();
    expect(descriptor?.id).toMatch(APPWRITE_RESOURCE_ID);
    expect(descriptor?.fileName).not.toContain('\u001f');
  });

  it('uses one canonical generation id across bundle, manifest and descriptor', async () => {
    const store = new FakeStore();
    const gen = await stageGeneration(store, raw());
    const published = await publish({
      config: gen.config,
      candidateVersionId: gen.candidateVersionId,
      approval: gen.approval,
      ports: store.publishPorts(),
    });
    expect(published.status).toBe('published');
    expect(gen.snapshot.datasetVersions[0]?.id).toBe(gen.candidateVersionId);
    const manifest = store.manifests.get(gen.candidateVersionId);
    const descriptor = store.descriptors.get(gen.candidateVersionId);
    expect(manifest?.datasetVersionId).toBe(gen.candidateVersionId);
    expect(descriptor?.datasetVersionId).toBe(gen.candidateVersionId);
  });

  it('keeps the sealed candidate readable and referentially integral', async () => {
    const store = new FakeStore();
    const gen = await stageGeneration(store, raw());
    const bytes = store.candidates.get(gen.candidateVersionId);
    expect(bytes).toBeDefined();
    const decoded = deserializeCatalogue(new TextDecoder().decode(bytes));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(validateReferentialIntegrity(decoded.snapshot)).toEqual([]);
  });
});

describe('raw datasetVersion.minimumClientVersion repair', () => {
  it('accepts filled numeric x.y.z and preserves future versions without false import failure', async () => {
    for (const validVersion of ['0.0.0', '1.2.3', '99.88.77']) {
      const store = new FakeStore();
      const doc = raw();
      doc.datasetVersion.minimumClientVersion = validVersion;
      const res = await stage({
        config: testConfig(),
        snapshotBytes: rawBytes(doc),
        encoding: 'utf-8',
        ports: store.stagePorts(),
      });
      expect(res.status).toBe('staged');
    }
  });

  it('quarantines padded, blank, or malformed minimumClientVersion before publication', async () => {
    const badCases = [
      ' 1.0.0 ',
      '1.0.0 ',
      ' 1.0.0',
      '1.0.0\t',
      '',
      '   ',
      '1.0',
      'v1.0.0',
      '1.0.0-beta',
      '1.2.3.4',
      'a.b.c',
      '1.'.repeat(26), // > 50 chars
    ];
    for (const bad of badCases) {
      const store = new FakeStore();
      const doc = raw();
      doc.datasetVersion.minimumClientVersion = bad;
      const res = await stage({
        config: testConfig(),
        snapshotBytes: rawBytes(doc),
        encoding: 'utf-8',
        ports: store.stagePorts(),
      });
      expect(res.status).toBe('quarantined');
      expect(res.completenessStatus).toBe('invalid-minimum-client-version');
    }
  });
});

describe('lineage derived from explicit raw previousVersionKey', () => {
  it('sets manifest.previous and embedded previous to null when initial baseline is missing', async () => {
    const store = new FakeStore();
    const gen = await stageGeneration(store, raw());
    const published = await publish({
      config: gen.config,
      candidateVersionId: gen.candidateVersionId,
      approval: gen.approval,
      ports: store.publishPorts(),
    });
    expect(published.status).toBe('published');
    const manifest = store.manifests.get(gen.candidateVersionId);
    expect(manifest?.previousVersionId).toBeNull();
    const embeddedPrevious = gen.snapshot.datasetVersions[0]?.previousVersionId;
    expect(
      embeddedPrevious?.status === 'missing' || embeddedPrevious === undefined,
    ).toBe(true);
  });

  it('quarantines initial snapshot that declares unexpected previousVersionKey when baseline is null', async () => {
    const store = new FakeStore();
    const doc = raw({ previousVersionKey: 'unexpected-prev' });
    const res = await stage({
      config: testConfig(),
      snapshotBytes: rawBytes(doc),
      encoding: 'utf-8',
      ports: store.stagePorts(),
    });
    expect(res.status).toBe('quarantined');
    expect(res.completenessStatus).toBe('baseline-mismatch');
  });

  it('matches manifest.previous and embedded previous when second generation provides correct explicit key', async () => {
    const store = new FakeStore();
    const first = await stageGeneration(store, raw());
    const pub1 = await publish({
      config: first.config,
      candidateVersionId: first.candidateVersionId,
      approval: first.approval,
      ports: store.publishPorts(),
    });
    expect(pub1.status).toBe('published');

    store.baseline = {
      baselineVersionId: first.candidateVersionId,
      baselineFingerprint: catalogueFingerprint(first.snapshot),
      catalogue: first.snapshot,
    };

    const secondDoc = buildRawDocument({
      products: [
        fictivolProduct(),
        { ...placebexProduct(), commercialName: 'Placebex Gen2' },
      ],
      previousVersionKey: first.identity.generationVersionKey,
    });

    const second = await stageGeneration(store, secondDoc);
    const pub2 = await publish({
      config: second.config,
      candidateVersionId: second.candidateVersionId,
      approval: second.approval,
      ports: store.publishPorts(),
    });
    expect(pub2.status).toBe('published');

    const manifest2 = store.manifests.get(second.candidateVersionId);
    expect(manifest2?.previousVersionId).toBe(first.candidateVersionId);
    const embedded2 = second.snapshot.datasetVersions[0]?.previousVersionId;
    expect(embedded2).toEqual({
      status: 'present',
      value: first.candidateVersionId,
    });
  });

  it('quarantines when second generation has missing or mismatched previousVersionKey without runtime injection', async () => {
    const store = new FakeStore();
    const first = await stageGeneration(store, raw());
    await publish({
      config: first.config,
      candidateVersionId: first.candidateVersionId,
      approval: first.approval,
      ports: store.publishPorts(),
    });

    store.baseline = {
      baselineVersionId: first.candidateVersionId,
      baselineFingerprint: catalogueFingerprint(first.snapshot),
      catalogue: first.snapshot,
    };

    // Missing key
    const missingDoc = buildRawDocument({
      products: [fictivolProduct()],
    });
    const missingRes = await stage({
      config: testConfig(),
      snapshotBytes: rawBytes(missingDoc),
      encoding: 'utf-8',
      ports: store.stagePorts(),
    });
    expect(missingRes.status).toBe('quarantined');
    expect(missingRes.completenessStatus).toBe('baseline-mismatch');

    // Mismatched key
    const mismatchDoc = buildRawDocument({
      products: [fictivolProduct()],
      previousVersionKey: 'wrong-generation-key',
    });
    const mismatchRes = await stage({
      config: testConfig(),
      snapshotBytes: rawBytes(mismatchDoc),
      encoding: 'utf-8',
      ports: store.stagePorts(),
    });
    expect(mismatchRes.status).toBe('quarantined');
    expect(mismatchRes.completenessStatus).toBe('baseline-mismatch');
  });

  it('preserves review, identity, bytes and writes zero duplicates on retry when active=self', async () => {
    const store = new FakeStore();
    const gen = await stageGeneration(store, raw());
    const pub1 = await publish({
      config: gen.config,
      candidateVersionId: gen.candidateVersionId,
      approval: gen.approval,
      ports: store.publishPorts(),
    });
    expect(pub1.status).toBe('published');

    // Baseline is now self
    store.baseline = {
      baselineVersionId: gen.candidateVersionId,
      baselineFingerprint: catalogueFingerprint(gen.snapshot),
      catalogue: gen.snapshot,
    };

    // Restaging the exact same generation
    const restaged = await stageGeneration(store, gen.raw);
    expect(restaged.candidateVersionId).toBe(gen.candidateVersionId);
    expect(restaged.review.candidateSha256).toBe(gen.review.candidateSha256);

    const pubRetry = await publish({
      config: restaged.config,
      candidateVersionId: restaged.candidateVersionId,
      approval: restaged.approval,
      ports: store.publishPorts(),
    });
    expect(pubRetry.status).toBe('already-published');
    expect(store.callsTo('writeBundleFile')).toBe(1);
    expect(store.callsTo('writeDescriptorRow')).toBe(1);
    expect(store.callsTo('writeManifestRow')).toBe(1);
  });
});

describe('published descriptor URL resolver and validation', () => {
  it('uses deterministic injected URL resolver when provided', async () => {
    const store = new FakeStore();
    const gen = await stageGeneration(store, raw());
    const ports = store.publishPorts();
    ports.resolvePublicUrl = (_versionId, fileName) =>
      `https://custom-storage.example.org/files/${fileName}`;

    const published = await publish({
      config: gen.config,
      candidateVersionId: gen.candidateVersionId,
      approval: gen.approval,
      ports,
    });
    expect(published.status).toBe('published');
    const descriptor = store.descriptors.get(gen.candidateVersionId);
    expect(descriptor?.url).toBe(
      `https://custom-storage.example.org/files/${descriptor?.fileName}`,
    );
  });

  it('rejects invalid URLs (non-HTTPS, credentials, control chars, fragments) before public writes', async () => {
    const invalidUrls = [
      'http://insecure.example.com/bundle.json',
      'https://user:pass@secure.example.com/bundle.json',
      'https://secure.example.com/bundle.json#fragment',
      'https://secure.example.com/bundle\u001f.json',
    ];

    for (const badUrl of invalidUrls) {
      const store = new FakeStore();
      const gen = await stageGeneration(store, raw());
      const ports = store.publishPorts();
      ports.resolvePublicUrl = () => badUrl;

      const result = await publish({
        config: gen.config,
        candidateVersionId: gen.candidateVersionId,
        approval: gen.approval,
        ports,
      });
      expect(result.status).toBe('rejected');
      expect(result.reason).toBe('invalid-public-url');
      expect(store.files.size).toBe(0);
      expect(store.descriptors.size).toBe(0);
      expect(store.manifests.size).toBe(0);
    }
  });
});
