/**
 * Constant response codes and bounded, content-free observability.
 *
 * Responses and log events never carry request bytes, raw material, backend
 * messages or credential values: only constant codes and short derived refs.
 */

export const RESPONSE_CODES = Object.freeze({
  methodNotAllowed: 'method-not-allowed',
  runtimeCredentialMissing: 'runtime-credential-missing',
  runtimeContextRejected: 'runtime-context-rejected',
  envelopeInvalid: 'envelope-invalid',
  publicationDisabled: 'publication-disabled',
  operationUnknown: 'operation-unknown',
  operationRejected: 'operation-rejected',
  publicationBusy: 'publication-busy',
  publicationCollision: 'publication-collision',
  staleBaseline: 'stale-baseline',
  backendError: 'backend-error',
  operationFailed: 'operation-failed',
  staged: 'staged',
  quarantined: 'quarantined',
  published: 'published',
  alreadyPublished: 'already-published',
});

export const SAFE_EVENT_NAMES = Object.freeze([
  'request-rejected',
  'publication-disabled',
  'operation-unknown',
  'operation-rejected',
  'staged',
  'quarantined',
  'published',
  'already-published',
  'publication-busy',
  'publication-collision',
  'stale-baseline',
  'backend-error',
  'operation-failed',
  'core-log',
  'lock-release-failed',
]);

const REF_LENGTH = 12;

/**
 * Return the first 12 digest characters of a kind-scoped reference, stable for
 * the same kind and stringified value across retries.
 */
export function deriveRef(sha256, kind, value) {
  return sha256
    .hash(`intermed-ref/v1|${kind}|${String(value)}`)
    .slice(0, REF_LENGTH);
}

/** One bounded log event: `import-anmdmr event=<event> ref=<ref>`. */
export function safeLog(log, event, ref) {
  const name = SAFE_EVENT_NAMES.includes(event) ? event : 'operation-failed';
  const marker =
    typeof ref === 'string' && /^[0-9a-f]{12}$/.test(ref) ? ref : 'none';
  log(`import-anmdmr event=${name} ref=${marker}`);
}
