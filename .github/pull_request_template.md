## Summary

Describe the problem, scope and revised requirement IDs/phase.

## Verification

- [ ] Every repository Markdown file was read before code changes.
- [ ] Tests were added/run before behavior-changing implementation; relevant checks have recorded results.
- [ ] Documentation-only changes were checked for links, numbering and cross-file scope consistency.
- [ ] No real patient data, proprietary datasets or credentials are included; fixtures/logs are synthetic.
- [ ] No build, deployment or clinical-validation result is claimed without evidence.

## Architecture, data and safety

- [ ] Domain/clinical logic stays independent of React, browser persistence and Appwrite/provider SDKs.
- [ ] Anonymous medication MVP remains useful without accounts; patient functionality stays later/privacy-gated.
- [ ] Failed dataset/SW updates preserve usable data, with tested schema/version compatibility where applicable.
- [ ] Clinical content/formulas/mappings are permitted, sourced, reviewed, versioned and tested.
- [ ] Commercial/combination products resolve to ingredients before interaction analysis; coverage/source states are honest.
- [ ] No dose, interaction, contraindication or surgical indication is invented by an LLM.
- [ ] OCR/AI-derived facts require clinician confirmation; explanations preserve source meaning.
- [ ] Secrets stay server-side; permissions, logs and cached responses respect privacy boundaries.

## Screenshots and limits

Use synthetic/sanitized screenshots only. Record browser/device/data versions and any unverified scope or release gates.
