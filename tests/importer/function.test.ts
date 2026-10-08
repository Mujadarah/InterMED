/**
 * Handler contract for the import-anmdmr Appwrite function: strict runtime
 * context, strict bounded request envelope, fail-closed behaviour with no
 * backend access and bounded, content-free responses and logs.
 */
import {
  createHarness,
  describe,
  envelope,
  expect,
  it,
  SAFE_LOG_PATTERN,
  SENTINEL,
  STAGE_OPERATION,
} from './handler-fixtures';

const AUTH_MATRIX: readonly {
  name: string;
  env: Record<string, string | undefined>;
  headers: Record<string, string>;
  status: number;
  code: string;
}[] = [
  {
    name: 'a request header key cannot replace the missing runtime key',
    env: { INTERMED_SERVER_KEY: undefined },
    headers: { 'x-appwrite-key': SENTINEL },
    status: 401,
    code: 'runtime-credential-missing',
  },
  {
    name: 'an empty runtime key is rejected',
    env: { INTERMED_SERVER_KEY: '' },
    headers: {},
    status: 401,
    code: 'runtime-credential-missing',
  },
  {
    name: 'a request header project cannot replace the foreign runtime project',
    env: { APPWRITE_FUNCTION_PROJECT_ID: 'intermed-prod' },
    headers: { 'x-appwrite-project': 'intermed-dev' },
    status: 403,
    code: 'runtime-context-rejected',
  },
  {
    name: 'a missing runtime project is rejected',
    env: { APPWRITE_FUNCTION_PROJECT_ID: undefined },
    headers: { 'x-appwrite-project': 'intermed-dev' },
    status: 403,
    code: 'runtime-context-rejected',
  },
  {
    name: 'a non-FRA endpoint is rejected',
    env: { APPWRITE_ENDPOINT: 'https://syd.cloud.appwrite.io/v1' },
    headers: {},
    status: 403,
    code: 'runtime-context-rejected',
  },
  {
    name: 'a decorated FRA endpoint is rejected',
    env: { APPWRITE_ENDPOINT: 'https://fra.cloud.appwrite.io/v1/' },
    headers: {},
    status: 403,
    code: 'runtime-context-rejected',
  },
  {
    name: 'a missing endpoint is rejected',
    env: { APPWRITE_ENDPOINT: undefined },
    headers: {},
    status: 403,
    code: 'runtime-context-rejected',
  },
  {
    name: 'a foreign function id is rejected',
    env: { APPWRITE_FUNCTION_ID: 'import-other' },
    headers: {},
    status: 403,
    code: 'runtime-context-rejected',
  },
  {
    name: 'a missing function id is rejected',
    env: { APPWRITE_FUNCTION_ID: undefined },
    headers: {},
    status: 403,
    code: 'runtime-context-rejected',
  },
];

const ENVELOPE_MATRIX: readonly { name: string; bodyJson: unknown }[] = [
  {
    name: 'a smuggled key field',
    bodyJson: { ...envelope(STAGE_OPERATION), key: SENTINEL },
  },
  {
    name: 'a smuggled approve flag',
    bodyJson: { ...envelope(STAGE_OPERATION), approve: true },
  },
  {
    name: 'a smuggled human actor',
    bodyJson: { ...envelope(STAGE_OPERATION), actor: 'someone' },
  },
  {
    name: 'a smuggled inline config',
    bodyJson: { ...envelope(STAGE_OPERATION), cfg: { sourceKey: 'x' } },
  },
  {
    name: 'smuggled inline snapshot bytes',
    bodyJson: { ...envelope(STAGE_OPERATION), bytes: 'e30=' },
  },
  {
    name: 'a smuggled endpoint',
    bodyJson: {
      ...envelope(STAGE_OPERATION),
      endpoint: 'https://fra.cloud.appwrite.io/v1',
    },
  },
  {
    name: 'a smuggled project header value',
    bodyJson: { ...envelope(STAGE_OPERATION), project: 'intermed-dev' },
  },
  { name: 'a non-string operation reference', bodyJson: { operationId: 7 } },
  { name: 'an empty operation reference', bodyJson: { operationId: '' } },
  {
    name: 'an oversized operation reference',
    bodyJson: { operationId: `op-${'0'.repeat(60)}` },
  },
  {
    name: 'an uppercase operation reference',
    bodyJson: { operationId: 'OP-0001' },
  },
  {
    name: 'an operation reference outside the reserved prefixes',
    bodyJson: { operationId: 'op-other-0001' },
  },
  { name: 'an empty envelope object', bodyJson: {} },
  { name: 'an array envelope', bodyJson: ['op-stage-0001'] },
  { name: 'a null envelope', bodyJson: null },
  {
    name: 'the retired inline snapshot body',
    bodyJson: {
      synthetic: true,
      sourceKey: 'Synthetica',
      datasetVersionKey: 'v1',
      dataSource: {},
      datasetVersion: {},
    },
  },
];

