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

**Monorepo note.** npm workspaces install from the repository root, which holds
the single root `package-lock.json`. The development site uses
`node infra/appwrite/pinned-toolchain.mjs install` and
`node infra/appwrite/pinned-toolchain.mjs build`: the launcher uses the host
Node only to install `npm@11.19.0` at an isolated temporary prefix outside the
archive, with lifecycle scripts disabled. On Linux x64 it first downloads the
official Node `24.21.0` musl gzip artifact from
`https://nodejs.org/dist/v24.21.0/node-v24.21.0-linux-x64-musl.tar.gz`, verifies
SHA-256
`3d63405f c65a0d2d 2976c1f0 bc2fd27b b0bd0721 2469e705 aac3f03a e5ab4c9c`
(remove spaces before comparing), validates
archive paths, and only then extracts it with the host's `tar`. The launcher
then verifies both versions and invokes the absolute extracted Node executable
with the absolute `npm-cli.js`, prepending the prefix's `.bin` wrapper directory
and the pinned Node binary directory to `PATH` for npm/Vite child processes.
Linux arm64 is refused because no exact official musl artifact is published;
unsupported platform/architecture combinations fail explicitly. The official
musl build remains experimental and requires an authorized cloud compatibility
retry before any production use. The npm and Windows bootstrap package
integrity hashes remain a production follow-up; this local fix is not approved
for production deployment.
`APPWRITE_HOST_NPM`, `APPWRITE_PINNED_NODE`, and `APPWRITE_PINNED_NPM_CLI` are
absolute-path test and operator injection points; no credentials are written by
the launcher.

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
