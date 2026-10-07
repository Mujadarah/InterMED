import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { serializeCatalogue } from '@intermed/domain';
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
  if (
    projectId !== DEV_PROJECT ||
    endpoint.replace(/\/+$/, '') !== DEV_ENDPOINT
  )
    throw new Error(
      'live acceptance is restricted to the fixed intermed-dev project',
    );
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function cloudId(prefix, canonicalId) {
  return `${prefix}-${createHash('sha256').update(canonicalId).digest('hex').slice(0, 24)}`;
}

function shellArg(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function commandFromArgv(argv) {
  return argv.map(shellArg).join(' ');
}

function rowData(row) {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => !key.startsWith('$')),
  );
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
      rowId: 'guard-version',
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
      rowId: 'guard-bundle',
      data: {
        datasetVersionId: 'guard-version',
        fileId: 'guard-published',
        fileName: 'live-acceptance-guard.json',
        contentType: 'application/json',
        byteSize: 2,
        checksum: 'sha256:guard',
      },
      ...common,
    },
    {
      tableId: 'import-runs',
      rowId: 'guard-run',
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
    fileId: `guard-${bucketId.replaceAll('-', '').slice(0, 27)}`,
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
    throw new Error(
      `synthetic fixture invalid: ${validated.issues[0]?.message}`,
    );
  const snapshot = validated.snapshot;
  const version = snapshot.datasetVersions[0];
  if (!version) throw new Error('synthetic fixture has no dataset version');

  const bundle = serializeCatalogue(snapshot);
  const bytes = Buffer.from(bundle, 'utf8');
  const fileChecksum = sha256(bytes);
  const fileName = 'synthetic-medication-catalogue-synthetic-2026-10-06.json';
  const canonicalVersionId = version.id;
  const cloudVersionId = cloudId('version', canonicalVersionId);
  const fileId = cloudId('file', canonicalVersionId);
  const descriptorId = cloudId('bundle', canonicalVersionId);
  const checksum = version.checksum;
  const versionRow = {
    $id: cloudVersionId,
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
    $id: descriptorId,
    $permissions: PUBLIC_READ,
    datasetVersionId: cloudVersionId,
    fileId,
    fileName,
    contentType: 'application/json',
    byteSize: bytes.byteLength,
    checksum: fileChecksum,
  };

  await mkdir(outputDirectory, { recursive: true });
  const bundlePath = join(outputDirectory, fileName);
  const descriptorPath = join(
    outputDirectory,
    'dataset-bundle-descriptor.json',
  );
  const versionPath = join(outputDirectory, 'dataset-version-row.json');
  await writeFile(bundlePath, bytes);
  await writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);
  await writeFile(versionPath, `${JSON.stringify(versionRow, null, 2)}\n`);

  const configFile = 'infra/appwrite/appwrite.config.development.json';
  const cli = ['npx', '--yes', 'appwrite-cli@28.1.0'];
  const config = ['--config-file', configFile];
  const rowCommand = (tableId, rowId, data, permissions = []) => {
    const argv = [
      ...cli,
      'tables-db',
      'create-row',
      '--database-id',
      DATABASE_ID,
      '--table-id',
      tableId,
      '--row-id',
      rowId,
      '--data',
      JSON.stringify(data),
      ...(permissions.length
        ? ['--permissions', JSON.stringify(permissions)]
        : []),
      ...config,
    ];
    return { argv, data, command: commandFromArgv(argv) };
  };
  const fileCommand = (file) => {
    const argv = [
      ...cli,
      'storage',
      'create-file',
      '--bucket-id',
      file.bucketId,
      '--file-id',
      file.fileId,
      '--file',
      file.fileName,
      '--permissions',
      JSON.stringify(file.permissions),
      ...config,
    ];
    return { argv, command: commandFromArgv(argv) };
  };
  const commandPlan = [
    ...guardFiles().map((file) => ({
      action: 'storage-create-guard-file',
      automatic: false,
      ...fileCommand(file),
    })),
    ...guardRows(now).map((row) => ({
      action: 'table-create-guard-row',
      automatic: false,
      ...rowCommand(row.tableId, row.rowId, row.data, row.$permissions),
    })),
    {
      action: 'storage-create-bundle-file',
      automatic: false,
      ...fileCommand({
        bucketId: 'published-datasets',
        fileId,
        fileName,
        permissions: PUBLIC_READ,
      }),
    },
    {
      action: 'table-create-descriptor-row',
      automatic: false,
      ...rowCommand(
        'dataset-bundles',
        descriptor.$id,
        rowData(descriptor),
        PUBLIC_READ,
      ),
    },
    {
      action: 'table-create-manifest-row-last',
      automatic: false,
      ...rowCommand(
        'dataset-versions',
        versionRow.$id,
        rowData(versionRow),
        PUBLIC_READ,
      ),
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
      canonicalDatasetVersionId: canonicalVersionId,
      datasetVersionId: cloudVersionId,
      status: versionRow.status,
      checksum,
      fileChecksum,
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
