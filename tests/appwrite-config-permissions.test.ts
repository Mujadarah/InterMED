import { describe, expect, it } from 'vitest';
import {
  appwriteConfigPaths,
  appwriteGrants,
  appwriteResources,
  findResource,
  loadAppwriteConfig,
  needsSession,
  parseGrant,
  readTextFile,
} from './support/appwrite-config';
import type { AppwriteProjectConfig } from './support/appwrite-config';

const development = await loadAppwriteConfig(appwriteConfigPaths.development);
const production = await loadAppwriteConfig(appwriteConfigPaths.production);

/** Resources whose intended audience is the unauthenticated reference reader. */
const approvedPublicReads = [
  'published-datasets',
  'dataset-bundles',
  'dataset-versions',
];

/** Resources that must stay private: raw material, quarantine and run metadata. */
const privateResources = [
  'raw-sources',
  'quarantine',
  'import-run-logs',
  'import-runs',
];

/**
 * Explicit security-flag expectations per resource, in the field names of the
 * current config format: `rowSecurity` on tables, `fileSecurity` on buckets.
 * The public resources must not rely on per-row or per-file grants — their read
 * is granted at the resource level — and the private resources must not enable
 * per-row or per-file grants either: no such grant is documented, and it would
 * bypass their empty `$permissions` set.
 */
const publicSecurityFlags = [
  ['tables', 'dataset-versions', 'rowSecurity'],
  ['tables', 'dataset-bundles', 'rowSecurity'],
  ['buckets', 'published-datasets', 'fileSecurity'],
] as const;

const privateSecurityFlags = [
  ['tables', 'import-runs', 'rowSecurity'],
  ['buckets', 'raw-sources', 'fileSecurity'],
  ['buckets', 'quarantine', 'fileSecurity'],
  ['buckets', 'import-run-logs', 'fileSecurity'],
] as const;

const importerStubPath = 'infra/appwrite/functions/import-anmdmr/src/main.js';

/**
 * Identifiers the admin importer stub must never mention before the real
 * importer exists: no transport, no storage writes and no reference content.
 */
const stubForbiddenWords = [
  'node-appwrite',
  'fetch(',
  'require(',
  'import ',
  'x-appwrite-key',
  'process.env',
  'createrow',
  'createfile',
  'updaterow',
  'deleterow',
  'upload',
  'medication',
  'ingredient',
  'dose',
  'interaction',
  'prescription',
  'patient',
];

