# Pre-run plan: input-contract comparison

Status: pre-registered implementation plan; no paid run has been executed in this
repository.

- Backend: Jev through `@effect/ai-typesafe` `TypeSafeDecisionModel`, model id
  `jev-latest`, using the provider-neutral Effect `Decision.probability` and one
  `DecisionModel` request containing the fixed configured Noul rule batch.
- Rule-definition identity: `src/questions.ts` (`NOUL_KEYS`, all nine rules), with
  the repository's configured definitions and thresholds from `src/policy/rules.ts`.
  Rule 2 (`r2_meaningless_combinations`) is the checked expectation; other rules stay
  in the batch and are not used as new ground truth.
- Input contracts and renderer identities: `textual-diff@1` / `renderer.diff@1`,
  `whole-post-edit-file@1` / `renderer.whole-file@1`, `edited-declaration@1` /
  `renderer.declaration@1`, and `edited-declaration-bounded-context@1` /
  `renderer.declaration-context@1`. Each renderer records a SHA-256 implementation
  digest, fixture digest, post-edit content hash, path, domain, source-character count,
  and serialized request byte count.
- Corpus: 24 human-authored synthetic fixtures; six each of interfaces, type aliases,
  Zod schemas, and Effect Schema definitions. The manifest pre-registers at least 12
  context-required cases, eight diff-sufficient controls, six whole-file-dilution cases,
  and six clear negative controls.
- Repetitions: three per fixture/mode scenario. A checked scenario passes its authored
  finite band only when at least two of three available repetitions are in band.
  Clear uses `p < 0.3`; violation uses `p >= 0.7` through `p <= 1`. Missing labels are
  unchecked, and ambiguous labels are reported without affecting gates.
- Extraction caps: declaration count 32, outbound depth 3, source characters 20,000.
  These are experiment caps, not production defaults. Cold and warm extraction are
  measured separately.
- Call budget: 24 × 4 × 3 = 288 logical requests. At most two transient retries per
  request gives an absolute 864 transport-attempt maximum. Before `--live` execution,
  the operator must supply an authorization ledger whose remaining cumulative project
  budget is at least 864; the command refuses to start otherwise. The project ledger
  ceiling is 1,000 calls.
- Environment: pinned package cohort `effect`, `@effect/ai-typesafe`, and
  `@effect/vitest` `4.0.0-rc.116`; TypeScript `7.0.2`; Node runtime identity and
  renderer digests are recorded by the command environment. Credentials are checked
  for presence only.
- Deadline gates: warm declaration-context extraction p95 ≤ 250 ms and end-to-end p95
  ≤ 1,000 ms on the declared milestone environment. Median declaration-context request
  bytes must not exceed whole-file median bytes.

The final report must be `advance-to-production-architecture`, `reject-or-narrow`, or
`inconclusive`. Any missing checked observation, transport unavailability, required
incomplete context, or unavailable timing/size gate makes the result inconclusive; it
does not become a semantic negative.