describe('Appwrite function import-anmdmr handler contract', () => {
  it('rejects every non-POST method before touching the runtime', async () => {
    for (const method of ['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      const harness = createHarness();
      const result = await harness.call({ method });
      expect(result.status, method).toBe(405);
      expect(result.body, method).toEqual({ code: 'method-not-allowed' });
      expect(harness.rest.calls.length, method).toBe(0);
      harness.dispose();
    }
  });

  it.each(AUTH_MATRIX)(
    'fails closed with no backend access: $name',
    async (matrixCase) => {
      const harness = createHarness({ env: matrixCase.env });
      const result = await harness.call({
        bodyJson: envelope(STAGE_OPERATION),
        headers: matrixCase.headers,
      });
      expect(result.status).toBe(matrixCase.status);
      expect(result.body).toEqual({ code: matrixCase.code });
      expect(harness.rest.calls.length).toBe(0);
      for (const line of result.logs) expect(line).toMatch(SAFE_LOG_PATTERN);
      harness.dispose();
    },
  );

  it.each(ENVELOPE_MATRIX)(
    'rejects a request envelope carrying $name',
    async (matrixCase) => {
      const harness = createHarness();
      const result = await harness.call({ bodyJson: matrixCase.bodyJson });
      expect(result.status).toBe(400);
      expect(result.body).toEqual({ code: 'envelope-invalid' });
      expect(harness.rest.calls.length).toBe(0);
      harness.dispose();
    },
  );

  it('removes the retired body, bodyRaw and header fallbacks', async () => {
    for (const request of [
      { bodyRaw: JSON.stringify(envelope(STAGE_OPERATION)) },
      { body: JSON.stringify(envelope(STAGE_OPERATION)) },
      { body: envelope(STAGE_OPERATION) },
      { headers: { 'x-operation-id': STAGE_OPERATION } },
    ]) {
      const harness = createHarness();
      const result = await harness.call(request);
      expect(result.status).toBe(400);
      expect(result.body).toEqual({ code: 'envelope-invalid' });
      expect(harness.rest.calls.length).toBe(0);
      harness.dispose();
    }
  });

  it('parses the bounded bodyText envelope of the official runtime', async () => {
    const harness = createHarness();
    const missing = await harness.call({
      bodyText: JSON.stringify(envelope('op-stage-9999')),
    });
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('operation-unknown');
    expect(harness.rest.calls.length).toBeGreaterThan(0);
    harness.dispose();
  });

  it('rejects malformed and oversized text envelopes', async () => {
    const oversized = createHarness();
    const big = await oversized.call({
      bodyText: JSON.stringify({
        operationId: 'op-stage-0001',
        padding: 'x'.repeat(4096),
      }),
    });
    expect(big.status).toBe(400);
    expect(big.body).toEqual({ code: 'envelope-invalid' });
    expect(oversized.rest.calls.length).toBe(0);
    oversized.dispose();

    const malformed = createHarness();
    const broken = await malformed.call({ bodyText: '{ not json' });
    expect(broken.status).toBe(400);
    expect(broken.body).toEqual({ code: 'envelope-invalid' });
    expect(malformed.rest.calls.length).toBe(0);
    malformed.dispose();
  });

  it('keeps publication disabled unless the trusted flag is exactly true', async () => {
    for (const flag of [undefined, '', 'TRUE', 'true ', '1', 'yes']) {
      const harness = createHarness({ publishEnabled: false });
      harness.setEnv('INTERMED_SYNTHETIC_PUBLISH_ENABLED', flag);
      const result = await harness.call({
        bodyJson: envelope('op-publish-0001'),
      });
      expect(result.status, String(flag)).toBe(403);
      expect(result.body, String(flag)).toEqual({
        code: 'publication-disabled',
      });
      expect(harness.rest.calls.length, String(flag)).toBe(0);
      harness.dispose();
    }
  });

  it('reports an unknown private operation as a constant code', async () => {
    const harness = createHarness();
    const result = await harness.call({
      bodyJson: envelope('op-stage-9999'),
    });
    expect(result.status).toBe(404);
    expect(result.body).toEqual({
      code: 'operation-unknown',
      operationRef: expect.stringMatching(/^[0-9a-f]{12}$/),
    });
    for (const line of result.logs) expect(line).toMatch(SAFE_LOG_PATTERN);
    harness.dispose();
  });

  it('never echoes the dummy secret sentinel on a thrown backend fault', async () => {
    const harness = createHarness();
    harness.rest.failWhen(() => true, {
      error: new Error(`backend exploded with ${SENTINEL}`),
    });
    const result = await harness.call({
      bodyJson: envelope('op-stage-9999'),
    });
    expect(result.status).toBe(500);
    expect(result.body.code).toBe('backend-error');
    const rendered = JSON.stringify(result.body) + result.logs.join('\n');
    expect(rendered).not.toContain(SENTINEL);
    expect(rendered).not.toContain('exploded');
    for (const line of result.logs) expect(line).toMatch(SAFE_LOG_PATTERN);
    harness.dispose();
  });

  it('never echoes the dummy secret sentinel on a failing backend response', async () => {
    const harness = createHarness();
    harness.rest.failWhen(() => true, {
      status: 503,
      message: `upstream carried ${SENTINEL}`,
    });
    const result = await harness.call({
      bodyJson: envelope('op-stage-9999'),
    });
    expect(result.status).toBe(500);
    expect(result.body.code).toBe('backend-error');
    const rendered = JSON.stringify(result.body) + result.logs.join('\n');
    expect(rendered).not.toContain(SENTINEL);
    expect(rendered).not.toContain('upstream');
    harness.dispose();
  });

  it('writes only bounded, content-free log events', async () => {
    const harness = createHarness();
    await harness.call({ method: 'GET' });
    await harness.call({ bodyJson: { operationId: 'BAD ID' } });
    await harness.call({ bodyJson: envelope('op-stage-9999') });
    expect(harness.logs.length).toBeGreaterThan(0);
    for (const line of harness.logs) {
      expect(line).toMatch(SAFE_LOG_PATTERN);
      expect(line.length).toBeLessThanOrEqual(96);
    }
    harness.dispose();
  });
});
