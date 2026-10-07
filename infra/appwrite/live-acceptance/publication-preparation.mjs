import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  serializeCatalogue,
} from '@intermed/domain';
import {
  syntheticMedicationFixture,
  validateSyntheticSource,
} from '@intermed/data-access';

const DEV_PROJECT = 'intermed-dev';
const DEV_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
const DATABASE_ID = 'intermed-datasets';
const TABLES = ['dataset-versions', 'dataset-bundles', 'import-runs'];
const BUCKETS = [
  'raw-sources',
  'quarantine',
  'import-run-logs',
  'published-datasets',
];
const PUBLIC_READ = ['read("any")'];

function assertDevelopmentProject(projectId, endpoint) {
  if (projectId !== DEV_PROJECT || endpoint.replace(/\/+$/, '') !== DEV_ENDPOINT)
    throw new Error('live acceptance is restricted to the fixed intermed-dev project');
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function fieldValue(field) {
  return field.status === 'present' ? field.value : null;
}

function guardRows(now) {
  const common = {
    $permissions: ['read("any")', 'update("any")', 'delete("any")'],
  };
  return [
    {
      tableId: 'dataset-versions',
      rowId: 'live-acceptance-guard-version',
      data: {
        dataset: 'synthetic-live-acceptance-guard',
        version: 'guard-0',
        sourceIds: ['guard-source'],
        upstreamVersion: null,
        upstreamPublishedAt: null,
        publishedAt: null,
        importedAt: now,
        checksum: 'sha256:guard',
        schemaVersion: 'medication-catalogue-1',
        minimumClientVersion: '0.0.0',
        recordCounts: '{}',
        coverage: 'Synthetic disposable guard only.',
        rightsApprovalReference: 'guard',
        clinicalReviewReference: 'guard',
        previousVersionId: null,
        status: 'staging',
      },
      ...common,
    },
    {
      tableId: 'dataset-bundles',
      rowId: 'live-acceptance-guard-bundle',
      data: {
        datasetVersionId: 'live-acceptance-guard-version',
        fileId: 'live-acceptance-guard-published',
        fileName: 'live-acceptance-guard.json',
        contentType: 'application/json',
        byteSize: 2,
        checksum: 'sha256:guard',
      },
      ...common,
    },
    {
      tableId: 'import-runs',
      rowId: 'live-acceptance-guard-run',
      data: {
        sourceId: 'guard-source',
        snapshotVersion: 'guard-0',
        importerVersion: 'guard',
        startedAt: now,
        completedAt: null,
        counts: '{}',
        validationFailures: '[]',
        diffSummary: '{}',
        completenessStatus: 'guard',
        approvalReference: 'guard',
        publicationStatus: 'staging',
      },
      ...common,
    },
  ];
}

function guardFiles() {
  return BUCKETS.map((bucketId) => ({
    bucketId,
    fileId: `live-acceptance-guard-${bucketId}`,
    fileName: 'live-acceptance-guard.txt',
    content: 'synthetic guard',
    permissions: ['read("any")', 'update("any")', 'delete("any")'],
  }));
}

export async function prepareSyntheticPublication(options) {
  const {
    outputDirectory,
    projectId = DEV_PROJECT,
    endpoint = DEV_ENDPOINT,
    now = new Date().toISOString(),
  } = options;
  assertDevelopmentProject(projectId, endpoint);
  if (!outputDirectory) throw new Error('outputDirectory is required');

  const validated = validateSyntheticSource(syntheticMedicationFixture);
  if (!validated.ok)
    throw new Error(`synthetic fixture invalid: ${validated.issues[0]?.message}`);
  const snapshot = validated.snapshot;
  const version = snapshot.datasetVersions[0];
  if (!version) throw new Error('synthetic fixture has no dataset version');

  const bundle = serializeCatalogue(snapshot);
  const bytes = Buffer.from(bundle, 'utf8');
  const checksum = sha256(bytes);
  const fileName = 'synthetic-medication-catalogue-synthetic-2026-10-06.json';
  const fileId = 'synthetic-medication-catalogue-synthetic-2026-10-06';
  const versionRow = {
    $id: version.id,
    $permissions: PUBLIC_READ,
    dataset: version.dataset,
    version: version.version,
    sourceIds: version.sourceIds,
    upstreamVersion: fieldValue(version.upstreamVersion),
    upstreamPublishedAt: fieldValue(version.upstreamPublishedAt),
    publishedAt: null,
    importedAt: version.importedAt,
    checksum,
    schemaVersion: version.schemaVersion,
    minimumClientVersion: version.minimumClientVersion,
    recordCounts: JSON.stringify(version.recordCounts),
    coverage: version.coverage,
    rightsApprovalReference: version.rightsApprovalReference,
    clinicalReviewReference: version.clinicalReviewReference,
    previousVersionId: fieldValue(version.previousVersionId),
    status: 'staging',
  };
  const descriptor = {
    $id: 'synthetic-medication-catalogue-synthetic-2026-10-06-bundle',
    $permissions: PUBLIC_READ,
    datasetVersionId: version.id,
    fileId,
    fileName,
    contentType: 'application/json',
    byteSize: bytes.byteLength,
    checksum,
  };

  await mkdir(outputDirectory, { recursive: true });
  const bundlePath = join(outputDirectory, fileName);
  const descriptorPath = join(outputDirectory, 'dataset-bundle-descriptor.json');
  const versionPath = join(outputDirectory, 'dataset-version-row.json');
  await writeFile(bundlePath, bytes);
  await writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);
  await writeFile(versionPath, `${JSON.stringify(versionRow, null, 2)}\n`);

  const cli = 'appwrite@28.1.0';
  const commandPlan = [
    {
      action: 'storage-create-file',
      automatic: false,
      command: `${cli} storage create-file --bucket-id published-datasets --file-id ${fileId} --file ${fileName} --permissions 'read("any")'`,
    },
    {
      action: 'table-create-row',
      automatic: false,
      command: `${cli} tablesdb create-row --database-id ${DATABASE_ID} --table-id dataset-bundles --row-id ${descriptor.$id} --data @dataset-bundle-descriptor.json --permissions 'read("any")'`,
    },
    {
      action: 'table-create-row',
      automatic: false,
      command: `${cli} tablesdb create-row --database-id ${DATABASE_ID} --table-id dataset-versions --row-id ${versionRow.$id} --data @dataset-version-row.json --permissions 'read("any")'`,
    },
    {
      action: 'publish-after-verification',
      automatic: false,
      command: `OWNER REVIEW: update ${versionRow.$id} status to published and set publishedAt after file, descriptor, and probes pass`,
    },
  ];

  return {
    projectId,
    endpoint,
    outputDirectory,
    snapshot,
    generation: {
      dataset: version.dataset,
      version: version.version,
      datasetVersionId: version.id,
      status: versionRow.status,
      checksum,
    },
    versionRow,
    descriptor,
    files: [bundlePath, descriptorPath, versionPath],
    commandPlan,
    guards: {
      rows: guardRows(now),
      files: guardFiles(),
      targets: [
        ...guardRows(now).map((row) => row.rowId),
        ...guardFiles().map((file) => file.fileId),
      ],
      tables: TABLES,
      buckets: BUCKETS,
    },
  };
}
