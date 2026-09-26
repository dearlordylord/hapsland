# Issue #95 arm-aware descriptive addendum — 2026-09-24

The [initial blind source scores](./blind-artifact-scores-2026-09-24.md) were frozen before the [mapping key](./blind-score-key-2026-09-24.md) was opened. `candidate-r4` is fresh A1, scoring **65/100**; `candidate-m7` is fresh B1, scoring **72/100**. These are two final-source descriptions, not a paired comparison: B1 has no complete sanitized host record, and the planned second pair was not run. No A-minus-B difference, mean, variance, or treatment-effect estimate is reported.

## A1 final defects and supported-unit eligibility

All five frozen source deductions for A1 are in `src/types.ts`. The final production analyzer reports that file as analyzed, with 16 named roots ready. The A1 hook observer saw one `src/types.ts` Add at about 292 seconds; its SHA-256 matches the final tree exactly. That snapshot lists the same 16 ready roots. The observer's snapshot is **observational only**: it reads after a patch hook and does not independently certify native patch success or map later provider requests to each root. The product's 16 Jev submissions establish backend activity, but the sanitized ledger does not retain root IDs for each request.

| Blind defect | Named root eligibility in the A1 snapshot and final analyzer | Limit on attribution |
| --- | --- | --- |
| Rule 1, lifecycle without a discriminant | `TraceTapeCase` ready | Source defect present in a ready root; no rule-specific Jev result or advice retained. |
| Rule 2, `end` or logs without `begin` | `TraceTapeCase` ready; its referenced `BeginRecord`, `LogRecord`, and `EndRecord` roots also ready | Same source counterexample overlaps rule 1; no distinct backend finding can be validated. |
| Rule 3, declaration repeated in two shapes | `CaseDeclarationRecord` and `TraceTapeCase` each ready; `TraceTapeDocument` ready and refers to record and case shapes | This is a cross-root relationship. The two standalone roots do not by themselves prove the full relationship was in a particular Jev request. |
| Rule 4, independent `records`, `cases`, `run`, and `done` | `TraceTapeDocument` ready, with referenced record and case shapes | The duplicate representation is in the ready root; no request-level or rule-level result retained. |
| Rule 5, empty fail detail | `EndRecord` ready, with `CaseStatus` ready | The final type admits the blind counterexample; no rule-specific Jev result retained. |

Other final files: `diagnostics.ts`, `formatter.ts`, `parser.ts`, and `summary.ts` were unsupported as whole files because of imports; `index.ts` and `instant.ts` had no declaration roots. Their implementation behavior may matter to the 65-point artifact score, but they are outside the supported named-type exposure cells. The ready status establishes analyzer admission, not Jev correctness or host visibility.

## B1 final defects and supported-unit eligibility

The final B1 tree is preserved at [`runs/fresh-pair-1-B/tree/`](./runs/fresh-pair-1-B/tree/). A focused offline check passed its `src/types.ts` contents to the production `analyzeTypeFile("src/types.ts", source)` analyzer. It returned `analyzed` for 15 named roots; every root named by the four frozen m7 deductions was ready, with the local referenced type shapes included in each unit:

| Blind defect | Named roots ready in the final B1 analyzer check | Final-tree classification |
| --- | --- | --- |
| Rule 1, lifecycle without a discriminant | `TraceTapeCase` | The material source defect remains in an analyzer-ready root. |
| Rule 2, `end` or logs without `begin` | `TraceTapeCase`, `BeginRecord`, `LogRecord`, `EndRecord` | The material lifecycle counterexamples remain in analyzer-ready roots; the case unit includes its referenced record shapes. |
| Rule 4, competing document encodings | `TraceTapeDocument` | Ready with the referenced record and case shapes in its evidence closure, including `TraceTapeRecord` and `TraceTapeCase`. |
| Rule 5, conditional end detail | `EndRecord`, `CaseStatus` | The material conditional-detail defect remains in analyzer-ready roots. |

This classifies **final-tree analyzer readiness** only. B1 was the control with no Hapsland hook configured and no Jev calls expected, so these roots were not exposed to Hapsland review; no finding delivery, host visibility, or repair can be inferred. The B1 sanitized session record is absent after the post-copy harness failure described in the [stop report](./stop-report-2026-09-24.md).

## Finding and visibility denominators

The [sanitized A1 ledger](./runs/fresh-pair-1-A/sanitized.json) records 16 Jev requests and 16 HTTP 200 completions. Product activity markers contain **8 finding outcomes with 9 total finding lines**, alongside 8 clear, 4 pending, 3 incomplete, and 1 unavailable markers. Those are marker counts, not distinct validated defects. The retained provider-completion events and activity markers contain no finding rule IDs or source-bearing content; no finding can be matched to one of the five blind defects or classified true/false from this evidence. Reportable rule IDs in agent-facing advice: **none**.

The delivery denominator is 8 backend finding outcomes (9 finding lines): **0 finding submissions**, **0 of 11 hook responses containing advice**, **0 recorded finding-rule acknowledgments**, and **0 demonstrated model-visible finding/reaction pairs**. One host message matched a broad Hapsland mention, but it contained no rule ID or review-feedback match; it is not evidence of seeing a finding. Seven later hooks after backend outcomes returned quiet responses, so the exact collection, revalidation, or advicee decision that prevented advice is unresolved. No repair can be attributed to Hapsland. The five final defects remained in the unchanged `src/types.ts` source.

This addendum updates eligibility classification after unblinding; it does not alter the frozen scores, the original preregistration, the A1 outcome, or the [pilot stop report](./stop-report-2026-09-24.md).
