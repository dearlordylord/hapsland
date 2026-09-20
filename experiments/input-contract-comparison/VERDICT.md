# Input-contract comparison milestone verdict

Status: `inconclusive`.

The credential-gated run completed on 2026-09-20 using the pre-registered 24 fixtures,
four renderers, three repetitions, fixed nine-rule batch, and Effect `DecisionModel`
path. It executed 288 logical calls within the declared 864-attempt maximum. There
were 252 available backend observations, no transport-unavailable observations, and
36 explicit `incomplete-required` declaration-only observations. The sanitized report
is [`live-report-2026-09-20.json`](../../evidence/input-contract-comparison/live-report-2026-09-20.json).

Observed gates:

- Warm extraction p95 (6.52 ms) and end-to-end p95 (8.17 ms) passed their milestone
  limits.
- Context-required semantic comparison, whole-file dilution, diff-sufficient controls,
  and clear-negative controls failed their pre-registered gates.
- Declaration-plus-context did not exceed diff on the context-required subset.
- Not every checked mode had three available repetitions because required context was
  intentionally excluded from declaration-only observations.
- Median declaration-context request bytes (897) exceeded whole-file median bytes
  (765).

The result does not authorize production extractor architecture. It is evidence to
reject or narrow the declaration-oriented input hypothesis until the corpus, contract,
or completeness policy receives a separately approved revision. Individual paid
probabilities, source-bearing responses, credentials, and raw provider usage were not
retained; only aggregate sanitized evidence is committed.
