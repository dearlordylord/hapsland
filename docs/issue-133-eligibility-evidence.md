# #133 file eligibility routing evidence

**Purpose:** Record the implementation boundary and validation evidence for #133.
**Status:** Integrated #133 implementation checkpoint; evidence is scoped to the runs and fixtures recorded below.
**Authority:** Implementation or validation evidence; this report does not amend accepted product behavior.
**Expected use:** Support #133 acceptance and the #137 source-linked authority review.
**Lifecycle:** Temporary. Review at #133 acceptance and again during #137. Once #137 incorporates the necessary boundary conclusions, exceptions, and validation limitations into its final authority report, consolidate those conclusions there, move any accepted product decision to its contract owner, update inbound links, and delete this snapshot. Keep executable traces and checks in their native artifacts.

Status: implementation checkpoint, 2026-09-28. Issue: [#133](https://github.com/dearlordylord/hapsland/issues/133).

## Decision boundary

`Canonical.step` now emits the ordered protected-path and candidate-file outcomes from `Configuration.bend`. Native TypeScript measures normalized relative paths, name/extension recognition, glob matches, physical path safety, Git administration containment, and Git-ignore state. Those facts do not enter retained Bend state. Invalid paths use a separate canonical event, so impossible path/fact combinations are not representable. The existing canonical file-selection outcome still applies include/exclude priority. Direct and older `runtime/review.ts` paths use the same protection classification; the older path also checks native Git eligibility before source capture in authorized and unscoped contexts when a Git working tree exists. If Git discovery fails where a `.git` marker is present, the older path reports unavailable before reading source. Selection does not imply that an analyzer applies to the selected file.

The `src/policy/eligibility.ts` export was classified as unused: repository search found its barrel re-export but no production, test, or package consumer. The barrel export and file were removed. `scripts/check-file-eligibility-boundary.mjs` prevents that owner and direct hard-exclusion logic from returning and checks the canonical calls.

## Offline evidence

- `conformance/canonical-configuration-v1.json` adds source-free expected outcomes for protection priority and Git/physical/ignore candidate priority. The independent canonical checker covers 52 traces.
- `LAWS.bend` and `PROOF.bend` add checked privacy, generated-path, and Git administration precedence claims.
- `selection-capture.test.ts` covers build/generated/vendor rejection, Markdown and `.mts`/`.cts` selection, unsupported extension refusal, exclusions, Git-ignore, symlinks, and native Git identity. `pipeline.test.ts` witnesses source capture of a selected Markdown file with zero Jev requests because its analyzer is inapplicable. `runtime/review.test.ts` supplies a source reader that fails if called and proves the older path refuses a Git-ignored file first.
- `server.test.ts` uses a fake clock, injected source effect, fake Jev dispatch, gated evaluation callback, and both candidate orders to show that a protected sibling is never captured while the safe file is evaluated and retained.

This slice does not add cross-file supporting-path traversal. Its future entry point must run the same eligibility gate for every supporting file before a source read under #138.
