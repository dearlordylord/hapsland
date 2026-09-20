# Input-contract comparison milestone verdict

Status: `reject-or-narrow` (final follow-up result).

The separately authorized follow-up run completed on 2026-09-20 using the revised
corpus and gates. Its sanitized report is
[`live-report-2026-09-20-followup.json`](../../evidence/input-contract-comparison/live-report-2026-09-20-followup.json).
It made 216 applicable calls with zero transport failures. Context-required semantic
accuracy passed at 10/11, focused-diff controls passed at 7/8, negative controls passed
at 19/20, all three repetitions were available, and timing/request-size gates passed.
The context-only paired-advantage gate had 0/3 wins and the whole-file-dilution
paired-advantage gate had 0/2 wins, so declaration-oriented context did not establish a
material semantic advantage. This is valid final evidence to reject or narrow the
declaration-oriented production architecture hypothesis; no production extractor
authorization follows.

The prior revised run remains recorded below as historical evidence; it is not rescored
against the follow-up gates.

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

## Bounded follow-up disposition

The follow-up revision does not reinterpret this verdict or authorize a paid call. It
prospectively corrects two design defects: the old diff-sufficient gate scored
declaration-context, and several positive controls described Rule 3 while the run checked
Rule 2. The revised corpus uses balanced self-contained Rule 2 controls and a material,
offline-guarded whole-file contrast. Paired context/dilution wins and negative-control
performance across all applicable modes must pass the gates in [`PLAN.md`](./PLAN.md).
