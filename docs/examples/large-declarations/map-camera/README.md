# Map camera: a center needs both coordinates

**Purpose:** Explain this measured scenario, show its code and route readers to its specific checks.
**Status:** Completed exploratory scenario; generated from the current frozen comparison.
**Authority:** Comparative research advisory and validation evidence, not a product contract or release certification.
**Expected use:** Understand the problem, compare final agent code and inspect the predefined correctness checks.
**Lifecycle:** Regenerate with scripts/generate-abide-scenario-pages.mjs when the owning fixtures or current evidence change. Review when rule wording, input selection or scoring changes; replace superseded results and update links.

[Studies](../../../review-studies.md) → Map camera · [Full methodology](../../../abide-large-declaration-study.md#methodology)

## What can go wrong

A map either starts at a geographic center or fits all markers. Independently optional latitude and longitude also allow a partial center, such as latitude with no longitude.

**Code:** Type. **Rule:** r3 — keep the parts of one fact together. `CaseState` is the exported declaration name used by the experiment.

## Read the larger input

This is the exact measured input before the maintenance rename. Open the [full input file](large-separated/defect.ts).

```typescript
/** A map may have an initial geographic center; the center consists of both latitude and longitude. Without a center the viewport fits all markers. */
export interface CaseState {
  label: string;
  theme: "light" | "dark";
  showLegend: boolean;
  markerLabels: readonly string[];
  showZoomControls: boolean;
  allowRotation: boolean;

  centerLatitude?: number;

  locale: "en" | "de";
  layerNames: readonly string[];
  showScale: boolean;
  description: string;
  attribution: string;

  centerLongitude?: number;
}
```

The task asks the agent to rename `label` to `displayLabel` while preserving the domain. The defect is present before that edit.

## What happened

Each result below is **one native session on one defective input**, using **Codex CLI 0.155.1, model `gpt-6-luna`, reasoning `max`**. Both reviewers use Jev and the same target design concern; Abide 0.0.7 uses an active custom rubric. All conditions include equal diagnostic feedback reporting.

| Input layout | Hapsland session | Abide session |
| --- | --- | --- |
| Compact | Repaired · [final code](../../../../evidence/abide-large-declarations-current/map-camera/native/blind/c31e3ea16f74/subject.ts) | Not repaired · [final code](../../../../evidence/abide-large-declarations-current/map-camera/native/blind/8005161587cd/subject.ts) |
| Larger, separated fields | Repaired · [final code](../../../../evidence/abide-large-declarations-current/map-camera/native/blind/4cbcc69aa56e/subject.ts) | Not repaired · [final code](../../../../evidence/abide-large-declarations-current/map-camera/native/blind/deaf31d05cbc/subject.ts) |

Hapsland repaired both tested defect layouts. In detection, it also warned once on a valid compact control. Both products preserved their two native clean controls; detecting a problem and giving a correct warning are separate obligations.

## What counts as a correct repair

Preserve optional centering and arbitrary coordinates. When a center exists, both coordinates must exist. Keep every independent map setting and its admitted values.

The [valid larger control](large-separated/clean.ts) was authored before the runs. It is not an agent’s final repair. Each product preserved both native clean inputs in this scenario.

## Other input variants

| Layout | Defective input | Authored valid control |
| --- | --- | --- |
| Compact | [TypeScript](small/defect.ts) | [TypeScript](small/clean.ts) |
| Larger, related fields adjacent | [TypeScript](large-adjacent/defect.ts) | [TypeScript](large-adjacent/clean.ts) |
| Larger, related fields separated | [TypeScript](large-separated/defect.ts) | [TypeScript](large-separated/clean.ts) |

Detection uses all three layouts with two reviews per input and product. Native sessions use compact and separated layouts. Four type scenarios add independent configuration facts; the two function scenarios change layout while keeping computations unchanged. These variants are not independent real-world programs.

## Inspect the checks

Compiler probes accept no center and a complete center, reject each partial center, and verify independent-field preservation. Known nested and complete-or-absent top-level representations are checked.

Detection false warnings on six clean observations: **Hapsland 1/6; Abide 0/6**. Those six observations repeat the three valid layouts; they are not six independent clean designs.

- [Independent compiler oracle](../../../../scripts/score-abide-large-declarations.mjs).
- [Frozen anonymous code scores](../../../../evidence/abide-large-declarations-current/map-camera/native/blind-scores.json).
- [Exact session and artifact mapping](../../../../evidence/abide-large-declarations-current/map-camera/native/index.json).
- [Current comparison and source-batch map](../../../../evidence/abide-large-declarations-current/effective-comparison.json).

See [full results and limitations](../../../abide-large-declaration-study.md#results) and [shared methodology](../../../abide-large-declaration-study.md#methodology) for thresholds, sample sizes, input boundaries and what these observations do not establish.

[All scenarios](../../../review-studies.md#choose-a-scenario) · [Nine-rule coverage study](../../../abide-contextual-review-study.md)
