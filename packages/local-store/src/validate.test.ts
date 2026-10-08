import { expect, it, vi } from 'vitest';
import {
  assessQuantity,
  deserializeCatalogue,
  fingerprint,
  presentField,
  sealCatalogue,
  serializeCatalogue,
  validateReferentialIntegrity,
  type MedicationCatalogueSnapshot,
  type PublishedDatasetManifest,
} from '@intermed/domain';
import type { SyntheticBundle } from './synthetic-bundle';
import { bundle } from './test-support';
import {
  checkBundle,
  decodeBundleBytes,
  NON_FATAL_DATA_QUALITY_CODES,
} from './validate';

/**
 * Bundle validation against the published transport contract (issue #12).
 *
 * `manifest.checksum` is the publisher's SHA-256 over the exact uploaded
 * bundle bytes (`sha256:<64 lowercase hex>`), not the internal FNV-1a
 * catalogue fingerprint. Every digest below comes from an independent Web
 * Crypto oracle, so a bug in the validator cannot make the expectation
 * agree with the implementation. Fixtures are synthetic only.
 */

/** Independent SHA-256 transport checksum of one bundle text. */
async function sha256Of(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `sha256:${hex}`;
}

/**
 * Re-seal a snapshot, serialize it and stamp the manifest with the correct
 * SHA-256 transport checksum, so only the snapshot content can fail.
 */
async function resealedBundle(
  base: SyntheticBundle,
  snapshot: MedicationCatalogueSnapshot,
): Promise<{
  readonly manifest: PublishedDatasetManifest;
  readonly text: string;
}> {
  const text = serializeCatalogue(sealCatalogue(snapshot));
  return {
    manifest: { ...base.manifest, checksum: await sha256Of(text) },
    text,
  };
}

function mustDeserialize(text: string): MedicationCatalogueSnapshot {
  const decoded = deserializeCatalogue(text);
  if (!decoded.ok) throw new Error('The synthetic fixture did not deserialize');
  return decoded.snapshot;
}

it('accepts a clean bundle whose checksum is the SHA-256 of its bytes', async () => {
  const alpha = await bundle('alpha');
  const checksum = await sha256Of(alpha.text);
  expect(checksum).toMatch(/^sha256:[0-9a-f]{64}$/);

  const validation = await checkBundle(
    { ...alpha.manifest, checksum },
    alpha.text,
  );
  expect(validation).toMatchObject({ ok: true, synthetic: true });
  if (validation.ok)
    expect(validation.snapshot.datasetVersions[0]?.id).toBe(alpha.generationId);
});

it('builds synthetic fixtures that publish the SHA-256 transport checksum', async () => {
  const alpha = await bundle('alpha');
  const checksum = await sha256Of(alpha.text);

  expect(alpha.manifest.checksum).toBe(checksum);
  expect(alpha.descriptor.checksum).toBe(checksum);
});

it('rejects a bundle whose bytes changed with checksum-mismatch', async () => {
  const alpha = await bundle('alpha');
  const checksum = await sha256Of(alpha.text);
  // One flipped character: one byte of the transport payload differs.
  const flipped = alpha.text.replace('Fictivol alpha', 'Fictivol aIpha');

  const validation = await checkBundle(
    { ...alpha.manifest, checksum },
    flipped,
  );
  expect(validation).toEqual({ ok: false, reason: 'checksum-mismatch' });
});

it('rejects FNV-style and non-prefixed checksums with checksum-mismatch', async () => {
  const alpha = await bundle('alpha');

  // The internal catalogue fingerprint is 16 hex characters with no prefix.
  const internal = fingerprint(alpha.text);
  expect(internal).toMatch(/^[0-9a-f]{16}$/);
  const withInternal = await checkBundle(
    { ...alpha.manifest, checksum: internal },
    alpha.text,
  );
  expect(withInternal).toEqual({ ok: false, reason: 'checksum-mismatch' });

  // The right digest without the `sha256:` prefix is not a transport checksum.
  const hex = (await sha256Of(alpha.text)).slice('sha256:'.length);
  const unprefixed = await checkBundle(
    { ...alpha.manifest, checksum: hex },
    alpha.text,
  );
  expect(unprefixed).toEqual({ ok: false, reason: 'checksum-mismatch' });

  // The right digest in uppercase hex is not the contract's lowercase form.
  const uppercase = await checkBundle(
    { ...alpha.manifest, checksum: `sha256:${hex.toUpperCase()}` },
    alpha.text,
  );
  expect(uppercase).toEqual({ ok: false, reason: 'checksum-mismatch' });
});

