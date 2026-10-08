/**
 * Shared fixtures for the import handler, intent, bridge and artifact tests.
 *
 * Identifier derivations are re-implemented here from the published formula so
 * the tests do not simply agree with the implementation under test. Raw
 * material is the synthetic fixture only: fictional names, flagged synthetic.
 * The publish intent's immutable `approvedAt` pins the publication timestamp so
 * a retry never drifts with the wall clock.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { validateSyntheticSource } from '@intermed/data-access';
import { serializeCatalogue } from '@intermed/domain';
import handler from '../../infra/appwrite/functions/import-anmdmr/src/main.js';
import {
  bytesToText,
  createFakeAppwriteRest,
  utf8Bytes,
} from './fake-appwrite-rest.mjs';

/** Dummy credential sentinel: never a real key, used for leak assertions. */
export const SENTINEL = 'dummy-secret-sentinel-7c1f9a4e2b60';

export const TRUSTED_RUNTIME = {
  project: 'intermed-dev',
  functionId: 'import-anmdmr',
  endpoint: 'https://fra.cloud.appwrite.io/v1',
};

export const DATASET = 'synthetic-medication-catalogue';
export const SOURCE_VERSION = 'synthetic-2026-10-06';
export const APPROVED_AT = '2026-10-07T10:00:00Z';

export const TEST_CONFIG = {
  sourceKey: 'source.synthetic',
  sourceVersion: SOURCE_VERSION,
  schemaVersion: 'medication-catalogue-1',
  importerVersion: 'm5-function-handler',
  parserVersion: 'm5-parser',
  parserEncoding: 'utf-8',
  syntheticAllowlist: ['source.synthetic'],
  largeRemovalCount: 5,
  largeRemovalPercent: 25,
  maxRawBytes: 1000000,
  maxRows: 2000,
} as const;

export const STAGE_OPERATION = 'op-stage-0001';
export const PUBLISH_OPERATION = 'op-publish-0001';
export const RAW_FILE_ID = 'raw-src-0001';

/** Hash synthetic text or bytes with real SHA-256 for handler binding assertions. */
export function sha256Hex(value: Uint8Array | string): string {
  return createHash('sha256')
    .update(typeof value === 'string' ? Buffer.from(value) : Buffer.from(value))
    .digest('hex');
}

/** Take the requested digest prefix for deterministic fixture identifiers. */
export function hexPrefix(digest: string, length: number): string {
  return digest.slice(0, length);
}

/** Published derivation formulas (see the API guide). */
export const derivations = {
  operationRef(operationId: string): string {
    return hexPrefix(sha256Hex(`intermed-ref/v1|operation|${operationId}`), 12);
  },
  intentFileId(operationId: string): string {
    return `oid1${hexPrefix(sha256Hex(`intermed-op-intent-file/v1|${operationId}`), 32)}`;
  },
  intentFileName(operationId: string): string {
    return `op-intent-v1.${operationId}.json`;
  },
  candidateFileId(candidateVersionId: string): string {
    return `cnd1${hexPrefix(sha256Hex(`intermed-candidate-file/v1|${candidateVersionId}`), 32)}`;
  },
  candidateFileName(fileId: string): string {
    return `candidate-v1.${fileId}.json`;
  },
  reviewFileId(input: {
    stageOperationId: string;
    candidateVersionId: string;
    baselineVersionId: string | null;
    baselineFingerprint: string | null;
  }): string {
    const material = [
      'intermed-stage-review-file/v1',
      input.stageOperationId,
      input.candidateVersionId,
      input.baselineVersionId ?? 'none',
      input.baselineFingerprint ?? 'none',
    ].join('|');
    return `rev1${hexPrefix(sha256Hex(material), 32)}`;
  },
  reviewFileName(fileId: string): string {
    return `stage-review-v1.${fileId}.json`;
  },
  quarantineFileId(runId: string, reason: string): string {
    return `qtn1${hexPrefix(sha256Hex(`intermed-quarantine-file/v1|${runId}|${reason}`), 32)}`;
  },
  quarantineFileName(reason: string): string {
    return `quarantine-v1.${reason}.raw`;
  },
  runRowId(runId: string): string {
    return `run1${hexPrefix(sha256Hex(`intermed-run-row/v1|${runId}`), 32)}`;
  },
  bundleFileId(candidateVersionId: string): string {
    return `bnd1${hexPrefix(sha256Hex(`intermed-bundle-file/v1|${candidateVersionId}`), 32)}`;
  },
  bundleFileName(fileId: string): string {
    return `bundle-${fileId}.json`;
  },
};

