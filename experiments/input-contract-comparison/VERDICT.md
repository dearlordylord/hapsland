# Input-contract comparison milestone verdict

Status: `inconclusive`.

The corrected credential-gated run completed on 2026-09-20 using the pre-registered
24-fixture corpus, four renderers, three repetitions, fixed nine-rule batch, and Effect
`DecisionModel` path. The corrected corpus contains real member-level before/after edits;
the `textual-diff@2` renderer sends a focused unified hunk with the declaration header
and nearby changed-member context, not the whole post-edit declaration. The sanitized
report is [`live-report-2026-09-20-corrected.json`](../../evidence/input-contract-comparison/live-report-2026-09-20-corrected.json).

The first run is retained as superseded evidence only: its fixtures used marker-only
edits and its diff renderer emitted whole-file line sets. It must not be used for the
milestone decision.

Observed gates in the corrected run:

- Warm extraction p95 (0.74 ms) and end-to-end p95 (0.82 ms) passed their milestone
  limits.
- Declaration-plus-context exceeded the corrected focused diff by three context-required
  cases and exceeded declaration-only by nine, satisfying those comparison deltas.
- The context-required candidate still reached only 9/11 checked cases (10 required),
  whole-file dilution reached 3/6 (5 required), and diff-sufficient controls reached
  3/7 (5 required).
- Clear negative controls passed at 5/6. This is useful evidence that the focused diff
  did not simply make every result positive, but it does not repair the failed semantic
  gates.
- Thirty-six declaration-only observations were explicitly `incomplete-required`, so
  the three-available-repetitions gate remains unmet. Declaration-context median request
  bytes (905) also exceeded whole-file (756).

The result does not authorize production extractor architecture. It supports a narrower
follow-up: preserve the focused diff contract for review, and separately decide whether
declaration-only should be a paid comparison arm when required references are unavailable.
Do not spend another paid matrix on this corpus until that completeness/denominator policy
and the failed dilution/control gates are revised and approved. Individual paid
probabilities, source-bearing responses, credentials, and raw provider usage were not
retained; only aggregate sanitized evidence is committed.
