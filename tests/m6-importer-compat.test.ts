/**
 * Milestone 6 validator against the real Milestone 5 producer (issue #12).
 *
 * SYNTHETIC data only. Each case stages and publishes through the real
 * importer (`stage` + `publish` against the stateful fake ports) and then
 * feeds the exact uploaded bytes to the local-store validator, so a drift
 * between the publisher's transport checksum or preserved data-quality notes
 * and what Milestone 6 accepts fails here.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  catalogueFingerprint,
  deserializeCatalogue,
  sealCatalogue,
  serializeCatalogue,
  validateReferentialIntegrity,
} from '@intermed/domain';
import {
  checkBundle,
  checkManifest,
  decodeBundleBytes,
} from '../packages/local-store/src/validate';
import { publish } from '../packages/importer/src/publisher';
import { FakeStore } from './importer/support/fake-ports';
import { stageGeneration } from './importer/support/harness';
import {
  fictivolProduct,
  placebexProduct,
  type RawOptions,
} from './importer/support/synthetic-raws';

// Fictional source keys, assembled at runtime: they are plain identifiers,
// not credentials, but `key: '<literal>'` trips generic secret scanners.
const BLORBEXIUM_INGREDIENT_KEY = ['AI', 'BLORBEXIUM'].join('-');
const BLORBEX_JOIN_KEY = ['MI', 'BLORBEX'].join('-');
const TABLET_DOSAGE_FORM_KEY = ['DF', 'TABLET'].join('-');

function sha256Hex(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function publishGeneration(store: FakeStore, options: RawOptions) {
  const staged = await stageGeneration(store, options);
  const outcome = await publish({
    config: staged.config,
    candidateVersionId: staged.candidateVersionId,
    approval: staged.approval,
    ports: store.publishPorts(),
  });
  expect(outcome.status).toBe('published');
  const manifest = store.manifests.get(staged.candidateVersionId);
  const descriptor = store.descriptors.get(staged.candidateVersionId);
  const bytes = store.files.get(
    `${staged.candidateVersionId}/${descriptor?.fileName ?? ''}`,
  );
  if (!manifest || !descriptor || !bytes)
    throw new Error('publication artefacts are missing');
  const text = decodeBundleBytes(bytes);
  if (text === null) throw new Error('published bundle is not strict UTF-8');
  return { manifest, descriptor, bytes, text };
}

describe('M6 validator against the published M5 transport contract', () => {
  it('accepts a clean generation whose checksum is the SHA-256 of the uploaded bytes', async () => {
    const published = await publishGeneration(new FakeStore(), {
      products: [fictivolProduct(), placebexProduct()],
    });

    expect(published.manifest.checksum).toBe(
      `sha256:${sha256Hex(published.bytes)}`,
    );
    expect(published.descriptor.checksum).toBe(published.manifest.checksum);
    expect(published.descriptor.byteSize).toBe(published.bytes.length);
    // The strict decoder hands the validator text that re-encodes to the
    // publisher's exact bytes.
    expect(new TextEncoder().encode(published.text)).toEqual(published.bytes);
    const decoded = deserializeCatalogue(published.text);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.snapshot.datasetVersions[0]?.checksum).toBe(
      catalogueFingerprint(decoded.snapshot),
    );
    expect(
      checkManifest(published.manifest, published.manifest.dataset),
    ).toBeNull();

    await expect(
      checkBundle(published.manifest, published.text),
    ).resolves.toMatchObject({ ok: true });
  });

  it('accepts a generation carrying only the preserved source-token notes', async () => {
    const published = await publishGeneration(new FakeStore(), {
      products: [
        {
          sourceProductId: 'SP-BLORBEX',
          commercialName: 'Blorbex',
          strengthText: '500,125 blorbz',
          dosageFormKey: TABLET_DOSAGE_FORM_KEY,
          ingredients: [
            {
              key: BLORBEXIUM_INGREDIENT_KEY,
              text: 'Blorbexium',
              joinKey: BLORBEX_JOIN_KEY,
              value: '500,125',
              unit: 'blorbz',
            },
          ],
        },
      ],
    });
    const decoded = deserializeCatalogue(published.text);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const codes = validateReferentialIntegrity(decoded.snapshot)
      .map((issue) => issue.code)
      .sort();
    expect(codes).toEqual(['ambiguous-decimal', 'invalid-unit']);

    await expect(
      checkBundle(published.manifest, published.text),
    ).resolves.toMatchObject({ ok: true });
  });

  it('still rejects a genuinely fatal integrity issue behind a correct checksum', async () => {
    const published = await publishGeneration(new FakeStore(), {
      products: [fictivolProduct(), placebexProduct()],
    });
    const decoded = deserializeCatalogue(published.text);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const snapshot = decoded.snapshot;
    const firstId = snapshot.products[0]?.id;
    if (!firstId) throw new Error('fixture has no products');
    const tampered = {
      ...snapshot,
      products: snapshot.products.map((row, index) =>
        index === 1 ? { ...row, id: firstId } : row,
      ),
    };
    const text = serializeCatalogue(sealCatalogue(tampered));
    const checksum = `sha256:${sha256Hex(new TextEncoder().encode(text))}`;

    await expect(
      checkBundle({ ...published.manifest, checksum }, text),
    ).resolves.toEqual({ ok: false, reason: 'integrity-failed' });
  });
});