/**
 * Raw synthetic source snapshot: one coherent, obviously fictional generation
 * ("Synthetica"/"Fictivol") with consistent provenance and no referential
 * gaps, valid against the real domain validator.
 */
export function buildSnapshotDocument(
  overrides: { commercialName?: string } = {},
): Record<string, unknown> {
  const track = {
    sourceKey: 'source.synthetic',
    datasetVersionKey: SOURCE_VERSION,
  };
  const missing = { status: 'missing' };
  const instant = '2026-10-06T00:00:00Z';
  return {
    format: 'anmdmr-synthetic',
    schemaVersion: TEST_CONFIG.schemaVersion,
    synthetic: true,
    completeness: 'full',
    sourceKey: 'source.synthetic',
    recordCounts: {
      products: 1,
      activeIngredients: 0,
      medicationIngredients: 0,
      atcCodes: 0,
      dosageForms: 0,
      manufacturers: 0,
      marketingAuthorizationHolders: 0,
      regulatoryDocuments: 0,
    },
    dataSource: {
      sourceKey: 'source.synthetic',
      name: 'Synthetica synthetic catalogue (fictional)',
      authority: 'Fictivol Test Authority (fictional)',
      jurisdiction: { status: 'present', value: 'fictional' },
      url: 'https://example.invalid/synthetica',
      licenseOrPermissionReference: {
        status: 'present',
        value: 'FICT-LICENCE-0001',
      },
      rightsStatus: 'unresolved',
      allowedUses: ['automated-test'],
      prohibitedUses: ['commercial-use'],
      permissionExpiresAt: missing,
      attributionRequirements: {
        status: 'present',
        value: 'Synthetic fixture. Not for clinical use.',
      },
      expectedUpdateCadence: missing,
      importMethod: 'synthetic-inline',
      coverageDescription: 'Fictional products only. Not for clinical use.',
      reviewOwner: 'none',
      reviewedAt: instant,
    },
    datasetVersion: {
      dataset: DATASET,
      version: SOURCE_VERSION,
      upstreamVersion: missing,
      publishedAt: missing,
      upstreamPublishedAt: missing,
      importedAt: instant,
      schemaVersion: 'medication-catalogue-1',
      minimumClientVersion: '0.0.0',
      coverage: 'Fictional coverage only. Not for clinical use.',
      rightsApprovalReference: 'FICT-APPROVAL-0000',
      clinicalReviewReference: 'FICT-REVIEW-0000',
      previousVersionKey: missing,
      status: 'staging',
    },
    products: [
      {
        ...track,
        sourceProductId: 'P-FICTIVOL',
        cim: { status: 'present', value: 'FICT-CIM-0001' },
        commercialName: overrides.commercialName ?? 'Fictivol',
        originalDciText: { status: 'present', value: 'Fictivolinum' },
        strengthText: { status: 'present', value: '500 mg' },
        dosageFormKey: missing,
        route: { status: 'present', value: 'oral-fictional' },
        atcKeys: [],
        manufacturerKeys: [],
        marketingAuthorizationHolderKey: missing,
        authorizationNumber: missing,
        authorizationDate: missing,
        authorizationStatus: missing,
        presentationOrPackDescription: missing,
        regulatoryDocumentKeys: [],
        sourceVersion: 'synthetic-1',
        firstSeenAt: instant,
        lastSeenAt: instant,
        status: 'active',
      },
    ],
    activeIngredients: [],
    medicationIngredients: [],
    atcCodes: [],
    dosageForms: [],
    manufacturers: [],
    marketingAuthorizationHolders: [],
    regulatoryDocuments: [],
  };
}

