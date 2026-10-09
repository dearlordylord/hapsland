# Reservation window: make the clock explicit

<!--
**Purpose:** Explain this measured scenario, show its code and route readers to its specific checks.
**Status:** Completed exploratory scenario; generated from the current frozen comparison.
**Authority:** Comparative research advisory and validation evidence, not a product contract or release certification.
**Expected use:** Understand the problem, compare final agent code and inspect the predefined correctness checks.
**Lifecycle:** Regenerate with scripts/generate-abide-scenario-pages.mjs when the owning fixtures or current evidence change. Review when rule wording, input selection or scoring changes; replace superseded results and update links.
-->

[Studies](../../../review-studies.md) → Reservation window · [Full methodology](../../../abide-large-declaration-study.md#methodology)

## What can go wrong

Booking decisions depend on the current time, but the function signature below does not declare a clock. Its helper `readServiceTime()` calls `Date.now()`, which reads the system clock. The same booking arguments can therefore yield a different decision as time passes.

**Code:** Function. **Rule:** r9 — declare the resources the body uses. `CaseState` is the exported declaration name used by the experiment.

## Read the larger input

This is the exact measured input before the maintenance rename. Open the [full input file](large-separated/defect.ts) and [helper definitions](large-separated/support.ts).

```typescript
import { readServiceTime, type Clock, type ReservationRequest, type ReservationDecision } from "./support";
/** Reservation decisions prioritize temporary closure, expired holds, then insufficient inventory. An active hold expires at its deadline. Inventory decreases only for an available booking; reference and trimmed presentation description are preserved. */
export function CaseState(
  label: string,
  request: ReservationRequest,
): ReservationDecision {
  const description = label.trim();
  const requested = request.requestedSeats;
  const remaining = request.remainingSeats;

  const reference = request.reference;
  const availableSeats = Math.max(0, remaining - requested);
  const observedAt = readServiceTime();

  const expired = request.holdUntil <= observedAt;
  const unavailable = requested > remaining;

  const status = request.temporarilyClosed ? "closed" : expired ? "expired" : unavailable ? "unavailable" : "available";
  return { description, reference, status, seatsAfterBooking: status === "available" ? availableSeats : remaining };
}
```

The task asks the agent to rename `label` to `displayLabel` while preserving the domain. The defect is present before that edit.

## What happened

Each result below is **one native session on one defective input**, using **Codex CLI 0.155.1, model `gpt-6-luna`, reasoning `max`**. Both reviewers use Jev and the same target design concern; Abide 0.0.7 uses an active custom rubric. All conditions include equal diagnostic feedback reporting.

| Input layout | Hapsland session | Abide session |
| --- | --- | --- |
| Compact | Repaired · [final code](../../../../evidence/abide-large-declarations-current/reservation-window/native/blind/cff9268f656d/subject.ts) | Not repaired · [final code](../../../../evidence/abide-large-declarations-current/reservation-window/native/blind/4374c4ec9a8b/subject.ts) |
| Expanded signature, grouped body | Repaired · [final code](../../../../evidence/abide-large-declarations-current/reservation-window/native/blind/aa670314cf4b/subject.ts) | Not repaired · [final code](../../../../evidence/abide-large-declarations-current/reservation-window/native/blind/f31a729e290e/subject.ts) |

Both Hapsland sessions declared and used a Clock. Neither Abide session repaired the hidden clock dependency. Across layouts, the function keeps the same computations and ordering; the larger forms expand the signature and paragraph layout.

## What counts as a correct repair

Declare a usable clock or observation time and actually use it. Preserve closure → expiry → insufficient inventory → availability precedence, the booking reference and trimmed description. Decrement inventory only for an available booking.

The [valid larger control](large-separated/clean.ts) was authored before the runs. It is not an agent’s final repair. Each product preserved both native clean inputs in this scenario.

## Other input variants

| Layout | Defective input | Authored valid control |
| --- | --- | --- |
| Compact | [TypeScript](small/defect.ts) | [TypeScript](small/clean.ts) |
| Expanded signature, compact body | [TypeScript](large-adjacent/defect.ts) | [TypeScript](large-adjacent/clean.ts) |
| Expanded signature, grouped body | [TypeScript](large-separated/defect.ts) | [TypeScript](large-separated/clean.ts) |

Detection uses all three layouts with two reviews per input and product. Native sessions use compact and separated layouts. Four type scenarios add independent configuration facts; the two function scenarios change layout while keeping computations unchanged. These variants are not independent real-world programs.

## Inspect the checks

Blinded runtime probes use deadline 100 with times 99, 100 and 101, closed and insufficient-inventory cases, and distinct supplied versus hidden clock values. They check actual supplied-clock use, call counts and exact inventory updates.

Detection false warnings on six clean observations: **Hapsland 0/6; Abide 0/6**. Those six observations repeat the three valid layouts; they are not six independent clean designs.

- [Blinded semantic judgments](../../../../evidence/abide-large-declarations-current/manual/reservation-window.json).
- [Executable probes](../../../../evidence/abide-large-declarations-current/manual/probes/reservation-window/probe.mjs).
- [Frozen anonymous code scores](../../../../evidence/abide-large-declarations-current/reservation-window/native/blind-scores.json).
- [Exact session and artifact mapping](../../../../evidence/abide-large-declarations-current/reservation-window/native/index.json).
- [Current comparison and source-batch map](../../../../evidence/abide-large-declarations-current/effective-comparison.json).

See [full results and limitations](../../../abide-large-declaration-study.md#results) and [shared methodology](../../../abide-large-declaration-study.md#methodology) for thresholds, sample sizes, input boundaries and what these observations do not establish.

[All scenarios](../../../review-studies.md#choose-a-scenario) · [Nine-rule coverage study](../../../abide-contextual-review-study.md)
