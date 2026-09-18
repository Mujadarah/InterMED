# InterMED

InterMED is an open-source, local-first clinical decision-support assistant for clinicians, initially targeting iPhone. It is designed to work offline without a hosted backend or mandatory account, while keeping clinically meaningful outputs explainable and traceable.

> [!IMPORTANT]
> InterMED is under active development. It is not validated for clinical use and must not be used as a substitute for professional judgment, local policy, or approved medical systems.

## Product principles

- Local-first and offline-capable.
- Patient identity fields are optional.
- Extracted clinical data require clinician confirmation.
- High-impact clinical logic must be deterministic, tested, versioned, and evidence-backed.
- Medication doses, drug interactions, and surgical indications must never be invented by an LLM.
- iPadOS may be supported in a later release; the first build target is iPhone.

The controlling product and engineering documents are in [`plan/`](plan/README.md).

## Status

Repository bootstrap is in progress. No clinical functionality is currently released or validated.

## Contributing

Bug reports, feature proposals, and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before contributing. Please do not include real or identifiable patient data in issues, pull requests, tests, screenshots, or logs.

## License

Licensed under the [Apache License 2.0](LICENSE).
