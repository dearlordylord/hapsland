# Report delivery: email needs recipients

**Purpose:** Explain this measured scenario, show its code and route readers to its specific checks.
**Status:** Completed exploratory scenario; generated from the current frozen comparison.
**Authority:** Comparative research advisory and validation evidence, not a product contract or release certification.
**Expected use:** Understand the problem, compare final agent code and inspect the predefined correctness checks.
**Lifecycle:** Regenerate with scripts/generate-abide-scenario-pages.mjs when the owning fixtures or current evidence change. Review when rule wording, input selection or scoring changes; replace superseded results and update links.

[Studies](../../../review-studies.md) → Report delivery · [Full methodology](../../../abide-large-declaration-study.md#methodology)

## What can go wrong

A report can be downloaded by its requester or sent by email. The type below also accepts email without recipients and download with recipients: its fields do not enforce the chosen delivery mode.

**Code:** Type. **Rule:** r2 — prevent meaningless field combinations. `CaseState` is the exported declaration name used by the experiment.

## Read the larger input

This is the exact measured input before the maintenance rename. Open the [full input file](large-separated/defect.ts).

```typescript
/** A report is downloaded by its requester or emailed to recipients. Download has no recipient list; email has at least one recipient. */
export interface CaseState {
  label: string;
  format: "csv" | "pdf";
  columns: readonly string[];
  locale: "en" | "de";
  includeHeader: boolean;
  fileStem: string;

  deliveryMode: "download" | "email";

  compression: "none" | "gzip";
  sortOrder: "ascending" | "descending";
  filters: readonly string[];
  description: string;
  footerText: string;

  recipients?: readonly [string, ...string[]];
}
```

The task asks the agent to rename `label` to `displayLabel` while preserving the domain. The defect is present before that edit.

## What happened

Each result below is **one native session on one defective input**, using **Codex CLI 0.155.1, model `gpt-6-luna`, reasoning `max`**. Both reviewers use Jev and the same target design concern; Abide 0.0.7 uses an active custom rubric. All conditions include equal diagnostic feedback reporting.

| Input layout | Hapsland session | Abide session |
| --- | --- | --- |
| Compact | Repaired · [final code](../../../../evidence/abide-large-declarations-current/report-delivery/native/blind/636f207befe0/subject.ts) | Repaired · [final code](../../../../evidence/abide-large-declarations-current/report-delivery/native/blind/60f62c1a903a/subject.ts) |
| Larger, separated fields | Repaired · [final code](../../../../evidence/abide-large-declarations-current/report-delivery/native/blind/b4a5c1940d82/subject.ts) | Not repaired · [final code](../../../../evidence/abide-large-declarations-current/report-delivery/native/blind/01c6af6912e4/subject.ts) |

Both Hapsland sessions repaired the type. The compact Abide session also repaired it, but reported `NO_FEEDBACK` and had no identified feedback output; that repair has no demonstrated feedback-to-repair link.

## What counts as a correct repair

Keep arbitrary report configuration and both delivery modes. Email must require at least one recipient; download must exclude a recipient list. A tagged delivery value or a correctly constrained top-level union can express this.

The [valid larger control](large-separated/clean.ts) was authored before the runs. It is not an agent’s final repair. Each product preserved both native clean inputs in this scenario.

## Other input variants

| Layout | Defective input | Authored valid control |
| --- | --- | --- |
| Compact | [TypeScript](small/defect.ts) | [TypeScript](small/clean.ts) |
| Larger, related fields adjacent | [TypeScript](large-adjacent/defect.ts) | [TypeScript](large-adjacent/clean.ts) |
| Larger, related fields separated | [TypeScript](large-separated/defect.ts) | [TypeScript](large-separated/clean.ts) |

Detection uses all three layouts with two reviews per input and product. Native sessions use compact and separated layouts. Four type scenarios add independent configuration facts; the two function scenarios change layout while keeping computations unchanged. These variants are not independent real-world programs.

## Inspect the checks

Compiler probes supply complete variable assignments for both valid modes and invalid combinations, and check that independent configuration fields retain their original types and requiredness.

Detection false warnings on six clean observations: **Hapsland 0/6; Abide 0/6**. Those six observations repeat the three valid layouts; they are not six independent clean designs.

- [Independent compiler oracle](../../../../scripts/score-abide-large-declarations.mjs).
- [Frozen anonymous code scores](../../../../evidence/abide-large-declarations-current/report-delivery/native/blind-scores.json).
- [Exact session and artifact mapping](../../../../evidence/abide-large-declarations-current/report-delivery/native/index.json).
- [Current comparison and source-batch map](../../../../evidence/abide-large-declarations-current/effective-comparison.json).

See [full results and limitations](../../../abide-large-declaration-study.md#results) and [shared methodology](../../../abide-large-declaration-study.md#methodology) for thresholds, sample sizes, input boundaries and what these observations do not establish.

[All scenarios](../../../review-studies.md#choose-a-scenario) · [Nine-rule coverage study](../../../abide-contextual-review-study.md)