/** Serialize the synthetic raw document as UTF-8 JSON bytes. */
export function snapshotBytes(
  document: Record<string, unknown> = buildSnapshotDocument(),
): Uint8Array {
  return utf8Bytes(JSON.stringify(document));
}

/**
 * Candidate bundle bytes as the core writes them: the real validator and the
 * real canonical serializer, no domain mocking.
 */
export function candidateBytes(): Uint8Array {
  const document = buildSnapshotDocument();
  const result = validateSyntheticSource({
    synthetic: true,
    dataSource: document.dataSource,
    datasetVersion: document.datasetVersion,
    products: document.products,
    activeIngredients: document.activeIngredients,
    medicationIngredients: document.medicationIngredients,
    atcCodes: document.atcCodes,
    dosageForms: document.dosageForms,
    manufacturers: document.manufacturers,
    marketingAuthorizationHolders: document.marketingAuthorizationHolders,
    regulatoryDocuments: document.regulatoryDocuments,
  });
  if (!result.ok) {
    throw new Error(`synthetic fixture is invalid: ${result.issues.length}`);
  }
  return utf8Bytes(serializeCatalogue(result.snapshot));
}

/** Count entity arrays used by handler fixtures, treating absent collections as empty. */
export function catalogueCounts(
  catalogue: Record<string, unknown>,
): Record<string, number> {
  const length = (key: string): number =>
    Array.isArray(catalogue[key]) ? (catalogue[key] as unknown[]).length : 0;
  return {
    products: length('products'),
    activeIngredients: length('activeIngredients'),
    medicationIngredients: length('medicationIngredients'),
    atcCodes: length('atcCodes'),
    dosageForms: length('dosageForms'),
    manufacturers: length('manufacturers'),
    marketingAuthorizationHolders: length('marketingAuthorizationHolders'),
    regulatoryDocuments: length('regulatoryDocuments'),
  };
}

export interface IntentDocument {
  [key: string]: unknown;
}

/** Build a synthetic private stage intent with overridable fields for negative tests. */
export function stageIntentDocument(
  operationId: string = STAGE_OPERATION,
  overrides: Record<string, unknown> = {},
): IntentDocument {
  const bytes = snapshotBytes();
  return {
    purpose: 'intermed-synthetic-stage/v1',
    operationId,
    issuedAt: '2026-10-07T09:00:00Z',
    dataset: DATASET,
    syntheticOnly: true,
    rawSnapshotFileId: RAW_FILE_ID,
    rawSnapshotSha256: sha256Hex(bytes),
    config: {
      ...TEST_CONFIG,
      syntheticAllowlist: [...TEST_CONFIG.syntheticAllowlist],
    },
    ...overrides,
  };
}

export interface PublishIntentBindings {
  candidateVersionId: string;
  candidateSha256: string;
  rawSnapshotSha256: string;
  baselineVersionId?: string | null;
  baselineFingerprint?: string | null;
}

/** Build a fictional operator approval bound to the supplied candidate and baseline. */
export function publishIntentDocument(
  operationId: string = PUBLISH_OPERATION,
  bindings: PublishIntentBindings,
  overrides: Record<string, unknown> = {},
): IntentDocument {
  return {
    purpose: 'intermed-synthetic-publish/v1',
    operationId,
    issuedAt: '2026-10-07T10:00:00Z',
    dataset: DATASET,
    stageOperationId: STAGE_OPERATION,
    candidateVersionId: bindings.candidateVersionId,
    candidateSha256: bindings.candidateSha256,
    rawSnapshotSha256: bindings.rawSnapshotSha256,
    config: {
      ...TEST_CONFIG,
      syntheticAllowlist: [...TEST_CONFIG.syntheticAllowlist],
    },
    baselineVersionId: bindings.baselineVersionId ?? null,
    baselineFingerprint: bindings.baselineFingerprint ?? null,
    version: SOURCE_VERSION,
    approvedBy: 'Synthetica Release Owner (fictional)',
    approvalReference: 'FICT-APPROVAL-0001',
    approvedAt: APPROVED_AT,
    operationalApproval: true,
    largeRemovalApproval: true,
    ...overrides,
  };
}

