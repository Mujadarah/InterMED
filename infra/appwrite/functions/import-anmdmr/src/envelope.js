/* global Buffer */
/**
 * Strict bounded request envelope.
 *
 * The official Appwrite runtime exposes the parsed body as `bodyJson` and the
 * raw text as `bodyText`. Only those two are read. The envelope is exactly
 * `{ operationId }`: no inline bytes, config, endpoints, keys, actors, approval
 * flags or project values are accepted from a caller, and the retired body,
 * bodyRaw and header fallbacks are gone.
 */

export const MAX_ENVELOPE_BYTES = 2048;

/**
 * Reserved operation reference shapes. The prefix binds the operation kind to
 * the private intent purpose, so a stage reference can never carry an approval
 * intent and publication stays fail-closed behind its own reference prefix.
 */
export const OPERATION_ID_PATTERN =
  /^op-(stage|publish)-[a-z0-9][a-z0-9-]{0,43}$/;

const ENVELOPE_KEYS = ['operationId'];

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readEnvelopeValue(req) {
  if (isPlainObject(req.bodyJson)) return { value: req.bodyJson };
  if (req.bodyJson !== undefined && req.bodyJson !== null) return null;
  if (typeof req.bodyText !== 'string') return null;
  const byteLength = Buffer.byteLength(req.bodyText, 'utf8');
  if (byteLength > MAX_ENVELOPE_BYTES) return null;
  try {
    const parsed = JSON.parse(req.bodyText);
    if (!isPlainObject(parsed)) return null;
    return { value: parsed };
  } catch {
    return null;
  }
}

/** Parse the envelope. Anything besides `{ operationId }` fails closed. */
export function parseEnvelope(req) {
  const envelope = readEnvelopeValue(req);
  if (!envelope) return { ok: false };
  const keys = Object.keys(envelope.value);
  if (keys.length !== ENVELOPE_KEYS.length) return { ok: false };
  if (keys[0] !== ENVELOPE_KEYS[0]) return { ok: false };
  const operationId = envelope.value.operationId;
  if (typeof operationId !== 'string') return { ok: false };
  if (!OPERATION_ID_PATTERN.test(operationId)) return { ok: false };
  return { ok: true, operationId };
}

/** Whether the reference prefix is the publication kind. */
export function isPublishReference(operationId) {
  return operationId.startsWith('op-publish-');
}
