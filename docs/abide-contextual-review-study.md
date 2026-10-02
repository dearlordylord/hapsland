# Contextual review and repair: a Hapsland–Abide study

**Purpose:** Explain a measured comparison of contextual review and subsequent agent repairs, with its method and limitations.
**Status:** Draft for publication review; current campaign completed on 2026-10-02.
**Authority:** Validation evidence and comparative research advisory; not an accepted product contract.
**Expected use:** Assess whether this workflow is relevant to your code and inspect the evidence behind the README excerpt.
**Lifecycle:** Review when an implementation, feedback policy, or scoring method changes. When a successor study is published, replace this account, update inbound links, and delete superseded narrative and uncited campaign snapshots. Retain the frozen evidence supporting the current claims.

## What we observed

On four selected cross-file duplicate-fact defects, repeated three times, **Codex completed independently checked repairs in 12/12 sessions with Hapsland and 1/12 with Abide configured with the same Noul concern**. Each product supplied its own response instructions during the same maintenance task.

**Hapsland also warned on all six clean-control observations.** Final checks found independent facts preserved in 6/6 Hapsland clean artifacts and 6/6 Abide clean artifacts. All six Hapsland clean sessions confirmed receipt and reported that they did not apply the warning. A warning is therefore not sufficient authority for automatic application. These are constructed, previously tested cases covering one rule, not evidence of general review superiority.

## A concrete example

An audio record stored `sampleRate` at its root and inside `track.encoding.sampleRate`, defined in an unchanged supporting file. Both represented the same encoded rate, but the type allowed them to disagree. The assigned task was to rename the presentation field `label` to `displayLabel`.

A repair had to prevent contradictory copies while retaining valid values and independent information, such as channel count. Removing a redundant field or correctly constraining the relationship could pass. The clean resampling control instead had independent native and requested playback rates: requiring equality would introduce a defect. Other cases covered build provenance, stored compression, and access grants; a second clean control distinguished stored compression from a requested future repack format.

## Results

The campaign contained **54 native Codex sessions**: six cases, three repetitions, and three arms. A separate fixed-edit stage contained 36 observations across the two reviewers.

| Measure | Hapsland | Abide with custom Noul rubric |
| --- | ---: | ---: |
| Completed sessions with final artifacts repairing the defect | 12/12 | 1/12 |
| Fixed-edit flawed cases warned on, at the configured 0.7 threshold | 12/12 | 0/12 |
| Fixed-edit false warnings on clean cases | 6/6 | 0/6 |
| Clean domains preserved under predeclared control checks | 6/6 | 6/6 |

54/54 sessions completed successfully; 54/54 final projects compiled. There were 0 actor timeouts, 0 review transport errors, and 0 recorded request-budget stops. 0 artifacts remained unassessed after the predeclared checks. All outcomes remain in the [comparison](../evidence/abide-contextual-current/comparison.json).

Hapsland had 12 defect repairs with recorded finding output, an echoed receipt marker, and a subsequent source change passing the probes. No Abide repair had that confirmed receipt-to-repair sequence; its single repaired artifact lacked verified receipt. Artifact repair counts are separate from reviewer attribution: a passing artifact without recorded receipt cannot safely be credited to that advice. The [validation record](../evidence/abide-contextual-current/validation.json) reconciles requests and source hashes.

## What the agent receives

Hapsland uses [one runtime-neutral formatter](../src/feedback/message.ts):

```text
Hapsland
Check these findings. Fix valid issues and verify; otherwise explain why.
subject.ts :: CaseState: The type appears to store the same fact in places that can disagree.
```

`hapsland --feedback-preview` displays a synthetic example without calling Jev. Actual messages come from configured rules. IDs and probabilities remain internal metadata; Claude and Codex carry the same text in their native envelopes.

