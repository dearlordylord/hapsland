# Issue #138 adoption corpus candidate

**Purpose:** Hold source-backed candidate fixtures for the #93/#138 type and function adoption decision.
**Status:** Unapproved proposal; labels, completeness outcomes, and rule targets require owner review. No live Jev calls were made for this corpus.
**Authority:** Implementation and validation groundwork, not an accepted product contract or semantic ground truth.
**Expected use:** Review each source, event, rule rationale, expected band and skip outcome before freezing a paid-run manifest. Run `python3 evidence/issue-138-adoption/verify-corpus.py` to check hashes and exact apply_patch output, then the offline product completeness test.
**Lifecycle:** Temporary until the #93/#138 adoption decision. At that decision, consolidate approved fixture and threshold terms into `docs/type-function-review-proposal.md` and the evaluation runner's versioned fixture owner; delete this proposal snapshot if superseded or rejected. Review this file when any fixture, rule, renderer, or adoption scope changes.

## What exists

`manifest.json` names 24 source-backed *proposed* semantic pairs, 12 per branch. Each record has source hashes, a Codex Add or Update patch, a selected root and declaration start, an exact branch contract/rule ID, rationale, expected completeness and comparison arms. Bands are proposals only; none have been human approved or tested against live Jev. T01/T07/F07 use Update so their unchanged local support is absent from the focused diff. T04 and T11/T12 also use Update, leaving their sibling declarations unchanged and selecting only the named root. Multi-root Add appears only in offline TI13/FI13. The paid matrix remains at most 24 pairs. The verifier executes every patch with the installed `apply_patch` command in an isolated temporary directory and compares exact post bytes; this is not a host-version conformance run.

Each case directory is a separate virtual repository: `root.ts` and `support.ts` are runtime-relative paths inside that fixture. The `sources[].path` entries locate the files in this evidence directory for hashing.

`offline-manifest.json` names 26 source-backed *proposed* offline graph/skip cases, 13 per branch. TI04/FI04 are complete-cycle controls and TI13/FI13 are multi-root Add controls; the others are skip or stale-result cases. The expected public reason for declaration-cap cases TI08/FI08 is deliberately unresolved. These records do not assert that the product already returns those codes.

`verify-corpus.py` checks fixture counts, SHA-256 of UTF-8 file bytes, path containment, selected-root header identity, 64 KiB command size, and exact patch execution/post bytes. It fails closed if the `apply_patch` executable is absent. `src/direct-event/adoption-corpus.test.ts` checks selection and current native graph completeness for all 24 semantic and 26 offline records. Its controlled DecisionModel asserts zero requests for incomplete, ambiguous, source-capped, and rule-empty cases. Complete-cycle cases have one controlled request and an included back-edge to the root; multi-root Add controls have two requests. TI10/FI10 each make one controlled request, then change supporting source at `beforeHandoff`; publication suppresses the stale finding and gives no advice. It checks that A→B→excluded C never reads C and that an oversized first imported node still leads to a read of the later import. These are offline tests, not live Jev calls. They do **not** establish semantic truth, Jev probabilities, host delivery, or the proposed acceptance thresholds.

TI05/FI05 and TI06/FI06 use verified root-only Updates. Their earlier Add forms selected unaffected sibling declarations as separate ready units, so they could not support a whole-event no-request assertion. In TI06/FI06, both oversized `huge.ts` and small `later.ts` are imports; the test observes two stable reads of each and no request for the incomplete root.

The proposed source-free skip labels are not yet all validated as public codes. Current internal observations are `missing-evidence` for the depth and tree overflow cases TI05/FI05/TI06/FI06, `declaration-limit` for TI08, `no-declarations` for FI08 and FI11, and `declaration-merge` for TI11. The test fixes these observed facts while leaving the public-code acceptance decision open.

TI07/FI07 exercise a source **above** 256 KiB, and TI08/FI08 exercise rejection of 65 declarations. Exact inclusive boundary checks already live in `selection-capture.test.ts` (262144 bytes admitted, one more rejected) and `analyzer.test.ts` (64 declarations admitted, 65 rejected); this corpus does not duplicate those boundary proofs.

