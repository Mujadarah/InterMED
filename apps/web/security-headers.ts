/**
 * Single source of truth for the InterMED response-header policy.
 *
 * The production meta CSP (injected by `vite.config.ts`) and the
 * header CSP (applied by any header-capable host/edge) are both derived
 * from {@link cspDirectives}, so the two can never drift. The header
 * policy adds only `frame-ancestors 'none'`, which a meta element cannot
 * carry, plus the non-CSP hardening headers below.
 *
 * No deployment or live host is configured here: this module only builds
 * the policy values. Host files (`dist/_headers`,
 * `dist/security-headers.json`) are emitted at build time by
 * `pwa/security-headers-build.ts`.
 */

/** CSP directives shared by the meta tag and the response header. */
export const cspDirectives: Record<string, string> = {
  'default-src': "'none'",
  'base-uri': "'none'",
  'object-src': "'none'",
  'frame-src': "'none'",
  'form-action': "'self'",
  'script-src': "'self'",
  'style-src': "'self'",
  'img-src': "'self'",
  'font-src': "'self'",
  'connect-src': "'self'",
  'manifest-src': "'self'",
  'worker-src': "'self'",
};

/** Directive order for serialization (insertion order of `cspDirectives`). */
const directiveOrder = Object.keys(cspDirectives);

function serializeDirectives(
  directives: Record<string, string>,
  extra?: ReadonlyArray<readonly [string, string]>,
): string {
  const entries = directiveOrder.map(
    (name) => `${name} ${directives[name]}` as string,
  );
  if (extra)
    for (const [name, value] of extra) entries.push(`${name} ${value}`);
  return entries.join('; ');
}

/** Value for the production `<meta http-equiv="Content-Security-Policy">`. */
export const metaContentSecurityPolicy: string =
  serializeDirectives(cspDirectives);

/**
 * Value for the `Content-Security-Policy` response header: the meta policy
 * plus `frame-ancestors 'none'` (a meta CSP cannot carry `frame-ancestors`).
 */
export const headerContentSecurityPolicy: string = serializeDirectives(
  cspDirectives,
  [['frame-ancestors', "'none'"]],
);

/** Permissions denied in the `Permissions-Policy` header. */
const deniedFeatures = [
  'camera',
  'microphone',
  'geolocation',
  'payment',
  'usb',
  'interest-cohort',
] as const;

export const permissionsPolicy: string = deniedFeatures
  .map((feature) => `${feature}=()`)
  .join(', ');

/**
 * Full response-header set applied to every route (`/*`).
 * `/sw.js` carries the same CSP plus `Cache-Control: no-cache`
 * (see {@link buildSwSecurityHeaders}).
 */
export function buildSecurityHeaders(): Record<string, string> {
  return {
    'Content-Security-Policy': headerContentSecurityPolicy,
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': permissionsPolicy,
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
}

/** Response headers for `/sw.js`: the shared set, with `Cache-Control` added. */
export function buildSwSecurityHeaders(): Record<string, string> {
  return {
    ...buildSecurityHeaders(),
    'Cache-Control': 'no-cache',
  };
}

/**
 * Render `dist/_headers` in Netlify / Cloudflare Pages format: `/*` gets
 * every header, and `/sw.js` gets the same CSP plus `Cache-Control`.
 */
export function renderHeadersFile(): string {
  const renderBlock = (
    path: string,
    headers: Record<string, string>,
  ): string => {
    const lines = Object.entries(headers).map(
      ([name, value]) => `  ${name}: ${value}`,
    );
    return `${path}\n${lines.join('\n')}\n`;
  };
  return (
    renderBlock('/*', buildSecurityHeaders()) +
    renderBlock('/sw.js', buildSwSecurityHeaders())
  );
}

/** Neutral manifest any edge or reverse proxy can consume. */
export function buildSecurityHeadersManifest(): {
  routes: Array<{ path: string; headers: Record<string, string> }>;
} {
  return {
    routes: [
      { path: '/*', headers: buildSecurityHeaders() },
      { path: '/sw.js', headers: buildSwSecurityHeaders() },
    ],
  };
}