Abide 0.0.7 uses a [shared source formatter](https://github.com/coldteadotai/abide/blob/ea6d0976a0cbac70f71a460ece348bd68d777350/packages/cli/src/lib/reason.ts#L14) naming the rule, its source and verdict, followed by `Repair <file> now, then continue with the task.` At turn end it asks for repair before finishing. Uncertain-result notices are separate and explicitly say they are not sent to the agent; a notice naming a rule is not necessarily actionable advice.

Every arm received identical maintenance and diagnostic reporting instructions. The task did **not** add a repair-response protocol. Fresh receipt markers were appended to rule-bearing output, asking the agent to echo them only if received. A marker establishes recorded receipt, not correctness or causation. This measures ordinary maintenance **with diagnostic instrumentation**, not completely uninstrumented default behavior.

## Methodology and fairness

This in-house study was designed and executed by the Hapsland team. **The constructed cases had previously been tested and their outcomes were known.** They were selected to investigate relationships outside an edit’s diff and frozen before this campaign. Repetitions measure consistency within four defect designs; they are not twelve independent designs or a held-out benchmark.

The comparator was the released Abide **0.0.7** handler, unchanged, with a manually active custom rubric expressing the same Noul duplicate-encoding concern. Both used Jev. Hapsland supplied a declaration and related definitions; Abide supplied its diff and task context. These configured input boundaries, response instructions, and delivery paths differ together. The experiment does not isolate a causal effect of context collection or feedback wording alone.

All fixture source files were eligible; exclusions were empty. Privacy settings, other rules, installed-release support, and simultaneous use of both products were not tested here.

Runs used Codex CLI **0.155.1**, **gpt-6-luna**, maximum reasoning effort, Linux arm64, and Node 24.20.0. Hapsland was source checkout `6c36462dd846c66fff95f8fce2453e63216b017a`. Native trust and sandbox bypass were configured for the experiment. The [platform record](../evidence/abide-contextual-current/platform.json) identifies binaries and hashes.

The no-review arm controlled for spontaneous repair during the same task: 0/12 defects were repaired and 6/6 clean domains preserved. This is a methodology control, not a third review product. The campaign had a 180-request ceiling, no automatic retries, and no outcome-selected replacements. It used 98 physical Jev requests. A setup failure consumed 28 additional preparatory detection requests before the final configuration was frozen, with no native sessions and no outcome-based replacement. These are excluded from campaign metrics; total requests including preparation were 126. See the [pre-execution declaration](../evidence/abide-contextual-current/declaration.json) and [request ledger](../evidence/abide-contextual-current/attempts.jsonl).

## Scoring and interpretation

An independent TypeScript 5.9.3 scorer read anonymous final artifacts without reviewer identity, answers, or conversation. Finite-domain probes checked predefined valid witnesses and contradictory copies. Structural variable assignments prevented excess-property errors from masquerading as semantic repairs. Unknown shapes received no repair credit. These checks are not a general proof of type correctness.

Clean-control scoring was [declared before execution](../evidence/abide-contextual-current/control-scoring-declaration.json), applied across all arms, and checked eight independent combinations per control. It accepted canonical field names or explicit `requestedSampleRate` / `requestedCompression` clarifications. Domain preservation does not mean preservation of all original API field names. Primary scores and [control results](../evidence/abide-contextual-current/control-adjudication.json) were frozen before the [arm join](../evidence/abide-contextual-current/unblinding-receipt.json). Anonymous algorithmic scoring reduces identity bias; it does not make a team-authored study external or independent.

Detection, submitted feedback, confirmed receipt, repair, and clean-domain preservation are separate observations. The current result supports this selected workflow and its observed trade-off; wider quality and uninstrumented agent behavior remain unknown.

Under the [comparative research methodology](https://github.com/dearlordylord/hapsland-research/blob/master/PRODUCT-RESEARCH-METHODOLOGY.md), the advisory classifications are **BORROW** for collecting relevant definitions and supporting justified disagreement; **OPTIONAL INTEGRATION** for Abide as a comparator or neighboring tool, subject to separate coexistence validation; **REJECT** for mandatory acceptance of every positive classification or general superiority claims; and no new **DEPEND ON** recommendation.

Result observations are **RUN / RUNTIME-TESTED** within these conditions. Formatter and scorer descriptions are **SRC / SOURCE-INSPECTED**, with their executed outcomes recorded separately. Explanations attributing the result to a particular architectural difference are **INFERRED**.

## Inspect or replay

The [current campaign directory](../evidence/abide-contextual-current/) retains frozen declarations, synthetic source artifacts, scores, receipt evidence, and accounting, without credentials or private project source. Run the oracle’s 17 self-checks offline:

```sh
node scripts/score-abide-contextual-artifacts.mjs --self-check
```

With TypeScript 5.9.3 installed at `/tmp/hapsland-quality-scorer/node_modules/typescript`, replay a saved repetition to a new output file:

```sh
node scripts/score-abide-contextual-artifacts.mjs --score \
  --blind-root=evidence/abide-contextual-current/repeat-1/blind \
  --output=/tmp/hapsland-replayed-scores.json --expected-count=18
```

This invokes no reviewer. The [live runner](../scripts/run-abide-contextual-study.mjs) records pinned tools and bounded execution; a live rerun needs credentials and a new destination and incurs review requests.