## Function branch blocker

Six intended positive `r9_body_reaches_undeclared` cases have **no probability band** and cannot enter the proposed live matrix:

| Cases | Current native fact | Consequence |
| --- | --- | --- |
| F01, F02 | `Date.now()` is an `unsupported` callee inside the local/imported helper. | Unit-wide completeness must fail. |
| F03 | `globalThis.fetch` access in a transitive helper is now marked unsupported by the reviewed ambient-read analyzer fix. | Unit-wide completeness fails. |
| F04, F09, F11 | Bare `globalCounter` read is now marked unsupported by the reviewed ambient-read analyzer fix. | Unit-wide completeness fails. |

The offline product test confirms none of F01–F04/F09/F11 yields a complete selected unit after the reviewed ambient-read fix. F05–F08, F10 and F12 are proposed clear controls only. Thus the current function corpus has **no honest checked positive pair** for the proposed r9 rule and cannot support a function semantic superiority or production adoption claim. The accepted #93 unit-wide completeness gate forbids a paid call for all six blocked cases. A different owner-approved function rule could exercise currently supported body and named-call facts (for example, whether the root delegates to a statically resolved helper), but it would answer a different question and requires new human-authored positive/negative labels and a separately frozen v2 rule definition.

## Decision sequence

1. Review type T01–T12 for human-checked semantic expectations, valid rule applicability, exact graph completeness, focused-diff and whole-file comparators, and stable source hashes. A **type-only** first milestone is possible if its separate owner-approved corpus and gates pass. It does not approve the function branch.
2. Resolve the function resource-binding scope or approve a narrower rule and replace the six withheld cases with complete, checked positives. Re-review F05–F12 under the final rule.
3. Review the deterministic product-level tests for all 50 records, including source-read counts and controlled no-request checks; the hash verifier is only a structural guard.
4. Freeze exact v2 rule-pack content digests, renderer/wire examples, labels, thresholds, memory/host evidence, and finite live authorization. The candidate egress switch remains off until the accepted #93 adoption gates are met.

The prior #16 comparison remains `reject-or-narrow`; its paired context-only and whole-file-dilution gates failed. This corpus does not revise that evidence.

## Later offline egress accounting

`egress-accounting-proposal.json` is a successor observation, not an amendment to
the pre-execution `live-plan-proposal.json`. It joins the 12 proposed T cases to
their 33 focused-diff, whole-file, and applicable v1 comparator inputs and to
the pinned Effect provider's observed HTTP **body** byte counts and SHA-256
hashes. Each case lists verified fixture path/hash/byte anchors; each arm lists
the pre/post source roles and source-bearing field byte count. Repeated roles
such as a v1 root and its supporting declaration can refer to one distinct
fixture file while contributing separate source-bearing fields. Run
`node evidence/issue-138-adoption/verify-egress-accounting.mjs --check` to
verify these joins against current source files, proposal artifacts, and the
separate provider observation. The provider HTTP test in
`src/direct-event/provider-http-wire.test.ts` independently replays the body
hashes using an injected, offline client.

The later `src/direct-event/candidate-egress-accounting.test.ts` replays all 12
T-case Codex patches through the current candidate pipeline with the proposed
v2 type rule. It checks each source against its corpus hash, selects one complete
PreparedUnit, and captures that unit's exact HTTP body through an injected
`@effect/ai-typesafe` client with a sentinel key and synthetic response. Its
12 candidate rows record body bytes/hash and each rendered root or supporting
declaration's virtual path, source hash, and source-field byte count. Re-run this
test before treating those rows as current; the accounting verifier checks
their schema, fixture joins, and test-file anchor but does not replace the
pipeline/provider replay. The two earlier candidate goldens remain separate
synthetic examples and are not mapped to T01–T12.

File anchors identify full fixture buffers; a focused diff's source-field byte
count identifies the excerpt actually placed in its proposed input. Candidate
source hashes identify rendered declarations, which can be smaller than their
fixture files. The measurement excludes HTTP header bytes and transport
framing. Comparator contracts and expanded source egress still require owner
approval; this accounting does not make the paid study eligible or establish
#140's production provider-aware request limit.
