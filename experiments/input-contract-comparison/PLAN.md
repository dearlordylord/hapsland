# Pre-run plan: input-contract comparison

Status: revised after review; deterministic checks pass and a new credential-gated run
is pending. The prior corrected run remains historical evidence and is not used for the
revised decision.

- Backend: Jev through `@effect/ai-typesafe` `TypeSafeDecisionModel`, model id
  `jev-latest`, using the provider-neutral Effect `Decision.probability` and one
  `DecisionModel` request containing the fixed configured Noul rule batch.
- Rule-definition identity: `src/questions.ts` (`NOUL_KEYS`, all nine rules), with
  the repository's configured definitions and thresholds from `src/policy/rules.ts`.
  Rule 2 (`r2_meaningless_combinations`) is the checked expectation; other rules stay
  in the batch and are not used as new ground truth.
- Input contracts and renderer identities: `textual-diff@2` / `renderer.diff@2`,
  `whole-post-edit-file@2` / `renderer.whole-file@2`, `edited-declaration@2` /
  `renderer.declaration@2`, and `edited-declaration-bounded-context@2` /
  `renderer.declaration-context@2`. The diff contract is a focused unified hunk with
  bounded context lines around the actual member-level edit. Each renderer records a
  SHA-256 implementation
  digest, fixture digest, post-edit content hash, path, domain, source-character count,
  and serialized request byte count.
- Completeness policy revision: when a focused diff or declaration-only renderer cannot
  carry a fixture's explicitly required outbound reference, the rendered input is
  `not-applicable`, not a semantic observation. Those arms are excluded from the
  context-required baseline and repetition denominator. Required references omitted by
  an otherwise applicable renderer remain `incomplete-required` and keep the run
  inconclusive. Completeness metadata stays in the request envelope; it is not duplicated
  inside declaration-context source.
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
- Call budget: 24 × 4 × 3 = 288 logical matrix slots. Twelve context-required fixtures
  have two structurally not-applicable arms (focused diff and declaration-only), so 72
  slots make no backend call and 216 slots are applicable. With one transient retry per
  applicable request, the revised run has a 432-attempt maximum. Before `--live`
  execution, the operator must supply an authorization ledger covering that envelope;
  the command refuses to start when it does not. The project ledger ceiling is 1,000
  calls, with 432 remaining after the two prior 252-observation runs.
- Environment: pinned package cohort `effect`, `@effect/ai-typesafe`, and
  `@effect/vitest` `4.0.0-rc.116`; TypeScript `7.0.2`; Node runtime identity and
  renderer digests are recorded by the command environment. Credentials are checked
  for presence only.
- Revised semantic gates: context-required cases require at least 10 applicable
  declaration-context cases; declaration-context must exceed the applicable whole-file
  baseline by at least three cases. Diff-sufficient controls retain their original
  five-of-seven gate, whole-file dilution retains five-of-six plus a two-case advantage,
  and fully applicable clear negatives retain the one-case tolerance. Every applicable
  checked scenario still requires three available repetitions.
- Deadline gates: warm declaration-context extraction p95 ≤ 250 ms and end-to-end p95
  ≤ 1,000 ms on the declared milestone environment. Median declaration-context request
  bytes must not exceed whole-file median bytes.

The final report must be `advance-to-production-architecture`, `reject-or-narrow`, or
`inconclusive`. Any missing applicable observation, transport unavailability, required
incomplete context, or unavailable timing/size gate makes the result inconclusive;
`not-applicable` arms are reported separately and do not become semantic negatives.
