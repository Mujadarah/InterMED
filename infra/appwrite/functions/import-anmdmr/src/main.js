/* global process */
import { deserializeCatalogue } from '@intermed/domain';
import {
  canonicalizeConfig,
  publish,
  PublicationConflictError,
  stage,
} from '@intermed/importer';
import crypto from 'node:crypto';
import { createAppwriteStore } from './appwrite-store.js';
import { deriveRef, RESPONSE_CODES, safeLog } from './codes.js';
import { parseEnvelope } from './envelope.js';
import { runOperation } from './operations.js';
import {
  readTrustedRuntime,
  TRUSTED_ENDPOINT,
  TRUSTED_PROJECT_ID,
} from './runtime-config.js';

const sha256 = {
  hash: (data) => crypto.createHash('sha256').update(data).digest('hex'),
};

function responseFor(outcome) {
  const body = { code: outcome.code };
  if (outcome.operationRef) body.operationRef = outcome.operationRef;
  if (outcome.runRef) body.runRef = outcome.runRef;
  if (outcome.datasetVersionRef)
    body.datasetVersionRef = outcome.datasetVersionRef;
  if (outcome.summary) body.summary = outcome.summary;
  return body;
}

/**
 * Entry point of the private runner. Authority comes from the trusted runtime
 * context and the owner-created private intent behind the reference; the body
 * is exactly `{ operationId }` and nothing else is read from the request.
 */
export default async ({ req, res, log }) => {
  if (req.method !== 'POST') {
    safeLog(log, 'request-rejected');
    return res.json({ code: RESPONSE_CODES.methodNotAllowed }, 405);
  }

  const runtime = readTrustedRuntime(process.env);
  if (!runtime.ok) {
    safeLog(log, 'request-rejected');
    const status =
      runtime.code === RESPONSE_CODES.runtimeCredentialMissing ? 401 : 403;
    return res.json({ code: runtime.code }, status);
  }

  const envelope = parseEnvelope(req);
  if (!envelope.ok) {
    safeLog(log, 'request-rejected');
    return res.json({ code: RESPONSE_CODES.envelopeInvalid }, 400);
  }

  const operationRef = deriveRef(sha256, 'operation', envelope.operationId);
  let outcome;
  try {
    const store = createAppwriteStore({
      fetch: globalThis.fetch,
      endpoint: TRUSTED_ENDPOINT,
      projectId: TRUSTED_PROJECT_ID,
      serverKey: runtime.serverKey,
    });
    outcome = await runOperation({
      operationId: envelope.operationId,
      deps: {
        core: {
          stage,
          publish,
          canonicalizeConfig,
          newPublicationConflict: () => new PublicationConflictError(),
        },
        deserializeCatalogue,
        store,
        sha256,
        now: () => new Date(),
        randomToken: () => crypto.randomBytes(24).toString('hex'),
        log,
        publishEnabled: runtime.publishEnabled,
      },
    });
  } catch (error) {
    const name = error && error.name;
    outcome = {
      status: 500,
      code:
        name === 'StoreError'
          ? RESPONSE_CODES.backendError
          : RESPONSE_CODES.operationFailed,
      operationRef,
    };
  }

  safeLog(log, outcome.code, outcome.operationRef);
  return res.json(responseFor(outcome), outcome.status);
};
