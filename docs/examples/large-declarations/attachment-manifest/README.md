# Attachment manifest: one source for the count

**Purpose:** Explain this measured scenario, show its code and route readers to its specific checks.
**Audience:** Prospective users; rule authors; evaluation contributors and reviewers.
**Status:** Completed exploratory scenario; generated from the current frozen comparison.
**Authority:** Comparative research advisory and validation evidence, not a product contract or release certification.
**Expected use:** Understand the problem, compare final agent code and inspect the predefined correctness checks.
**Lifecycle:** Regenerate with scripts/generate-abide-scenario-pages.mjs when the owning fixtures or current evidence change. Review when rule wording, input selection or scoring changes; replace superseded results and update links.

[Studies](../../../review-studies.md) → Attachment manifest · [Full methodology](../../../abide-large-declaration-study.md#methodology)

## What can go wrong

A manifest stores attachments and their count independently. It therefore accepts an empty list with count two, or a one-item list with count zero.

**Code:** Type. **Rule:** r4 — avoid storing the same fact twice. `CaseState` is the exported declaration name used by the experiment.

## Read the larger input

This is the exact measured input before the maintenance rename. Open the [full input file](large-separated/defect.ts).

```typescript
/** The attachment total is the number of entries in attachments. It is displayed as a badge; no entries are hidden or counted separately. */
export interface CaseState {
  label: string;
  subject: string;
  bodyText: string;
  tags: readonly string[];
  category: "internal" | "customer";
  locale: "en" | "de";

  attachments: readonly { filename: string; mediaType: "image/png" | "application/pdf" }[];

  showPreview: boolean;
  layout: "compact" | "comfortable";
  showSender: boolean;
  footerText: string;
  description: string;

  attachmentCount: number;
}
```

The task asks the agent to rename `label` to `displayLabel` while preserving the domain. The defect is present before that edit.

## What happened

Each result below is **one native session on one defective input**, using **Codex CLI 0.155.1, model `gpt-6-luna`, reasoning `max`**. Both reviewers use Jev and the same target design concern; Abide 0.0.7 uses an active custom rubric. All conditions include equal diagnostic feedback reporting.

| Input layout | Hapsland session | Abide session |
| --- | --- | --- |
| Compact | Repaired · [final code](../../../../evidence/abide-large-declarations-current/attachment-manifest/native/blind/fe122dc1bf5d/subject.ts) | Not repaired · [final code](../../../../evidence/abide-large-declarations-current/attachment-manifest/native/blind/c5555b92e4d6/subject.ts) |
| Larger, separated fields | Repaired · [final code](../../../../evidence/abide-large-declarations-current/attachment-manifest/native/blind/a6c9cdc9b41d/subject.ts) | Not repaired · [final code](../../../../evidence/abide-large-declarations-current/attachment-manifest/native/blind/ec3b87db5603/subject.ts) |

Both Hapsland sessions removed redundant count and retained attachments. Neither Abide session repaired the independent count. The authored valid control demonstrates the intended representation; it is separate from the agents’ final code.

## What counts as a correct repair

Retain arbitrary attachments, filenames, media types and independent settings. Derive the count from the actual list or enforce equality. Removing the redundant count while keeping the list is a valid repair.

The [valid larger control](large-separated/clean.ts) was authored before the runs. It is not an agent’s final repair. Each product preserved both native clean inputs in this scenario.

## Other input variants

| Layout | Defective input | Authored valid control |
| --- | --- | --- |
| Compact | [TypeScript](small/defect.ts) | [TypeScript](small/clean.ts) |
| Larger, related fields adjacent | [TypeScript](large-adjacent/defect.ts) | [TypeScript](large-adjacent/clean.ts) |
| Larger, related fields separated | [TypeScript](large-separated/defect.ts) | [TypeScript](large-separated/clean.ts) |

Detection uses all three layouts with two reviews per input and product. Native sessions use compact and separated layouts. Four type scenarios add independent configuration facts; the two function scenarios change layout while keeping computations unchanged. These variants are not independent real-world programs.

## Inspect the checks

Blinded review checks all independent fields and arbitrary filenames. Compiler witnesses and empty/one/two-item array probes check count derivation availability. These type fixtures contain no UI badge renderer.

Detection false warnings on six clean observations: **Hapsland 0/6; Abide 0/6**. Those six observations repeat the three valid layouts; they are not six independent clean designs.

- [Blinded semantic judgments](../../../../evidence/abide-large-declarations-current/manual/attachment-manifest.json).
- [Executable probes](../../../../evidence/abide-large-declarations-current/manual/probes/attachment-manifest/adjudicate.mjs).
- [Frozen anonymous code scores](../../../../evidence/abide-large-declarations-current/attachment-manifest/native/blind-scores.json).
- [Exact session and artifact mapping](../../../../evidence/abide-large-declarations-current/attachment-manifest/native/index.json).
- [Current comparison and source-batch map](../../../../evidence/abide-large-declarations-current/effective-comparison.json).

See [full results and limitations](../../../abide-large-declaration-study.md#results) and [shared methodology](../../../abide-large-declaration-study.md#methodology) for thresholds, sample sizes, input boundaries and what these observations do not establish.

[All scenarios](../../../review-studies.md#choose-a-scenario) · [Nine-rule coverage study](../../../abide-contextual-review-study.md)
