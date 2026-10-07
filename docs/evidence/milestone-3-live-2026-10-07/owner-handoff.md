# Milestone 3 live owner handoff — 2026-10-07

## Current development PASS status

All requested Milestone 3 development live checks 1–8 passed, including the
final real-adapter read and owner-approved cleanup. PR delivery remains pending
final exact-head CI. This is not a global release or clinical-product
validation claim.

- Development project `intermed-dev` is active in Frankfurt (`fra`); the
  organization plan is GitHub Student Pack `auto-1`, with both project slots
  occupied by the shell and development projects.
- Development Sites deployment `6ac62b9286ef77aa3a78` is ready. The pinned
  install and build succeeded with Node `v24.21.0` and npm `11.19.0`; edge
  distribution completed `6/6`. Deployment field comparison is zero-difference;
  this is deployed development evidence, not a claim that the PR's final exact
  head is deployed.
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
  long-cache headers remain a future policy follow-up. Browser proof is not
  real-device acceptance, which is out of scope here.

## Not run or out of scope

Production deployment, billing/capacity changes, restore drill, real-device
acceptance, clinical approval, production bootstrap hash approval, CSP/reader
wiring, and any changes to the existing shell project were not performed.
These are out of scope or future follow-ups, not blockers for the completed
development checks.