describe.each([
  ['development', development],
  ['production', production],
])(
  'Appwrite %s configuration as code',
  (label, config: AppwriteProjectConfig) => {
    it('uses an isolated Frankfurt project with an https API endpoint', () => {
      expect(config.projectId, label).toMatch(/^intermed-(dev|prod)$/);
      expect(config.endpoint, label).toBe('https://fra.cloud.appwrite.io/v1');
    });

    it('declares the dataset publication database with its tables', () => {
      const databases = (config.tablesDB ?? []).map(({ $id }) => $id);
      expect(databases, label).toEqual(['intermed-datasets']);
      const tables = (config.tables ?? []).map(({ $id }) => $id).sort();
      expect(tables, label).toEqual([
        'dataset-bundles',
        'dataset-versions',
        'import-runs',
      ]);
      for (const table of config.tables ?? [])
        expect(table.databaseId, `${label}/${table.$id}`).toBe(
          'intermed-datasets',
        );
    });

    it('declares the private and public storage buckets', () => {
      const buckets = (config.buckets ?? []).map(({ $id }) => $id).sort();
      expect(buckets, label).toEqual([
        'import-run-logs',
        'published-datasets',
        'quarantine',
        'raw-sources',
      ]);
    });

    it('grants read("any") on exactly the published dataset resources', () => {
      const publicReads = appwriteGrants(config)
        .filter(({ grant }) => grant === 'read("any")')
        .map(({ resourceId }) => resourceId)
        .sort();
      expect(publicReads, label).toEqual([...approvedPublicReads].sort());
    });

    it('declares no permission outside the approved public reads', () => {
      const grants = appwriteGrants(config)
        .map(({ resourceId, grant }) => `${resourceId}: ${grant}`)
        .sort();
      expect(grants, label).toEqual(
        [...approvedPublicReads]
          .map((resourceId) => `${resourceId}: read("any")`)
          .sort(),
      );
    });

    it('grants no create, update, delete or write access to any role', () => {
      const writeGrants = appwriteGrants(config).filter(({ grant }) => {
        const verb = parseGrant(grant)?.verb;
        return verb !== 'read';
      });
      expect(writeGrants, label).toEqual([]);
    });

    it('uses only the "any" role so public reads need no Auth session', () => {
      const sessionGrants = appwriteGrants(config).filter(({ grant }) => {
        const role = parseGrant(grant)?.role;
        return role !== undefined && needsSession(role);
      });
      expect(sessionGrants, label).toEqual([]);
    });

    it('keeps raw, quarantine, run-log and import-run resources private', () => {
      for (const id of privateResources) {
        const resource =
          id === 'import-runs'
            ? findResource(config, 'tables', id)
            : findResource(config, 'buckets', id);
        expect(resource.$permissions ?? [], `${label}/${id}`).toEqual([]);
      }
    });

    it('grants public reads at the resource level, never per row or per file', () => {
      for (const [kind, id, field] of publicSecurityFlags) {
        const resource = findResource(config, kind, id);
        expect(resource[field], `${label}/${id} ${field}`).toBe(false);
        expect(resource.$permissions ?? [], `${label}/${id}`).toContain(
          'read("any")',
        );
      }
    });

    it('enables no per-row or per-file grants on private resources', () => {
      for (const [kind, id, field] of privateSecurityFlags) {
        const resource = findResource(config, kind, id);
        expect(resource[field], `${label}/${id} ${field}`).toBe(false);
        expect(resource.$permissions ?? [], `${label}/${id}`).toEqual([]);
      }
    });

    it('states a security flag for every table and every bucket', () => {
      const expected = [...publicSecurityFlags, ...privateSecurityFlags]
        .map(([kind, id, field]) => `${kind}/${id}.${field}`)
        .sort();
      const declared = [
        ...(config.tables ?? []).map(({ $id }) => `tables/${$id}.rowSecurity`),
        ...(config.buckets ?? []).map(
          ({ $id }) => `buckets/${$id}.fileSecurity`,
        ),
      ].sort();
      expect(declared, label).toEqual(expected);
    });

    it('gives the admin importer function no public execute and no secrets', () => {
      const importer = findResource(config, 'functions', 'import-anmdmr');
      expect(importer.execute ?? [], label).toEqual([]);
      expect(importer.scopes ?? [], label).toEqual([]);
      expect(importer.vars ?? [], label).toEqual([]);
      expect(importer.enabled, label).toBe(true);
      expect(importer.schedule ?? '', label).toBe('');
    });

    it('documents SPA fallback and monorepo build settings on the site', () => {
      expect(config.sites ?? [], label).toHaveLength(1);
      const site = config.sites?.[0];
      if (!site) throw new Error(`${label}: missing site resource`);
      expect(site.fallbackFile, label).toBe('index.html');
      expect(site.adapter, label).toBe('static');
      expect(site.framework, label).toBe('other');
      expect(site.buildRuntime, label).toBe('node-22');
      expect(site.enabled, label).toBe(true);
      expect(site.logging, label).toBe(true);

      if (label === 'development') {
        expect(site.$id, label).toBe('intermed-web-dev');
        expect(site.name, label).toBe('InterMED web (development)');
        expect(site.path, label).toBe('../..');
        expect(site.installCommand, label).toBe(
          'npx --yes --package=node@24.21.0 --package=npm@11.19.0 --call "node --version && npm --version && npm ci --no-fund"',
        );
        expect(site.buildCommand, label).toBe(
          'npx --yes --package=node@24.21.0 --package=npm@11.19.0 --call "npm run build --workspace @intermed/web"',
        );
        expect(site.outputDirectory, label).toBe('./apps/web/dist');
      } else {
        expect(site.$id, label).toBe('intermed-web-prod');
        expect(site.name, label).toBe('InterMED web (production)');
        expect(site.path, label).toBe('apps/web');
        expect(site.installCommand, label).toBe(
          'npm ci --prefix ../.. --no-fund',
        );
        expect(site.buildCommand, label).toBe('npm run build');
        expect(site.outputDirectory, label).toBe('./dist');
      }
    });

    it('never references the existing Milestone 2 test project or site', () => {
      const source = JSON.stringify(config);
      expect(source, label).not.toContain('6ac4b25b0012379cf3d0');
      expect(source, label).not.toContain('6ac4b3550003a26eea02');
    });

    it('keeps every resource identifier free of secret-looking values', () => {
      for (const { kind, resource } of appwriteResources(config)) {
        expect(resource.$id, `${label}/${kind}`).toMatch(
          /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/,
        );
      }
    });
  },
);

it('isolates development and production projects from each other', () => {
  expect(development.projectId).not.toBe(production.projectId);
  expect(development.projectId).toBe('intermed-dev');
  expect(production.projectId).toBe('intermed-prod');
});

it('runs the importer stub as a non-clinical stub without side effects', async () => {
  const source = (await readTextFile(importerStubPath)).toLowerCase();
  for (const word of stubForbiddenWords)
    expect(source, `import-anmdmr stub mentions "${word}"`).not.toContain(word);
  expect(source).toContain('stub-not-implemented');
});
