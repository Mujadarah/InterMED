# Appwrite Sites settings (documented, not applied)

These are the intended Sites settings for the InterMED web PWA. They are
recorded as code in the `sites` entries of
[`appwrite.config.development.json`](appwrite.config.development.json) and
[`appwrite.config.production.json`](appwrite.config.production.json) and as the
table below. **No site is created, updated or deployed by this milestone.**

The existing Milestone 2 static test site (project `6ac4b25b0012379cf3d0`, site
`6ac4b3550003a26eea02`, origin `intermed-shell-test.appwrite.network`) hosts the
development shell and is **not touched**: the placeholder site IDs
`intermed-web-dev` / `intermed-web-prod` cannot address it, and the offline tests
assert that no live identifier appears in the configuration.

## GitHub and build settings

| Setting                | Intended value                                                                      | Notes                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| GitHub repository      | `Mujadarah/InterMED`                                                                | The repository already used by CI; connection requires a GitHub App authorization |
| Production branch      | `main`                                                                              | Production-branch commits deploy and activate; other branches build previews only |
| Root directory         | `apps/web`                                                                          | Where the install/build commands run                                              |
| Install command        | `npm ci --prefix ../.. --no-fund`                                                   | Lockfile-only install of the workspace root (see the monorepo note below)         |
| Build command          | `npm run build`                                                                     | `vite build` for `@intermed/web`                                                  |
| Output directory       | `./dist`                                                                            | Vite output for `apps/web` (`apps/web/dist` from the repository root)             |
| SPA deep-link fallback | `index.html` (`fallbackFile`)                                                       | Serves app HTML for `/status` and other deep links; matches the existing site     |
| Adapter / rendering    | `static`                                                                            | Static SPA/PWA hosting; no server rendering                                       |
| Framework              | `other`                                                                             | Same as the existing site's framework setting                                     |
| Build runtime          | `node-22`                                                                           | Pinned build container identifier                                                 |
| Build triggers         | branch filter `main`; path filter `apps/web/**`, `packages/**`, `infra/appwrite/**` | Avoids rebuilding for documentation-only commits                                  |
| Environment variables  | none                                                                                | Frontend build variables are public-only and currently unset                      |

**Monorepo note.** npm workspaces install from the repository root, so an
install command running inside `apps/web` must target the root. The value above
(`npm ci --prefix ../.. --no-fund`) resolves from `apps/web` to the repository
root — the directory that holds the single root `package-lock.json` — while
keeping `apps/web` as the documented root directory. (`--prefix ..` resolves to
`apps/`, which has no `package.json` and no lockfile and therefore cannot be
installed.) An offline test asserts that the configured prefix resolves to the
lockfile directory. If the Sites build runner does not accept
`--prefix`, use the equivalent single-root settings instead: root directory `/`,
install `npm ci --no-fund`, build `npm run build`, output `apps/web/dist`,
fallback `index.html`. Whichever variant is chosen must be confirmed against an
actual Sites build before it is called working.

## Consistency with the existing site

The existing test site was deployed manually from a packaged `apps/web/dist`
with framework `Other`, empty install/build commands, output directory `./` and
fallback `index.html`. The settings above reproduce that served behavior
(static output plus `index.html` fallback) while adding the reviewed
Git-connected build path, which is the intended flow
([deploy from Git](https://appwrite.io/docs/products/sites/deploy-from-git),
[rendering](https://appwrite.io/docs/products/sites/rendering)).

## Deployment boundaries

- Production deployment happens only from reviewed `main` revisions; preview
  deployments stay synthetic/nonclinical and carry no production write access.
- Response-header policy (CSP header with `frame-ancestors`, CSP for `/sw.js`,
  `Referrer-Policy`, `Permissions-Policy`) is **not** expressible in this Sites
  configuration and remains an open Milestone 12 gate (see
  [Milestone 2 evidence](../../docs/MILESTONE_2_EVIDENCE.md)). The production
  meta CSP stays unchanged; a future reader against a cross-origin API would
  also need a `connect-src` allowance — recorded in
  [Milestone 3 evidence](../../docs/MILESTONE_3_EVIDENCE.md#open-risks-and-gaps).
- Deep links, manifest scope, service-worker scope, TLS, cache headers and
  source-map absence must be re-tested on every authorized deployment
  ([runbook](../../docs/APPWRITE_RUNBOOK.md)).
