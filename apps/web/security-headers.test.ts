import { expect, it } from 'vitest';
import {
  buildSecurityHeaders,
  buildSecurityHeadersManifest,
  buildSwSecurityHeaders,
  cspDirectives,
  headerContentSecurityPolicy,
  metaContentSecurityPolicy,
  permissionsPolicy,
  renderHeadersFile,
} from './security-headers';

/** The meta CSP shipped before M12; the header work must not change it. */
const legacyMetaCsp = [
  "default-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
].join('; ');

it('keeps the meta CSP byte-identical to the shipped policy', () => {
  expect(metaContentSecurityPolicy).toBe(legacyMetaCsp);
  expect(metaContentSecurityPolicy).toBe(
    Object.entries(cspDirectives)
      .map(([name, value]) => `${name} ${value}`)
      .join('; '),
  );
});

it('builds the header CSP from the meta CSP plus frame-ancestors', () => {
  expect(headerContentSecurityPolicy).toBe(
    `${metaContentSecurityPolicy}; frame-ancestors 'none'`,
  );
  expect(buildSecurityHeaders()['Content-Security-Policy']).toBe(
    headerContentSecurityPolicy,
  );
});

it.each([metaContentSecurityPolicy, headerContentSecurityPolicy])(
  'allows no unsafe-inline, unsafe-eval or wildcard sources: %s',
  (policy) => {
    expect(policy).not.toMatch(/\bunsafe-(?:inline|eval)\b/);
    expect(policy.split(';')).toEqual(
      expect.not.arrayContaining([expect.stringContaining('*')]),
    );
    for (const directive of policy.split(';'))
      expect(directive.trim().split(/\s+/)).not.toContain('*');
  },
);

it('returns the full hardening header set', () => {
  expect(buildSecurityHeaders()).toEqual({
    'Content-Security-Policy': headerContentSecurityPolicy,
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': permissionsPolicy,
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Opener-Policy': 'same-origin',
  });
  for (const feature of [
    'camera',
    'microphone',
    'geolocation',
    'payment',
    'usb',
    'interest-cohort',
  ])
    expect(permissionsPolicy).toContain(`${feature}=()`);
});

it('carries the CSP on /sw.js with no-cache', () => {
  const sw = buildSwSecurityHeaders();
  expect(sw['Content-Security-Policy']).toBe(headerContentSecurityPolicy);
  expect(sw['Cache-Control']).toBe('no-cache');
});

it('renders _headers with every header on /* and the CSP on /sw.js', () => {
  const file = renderHeadersFile();
  const headers = buildSecurityHeaders();
  const sw = buildSwSecurityHeaders();
  expect(file.startsWith('/*\n')).toBe(true);
  expect(file).toContain('/sw.js\n');
  for (const [name, value] of Object.entries(headers))
    expect(file).toContain(`  ${name}: ${value}`);
  for (const [name, value] of Object.entries(sw))
    expect(file).toContain(`  ${name}: ${value}`);
});

it('exposes a neutral manifest agreeing with buildSecurityHeaders()', () => {
  expect(buildSecurityHeadersManifest()).toEqual({
    routes: [
      { path: '/*', headers: buildSecurityHeaders() },
      { path: '/sw.js', headers: buildSwSecurityHeaders() },
    ],
  });
});
