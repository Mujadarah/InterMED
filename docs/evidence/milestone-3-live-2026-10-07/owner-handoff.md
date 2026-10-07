# Milestone 3 live owner handoff — 2026-10-07

## Current bounded PASS checks

- Development project `intermed-dev` is active in Frankfurt (`fra`); the
  organization plan is GitHub Student Pack `auto-1`, with both project slots
  occupied by the shell and development projects.
- Development Sites deployment `6ac62b9286ef77aa3a78` is ready from source
  commit `ac848af0b48f92a4eb9ab03b8aa7841769165e33`. Pinned install and build
  succeeded with Node `v24.21.0` and npm `11.19.0`; edge distribution completed
  `6/6`.
- Deployment readback and direct GET verified the declared site fields,
  including `enabled: true`; the pull export's omitted `enabled` field is not
  drift.
- Browser and HTTPS checks passed for `/status`, `/`, the manifest, `/sw.js`,
  and the hashed JS/CSS assets. The manifest and service worker use root scope.
- The sanitized deployed-bundle scan passed for 11 actual deployed files.
  Deployment variables are empty and only `apps/web/.env.example` is listed
  among public environment examples.
- The real adapter read returned the synthetic published manifest and
  descriptor. The synthetic records are fictional and not clinical approval.

## Historical failures and limits

- The first 39-check matrix and six crosswalk failures remain retained as
  failed/inconclusive evidence. The corrected 39/39 bounded probes and the
  owner-approved seven-object cleanup are recorded separately.
- Earlier Sites attempts failed on Node runtime compatibility (`node-22` and
  `fcntl64`); they are historical failures, not evidence against the final
  musl deployment.
- Observed cache policy is `public, max-age=0, must-revalidate`; immutable
  long-cache headers remain an open risk. Browser proof is not real-device
  acceptance.

## Not run or out of scope

Production deployment, billing/capacity changes, restore drill, real-device
acceptance, clinical approval, production bootstrap hash approval, CSP/reader
wiring, and any changes to the existing shell project were not performed.
Milestone 3 overall live acceptance remains unclaimed.
