# Review studies and code examples

**Purpose:** Guide readers from comparative results to concrete code, scenario explanations and detailed evidence.
**Status:** Maintained research navigation; linked studies own their measured results.
**Authority:** Maintained navigation for comparative research advisory and validation evidence, not a product contract or release certification.
**Expected use:** Choose an example, understand what was tested and inspect the checks behind a result.
**Lifecycle:** Update when a study, scenario or current evidence owner changes. Review when fixtures, scoring, rule wording or comparison scope change; replace superseded summaries and remove obsolete links.

[Main README](../README.md) → Studies

A small maintenance edit can leave a design problem elsewhere in a type or function. These studies compare whether review identifies that problem, whether feedback reaches the agent and whether the agent makes a correct repair.

## Start with an example

- [Email needs recipients](./examples/large-declarations/report-delivery/README.md): a type permits combinations the delivery mode should forbid.
- [One source for an attachment count](./examples/large-declarations/attachment-manifest/README.md): a stored count can disagree with its list.
- [Make the booking clock explicit](./examples/large-declarations/reservation-window/README.md): a function reads time through an undeclared dependency.

Each scenario page shows the problem, actual input code, final agent code and the specific correctness checks. All six scenarios, including the [compact render-pool counterexample](./examples/large-declarations/render-pool/README.md), are below.

## What the current numbers mean

The larger-declaration study contains **six scenarios: four types and two functions, covering five of the nine Hapsland rules evaluated at execution time**. Each scenario has one compact defective input and one larger separated defective input in the native comparison.

| Defective inputs in native sessions | Hapsland sessions repaired | Abide sessions repaired |
| --- | ---: | ---: |
| Six compact inputs — one per scenario | 5/6 | 2/6 |
| Six larger separated inputs — one per scenario | 6/6 | 0/6 |
| Both forms — twelve inputs per product | 11/12 | 2/12 |

**6/6 means six checked repairs in six sessions, one per larger scenario.** It does not mean six rules or six repetitions per scenario. Each native cell is one session using **Codex CLI 0.155.1, model `gpt-6-luna`, reasoning `max`**. Both reviewers use Jev and the same target design concerns; Abide 0.0.7 uses an active custom rubric. All conditions include equal diagnostic feedback reporting.

All twelve defective Hapsland sessions had a positive Jev answer and confirmed feedback receipt; eleven resulted in checked repairs. In the compact render-pool session, the agent declined the advice. Abide sessions produced two repairs without a verified feedback-to-repair link. Separately, Hapsland gave one false warning in 36 clean detection observations; Abide gave none. Detection counts are repeated review observations, not native repairs.

These are selected synthetic examples. Differences also appeared on compact inputs; the collection does not establish that size caused the gap or that either product is generally superior. See the [complete results](./abide-large-declaration-study.md#results) for all outcomes and limits.

## Choose a scenario

| Scenario | Code | Problem and rule | Read the example |
| --- | --- | --- | --- |
| Report delivery | Type | Invalid delivery/recipient combinations (`r2`) | [Email needs recipients](./examples/large-declarations/report-delivery/README.md) |
| Map camera | Type | Partial geographic center (`r3`) | [Both coordinates belong together](./examples/large-declarations/map-camera/README.md) |
| Attachment manifest | Type | Count can disagree with attachments (`r4`) | [One source for the count](./examples/large-declarations/attachment-manifest/README.md) |
| Render pool | Type | Unallowed worker counts (`r7`) | [Allowed values and the compact counterexample](./examples/large-declarations/render-pool/README.md) |
| Reservation window | Function | Hidden clock dependency (`r9`) | [Make the clock explicit](./examples/large-declarations/reservation-window/README.md) |
| Moderation decision | Function | Hidden audit-writing dependency (`r9`) | [Make the writer explicit](./examples/large-declarations/moderation-decision/README.md) |

Both function scenarios exercise the same rule, so six scenarios cover five rules. The four type scenarios add independent configuration fields. The function scenarios keep their computations unchanged and expand signatures and paragraph layout.

A **rule** defines the concern to check. A **scenario** gives that concern a concrete domain. An **input variant** is a particular source file and layout. A **finding** is review advice; a **checked repair** is a final code change that satisfies the predefined domain checks.

Each scenario has three layouts, each with a defective input and an authored valid control: **6 × 3 × 2 = 36 input variants**. Detection tests all three layouts; native work tests compact and larger separated layouts. The valid controls are starting inputs, not copies of an agent’s repair.

## Explore the full studies

| Study | Coverage | What to inspect |
| --- | --- | --- |
| [Larger declarations and layout](./abide-large-declaration-study.md) | Five rules, six scenarios, 36 variants | Complete detection/repair tables, Abide input boundaries, shared methodology and source-batch accounting |
| [Compact examples across all nine rules](./abide-contextual-review-study.md) | A separate duplicate-fact matrix and a matrix for the eight other rules | Additional examples, per-rule results, false warnings and final source |
| [Hapsland and Abide](./abide-comparison.md) | Review inputs, file access and data retention | Architecture, joint operation and links to measured review quality |

The older “eight rules” count refers to the eight rules besides duplicate-fact rule `r4`, which had its own study. New setup now provisions **seven defaults** after [the default review](./configuration.md#default-rule-dispositions). These historical studies evaluated nine rules, including the two removed defaults. The studies use different inputs and repetitions; their repair counts are not pooled into a single rating.

## Inspect the evidence

For most readers, start with a scenario page: it links directly to that scenario’s final source, anonymous scores and compiler or behavior probes. For the complete matrix, see the [current comparison and source-batch map](../evidence/abide-large-declarations-current/effective-comparison.json) and the [methodology](./abide-large-declaration-study.md#methodology). The full report explains the declared moderation rerun and distinguishes executed sessions from the current comparison.
