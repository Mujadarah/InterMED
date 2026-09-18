# Contributing to InterMED

Thank you for helping improve InterMED.

## Ways to contribute

- Report a reproducible bug using the bug-report form.
- Propose a feature using the feature-request form.
- Open a pull request from a fork or topic branch.
- Review documentation, accessibility, privacy, tests, and clinical-content provenance.

## Safety and privacy

- Never submit real or identifiable patient data.
- Do not add clinical thresholds, medication doses, interactions, or treatment recommendations without a permitted authoritative source, version metadata, tests, and clinical review.
- OCR- or AI-derived clinical facts must remain candidates until explicitly confirmed by a clinician.
- Follow [`plan/CLINICAL_SAFETY.md`](plan/CLINICAL_SAFETY.md) for every change.

## Development workflow

1. Fork the repository and create a focused branch.
2. Add or update tests before implementation when behavior changes.
3. Keep domain and clinical logic independent of SwiftUI and provider SDKs.
4. Run the documented build, test, lint, and safety checks.
5. Open a pull request and complete the template.

Direct pushes to the default branch are disabled. Changes must be proposed by pull request and pass the configured review and status-check rules.

By submitting a contribution, you agree that it is licensed under Apache License 2.0.
