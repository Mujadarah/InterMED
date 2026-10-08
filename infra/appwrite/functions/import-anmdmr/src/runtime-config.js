/**
 * Minimal trusted runtime configuration.
 *
 * Authority comes from the owner-created private operation intent and the
 * trusted runtime environment only. The server key below is an I/O credential
 * for the private Appwrite REST calls; it is never authority by itself and is
 * never read from a request.
 */

export const TRUSTED_PROJECT_ID = 'intermed-dev';
export const TRUSTED_FUNCTION_ID = 'import-anmdmr';
/** The FRA endpoint strictly: no other region, no decorated variant. */
export const TRUSTED_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';

export const DATABASE_ID = 'intermed-datasets';
export const TABLES = Object.freeze({
  publishedVersions: 'dataset-versions',
  publishedBundles: 'dataset-bundles',
  runs: 'import-runs',
});
export const BUCKETS = Object.freeze({
  raw: 'raw-sources',
  quarantine: 'quarantine',
  logs: 'import-run-logs',
  published: 'published-datasets',
});

export const SERVER_KEY_ENV = 'INTERMED_SERVER_KEY';
export const PUBLISH_FLAG_ENV = 'INTERMED_SYNTHETIC_PUBLISH_ENABLED';

/**
 * Read the trusted runtime context from environment variables only. A missing
 * credential and a foreign runtime context are rejected with distinct constant
 * codes and no request header can stand in for either.
 */
export function readTrustedRuntime(env) {
  const serverKey = env[SERVER_KEY_ENV];
  if (typeof serverKey !== 'string' || serverKey.length === 0) {
    return { ok: false, code: 'runtime-credential-missing' };
  }
  if (env.APPWRITE_ENDPOINT !== TRUSTED_ENDPOINT) {
    return { ok: false, code: 'runtime-context-rejected' };
  }
  if (env.APPWRITE_FUNCTION_PROJECT_ID !== TRUSTED_PROJECT_ID) {
    return { ok: false, code: 'runtime-context-rejected' };
  }
  if (env.APPWRITE_FUNCTION_ID !== TRUSTED_FUNCTION_ID) {
    return { ok: false, code: 'runtime-context-rejected' };
  }
  return {
    ok: true,
    serverKey,
    publishEnabled: env[PUBLISH_FLAG_ENV] === 'true',
  };
}
