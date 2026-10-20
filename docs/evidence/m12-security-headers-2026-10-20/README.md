# M12 security response headers — 2026-10-20

Host-agnostic header policy as code. No host or edge was chosen, configured,
or deployed; no live Appwrite resource was touched; no npm dependency was
added. Work was done on branch `claude/m12-security-headers` from
`origin/main`, in small commits, without pushing.

## What changed

- `apps/web/security-headers.ts` (new): single source of truth. It exports
  the CSP directives object (`cspDirectives`), the meta value
  (`metaContentSecurityPolicy`), the header value
  (`headerContentSecurityPolicy`, meta plus `frame-ancestors 'none'`), the
  `Permissions-Policy` value, `buildSecurityHeaders()`,
  `buildSwSecurityHeaders()` (`/sw.js` adds `Cache-Control: no-cache`),
  `renderHeadersFile()` (`_headers` format) and
  `buildSecurityHeadersManifest()` (neutral JSON manifest).
- `apps/web/vite.config.ts`: the production meta CSP is now imported from
  the module above instead of a local literal, so the meta tag and the
  header can never drift. The emitted meta value is byte-identical.
- `apps/web/pwa/security-headers-build.ts` (new): build-time Vite plugin,
  registered alongside the existing shell build, that writes
  `dist/_headers` and `dist/security-headers.json`. Both files sit outside
  the precache list counted by `pwa/shell-build.ts`.
- Tests: `apps/web/security-headers.test.ts` (new), additions to
  `apps/web/pwa/build-output.test.ts` (built-output agreement, meta
  byte-identity, precache exclusion), `tests/browser/production-server.ts`
  (opt-in `securityHeaders` response headers) and
  `tests/browser/security-headers.spec.ts` (new, Chromium-only).
- `infra/appwrite/SITES.md`: the M12 response-header line now points here.

## Policy table

| Header                          | Value                                                                                                                                                                                                                                                    | Notes                                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `Content-Security-Policy`       | `default-src 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'; form-action 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'` | Meta policy plus `frame-ancestors 'none'`; a meta element cannot carry `frame-ancestors`. Same value on `/sw.js`. |
| `Referrer-Policy`               | `no-referrer`                                                                                                                                                                                                                                            | No referrer is sent on any navigation or subresource request.                                                     |
| `Permissions-Policy`            | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()`                                                                                                                                                                       | Denies the sensitive features the shell never uses.                                                               |
| `X-Content-Type-Options`        | `nosniff`                                                                                                                                                                                                                                                | Blocks MIME-type sniffing of served assets.                                                                       |
| `Cross-Origin-Opener-Policy`    | `same-origin`                                                                                                                                                                                                                                            | Isolates the browsing context group from cross-origin openers.                                                    |
| `Cache-Control` (`/sw.js` only) | `no-cache`                                                                                                                                                                                                                                               | The worker script is revalidated on every fetch; all other routes keep the host default.                          |

Design notes: no `unsafe-inline`, `unsafe-eval`, or wildcard source appears
in either CSP (asserted by test). The production meta CSP is unchanged. A
future reader against a cross-origin API would still need a `connect-src`
allowance; that remains recorded in the Milestone 3 evidence and is not added
here.

## Generated host files

`dist/_headers` (Netlify / Cloudflare Pages format): `/*` carries every
header; `/sw.js` carries the same set plus `Cache-Control: no-cache`.

`dist/security-headers.json` (neutral manifest for any edge or reverse
proxy):

```json
{
  "routes": [
    {
      "path": "/*",
      "headers": {
        "Content-Security-Policy": "…",
        "Referrer-Policy": "no-referrer",
        "...": "…"
      }
    },
    {
      "path": "/sw.js",
      "headers": {
        "Content-Security-Policy": "…",
        "...": "…",
        "Cache-Control": "no-cache"
      }
    }
  ]
}
```

## How to apply it (described, not deployed)

Choosing the host or edge is the owner's decision. Each option below consumes
the generated files unchanged.

- **Cloudflare Pages:** keep the emitted `dist/_headers` at the output root.
  Pages applies path-scoped response headers from that file with no dashboard
  change. Verify with `curl -sI` on `/` and `/sw.js` after the authorized
  deployment.
- **Netlify:** keep the emitted `dist/_headers` at the publish root. Netlify
  applies the same file format. Alternatively, translate
  `security-headers.json` into `netlify.toml` `[[headers]]` entries; the test
  suite asserts both files agree, so either source is equivalent.
- **nginx (reverse proxy or static root):** translate the manifest once, e.g.
  `add_header Content-Security-Policy "<header CSP>" always;` plus one
  `add_header` per remaining header in the server/location block, and
  `add_header Cache-Control "no-cache" always;` in `location = /sw.js`.
- **Cloudflare Worker in front of Appwrite Sites (described, not deployed):**
  Appwrite Sites cannot set these headers (see `infra/appwrite/SITES.md`), so
  a Worker on the public route would fetch the Sites origin, copy the
  response, set every header from `buildSecurityHeaders()` (plus
  `Cache-Control: no-cache` for `/sw.js`), and return the new response. HTML
  bytes stay untouched, so the meta CSP and the header CSP keep agreeing.
  This Worker does not exist yet; it needs the owner's hosting authority and
  a reviewed deploy before any clinical use.

## Commands and results

Pinned toolchain: Node 24.21.0 / npm 11.19.0 for the gate; the Playwright run
additionally uses the pinned Node 22 runtime through
`INTERMED_NODE22_RUNTIME`.

- `npm run format:check` — pass.
- `npm run lint` — pass.
- `npm run typecheck` — pass.
- `npx vitest run` — pass (see note below on the one known local-only
  failure).
- `npm run check:boundaries` — pass.
- `npm run build` — pass; precache budget `16/24 assets`,
  `649,482/2,097,152 bytes`; `_headers` and `security-headers.json` emitted
  and agreeing with `buildSecurityHeaders()`; `index.html` meta CSP
  byte-identical to the source policy.
- `npx playwright test --project=chromium-desktop` — pass, including the new
  `tests/browser/security-headers.spec.ts`: headers present on `/` and
  `/sw.js`, the app loads and works with headers on (overview, search,
  calculators with a real BMI computation, status/diagnostics), and framing
  the origin from a test page is blocked (`frame-ancestors` refusal observed).

Note: `tests/importer/artifact.test.ts` ("builds under the OS temp directory")
is a known local-only failure and is unrelated to this change; it was left
untouched.

## What still needs a live host

- The owner's choice of header-capable host or edge, and the authorized
  deployment that applies this policy.
- Re-testing on that deployment per the runbook: deep links, manifest scope,
  service-worker scope, TLS, cache headers, source-map absence, plus the new
  response headers on `/`, `/status`, and `/sw.js`, and the framing refusal.
- Any `connect-src` allowance if a future reader targets a cross-origin API
  (Milestone 3 evidence), reviewed before it is added.
