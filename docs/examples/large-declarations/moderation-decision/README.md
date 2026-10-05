# Moderation decision: make the audit writer explicit

**Purpose:** Explain this measured scenario, show its code and route readers to its specific checks.
**Status:** Completed exploratory scenario; generated from the current frozen comparison.
**Authority:** Comparative research advisory and validation evidence, not a product contract or release certification.
**Expected use:** Understand the problem, compare final agent code and inspect the predefined correctness checks.
**Lifecycle:** Regenerate with scripts/generate-abide-scenario-pages.mjs when the owning fixtures or current evidence change. Review when rule wording, input selection or scoring changes; replace superseded results and update links.

[Studies](../../../review-studies.md) → Moderation decision · [Full methodology](../../../abide-large-declaration-study.md#methodology)

## What can go wrong

Each decision must record the submission ID, status and exact original text once. The helper `appendAudit()` appends to a shared in-memory audit log, but this writing capability is absent from the function signature.

**Code:** Function. **Rule:** r9 — declare the resources the body uses. `CaseState` is the exported declaration name used by the experiment.

## Read the larger input

This is the exact measured input before the maintenance rename. Open the [full input file](large-separated/defect.ts) and [helper definitions](large-separated/support.ts).

```typescript
import { appendAudit, type AuditWriter, type ModerationInput, type ModerationDecision } from "./support";
/** Each moderation decision records submission ID, selected status and exact original text once, including rejected and empty submissions. The returned text is trimmed. Empty, excessive length and blocked terms take precedence in that order. Matching is case insensitive. */
export function CaseState(
  label: string,
  input: ModerationInput,
): ModerationDecision {
  const description = label.trim();
  const submissionId = input.submissionId;
  const normalizedText = input.rawText.trim();

  const comparable = normalizedText.toLowerCase();
  const blocked = input.blockedTerms.some(term => comparable.includes(term.toLowerCase()));
  const empty = normalizedText.length === 0;

  const tooLong = normalizedText.length > input.maximumLength;
  const status = empty ? "empty" : tooLong ? "too-long" : blocked ? "blocked" : "accepted";
  const entry = submissionId + ":" + status + ":" + input.rawText;

  appendAudit(entry);
  return { description, submissionId, normalizedText, status };
}
```

The task asks the agent to rename `label` to `displayLabel` while preserving the domain. The defect is present before that edit.

## What happened

Each result below is **one native session on one defective input**, using **Codex CLI 0.155.1, model `gpt-6-luna`, reasoning `max`**. Both reviewers use Jev and the same target Noul concern; Abide 0.0.7 uses an active custom rubric. All conditions include equal diagnostic feedback reporting.

| Input layout | Hapsland session | Abide session |
| --- | --- | --- |
| Compact | Repaired · [final code](../../../../evidence/abide-large-moderation-corrected-current/moderation-decision/native/blind/c047cb5dd785/subject.ts) | Not repaired · [final code](../../../../evidence/abide-large-moderation-corrected-current/moderation-decision/native/blind/6bb2d2c54732/subject.ts) |
| Expanded signature, grouped body | Repaired · [final code](../../../../evidence/abide-large-moderation-corrected-current/moderation-decision/native/blind/f364f24e44ac/subject.ts) | Not repaired · [final code](../../../../evidence/abide-large-moderation-corrected-current/moderation-decision/native/blind/d93f27ef8d6c/subject.ts) |

Both Hapsland sessions used an explicit writer and passed the behavior probes. Neither Abide session repaired the hidden writer dependency. This scenario uses the declared renderer-repair batch; fixtures and scoring stayed unchanged.

## What counts as a correct repair

Declare a usable audit writer and use the supplied writer. Keep exactly one raw audit entry, trimmed returned text and every public result field. Preserve empty → too long → blocked → accepted precedence; deleting audit is not a repair.

The [valid larger control](large-separated/clean.ts) was authored before the runs. It is not an agent’s final repair. Each product preserved both native clean inputs in this scenario.

## Other input variants

| Layout | Defective input | Authored valid control |
| --- | --- | --- |
| Compact | [TypeScript](small/defect.ts) | [TypeScript](small/clean.ts) |
| Expanded signature, compact body | [TypeScript](large-adjacent/defect.ts) | [TypeScript](large-adjacent/clean.ts) |
| Expanded signature, grouped body | [TypeScript](large-separated/defect.ts) | [TypeScript](large-separated/clean.ts) |

Detection uses all three layouts with two reviews per input and product. Native sessions use compact and separated layouts. Four type scenarios add independent configuration facts; the two function scenarios change layout while keeping computations unchanged. These variants are not independent real-world programs.

## Inspect the checks

Blinded runtime probes check exact raw audit entries, one write per decision, empty and rejected input, length boundaries, arbitrary case-insensitive blocked terms and all returned facts. Compiler checks preserve the full input/output contract.

Detection false warnings on six clean observations: **Hapsland 0/6; Abide 0/6**. Those six observations repeat the three valid layouts; they are not six independent clean designs.

- [Blinded semantic judgments](../../../../evidence/abide-large-moderation-corrected-current/manual/moderation-decision.json).
- [Executable probes](../../../../evidence/abide-large-moderation-corrected-current/manual/probes/moderation-decision/probe.mjs).
- [Frozen anonymous code scores](../../../../evidence/abide-large-moderation-corrected-current/moderation-decision/native/blind-scores.json).
- [Exact session and artifact mapping](../../../../evidence/abide-large-moderation-corrected-current/moderation-decision/native/index.json).
- [Current comparison and source-batch map](../../../../evidence/abide-large-declarations-current/effective-comparison.json).

See [full results and limitations](../../../abide-large-declaration-study.md#results) and [shared methodology](../../../abide-large-declaration-study.md#methodology) for thresholds, sample sizes, input boundaries and what these observations do not establish.

[All scenarios](../../../review-studies.md#choose-a-scenario) · [Nine-rule coverage study](../../../abide-contextual-review-study.md)
