import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository-relative paths of the Appwrite configuration as code. */
export const appwriteConfigPaths = {
  development: 'infra/appwrite/appwrite.config.development.json',
  production: 'infra/appwrite/appwrite.config.production.json',
} as const;

export const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
);

export type AppwriteResourceKind =
  'tablesDB' | 'tables' | 'buckets' | 'functions' | 'sites';

export interface AppwriteResourceConfig {
  readonly $id: string;
  readonly name: string;
  readonly $permissions?: readonly string[];
  readonly execute?: readonly string[];
  readonly [key: string]: unknown;
}

export interface AppwriteProjectConfig {
  readonly projectId: string;
  readonly endpoint: string;
  readonly tablesDB?: readonly AppwriteResourceConfig[];
  readonly tables?: readonly AppwriteResourceConfig[];
  readonly buckets?: readonly AppwriteResourceConfig[];
  readonly functions?: readonly AppwriteResourceConfig[];
  readonly sites?: readonly AppwriteResourceConfig[];
  readonly [key: string]: unknown;
}

export interface AppwriteResource {
  readonly kind: AppwriteResourceKind;
  readonly resource: AppwriteResourceConfig;
}

export interface AppwriteGrant {
  readonly resourceId: string;
  readonly kind: AppwriteResourceKind;
  readonly grant: string;
}

/**
 * Read one Appwrite configuration file as code.
 * @throws {Error} When the file is missing or not valid JSON.
 */
export async function loadAppwriteConfig(
  relativePath: string,
): Promise<AppwriteProjectConfig> {
  const source = await readFile(join(repositoryRoot, relativePath), 'utf8');
  return JSON.parse(source) as AppwriteProjectConfig;
}

/**
 * Flatten every resource of a project configuration with its kind.
 */
export function appwriteResources(
  config: AppwriteProjectConfig,
): readonly AppwriteResource[] {
  const kinds: readonly (readonly [
    AppwriteResourceKind,
    readonly AppwriteResourceConfig[] | undefined,
  ])[] = [
    ['tablesDB', config.tablesDB],
    ['tables', config.tables],
    ['buckets', config.buckets],
    ['functions', config.functions],
    ['sites', config.sites],
  ];
  return kinds.flatMap(([kind, resources]) =>
    (resources ?? []).map((resource) => ({ kind, resource })),
  );
}

/**
 * Find one resource by identifier.
 * @throws {Error} When the resource is not declared in the configuration.
 */
export function findResource(
  config: AppwriteProjectConfig,
  kind: AppwriteResourceKind,
  id: string,
): AppwriteResourceConfig {
  const match = appwriteResources(config).find(
    (entry) => entry.kind === kind && entry.resource.$id === id,
  );
  if (!match) throw new Error(`Missing ${kind} resource: ${id}`);
  return match.resource;
}

/**
 * Flatten every declared permission grant with its resource identifier.
 */
export function appwriteGrants(
  config: AppwriteProjectConfig,
): readonly AppwriteGrant[] {
  return appwriteResources(config).flatMap(({ kind, resource }) =>
    (resource.$permissions ?? []).map((grant) => ({
      resourceId: resource.$id,
      kind,
      grant,
    })),
  );
}

/**
 * Parse one Appwrite permission string such as `read("any")`.
 */
export function parseGrant(
  grant: string,
): { readonly verb: string; readonly role: string } | null {
  const match = /^([a-z]+)\("([^"]+)"\)$/.exec(grant);
  const verb = match?.[1];
  const role = match?.[2];
  if (!verb || !role) return null;
  return { verb, role };
}

/** Role prefixes that require an account or an anonymous Auth session. */
const sessionRoles = ['user:', 'team:', 'member:', 'users', 'guests'];

/**
 * Whether a permission role needs any Appwrite Auth session at all.
 */
export function needsSession(role: string): boolean {
  return sessionRoles.some(
    (candidate) =>
      role === candidate ||
      role.startsWith(`${candidate}/`) ||
      role.startsWith(candidate),
  );
}

/**
 * Recursively list files under a repository-relative directory.
 */
export async function listFiles(
  relativePath: string,
): Promise<readonly string[]> {
  const entries = await readdir(join(repositoryRoot, relativePath), {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        !entry.parentPath.split(/[\\/]/).includes('node_modules'),
    )
    .map((entry) =>
      join(entry.parentPath, entry.name)
        .replaceAll('\\', '/')
        .replace(`${repositoryRoot.replaceAll('\\', '/')}/`, ''),
    )
    .sort();
}

/**
 * Read one repository-relative file as UTF-8 text.
 */
export async function readTextFile(relativePath: string): Promise<string> {
  return readFile(join(repositoryRoot, relativePath), 'utf8');
}
