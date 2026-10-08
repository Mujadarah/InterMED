/**
 * Positive stage + publish flow through the COMPILED, isolated artifact on the
 * explicitly configured Node 22 runtime, against the fake Appwrite REST
 * surface only. The runner imports the handler through the artifact's own
 * `package.json` `main`, so it works for both the transitional `function-entry`
 * layout and the final `src/main.js` layout.
 */
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, snapshotBytes } from './handler-fixtures';
import { buildImporterFunctionArtifact } from '../../scripts/build-importer-function.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The official Node 22 runtime is a hard requirement: CI captures
 * `process.execPath` from the pinned `actions/setup-node` installation into
 * `INTERMED_NODE22_RUNTIME`. This suite must never skip silently, so a missing
 * or unusable runtime fails loudly with an actionable message instead.
 */
const NODE22 = (() => {
  const configured = process.env.INTERMED_NODE22_RUNTIME;
  if (!configured) {
    throw new Error(
      'INTERMED_NODE22_RUNTIME is required: point it at the official Node 22 runtime executable ' +
        '(CI exports process.execPath of the pinned Node 22 installation to GITHUB_ENV). ' +
        'This compiled-artifact suite does not skip.',
    );
  }
  if (!existsSync(configured)) {
    throw new Error(
      `INTERMED_NODE22_RUNTIME does not point at an existing runtime executable: ${configured}`,
    );
  }
  return configured;
})();