export interface HandlerResult {
  status: number;
  body: Record<string, unknown>;
  logs: string[];
}

export interface HandlerRequest {
  method?: string;
  bodyJson?: unknown;
  bodyText?: string;
  bodyRaw?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export type FakeRest = ReturnType<typeof createFakeAppwriteRest>;

export interface Harness {
  rest: FakeRest;
  logs: string[];
  call(request: HandlerRequest): Promise<HandlerResult>;
  seedFile(
    bucketId: string,
    fileId: string,
    name: string,
    content: string | Uint8Array,
  ): void;
  seedRow(
    tableId: string,
    rowId: string,
    values: Record<string, unknown>,
  ): void;
  setEnv(name: string, value: string | undefined): void;
  dispose(): void;
}

/** Stub handler fetch and runtime variables; callers must dispose to restore global state. */
export function createHarness(
  options: {
    publishEnabled?: boolean;
    env?: Record<string, string | undefined>;
  } = {},
): Harness {
  const rest = createFakeAppwriteRest({ serverKey: SENTINEL });
  const logs: string[] = [];
  const restore = new Map<string, string | undefined>();
  vi.stubGlobal('fetch', rest.fetch as unknown as typeof fetch);

  /** Set a test runtime variable while retaining its original value for disposal. */
  function setEnv(name: string, value: string | undefined): void {
    if (!restore.has(name)) restore.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  setEnv('APPWRITE_FUNCTION_PROJECT_ID', TRUSTED_RUNTIME.project);
  setEnv('APPWRITE_FUNCTION_ID', TRUSTED_RUNTIME.functionId);
  setEnv('APPWRITE_ENDPOINT', TRUSTED_RUNTIME.endpoint);
  setEnv('INTERMED_SERVER_KEY', SENTINEL);
  setEnv(
    'INTERMED_SYNTHETIC_PUBLISH_ENABLED',
    options.publishEnabled ? 'true' : undefined,
  );
  for (const [name, value] of Object.entries(options.env ?? {})) {
    setEnv(name, value);
  }

  return {
    rest,
    logs,
    setEnv,
    seedFile(bucketId, fileId, name, content) {
      const bytes = typeof content === 'string' ? utf8Bytes(content) : content;
      const bucket = rest.files.get(bucketId);
      if (!bucket) throw new Error(`unknown bucket ${bucketId}`);
      bucket.set(fileId, { name, bytes, permissions: [] });
    },
    seedRow(tableId, rowId, values) {
      const table = rest.rows.get(tableId);
      if (!table) throw new Error(`unknown table ${tableId}`);
      table.set(rowId, values);
    },
    async call(request) {
      const captured: { body: Record<string, unknown>; status: number } = {
        body: {},
        status: 0,
      };
      const res = {
        json: (body: Record<string, unknown>, status: number) => {
          captured.body = body;
          captured.status = status;
        },
      };
      await handler({
        req: {
          method: request.method ?? 'POST',
          bodyJson: request.bodyJson,
          bodyText: request.bodyText,
          bodyRaw: request.bodyRaw,
          body: request.body,
          headers: request.headers ?? {},
        },
        res,
        log: (message: string) => {
          logs.push(message);
        },
      });
      return { status: captured.status, body: captured.body, logs: [...logs] };
    },
    dispose() {
      for (const [name, value] of restore) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      restore.clear();
      vi.unstubAllGlobals();
    },
  };
}

export const SAFE_LOG_PATTERN =
  /^import-anmdmr event=[a-z-]+ ref=([0-9a-f]{12}|none)$/;

/** Wrap an operation reference in the minimal handler request shape. */
export function envelope(operationId: unknown): { operationId: unknown } {
  return { operationId };
}

/** Read a seeded fake file as text, throwing when the fixture is missing. */
export function readSeedText(
  rest: FakeRest,
  bucketId: string,
  fileId: string,
): string {
  const stored = rest.files.get(bucketId)?.get(fileId);
  if (!stored) throw new Error(`missing seeded file ${fileId}`);
  return bytesToText(stored.bytes);
}

export { describe, expect, it, vi };
