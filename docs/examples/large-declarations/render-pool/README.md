# Render pool: allow only supported worker counts

**Purpose:** Explain this measured scenario, show its code and route readers to its specific checks.
**Audience:** Prospective users; rule authors; evaluation contributors and reviewers.
**Status:** Completed exploratory scenario; generated from the current frozen comparison.
**Authority:** Comparative research advisory and validation evidence, not a product contract or release certification.
**Expected use:** Understand the problem, compare final agent code and inspect the predefined correctness checks.
**Lifecycle:** Regenerate with scripts/generate-abide-scenario-pages.mjs when the owning fixtures or current evidence change. Review when rule wording, input selection or scoring changes; replace superseded results and update links.

[Studies](../../../review-studies.md) → Render pool · [Full methodology](../../../abide-large-declaration-study.md#methodology)

## What can go wrong

The service offers pools of exactly one, two or four workers. A plain number also accepts unsupported counts such as three or seventeen.

**Code:** Type. **Rule:** r7 — enforce what the field name promises. `CaseState` is the exported declaration name used by the experiment.

## Read the larger input

This is the exact measured input before the maintenance rename. Open the [full input file](large-separated/defect.ts).

```typescript
/** The rendering service offers exactly three pool sizes: one, two, or four workers. Worker count configures the selected pool size. */
export interface CaseState {
  label: string;
  quality: "draft" | "final";
  colorMode: "rgb" | "monochrome";
  includeBleed: boolean;
  fontFamilies: readonly string[];
  locale: "en" | "de";
  pageLayout: "portrait" | "landscape";
  compression: "none" | "gzip";
  watermark: string;
  description: string;
  outputFormat: "png" | "pdf";

  workerCount: number;
}
```

The task asks the agent to rename `label` to `displayLabel` while preserving the domain. The defect is present before that edit.

## What happened

Each result below is **one native session on one defective input**, using **Codex CLI 0.155.1, model `gpt-6-luna`, reasoning `max`**. Both reviewers use Jev and the same target design concern; Abide 0.0.7 uses an active custom rubric. All conditions include equal diagnostic feedback reporting.

| Input layout | Hapsland session | Abide session |
| --- | --- | --- |
| Compact | Not repaired · [final code](../../../../evidence/abide-large-declarations-current/render-pool/native/blind/2001df7f54cb/subject.ts) | Repaired · [final code](../../../../evidence/abide-large-declarations-current/render-pool/native/blind/aea546dad811/subject.ts) |
| Larger, separated fields | Repaired · [final code](../../../../evidence/abide-large-declarations-current/render-pool/native/blind/0f671dd507ad/subject.ts) | Not repaired · [final code](../../../../evidence/abide-large-declarations-current/render-pool/native/blind/8e2039fa640a/subject.ts) |

This is the collection’s counterexample. In the compact Hapsland session, Jev found the problem and the agent confirmed receipt, but reported `NOT_APPLIED` and left the numeric type. The compact Abide session repaired it while reporting `NO_FEEDBACK`. In the larger layout, only Hapsland repaired it.

## What counts as a correct repair

Accept all three supported counts and reject other numbers, while preserving every independent setting. For this domain, `workerCount: 1 | 2 | 4` is sufficient.

The [valid larger control](large-separated/clean.ts) was authored before the runs. It is not an agent’s final repair. Each product preserved both native clean inputs in this scenario.

## Other input variants

| Layout | Defective input | Authored valid control |
| --- | --- | --- |
| Compact | [TypeScript](small/defect.ts) | [TypeScript](small/clean.ts) |
| Larger, related fields adjacent | [TypeScript](large-adjacent/defect.ts) | [TypeScript](large-adjacent/clean.ts) |
| Larger, related fields separated | [TypeScript](large-separated/defect.ts) | [TypeScript](large-separated/clean.ts) |

Detection uses all three layouts with two reviews per input and product. Native sessions use compact and separated layouts. Four type scenarios add independent configuration facts; the two function scenarios change layout while keeping computations unchanged. These variants are not independent real-world programs.

## Inspect the checks

Complete compiler assignment witnesses test all supported counts, unsupported counts and independent settings. This is a local-value diagnostic; it does not require imported implementation context.

Detection false warnings on six clean observations: **Hapsland 0/6; Abide 0/6**. Those six observations repeat the three valid layouts; they are not six independent clean designs.

- [Independent compiler oracle](../../../../scripts/score-abide-large-declarations.mjs).
- [Frozen anonymous code scores](../../../../evidence/abide-large-declarations-current/render-pool/native/blind-scores.json).
- [Exact session and artifact mapping](../../../../evidence/abide-large-declarations-current/render-pool/native/index.json).
- [Current comparison and source-batch map](../../../../evidence/abide-large-declarations-current/effective-comparison.json).

See [full results and limitations](../../../abide-large-declaration-study.md#results) and [shared methodology](../../../abide-large-declaration-study.md#methodology) for thresholds, sample sizes, input boundaries and what these observations do not establish.

[All scenarios](../../../review-studies.md#choose-a-scenario) · [Nine-rule coverage study](../../../abide-contextual-review-study.md)
