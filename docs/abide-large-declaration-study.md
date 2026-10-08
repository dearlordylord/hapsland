# Large declarations: realistic examples and context visibility

**Purpose:** Compare selected realistic declarations across compact, larger adjacent and larger separated layouts, with readable inputs and independent validation.
**Audience:** Prospective users; rule authors; evaluation contributors and reviewers.
**Status:** Completed exploratory comparison; current matrix includes the declared renderer-repair moderation batch.
**Authority:** Comparative research advisory and validation evidence; not a product contract or a release certification.
**Expected use:** Inspect the examples and their domain obligations, compare measured conditions, and assess relevance to your own maintenance edits.
**Lifecycle:** Review when fixtures, source selection, rule wording, feedback or scoring change. Replace the measured account when its evidence is superseded; retain only evidence supporting current claims and update inbound links.

[Studies and examples](./review-studies.md) → Full larger-declaration report

Read the [scenario explanations](./review-studies.md#choose-a-scenario) for a guided code walkthrough; this report owns the complete methodology and measured matrix.

A routine rename changes a few lines. Can the reviewer still identify a design problem elsewhere in the declaration, and does the agent fix it without losing valid behavior?

## Scope and selection

Six domains were selected from ten proposals before live outcomes: report delivery, map camera, attachment manifest, render pool, reservation window and moderation decision. Selection prioritized readable domain meaning, a concrete problematic value or behavior, realistic independent facts, a close valid control and independently checkable repairs. The alternatives—webhook retry, workspace membership, invoice aging and shipment planning—were excluded for domain overlap or additional identity complexity in this study, not comparative outcomes.

Four type domains compare a compact core with meaningful additional configuration fields. Their larger adjacent and separated variants contain the same fields and meanings. Two function domains keep the same statements, evaluation order and behavior across layouts; their larger forms expand signatures and group computation into paragraphs. Function comparisons measure layout, not a different population of semantically larger programs. “Larger” is relative: type declarations are roughly 16–21 lines and function declarations 18–21 lines, not large production modules. Deliberately separating related fields is an experimental condition, not a recommended coding style.

All native sessions use **Codex CLI 0.155.1, model `gpt-6-luna`, reasoning effort `max`**. Both reviewers use Jev. Abide 0.0.7 receives the same target binary review question and criteria through an active custom rubric; Hapsland uses the current signature/body requirement for the resource rule.

The fixed matrix contains 36 inputs: six domains × three layouts × defect/control. Detection uses two repetitions for each reviewer, or 144 cells. Native work uses compact and large-separated layouts, one session per input and reviewer condition, including a no-review methodology control: 72 sessions. No favorable subset replaces those measurements.

## Examples

The [fixture collection](../scripts/abide-large-declaration-fixtures.mjs) owns the actual submitted inputs. Readable TypeScript files are under [large-declaration examples](./examples/large-declarations/). These are team-authored synthetic scenarios, not harvested production bugs or an external held-out benchmark. Related helper source is available beside function examples.

| Domain and rule | Concrete problem | Compact input | Larger input | Valid counterpart |
| --- | --- | --- | --- | --- |
| [Report delivery](./examples/large-declarations/report-delivery/README.md) — conditional facts (`r2`) | An email report can omit recipients; a downloaded report can carry them. | [Type](./examples/large-declarations/report-delivery/small/defect.ts) | [Type](./examples/large-declarations/report-delivery/large-separated/defect.ts) | [Tagged delivery](./examples/large-declarations/report-delivery/large-separated/clean.ts) |
| [Map camera](./examples/large-declarations/map-camera/README.md) — related facts (`r3`) | Latitude can be provided without longitude. | [Type](./examples/large-declarations/map-camera/small/defect.ts) | [Type](./examples/large-declarations/map-camera/large-separated/defect.ts) | [Complete optional center](./examples/large-declarations/map-camera/large-separated/clean.ts) |
| [Attachment manifest](./examples/large-declarations/attachment-manifest/README.md) — duplicated fact (`r4`) | A separately stored count can disagree with the attachments. | [Type](./examples/large-declarations/attachment-manifest/small/defect.ts) | [Type](./examples/large-declarations/attachment-manifest/large-separated/defect.ts) | [Attachments as the source](./examples/large-declarations/attachment-manifest/large-separated/clean.ts) |
| [Render pool](./examples/large-declarations/render-pool/README.md) — precise values (`r7`) | A numeric worker count accepts values outside the documented `1`, `2`, `4`. | [Type](./examples/large-declarations/render-pool/small/defect.ts) | [Type](./examples/large-declarations/render-pool/large-separated/defect.ts) | [Allowed counts](./examples/large-declarations/render-pool/large-separated/clean.ts) |
| [Reservation window](./examples/large-declarations/reservation-window/README.md) — declared resources (`r9`) | The function's signature hides its use of the service clock. | [Function](./examples/large-declarations/reservation-window/small/defect.ts) | [Function](./examples/large-declarations/reservation-window/large-separated/defect.ts) and [helper](./examples/large-declarations/reservation-window/large-separated/support.ts) | [Explicit clock](./examples/large-declarations/reservation-window/large-separated/clean.ts) |
| [Moderation decision](./examples/large-declarations/moderation-decision/README.md) — declared resources (`r9`) | The function's signature hides writing an audit entry. | [Function](./examples/large-declarations/moderation-decision/small/defect.ts) | [Function](./examples/large-declarations/moderation-decision/large-separated/defect.ts) and [helper](./examples/large-declarations/moderation-decision/large-separated/support.ts) | [Explicit audit writer](./examples/large-declarations/moderation-decision/large-separated/clean.ts) |

For the functions, the stakes are observable: the same booking arguments can produce a different decision as time passes, and moderation must write exactly one audit record per decision after repair. Declaring the clock or writer makes that dependency visible to callers.

Every domain also includes a `large-adjacent` layout beside these files. It groups related facts together while retaining the larger declaration's exact fields or statements. The valid counterparts are experimental controls, not copies of an agent's final repair.

The map-center grouping has a related refactoring pattern in Fowler's [Introduce Parameter Object](https://refactoring.com/catalog/introduceParameterObject.html): related values can be represented together. This is design inspiration, not evidence that either review product detects our examples. [PLDB](https://pldb.kirancodes.me/) was inspected as a literature-discovery index; no paper-derived rule or dependency is adopted in this pass.

## What Abide receives

Abide 0.0.7 does **not** impose a fixed three-line context window on native Codex edits. For `apply_patch`, it forwards each supplied file section, including whatever unchanged context the agent included. By contrast, synthesized diffs and Git turn diffs use three context lines on each side. These are **SRC / SOURCE-INSPECTED** findings; the inspected published files match immutable upstream commit `533a3d25d5d537bf9005f2f48ce5b18837fd5c74`. See the [patch parser](https://github.com/coldteadotai/abide/blob/533a3d25d5d537bf9005f2f48ce5b18837fd5c74/packages/cli/src/lib/applyPatch.ts), [diff construction](https://github.com/coldteadotai/abide/blob/533a3d25d5d537bf9005f2f48ce5b18837fd5c74/packages/cli/src/lib/diff.ts) and [Git diff construction](https://github.com/coldteadotai/abide/blob/533a3d25d5d537bf9005f2f48ce5b18837fd5c74/packages/cli/src/lib/git.ts).

Post-edit checks process edited files separately and cut each diff at 24,000 characters. Stop compares the turn-start snapshot with the final tree, cuts each file diff at 8,000 characters, and can rerun edit rules for uncovered or previously blocked files. Later edits can therefore expose additional distant hunks; unchanged distant fields and imported definitions are not automatically attached. These are **SRC / SOURCE-INSPECTED** findings from the [post-edit handler](https://github.com/coldteadotai/abide/blob/533a3d25d5d537bf9005f2f48ce5b18837fd5c74/packages/cli/src/hooks/postToolUse.ts) and [Stop handler](https://github.com/coldteadotai/abide/blob/533a3d25d5d537bf9005f2f48ce5b18837fd5c74/packages/cli/src/hooks/stop.ts).

An offline probe exercised the released post-edit handler with synthetic source and intercepted dispatch before any network request. A localized rename produced a seven-line diff without the distant `endpointUrl` field; a whole-interface patch produced fourteen lines including it. This is **RUN / RUNTIME-TESTED** input-boundary evidence, not a live detection result. The [boundary record](../evidence/abide-large-declarations-current/abide-boundary.json) contains the probes and source hashes.

This experiment deliberately supplies the same localized patch with three context lines to both products in the detection condition. That is a controlled input shape, not an inherent Abide window. Native agents are asked for a minimal initial rename patch, but choose the actual context and subsequent corrections freely; a larger replacement may expose the entire declaration and remove the hypothesized visibility difference.

## Results

The current matrix combines five retained source-pinned domains with the declared moderation rerun. It contains **11/12 independently checked repairs in Hapsland sessions and 2/12 in Abide sessions**. In the larger separated layouts the counts are **6/6 and 0/6**. Each native cell is one session on one constructed input; these are exploratory observations, not a statistical ranking.

| Domain | Compact Hapsland | Compact Abide | Larger separated Hapsland | Larger separated Abide | Actual larger final source |
| --- | --- | --- | --- | --- | --- |
| [Report delivery](./examples/large-declarations/report-delivery/README.md) | 1/1 | 1/1 | 1/1 | 0/1 | [Hapsland](../evidence/abide-large-declarations-current/report-delivery/native/blind/b4a5c1940d82/subject.ts) · [Abide](../evidence/abide-large-declarations-current/report-delivery/native/blind/01c6af6912e4/subject.ts) |
| [Map camera](./examples/large-declarations/map-camera/README.md) | 1/1 | 0/1 | 1/1 | 0/1 | [Hapsland](../evidence/abide-large-declarations-current/map-camera/native/blind/4cbcc69aa56e/subject.ts) · [Abide](../evidence/abide-large-declarations-current/map-camera/native/blind/deaf31d05cbc/subject.ts) |
| [Attachment manifest](./examples/large-declarations/attachment-manifest/README.md) | 1/1 | 0/1 | 1/1 | 0/1 | [Hapsland](../evidence/abide-large-declarations-current/attachment-manifest/native/blind/a6c9cdc9b41d/subject.ts) · [Abide](../evidence/abide-large-declarations-current/attachment-manifest/native/blind/ec3b87db5603/subject.ts) |
| [Render pool](./examples/large-declarations/render-pool/README.md) | 0/1 | 1/1 | 1/1 | 0/1 | [Hapsland](../evidence/abide-large-declarations-current/render-pool/native/blind/0f671dd507ad/subject.ts) · [Abide](../evidence/abide-large-declarations-current/render-pool/native/blind/8e2039fa640a/subject.ts) |
| [Reservation window](./examples/large-declarations/reservation-window/README.md) | 1/1 | 0/1 | 1/1 | 0/1 | [Hapsland](../evidence/abide-large-declarations-current/reservation-window/native/blind/aa670314cf4b/subject.ts) · [Abide](../evidence/abide-large-declarations-current/reservation-window/native/blind/f31a729e290e/subject.ts) |
| [Moderation decision](./examples/large-declarations/moderation-decision/README.md) | 1/1 | 0/1 | 1/1 | 0/1 | [Hapsland](../evidence/abide-large-moderation-corrected-current/moderation-decision/native/blind/f364f24e44ac/subject.ts) · [Abide](../evidence/abide-large-moderation-corrected-current/moderation-decision/native/blind/d93f27ef8d6c/subject.ts) |

All 72 current sessions completed and compiled. Hapsland preserved 12/12 clean controls; Abide preserved 12/12. There were 0 Hapsland and 0 Abide unassessed native outcomes.

### Detection under the controlled localized patch

Each cell below contains two repeats of the same defect input. A positive answer means the configured target finding crossed that product’s threshold; it does not mean the agent repaired anything.

| Domain | Compact positives Hapsland / Abide | Larger adjacent positives Hapsland / Abide | Larger separated positives Hapsland / Abide | False positives across six clean observations Hapsland / Abide |
| --- | --- | --- | --- | --- |
| [Report delivery](./examples/large-declarations/report-delivery/README.md) | 2/2 · 0/2 | 2/2 · 0/2 | 2/2 · 0/2 | 0/6 · 0/6 |
| [Map camera](./examples/large-declarations/map-camera/README.md) | 2/2 · 0/2 | 2/2 · 0/2 | 2/2 · 0/2 | 1/6 · 0/6 |
| [Attachment manifest](./examples/large-declarations/attachment-manifest/README.md) | 2/2 · 1/2 | 2/2 · 1/2 | 2/2 · 0/2 | 0/6 · 0/6 |
| [Render pool](./examples/large-declarations/render-pool/README.md) | 2/2 · 0/2 | 2/2 · 0/2 | 2/2 · 0/2 | 0/6 · 0/6 |
| [Reservation window](./examples/large-declarations/reservation-window/README.md) | 2/2 · 0/2 | 2/2 · 0/2 | 2/2 · 0/2 | 0/6 · 0/6 |
| [Moderation decision](./examples/large-declarations/moderation-decision/README.md) | 2/2 · 0/2 | 2/2 · 0/2 | 2/2 · 0/2 | 0/6 · 0/6 |

Across all layouts, Hapsland detected 36/36 defect observations with 1/36 false-positive clean observations; Abide detected 2/36 with 0/36. Unchecked observations: Hapsland 0, Abide 0. Repeat cells are not independent code examples.

### From an answer to a checked repair

| Defect-session observation | Hapsland | Abide |
| --- | --- | --- |
| Positive Jev answer | 12/12 | 0/12 |
| Rule/message-bearing hook output | 12/12 | 1/12 |
| Receipt marker echoed by agent | 12/12 | 0/12 |
| Agent reports applying feedback | 11/12 | 0/12 |
| Independent checker verifies repair | 11/12 | 2/12 |
| Verified repair with all preceding feedback evidence | 11/12 | 0/12 |

Output identification matches the configured Hapsland message or rendered Abide rule identifier; a rule-bearing output alone is not proof of a positive finding. Receipt and application reports are cooperative instrumentation. Independent code checks validate the predefined domain obligations; they do not isolate causation.

The compact render-pool case is a useful counterexample: Hapsland obtained a positive answer and a verified receipt, but the agent reported `NOT_APPLIED` and left the broad numeric type. The Abide session repaired it. Both compact Abide repairs—report delivery and render pool—reported `NO_FEEDBACK` and had no identified feedback output, so they count as successful sessions without a demonstrated feedback-to-repair link. The compact map control also produced one Hapsland detection false positive; all native clean controls remained valid.

### Which examples to start with

Start with **report delivery** for conditional validity, **attachment manifest** for redundant state, and **reservation window** for a hidden resource with directly testable behavior. Their larger Hapsland sessions passed independent repair checks and their larger Abide sessions did not repair. Map camera is another readable relationship example, with the false-positive caveat above. Moderation adds a second resource example. Keep render pool as the local-value diagnostic and visible counterexample, rather than treating every row as the same context mechanism. These are recommendations for explaining the measured collection; all six domains remain in the comparison.

The larger inputs do not establish that declaration size caused the difference: gaps also appeared in compact inputs, the type and function treatments differ, and product projections and feedback differ. Abide can receive wider patches. This study supports these particular broader-design review use cases, not a universal advantage from adding lines.

### Evidence and batch scope

The [current comparison](../evidence/abide-large-declarations-current/effective-comparison.json) joins five original source-pinned families with the declared moderation replacement. The [initial declaration](../evidence/abide-large-declarations-current/declaration.json), [replacement declaration](../evidence/abide-large-moderation-corrected-current/declaration.json) and frozen anonymous judgments preserve exact scope. The first moderation batch did not dispatch Hapsland input: its renderer rejected an anonymous callback reference. That is an input-rendering defect before provider dispatch, not a negative Jev verdict. The repair accepts the explicit opaque omission without inventing its body; all six unchanged moderation inputs and both reviewer conditions were rerun under the same rubric. No full rerun on one source revision is claimed.

In total 168 detection observations and 84 native sessions were executed, using 248 physical Jev requests. The current matrix retains 144 detection cells and 72 native sessions (228 requests); superseded moderation cells are excluded rather than pooled. The declared ceilings were 336 and 56 requests, with no automatic retries. [Projection preflight](../evidence/abide-large-moderation-corrected-current/projection-preflight.json) verifies zero-network rendering of the corrected inputs.

Anonymous semantic checks and probes: [attachments](../evidence/abide-large-declarations-current/manual/attachment-manifest.json), [reservation](../evidence/abide-large-declarations-current/manual/reservation-window.json), [moderation](../evidence/abide-large-moderation-corrected-current/manual/moderation-decision.json). Attachment probes verify that the public list supports correct length derivation; there is no UI badge renderer in those type fixtures.

## Methodology

The initial maintenance edit renames `label` to `displayLabel`; defects are already present beforehand. All arms are instructed to preserve the documented domain and independent facts; independent checks determine whether they do. The native task requests a minimal initial rename patch, but the agent chooses its actual patch and later corrections freely. Source-free line statistics record actual patch shape. Diagnostic receipt markers and outcome self-reports are equal across conditions; they establish cooperative receipt evidence, not correctness or causation.

The no-review methodology controls produced no verified repairs and preserved all their clean inputs; their role is to check spontaneous changes and workflow behavior, rather than serve as a third product comparator.

The independent TypeScript 5.9.3 oracle checks complete valid and invalid structural variable assignments, original independent-field types and requiredness, and alternative known repaired representations. It passed 259 offline checks. Excess-property errors, deleting independent facts, narrowing arbitrary text or hardcoding witness values cannot earn repair credit. Duplicate-count and resource-body designs additionally require blinded semantic adjudication and safe runtime probes. Unknown public APIs remain unassessed.

Case selection, source hashes, scoring obligations, physical-request ceiling, timeouts and stop conditions must be declared before live outcomes. There are no automatic retries or outcome-selected case replacements. All source is synthetic and eligible; file-access exclusions and running both products together are outside this study.

Under the [comparative research methodology](https://github.com/dearlordylord/hapsland-research/blob/master/PRODUCT-RESEARCH-METHODOLOGY.md), classifications are **BORROW** for relevant-definition collection, readable grouping and independent checks; **OPTIONAL INTEGRATION** for Abide as a neighboring reviewer subject to separate coexistence testing; **REJECT** for assuming a fixed native context window or general superiority; no new **DEPEND ON** recommendation.
