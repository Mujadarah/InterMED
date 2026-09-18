## Summary

Describe the problem and the focused change.

## Verification

- [ ] Tests were added or updated before behavior-changing implementation.
- [ ] Relevant build, test, lint, and migration checks pass.
- [ ] No real or identifiable patient data are included.
- [ ] Logs and fixtures use synthetic data only.

## Architecture and safety

- [ ] Domain and clinical logic remain independent of SwiftUI and provider SDKs.
- [ ] OCR/AI-derived facts require confirmation before persistence.
- [ ] Clinical rules/calculations are deterministic, versioned, sourced, and tested.
- [ ] No medication dose, interaction, or surgical indication was invented from model knowledge.
- [ ] Evidence and provenance metadata were updated where applicable.

## Screenshots

Include only sanitized screenshots using synthetic data.
