/**
 * Shared registry-tarball boundary helpers for the importer test fixtures.
 *
 * `artifact.test.ts` seeds isolated npm caches from the committed lockfile and
 * needs the exact pinned tarball bytes. These helpers keep the install
 * network boundary in one place so the focused security fixture tests can
 * exercise it with an injected fake fetch (never the real network).
 */
import { createHash } from 'node:crypto';

/** The one and only fetch origin the install boundary ever allows. */
const NPM_REGISTRY_ORIGIN = 'https://registry.npmjs.org';

/** First ssri digest of an integrity string (`sha512-<base64>`). */
export function integrityDigest(integrity: string): {
  algorithm: string;
  expected: string;
} {
  const first = integrity.trim().split(/\s+/)[0] ?? '';
  const dash = first.indexOf('-');
  return {
    algorithm: first.slice(0, dash),
    expected: first.slice(dash + 1),
  };
}

/** Verify bytes against the first ssri digest of an integrity string. */
export function matchesIntegrity(bytes: Buffer, integrity: string): boolean {
  const { algorithm, expected } = integrityDigest(integrity);
  return createHash(algorithm).update(bytes).digest('base64') === expected;
}

/** Parse a URL or fail closed with the boundary error. */
function parseUrl(resolved: string): URL {
  try {
    return new URL(resolved);
  } catch {
    throw new Error(
      `Registry tarball URL rejected: not a valid URL: ${resolved}`,
    );
  }
}

/**
 * npm registry tarball path layout: `/{name}/-/{name}-{version}.tgz`, or
 * `/@{scope}/{name}/-/{name}-{version}.tgz` for scoped packages. Only the
 * shape is checked — the actual declared path of the validated URL is what
 * gets fetched, so the currently pinned version is never hardcoded.
 */
function isDeclaredTarballPath(pathname: string): boolean {
  const segments = pathname.slice(1).split('/');
  if (!segments.every((segment) => segment.length > 0)) return false;
  if (segments[segments.length - 2] !== '-') return false;
  const file = segments[segments.length - 1] ?? '';
  const name = segments[segments.length - 3] ?? '';
  if (!file.endsWith('.tgz') || !file.startsWith(`${name}-`)) return false;
  if (segments.length === 3) return true;
  if (segments.length === 4) return (segments[0] ?? '').startsWith('@');
  return false;
}

/**
 * Validate the lockfile `resolved` URL before ANY fetch happens (fail
 * closed): the exact https registry.npmjs.org origin, no userinfo, query or
 * fragment, and a declared npm tarball path. Returns the parsed URL so the
 * fetch target is exactly the validated pin.
 */
export function parseRegistryTarballUrl(resolved: string): URL {
  const url = parseUrl(resolved);
  if (url.protocol !== 'https:') {
    throw new Error(
      `Registry tarball URL rejected: must use https: ${resolved}`,
    );
  }
  if (url.origin !== NPM_REGISTRY_ORIGIN) {
    throw new Error(
      `Registry tarball URL rejected: outside the npm registry origin: ${resolved}`,
    );
  }
  if (url.username !== '' || url.password !== '') {
    throw new Error(
      `Registry tarball URL rejected: must not carry userinfo: ${resolved}`,
    );
  }
  if (url.search !== '') {
    throw new Error(
      `Registry tarball URL rejected: must not carry a query: ${resolved}`,
    );
  }
  if (url.hash !== '') {
    throw new Error(
      `Registry tarball URL rejected: must not carry a fragment: ${resolved}`,
    );
  }
  if (!isDeclaredTarballPath(url.pathname)) {
    throw new Error(
      `Registry tarball URL rejected: not a declared registry tarball path: ${resolved}`,
    );
  }
  return url;
}

/**
 * Fetch the pinned registry tarball and verify its bytes against the
 * committed lock integrity before the caller caches them (fail closed).
 * The pin is fully validated before ANY fetch, and the fetch forbids
 * redirects (`redirect: 'error'`), so it can never cross origins.
 *
 * `fetchImpl` is an injection seam for the focused security fixture tests;
 * production test code uses the default global fetch.
 */
export async function registryTarballBytes(
  resolved: string,
  integrity: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Buffer> {
  const url = parseRegistryTarballUrl(resolved);
  const response = await fetchImpl(url, { redirect: 'error' });
  if (!response.ok) {
    throw new Error(
      `Pinned tarball fetch failed for ${resolved}: HTTP ${response.status}`,
    );
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!matchesIntegrity(bytes, integrity)) {
    throw new Error(
      `Pinned tarball failed integrity verification: ${resolved}`,
    );
  }
  return bytes;
}
