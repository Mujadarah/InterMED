import { z } from 'zod';

export interface AppConfig {
  readonly mode: 'mock';
}

const publicEnvironment = z.strictObject({
  VITE_RUNTIME_MODE: z.literal('mock').default('mock'),
});

/**
 * Parse VITE_ environment values, defaulting an omitted runtime mode to mock.
 * Ignore non-VITE_ keys and reject unknown public keys or unsupported modes.
 * @throws {Error} When public configuration is invalid, without exposing values.
 */
export function parseConfig(env: Record<string, unknown>): AppConfig {
  const values = Object.fromEntries(
    Object.entries(env).filter(([key]) => key.startsWith('VITE_')),
  );
  const result = publicEnvironment.safeParse(values);
  if (!result.success)
    throw new Error(
      'Invalid public configuration. Use VITE_RUNTIME_MODE=mock only.',
    );
  return { mode: result.data.VITE_RUNTIME_MODE };
}
