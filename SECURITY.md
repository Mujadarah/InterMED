# Security policy

## Private reporting

Do not open a public vulnerability issue or attach sensitive data. Use [GitHub private vulnerability reporting](https://github.com/Mujadarah/InterMED/security/advisories/new) for this repository.

Never include patient data, medication-query histories, credentials, access tokens, device identifiers or private clinical records. Use synthetic reproductions and sanitized logs.

## Supported versions and current stage

InterMED is planning/pre-release software with no clinically supported release. Security fixes target the latest development line until a versioned support policy exists. The documentation specifies intended controls, not an implemented secure deployment.

## Planned PWA and infrastructure controls

HTTPS, reviewed CSP/security headers, untrusted-content sanitization, input/schema validation, dependency/secret scanning, reproducible dependencies, rate limits, least-privilege Appwrite permissions and server-only API keys are release requirements.

Public datasets may be read without Auth, but readers cannot write, inspect raw imports/quarantine or execute administrative Functions. Server key scopes do not replace application authorization. Never put server/provider secrets into frontend environment variables or service-worker caches.

IndexedDB/Cache Storage are browser-managed and are not inherently encrypted or permanently retained. UI locking is not database encryption. Dataset validation/atomic activation/rollback must prevent corrupt updates from replacing usable data.

## Privacy and clinical-data boundaries

Medication MVP collects no patient data or mandatory identity. Avoid sensitive query analytics/identity linkage and console/server query logs. Future patient storage/upload requires separate encryption/key recovery, access control, retention/delete/export, hosting/compliance and incident-response approval. No raw identifiable data go to generic AI by default.

Source/license and clinical-content review gates are security/safety boundaries as well as legal concerns. Missing interaction data cannot produce a universal “safe” verdict. See [CLINICAL_SAFETY.md](plan/CLINICAL_SAFETY.md), [APPWRITE.md](plan/APPWRITE.md) and [PWA_OFFLINE.md](plan/PWA_OFFLINE.md).
