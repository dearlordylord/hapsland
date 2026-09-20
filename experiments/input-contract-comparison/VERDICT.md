# Input-contract comparison milestone verdict

Status: `reject-or-narrow`.

The revised credential-gated run completed on 2026-09-20 using the 24-fixture corpus,
four versioned renderers, three repetitions, fixed nine-rule batch, and Effect
`DecisionModel` path. The revised policy records focused-diff and declaration-only arms
as `not-applicable` when they cannot carry a fixture's explicitly required outbound
reference. Those arms are excluded from semantic denominators and never treated as
semantic negatives. The sanitized report is
[`live-report-2026-09-20-revised.json`](../../evidence/input-contract-comparison/live-report-2026-09-20-revised.json).

The corrected pre-revision run and an aborted attempt are retained as historical
operational evidence only. The aborted attempt reserved budget for non-applicable arms
and stopped before producing a report; the reservation bug was fixed before the revised
run. Its sanitized note is
[`revised-run-operational-failure-2026-09-20.json`](../../evidence/input-contract-comparison/revised-run-operational-failure-2026-09-20.json).

Observed gates in the revised run:

- Context-required semantic accuracy passed at 10/11 applicable checked cases.
- Three available repetitions passed for every applicable checked scenario.
- Warm extraction p95 (2.01 ms), end-to-end p95 (2.87 ms), and request-size comparison
  passed; declaration-context median request bytes were 770 versus whole-file 774.
- Context-plus-reference did not exceed whole-file on the context-required comparison
  (delta 0, required 3).
- Whole-file dilution reached 3/6 (5 required), diff-sufficient controls reached 2/7
  (5 required), and fully applicable clear negatives reached 2/4 (3 required).

This is valid evidence to reject or narrow the declaration-oriented production
architecture hypothesis. The focused diff contract is still a plausible review input,
and bounded context extraction is fast and size-neutral in this corpus, but the semantic
advantage is not established and the controls are not strong enough for production
authorization. Do not run another paid matrix without a newly approved corpus or gate
revision. Individual paid probabilities, source-bearing responses, credentials, and raw
provider usage were not retained; only aggregate sanitized evidence is committed.
