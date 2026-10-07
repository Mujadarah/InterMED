import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createAppwritePublishedDatasetReader } from '@intermed/data-access';

const DEV_PROJECT = 'intermed-dev';
const DEV_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';

export async function readPublishedMetadata(options) {
  const {
    endpoint = DEV_ENDPOINT,
    projectId = DEV_PROJECT,
    databaseId = 'intermed-datasets',
    versionsTableId = 'dataset-versions',
    bundlesTableId = 'dataset-bundles',
    bundleBucketId = 'published-datasets',
    dataset,
    outputDirectory,
    fetchLike = globalThis.fetch,
  } = options;
  if (
    projectId !== DEV_PROJECT ||
    endpoint.replace(/\/+$/, '') !== DEV_ENDPOINT
  )
    throw new Error(
      'live acceptance is restricted to the fixed intermed-dev project',
    );
  if (!dataset || !outputDirectory)
    throw new Error('dataset and outputDirectory are required');
  if (typeof fetchLike !== 'function') throw new Error('fetchLike is required');
  const reader = createAppwritePublishedDatasetReader({
    endpoint,
    projectId,
    databaseId,
    versionsTableId,
    bundlesTableId,
    bundleBucketId,
    fetchLike,
  });
  const manifest = await reader.getManifest(dataset);
  const descriptor =
    manifest.status === 'available'
      ? await reader.getBundleDescriptor(manifest.value.datasetVersionId)
      : manifest.status === 'unavailable'
        ? manifest
        : { status: 'absent', reason: 'not-found' };
  const payload = { projectId, endpoint, dataset, manifest, descriptor };
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = join(outputDirectory, 'adapter-read.json');
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  return {
    manifest,
    descriptor,
    outputPath,
    log: JSON.stringify({ projectId, endpoint, dataset, manifest, descriptor }),
  };
}
