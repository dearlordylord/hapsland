# #133 file eligibility routing evidence

Status: implementation checkpoint, 2026-09-28. Issue: [#133](https://github.com/dearlordylord/hapsland/issues/133).

## Decision boundary

`Canonical.step` now emits the ordered protected-path and candidate-file outcomes from `Configuration.bend`. Native TypeScript measures normalized relative paths, name/extension recognition, glob matches, physical path safety, Git administration containment, and Git-ignore state. Those facts do not enter retained Bend state. The existing canonical file-selection outcome still applies include/exclude priority. Direct and older `runtime/review.ts` paths use the same protection classification; direct selection then uses native candidate observations and the canonical admission result before source capture. Selection does not imply that an analyzer applies to the selected file.

The `src/policy/eligibility.ts` export was classified as unused: repository search found its barrel re-export but no production, test, or package consumer. The barrel export and file were removed. `scripts/check-file-eligibility-boundary.mjs` prevents that owner and direct hard-exclusion logic from returning and checks the canonical calls.

## Offline evidence

- `conformance/canonical-configuration-v1.json` adds source-free expected outcomes for protection priority and Git/physical/ignore candidate priority. The independent canonical checker covers 52 traces.
- `LAWS.bend` and `PROOF.bend` add checked privacy, generated-path, and Git administration precedence claims.
- `selection-capture.test.ts` covers build/generated/vendor rejection, Markdown selection, unsupported extension refusal, exclusions, Git-ignore, symlinks, and native Git identity. `pipeline.test.ts` witnesses source capture of a selected Markdown file with zero Jev requests because its analyzer is inapplicable.
- `server.test.ts` uses a fake clock, fake Jev dispatch, gated evaluation callback, and two candidate paths to show that a protected sibling is refused while the safe file is evaluated and retained.

This slice does not add cross-file supporting-path traversal. Its future entry point must run the same eligibility gate for every supporting file before a source read under #138.