it('fails closed with checksum-mismatch when the digest cannot be computed', async () => {
  const alpha = await bundle('alpha');
  // A context without Web Crypto, or a digest that rejects, cannot verify
  // the transport checksum: the bundle fails closed instead of throwing.
  const digest = vi
    .spyOn(globalThis.crypto.subtle, 'digest')
    .mockRejectedValueOnce(new Error('Synthetic digest failure'));
  try {
    const validation = await checkBundle(alpha.manifest, alpha.text);
    expect(validation).toEqual({ ok: false, reason: 'checksum-mismatch' });
  } finally {
    digest.mockRestore();
  }
});

it('accepts a bundle that carries only the preserved data-quality notes', async () => {
  const base = await bundle('notes');
  const snapshot = mustDeserialize(base.text);
  // The two tokens the contract preserves on purpose: an ambiguous decimal
  // ('500,125' — thousands or decimal separator) and an unrecognized unit
  // ('blorbz'). Both stay reviewable notes, not activation failures.
  const assessed = assessQuantity({
    value: presentField('500,125'),
    unit: presentField('blorbz'),
    originalText: presentField('500,125 blorbz'),
  });
  const patched: MedicationCatalogueSnapshot = {
    ...snapshot,
    medicationIngredients: snapshot.medicationIngredients.map((row) => ({
      ...row,
      strengthValue: assessed.value,
      strengthValueNormalized: assessed.normalized,
      strengthUnit: assessed.unit,
      strengthOriginalText: assessed.originalText,
    })),
  };

  // One note per join row: only the two preserved codes, nothing else.
  const codes = [
    ...new Set(
      validateReferentialIntegrity(sealCatalogue(patched)).map(
        (issue) => issue.code,
      ),
    ),
  ].sort();
  expect(codes).toEqual(['ambiguous-decimal', 'invalid-unit']);

  const resealed = await resealedBundle(base, patched);
  const validation = await checkBundle(resealed.manifest, resealed.text);
  expect(validation).toMatchObject({ ok: true, synthetic: true });
});

it('still rejects a fatal integrity issue behind a correct checksum', async () => {
  const base = await bundle('duplicate');
  const snapshot = mustDeserialize(base.text);
  const firstId = snapshot.products[0]?.id;
  if (!firstId) throw new Error('The synthetic fixture has no products');

  const patched: MedicationCatalogueSnapshot = {
    ...snapshot,
    products: snapshot.products.map((row, index) =>
      index === 1 ? { ...row, id: firstId } : row,
    ),
  };
  const resealed = await resealedBundle(base, patched);

  const validation = await checkBundle(resealed.manifest, resealed.text);
  expect(validation).toEqual({ ok: false, reason: 'integrity-failed' });
});

it('decodes bundle bytes strictly and byte-exactly, and rejects malformed UTF-8', () => {
  const encoder = new TextEncoder();
  // Romanian diacritics plus a leading BOM: the BOM must survive the boundary
  // so that re-encoding reproduces the publisher's exact bytes.
  const text = '\uFEFFFictivol \u0219 \u021b \u0103 \u00e2 \u00ee Placebex';
  const bytes = encoder.encode(text);

  const decoded = decodeBundleBytes(bytes);
  expect(decoded).toBe(text);
  expect(encoder.encode(decoded ?? '')).toEqual(bytes);

  expect(decodeBundleBytes(encoder.encode('plain bundle text'))).toBe(
    'plain bundle text',
  );
  // 0xff is never valid UTF-8, and fatal decoding must not replace it.
  expect(decodeBundleBytes(new Uint8Array([0x22, 0xff, 0x22]))).toBeNull();
  // An overlong NUL (0xc0 0x80) is malformed UTF-8 under the WHATWG decoder.
  expect(
    decodeBundleBytes(new Uint8Array([0x22, 0xc0, 0x80, 0x22])),
  ).toBeNull();
});

it('treats exactly the two preserved source-token codes as non-fatal', () => {
  expect(NON_FATAL_DATA_QUALITY_CODES).toEqual([
    'invalid-unit',
    'ambiguous-decimal',
  ]);
});
