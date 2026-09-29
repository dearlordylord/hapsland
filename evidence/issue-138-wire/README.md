# Issue #138 candidate v2 review input

**Purpose:** Make the proposed exact rendered type and function `DecisionModel` input reviewable with deterministic examples and byte counts.
**Status:** Unapproved wire proposal; no live Jev validation or expanded source egress approval.
**Authority:** Implementation and offline validation evidence. The accepted target remains `docs/type-function-review-proposal.md` (#93); these examples do not amend it.
**Expected use:** Inspect `type-candidate.json` and `function-candidate.json`, then run `npx vitest run src/direct-event/v2-wire-contract.test.ts --maxWorkers=1` and `npm run typecheck`. Review and freeze the fields, canonical encoding, limits, rule definitions, and fixture labels before any paid study.
**Lifecycle:** Temporary until the #93/#138 wire and adoption decision. At that decision, consolidate approved wire fields, encoding, version and digest rules into `docs/type-function-review-proposal.md` and a versioned conformance fixture owner; delete this proposal snapshot if superseded or rejected. Recheck this evidence whenever the renderer, request sizing, rule-pack compiler, or relevant graph contract changes.

## Proposed content

Each JSON file records two nested values from the current candidate pipeline: `providerInput`, the exact value supplied to `Decision.make`/`DecisionModel.evaluate`, and `completeRequest`, the `{input, decisions}` JSON envelope counted by the current finite pre-egress gate. The latter is a **local gate representation**, not a claim about byte-for-byte HTTP serialization by `@effect/ai-typesafe` or Jev. Both cases are constructed complete graph inputs passed through `candidateReviewInput` and `preparedProviderInput`; they are synthetic evidence facts and do not prove parser or host event behavior.

| Golden | Contract | Canonical tree bytes | Provider input JSON bytes | Complete local gate JSON bytes |
| --- | --- | ---: | ---: | ---: |
| `type-candidate.json` | `direct-event/type-shape/v2` | 474 | 777 | 942 |
| `function-candidate.json` | `direct-event/function/v1` | 553 | 854 | 1026 |

`canonicalTreeBytes` counts UTF-8 bytes of `canonicalValue({artifact,evidence})`, with recursive key sorting, ordered nodes and edges, and JSON escaping. `projectionFingerprint` is the SHA-256 of those canonical UTF-8 bytes. `providerInputBytes` counts UTF-8 bytes of `JSON.stringify(providerInput)`. `completeRequestBytes` counts UTF-8 bytes of `JSON.stringify({input,decisions})`; this is exactly what `encodedFullJevRequestBytes` measures today. The complete rendered candidate input is capped at 20 KiB. The local full request gate is 131,072 bytes, pending #140 provider-aware sizing. Both examples fit those finite gates.

The test compares both checked-in examples to the current renderer/pipeline outputs, checks the digest/version and byte formulas, and rejects absolute paths, disconnected graph source, extra artifact fields, and an oversized tree before a provider input exists. It makes no backend call. The test's explicit `UPDATE_WIRE_GOLDENS=1` switch only regenerates proposed examples for a reviewed change; ordinary runs compare and do not modify files.

## Open approval and validation

The owner must approve the exact field/encoding/version contract, corresponding v2 rule-pack definitions and corpus labels, finite study scope, and expanded source egress before live Jev use. These two examples do not establish semantic correctness, function positive labels, provider framing overhead, runtime RSS, host delivery, comparative accuracy, or production support. The current candidate egress switch remains off by default.
