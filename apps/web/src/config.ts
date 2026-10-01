import { z } from 'zod';

export interface AppConfig {
  readonly mode: 'mock';
}

const publicEnvironment = z.strictObject({
  VITE_RUNTIME_MODE: z.literal('mock').default('mock'),
});

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
