# Issue #138 candidate v2 review input

**Purpose:** Make the proposed rendered type/function input and type-only comparator inputs reviewable with deterministic examples, local byte counts, and pinned provider HTTP body observations.
**Status:** Unapproved wire proposal; no live Jev validation or expanded source egress approval.
**Authority:** Implementation and offline validation evidence. The accepted target remains `docs/type-function-review-proposal.md` (#93); these examples do not amend it.
**Expected use:** Inspect `type-candidate.json`, `function-candidate.json`, `comparators-proposal.json`, and `provider-http-observations.json`, then run their offline verifier/tests and `npm run typecheck`. Review and freeze fields, encoding, limits, rules, comparator scope, and fixture labels before any paid study.
**Lifecycle:** Temporary until the #93/#138 wire and adoption decision. At that decision, consolidate approved wire and comparator fields, encoding, version and digest rules into `docs/type-function-review-proposal.md` and a versioned conformance fixture owner; delete this proposal snapshot if superseded or rejected. Recheck this evidence whenever the renderer, request sizing, rule-pack compiler, fixture corpus, Effect provider cohort, or relevant graph contract changes.

## Candidate renderer goldens

`type-candidate.json` and `function-candidate.json` each record two nested values from the current candidate pipeline: `providerInput`, the exact value supplied to `Decision.make`/`DecisionModel.evaluate`, and `completeRequest`, the `{input, decisions}` JSON envelope counted by the current finite pre-egress gate. The latter is a **local gate representation**, not a claim about byte-for-byte HTTP serialization by `@effect/ai-typesafe` or Jev. These two golden cases are constructed complete graph inputs passed through `candidateReviewInput` and `preparedProviderInput`; they are synthetic evidence facts and do not prove parser or host event behavior.

| Golden | Contract | Canonical tree bytes | Provider input JSON bytes | Complete local gate JSON bytes |
| --- | --- | ---: | ---: | ---: |
| `type-candidate.json` | `direct-event/type-shape/v2` | 474 | 777 | 942 |
| `function-candidate.json` | `direct-event/function/v1` | 553 | 854 | 1026 |

`canonicalTreeBytes` counts UTF-8 bytes of `canonicalValue({artifact,evidence})`, with recursive key sorting, ordered nodes and edges, and JSON escaping. `projectionFingerprint` is the SHA-256 of those canonical UTF-8 bytes. `providerInputBytes` counts UTF-8 bytes of `JSON.stringify(providerInput)`. `completeRequestBytes` counts UTF-8 bytes of `JSON.stringify({input,decisions})`; this is exactly what `encodedFullJevRequestBytes` measures today. The complete rendered candidate input is capped at 20 KiB. The local full request gate is 131,072 bytes, pending #140 provider-aware sizing. Both examples fit those finite gates.

The test compares both checked-in examples to the current renderer/pipeline outputs, checks the digest/version and byte formulas, and rejects absolute paths, disconnected graph source, extra artifact fields, and an oversized tree before a provider input exists. It makes no backend call. The test's explicit `UPDATE_WIRE_GOLDENS=1` switch only regenerates proposed examples for a reviewed change; ordinary runs compare and do not modify files.

## Open approval and validation

The owner must approve the exact field/encoding/version contract, corresponding v2 rule-pack definitions and corpus labels, finite study scope, and expanded source egress before live Jev use. These two examples do not establish semantic correctness, function positive labels, provider framing overhead, runtime RSS, host delivery, comparative accuracy, or production support. The current candidate egress switch remains off by default.

## Type-only comparator proposal

`comparators-proposal.json` records the proposed focused diff and whole post-edit
file inputs for T01–T12, plus the current same-file named-type v1 input for the
nine manifest-applicable cases. Run
`node --experimental-strip-types evidence/issue-138-wire/verify-comparators.mjs --check`
to rederive all 33 inputs offline and compare their exact local JSON and UTF-8
byte counts. The explicit `--write` mode regenerates the proposal after a
reviewed change; it never calls Jev. The verifier checks fixture source hashes,
patch changed lines, Noul r2 decision text/criteria/threshold equality, and the
current v1 pipeline's encoded byte counts. T01/T07 focused hunks omit the
unchanged `Status` declaration; T11/T12 retain their unrelated file tail only
in the whole-file arm.

The focused diff is a **proposed zero-context unified hunk** derived from the
verified pre/post `root.ts` buffers. For Add, every new line is in the hunk;
for Update, it includes the exact changed lines and old line without surrounding
source. The whole-file arm uses the exact post-edit `root.ts` buffer. Neither
arm adds imported `support.ts` or unrelated repository files. Their proposed
Effect input contracts are `proposal/focused-unified-diff/v1` and
`proposal/whole-post-edit-file/v1`; these names and payload shapes require owner
approval. Historical #16 compared focused and whole-file modes through its
then-current `{path, source}` backend path. It did **not** establish these new
Effect `DecisionModel` input shapes. The final #16 result remains
`reject-or-narrow`.

The v1 arm is derived by `prepareObservation` and `preparedProviderInput` under
the existing `direct-event/same-file-named-types/v1` contract, with the bundled
Noul r2 rule alone. `sourceScope` records which pre/post paths can contribute
source and the UTF-8 bytes in source-bearing fields; `providerInputBytes` and
`localRequestBytes` count JSON encoding separately. The local request is
`{input, decisions}` before provider serialization. The provider HTTP envelope,
its byte count, backend/model settings, and an exact cross-arm rule batch identity
remain unresolved. The proposed v2 rule has a qualified decision key, whereas
the current v1 rule has its existing bare key; both carry the same authored
question, criteria, and threshold. An owner-reviewed comparator plan must settle
that identity difference before a paired live study. No source-bearing live
responses or credentials were used or retained here.

## Later offline provider HTTP observation

`provider-http-observations.json` records a later, independent observation for the
two synthetic candidate goldens and all 33 proposed comparator arms. Run
`npx vitest run src/direct-event/provider-http-wire.test.ts --maxWorkers=1` to
replay it. The test feeds each checked-in `{input, decisions}` value through
Effect `Decision.make` and `DecisionModel.decide` with the installed,
exact-pinned `@effect/ai-typesafe@4.0.0-rc.116` client. An injected `HttpClient`
records the generated request and returns a synthetic response; it cannot call
the network. The test checks the POST URL, auth/accept/content-type header
values, content-length/body-size equality, body field structure, and all 35
SHA-256/UTF-8 byte observations. The
checked-in file contains only sanitized header names, decision keys, input
contract names, body hashes, and byte counts; it contains neither source text
nor bearer value.

For this pinned client and these fixtures, the body is
`{model:"jev-latest",state:<input>,questions:<Noul definitions>}`. Candidate
type/function HTTP **body** sizes are 956/1,040 bytes, compared with 942/1,026
bytes at the local `{input,decisions}` gate. Every measured comparator arm also
adds exactly 14 bytes. The fixture decision `_tag` becomes provider `type:"noul"`;
its instructions and criteria remain unchanged. The exact size of HTTP headers,
transport framing, real backend behavior, and any other provider/model version
were not measured. The test rehydrates already proposed local inputs; it does
not prove that the runtime emits every comparator arm, or that the backend
accepts these candidate contracts. #140 still owns production provider-aware
full-request sizing. This observation does not approve source egress or satisfy
the #93/#138 live-study and adoption gates. The earlier unverified declaration
in `comparators-proposal.json` is preserved as the proposal's pre-observation
state; this later evidence records what the pinned local provider actually sent.
