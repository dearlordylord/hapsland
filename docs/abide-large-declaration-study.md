# Large declarations: realistic examples and context visibility

**Purpose:** Compare selected realistic declarations across compact, larger adjacent and larger separated layouts, with readable inputs and independent validation.
**Status:** Draft; offline validation completed, live experiment pending.
**Authority:** Comparative research advisory and validation evidence; not a product contract or a release certification.
**Expected use:** Inspect the examples and their domain obligations, compare measured conditions, and assess relevance to your own maintenance edits.
**Lifecycle:** Review when fixtures, source selection, rule wording, feedback or scoring change. Replace the measured account when its evidence is superseded; retain only evidence supporting current claims and update inbound links.

## Scope and selection

Six domains were selected from ten proposals before live outcomes: report delivery, map camera, attachment manifest, render pool, reservation window and moderation decision. Selection prioritized readable domain meaning, a concrete problematic value or behavior, realistic independent facts, a close valid control and independently checkable repairs. The alternatives—webhook retry, workspace membership, invoice aging and shipment planning—were excluded for domain overlap or additional identity complexity in this bounded pass, not comparative outcomes.

Four type domains compare a compact core with meaningful additional configuration fields. Their larger adjacent and separated variants contain the same fields and meanings. Two function domains keep the same statements, evaluation order and behavior across layouts; their larger forms expand signatures and group computation into paragraphs. Function comparisons measure layout, not a different population of semantically larger programs. Deliberately separating related fields is an experimental condition, not a recommended coding style.

All native sessions use **Codex CLI 0.155.1, model `gpt-6-luna`, reasoning effort `max`**. Both reviewers use Jev. Abide 0.0.7 receives the same target Noul question and criteria through an active custom rubric; Hapsland uses the current signature/body requirement for the resource rule.

The fixed matrix contains 36 inputs: six domains × three layouts × defect/control. Detection uses two repetitions for each reviewer, or 144 cells. Native work uses compact and large-separated layouts, one session per input and reviewer condition, including a no-review methodology control: 72 sessions. No favorable subset replaces those measurements.

## What Abide receives

Abide 0.0.7 does **not** impose a fixed three-line context window on native Codex edits. For `apply_patch`, it forwards each supplied file section, including whatever unchanged context the agent included. By contrast, synthesized diffs and Git turn diffs use three context lines on each side. These are **SRC / SOURCE-INSPECTED** findings; the inspected published files match immutable upstream commit `533a3d25d5d537bf9005f2f48ce5b18837fd5c74`. See the [patch parser](https://github.com/coldteadotai/abide/blob/533a3d25d5d537bf9005f2f48ce5b18837fd5c74/packages/cli/src/lib/applyPatch.ts), [diff construction](https://github.com/coldteadotai/abide/blob/533a3d25d5d537bf9005f2f48ce5b18837fd5c74/packages/cli/src/lib/diff.ts) and [Git diff construction](https://github.com/coldteadotai/abide/blob/533a3d25d5d537bf9005f2f48ce5b18837fd5c74/packages/cli/src/lib/git.ts).

Post-edit checks process edited files separately and cut each diff at 24,000 characters. Stop compares the turn-start snapshot with the final tree, cuts each file diff at 8,000 characters, and can rerun edit rules for uncovered or previously blocked files. Later edits can therefore expose additional distant hunks; unchanged distant fields and imported definitions are not automatically attached. These are **SRC / SOURCE-INSPECTED** findings from the [post-edit handler](https://github.com/coldteadotai/abide/blob/533a3d25d5d537bf9005f2f48ce5b18837fd5c74/packages/cli/src/hooks/postToolUse.ts) and [Stop handler](https://github.com/coldteadotai/abide/blob/533a3d25d5d537bf9005f2f48ce5b18837fd5c74/packages/cli/src/hooks/stop.ts).

An offline probe exercised the released post-edit handler with synthetic source and intercepted dispatch before any network request. A localized rename produced a seven-line diff without the distant `endpointUrl` field; a whole-interface patch produced fourteen lines including it. This is **RUN / RUNTIME-TESTED** input-boundary evidence, not a live detection result. The [boundary record](../evidence/abide-large-declarations-current/abide-boundary.json) contains the probes and source hashes.

This experiment deliberately supplies the same localized patch with three context lines to both products in the detection condition. That is a controlled input shape, not an inherent Abide window. Native agents choose their actual patches freely; a larger replacement may expose the entire declaration and remove the hypothesized visibility difference.

## Examples

The [fixture collection](../scripts/abide-large-declaration-fixtures.mjs) owns the actual submitted inputs. Readable TypeScript files are under [large-declaration examples](./examples/large-declarations/). These are team-authored synthetic scenarios, not harvested production bugs or an external held-out benchmark. Related helper source is available beside function examples.

The map-center grouping has a related refactoring pattern in Fowler's [Introduce Parameter Object](https://refactoring.com/catalog/introduceParameterObject.html): related values can be represented together. This is design inspiration, not evidence that either review product detects our examples. [PLDB](https://pldb.kirancodes.me/) was inspected as a literature-discovery index; no paper-derived rule or dependency is adopted in this pass.

## Results

Live execution and anonymous adjudication pending. No outcome claim is made at this stage.

## Methodology

The initial maintenance edit renames `label` to `displayLabel`; defects are already present beforehand. All arms preserve the documented domain and independent facts. The native task requests a minimal initial rename patch, but the agent chooses its actual patch and later corrections freely. Source-free line statistics record actual patch shape. Diagnostic receipt markers and outcome self-reports are equal across conditions; they establish cooperative receipt evidence, not correctness or causation.

The independent TypeScript 5.9.3 oracle checks complete valid and invalid structural variable assignments, original independent-field types and requiredness, and alternative known repaired representations. It passed 259 offline checks. Excess-property errors, deleting independent facts, narrowing arbitrary text or hardcoding witness values cannot earn repair credit. Duplicate-count and resource-body designs additionally require blinded semantic adjudication and safe runtime probes. Unknown public APIs remain unassessed.

Case selection, source hashes, scoring obligations, physical-request ceiling, timeouts and stop conditions must be declared before live outcomes. There are no automatic retries or outcome-selected case replacements. All source is synthetic and eligible; file-access exclusions and running both products together are outside this study.

Under the [comparative research methodology](https://github.com/dearlordylord/hapsland-research/blob/master/PRODUCT-RESEARCH-METHODOLOGY.md), classifications are **BORROW** for relevant-definition collection, readable grouping and independent checks; **OPTIONAL INTEGRATION** for Abide as a neighboring reviewer subject to separate coexistence testing; **REJECT** for assuming a fixed native context window or general superiority; no new **DEPEND ON** recommendation.
