import { z } from 'zod';

/**
 * Public, nonsecret identifiers of the published-dataset reader. They locate
 * public resources only: no key, token or credential may ever appear here.
 */
export interface PublishedDatasetConfig {
  readonly endpoint: string;
  readonly projectId: string;
  readonly publishedBucketId: string;
}

export interface AppConfig {
  readonly mode: 'mock';
  readonly publishedDatasets?: PublishedDatasetConfig;
}

const invalidConfigurationMessage =
  'Invalid public configuration. Use VITE_RUNTIME_MODE=mock with optional public reader identifiers.';

/** Credential shapes that must never ship in a frontend build. */
const credentialShapes: readonly RegExp[] = [
  /standard_[A-Za-z0-9._-]{8,}/,
  /\b[a-fA-F0-9]{32,}\b/,
  /(?<![A-Za-z0-9+/=])[A-Za-z0-9+]{56,}={0,2}(?![A-Za-z0-9+/=])/,
];

/**
 * Whether a public value has the shape of credential material. Every frontend
 * variable is public, so key-shaped values are refused instead of shipped.
 */
export function looksLikeCredential(value: string): boolean {
  return credentialShapes.some((shape) => shape.test(value));
}

/** Appwrite resource identifiers are short public slugs. */
const resourceIdentifier = z
  .string()
  .min(1)
  .max(36)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);

/** Public API base URL: https only, without embedded credentials or queries. */
const apiEndpoint = z
  .string()
  .min(1)
  .max(200)
  .regex(/^https:\/\/[^/\s@?#]+\/[^?\s#]*$/);

const publicEnvironment = z.strictObject({
  VITE_RUNTIME_MODE: z.literal('mock').default('mock'),
  VITE_PUBLISHED_DATASETS_ENDPOINT: apiEndpoint.optional(),
  VITE_APPWRITE_PROJECT_ID: resourceIdentifier.optional(),
  VITE_APPWRITE_PUBLISHED_BUCKET_ID: resourceIdentifier.optional(),
});

/**
 * Parse VITE_ environment values, defaulting an omitted runtime mode to mock.
 * Ignore non-VITE_ keys and reject unknown public keys, unsupported modes,
 * credential-shaped values and partial reader identifiers.
 * @throws {Error} When public configuration is invalid, without exposing values.
 */
export function parseConfig(env: Record<string, unknown>): AppConfig {
  const values = Object.fromEntries(
    Object.entries(env).filter(([key]) => key.startsWith('VITE_')),
  );
  if (
    Object.values(values).some(
      (value) => typeof value === 'string' && looksLikeCredential(value),
    )
  )
    throw new Error(invalidConfigurationMessage);
  const result = publicEnvironment.safeParse(values);
  if (!result.success) throw new Error(invalidConfigurationMessage);
  const {
    VITE_PUBLISHED_DATASETS_ENDPOINT: endpoint,
    VITE_APPWRITE_PROJECT_ID: projectId,
    VITE_APPWRITE_PUBLISHED_BUCKET_ID: publishedBucketId,
    VITE_RUNTIME_MODE: mode,
  } = result.data;
  const identifiers = [endpoint, projectId, publishedBucketId];
  const configured = identifiers.filter((value) => value !== undefined).length;
  if (configured !== 0 && configured !== identifiers.length)
    throw new Error(invalidConfigurationMessage);
  if (!endpoint || !projectId || !publishedBucketId) return { mode };
  return {
    mode,
    publishedDatasets: { endpoint, projectId, publishedBucketId },
  };
}