const NODE22_VERSION = (() => {
  try {
    return execFileSync(NODE22, ['--version'], {
      encoding: 'utf8',
      timeout: 5_000,
    }).trim();
  } catch (error) {
    throw new Error(
      `INTERMED_NODE22_RUNTIME (${NODE22}) is not runnable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
})();

function resolveNpmInvocation(): { command: string; args: string[] } {
  const configuredNpm = process.env.npm_execpath;
  const bundledNpm = join(
    dirname(process.execPath),
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js',
  );
  const npm = configuredNpm ?? bundledNpm;
  return npm.endsWith('.js')
    ? { command: process.execPath, args: [npm] }
    : { command: npm, args: [] };
}

/**
 * Runner executed inside the artifact on Node 22. It seeds the owner intent
 * state, stages, then publishes from the real staged review, and repeats the
 * publication with a deliberately advancing wall clock.
 */
function runnerSource(rawLiteral: string): string {
  return [
    "import { createHash, randomBytes } from 'node:crypto';",
    "import { readFileSync } from 'node:fs';",
    '',
    "const manifestJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));",
    'const handlerModule = await import(manifestJson.main);',
    'const handler = handlerModule.default;',
    "const { createFakeAppwriteRest, utf8Bytes, bytesToText } = await import('./fake-appwrite-rest.mjs');",
    '',
    '// Runtime-generated fake key; never a real credential and never printed.',
    "const SECRET = 'artifact-fake-secret-' + randomBytes(16).toString('hex');",
    "const DATASET = 'synthetic-medication-catalogue';",
    "const SOURCE_VERSION = 'synthetic-2026-10-06';",
    "const APPROVED_AT = '2026-10-07T10:00:00Z';",
    "const RAW_FILE_ID = 'raw-src-0001';",
    'const RAW = ' + rawLiteral + ';',
    'const rawBytes = utf8Bytes(JSON.stringify(RAW));',
    'const sha = (value) => createHash("sha256").update(value).digest("hex");',
    'const ref36 = (prefix, material) => prefix + sha(material).slice(0, 32);',
    'const config = {',
    "  sourceKey: 'source.synthetic',",
    '  sourceVersion: SOURCE_VERSION,',
    "  schemaVersion: 'medication-catalogue-1',",
    "  importerVersion: 'm5-function-handler',",
    "  parserVersion: 'm5-parser',",
    "  parserEncoding: 'utf-8',",
    "  syntheticAllowlist: ['source.synthetic'],",
    '  largeRemovalCount: 5,',
    '  largeRemovalPercent: 25,',
    '  maxRawBytes: 1000000,',
    '  maxRows: 2000,',
    '};',
    'const stageOp = "op-stage-0001";',
    'const publishOp = "op-publish-0001";',
    'const stageIntentFileId = ref36("oid1", "intermed-op-intent-file/v1|" + stageOp);',
    'const publishIntentFileId = ref36("oid1", "intermed-op-intent-file/v1|" + publishOp);',
    '',
    'process.env.APPWRITE_FUNCTION_PROJECT_ID = "intermed-dev";',
    'process.env.APPWRITE_FUNCTION_ID = "import-anmdmr";',
    'process.env.APPWRITE_ENDPOINT = "https://fra.cloud.appwrite.io/v1";',
    'process.env.INTERMED_SERVER_KEY = SECRET;',
    'process.env.INTERMED_SYNTHETIC_PUBLISH_ENABLED = "true";',
    '',
    'const rest = createFakeAppwriteRest({ serverKey: SECRET });',
    'globalThis.fetch = rest.fetch;',
    'const invoke = async (operationId) => {',
    '  const calls = [];',
    '  await handler({',
    '    req: { method: "POST", bodyJson: { operationId } },',
    '    res: { json: (body, status) => calls.push({ body, status }) },',
    '    log: () => {},',
    '  });',
    '  return calls.at(-1);',
    '};',
    'const stateOf = () => JSON.stringify({',
    '  versions: [...(rest.rows.get("dataset-versions")?.entries() ?? [])],',
    '  bundles: [...(rest.rows.get("dataset-bundles")?.entries() ?? [])],',
    '  published: [...(rest.files.get("published-datasets")?.entries() ?? [])]',
    '    .map(([id, file]) => [id, file.name, sha(file.bytes)]),',
    '});',
    '',
    'rest.seedRaw = undefined;',
    "rest.files.get('raw-sources').set(RAW_FILE_ID, { name: 'raw-snapshot.json', bytes: rawBytes, permissions: [] });",
    'const stageIntent = {',
    "  purpose: 'intermed-synthetic-stage/v1',",
    '  operationId: stageOp,',
    "  issuedAt: '2026-10-07T09:00:00Z',",
    '  dataset: DATASET,',
    '  syntheticOnly: true,',
    '  rawSnapshotFileId: RAW_FILE_ID,',
    '  rawSnapshotSha256: sha(rawBytes),',
    '  config,',
    '};',
    "rest.files.get('import-run-logs').set(stageIntentFileId, {",
    "  name: 'op-intent-v1.' + stageOp + '.json',",
    '  bytes: utf8Bytes(JSON.stringify(stageIntent)),',
    '  permissions: [],',
    '});',
    '',
    'const staged = await invoke(stageOp);',
    'if (staged.status !== 200 || staged.body.code !== "staged") {',
    '  throw new Error("stage failed: " + JSON.stringify(staged));',
    '}',
    '',
    'let review = null;',
    "for (const file of rest.files.get('import-run-logs').values()) {",
    "  if (file.name.startsWith('stage-review-v1.')) {",
    '    review = JSON.parse(bytesToText(file.bytes));',
    '  }',
    '}',
    'if (!review) throw new Error("no staged review");',
    'const publishIntent = {',
    "  purpose: 'intermed-synthetic-publish/v1',",
    '  operationId: publishOp,',
    "  issuedAt: '2026-10-07T10:00:00Z',",
    '  dataset: DATASET,',
    '  stageOperationId: stageOp,',
    '  candidateVersionId: review.candidateVersionId,',
    '  candidateSha256: review.candidateSha256,',
    '  rawSnapshotSha256: review.rawSnapshotSha256,',
    '  config,',
    '  baselineVersionId: review.baselineVersionId,',
    '  baselineFingerprint: review.baselineFingerprint,',
    '  version: SOURCE_VERSION,',
    "  approvedBy: 'Synthetica Release Owner (fictional)',",
    "  approvalReference: 'FICT-APPROVAL-0001',",
    '  approvedAt: APPROVED_AT,',
    '  operationalApproval: true,',
    '  largeRemovalApproval: true,',
    '};',
    "rest.files.get('import-run-logs').set(publishIntentFileId, {",
    "  name: 'op-intent-v1.' + publishOp + '.json',",
    '  bytes: utf8Bytes(JSON.stringify(publishIntent)),',
    '  permissions: [],',
    '});',
    '',
    'const published = await invoke(publishOp);',
    'if (published.status !== 200 || published.body.code !== "published") {',
    '  throw new Error("publish failed: " + JSON.stringify(published));',
    '}',
    'const writes = rest.calls.filter((call) => call.method === "POST").map((call) => call.path);',
    'const tail = writes.slice(-3).join(" -> ");',
    'const expectedTail = [',
    '  "/v1/storage/buckets/published-datasets/files",',
    '  "/v1/tablesdb/intermed-datasets/tables/dataset-bundles/rows",',
    '  "/v1/tablesdb/intermed-datasets/tables/dataset-versions/rows",',
    '].join(" -> ");',
    'if (tail !== expectedTail) throw new Error("write order: " + tail);',
    '',
    'const afterPublish = stateOf();',
    'const manifestRow = [...(rest.rows.get("dataset-versions")?.values() ?? [])][0];',
    '// Advance the wall clock far beyond the approval timestamp before retrying.',
    'const RealDate = Date;',
    'let offset = 0;',
    'globalThis.Date = class extends RealDate {',
    '  constructor(...args) {',
    '    if (args.length === 0) { super(RealDate.now() + 200 * 24 * 60 * 60 * 1000 + offset); offset += 1000; }',
    '    else { super(...args); }',
    '  }',
    '  static now() { return RealDate.now() + 200 * 24 * 60 * 60 * 1000 + offset; }',
    '};',
    'const retried = await invoke(publishOp);',
    'globalThis.Date = RealDate;',
    'if (retried.status !== 200 || retried.body.code !== "already-published") {',
    '  throw new Error("retry failed: " + JSON.stringify(retried));',
    '}',
    'if (stateOf() !== afterPublish) throw new Error("retry wrote duplicate state");',
    'if (manifestRow.publishedAt !== APPROVED_AT) {',
    '  throw new Error("publication time drifted: " + manifestRow.publishedAt);',
    '}',
    '',
    'console.log(JSON.stringify({',
    '  runtimeVersion: process.version,',
    '  entry: manifestJson.main,',
    '  staged: staged.body.code,',
    '  published: published.body.code,',
    '  retried: retried.body.code,',
    '  manifestPublishedAt: manifestRow.publishedAt,',
    '  writeTail: tail,',
    '}));',
    '',
  ].join('\n');
}

describe('compiled artifact positive flow (Node 22)', () => {
  it('stages and publishes through the isolated artifact with fake HTTP only', () => {
    expect(NODE22_VERSION).toMatch(/^v22\.\d+\.\d+$/);
    const parent = mkdtempSync(join(tmpdir(), 'intermed-handler-artifact-'));
    try {
      const artifact = buildImporterFunctionArtifact({ outputParent: parent });
      const packageJson = JSON.parse(
        readFileSync(join(artifact, 'package.json'), 'utf8'),
      ) as { main: string };
      expect(packageJson.main).toMatch(/\/main\.js$/);
      const npm = resolveNpmInvocation();
      execFileSync(
        npm.command,
        [...npm.args, 'ci', '--ignore-scripts', '--offline'],
        {
          cwd: artifact,
          stdio: 'pipe',
        },
      );
      copyFileSync(
        join(here, 'fake-appwrite-rest.mjs'),
        join(artifact, 'fake-appwrite-rest.mjs'),
      );
      const rawLiteral = JSON.stringify(
        JSON.parse(new TextDecoder().decode(snapshotBytes())),
      );
      const runner = join(artifact, '.handler-artifact-flow.mjs');
      writeFileSync(runner, runnerSource(rawLiteral), 'utf8');
      try {
        const output = execFileSync(NODE22, [runner], {
          cwd: artifact,
          encoding: 'utf8',
          env: { ...process.env },
        });
        const result = JSON.parse(output.trim()) as {
          runtimeVersion: string;
          entry: string;
          staged: string;
          published: string;
          retried: string;
          manifestPublishedAt: string;
          writeTail: string;
        };
        // The artifact really executed on the official Node 22 runtime.
        expect(result.runtimeVersion).toBe(NODE22_VERSION);
        expect(result.runtimeVersion).toMatch(/^v22\.\d+\.\d+$/);
        expect(result.entry).toBe(packageJson.main);
        expect(result.staged).toBe('staged');
        expect(result.published).toBe('published');
        expect(result.retried).toBe('already-published');
        expect(result.manifestPublishedAt).toBe('2026-10-07T10:00:00Z');
        expect(result.writeTail).toBe(
          [
            '/v1/storage/buckets/published-datasets/files',
            '/v1/tablesdb/intermed-datasets/tables/dataset-bundles/rows',
            '/v1/tablesdb/intermed-datasets/tables/dataset-versions/rows',
          ].join(' -> '),
        );
      } finally {
        rmSync(runner, { force: true });
      }
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  }, 120_000);
});
