# #126 canonical delivery evidence

**Purpose:** Record the implementation boundary and validation evidence for #126.
**Status:** Integrated #126 implementation checkpoint; evidence is scoped to the runs and fixtures recorded below.
**Authority:** Implementation or validation evidence; this report does not amend accepted product behavior.
**Expected use:** Support #126 acceptance and the #137 source-linked authority review.
**Lifecycle:** Temporary. Review at #126 acceptance and again during #137. Once #137 incorporates the necessary boundary conclusions, exceptions, and validation limitations into its final authority report, consolidate those conclusions there, move any accepted product decision to its contract owner, update inbound links, and delete this snapshot. Keep executable traces and checks in their native artifacts.

`Canonical.step` retains the selected Stop output slot, exact work operation
identities and finding counts, authorization phase, terminal result, and
continuation count. The submission batches also retain ordered numeric work
unit identities. `FinishAuthorize` requires the combined batch units to match
the reserved selection exactly. The resident reserves one continuation before authorizing
output and releases a provisional slot if final source, advicee, credential,
expiry, work, or output validation fails. The callback result records
acknowledged, failed, or uncertain; a duplicate result cannot consume another
slot. An uncertain result closes its original writer.

`SubmissionState.bend` retains source free advice, fingerprint, round, token,
surface, and lease phase. The resident keeps payloads, source and advicee
details, credentials, clocks, and host output in TypeScript. A finding batch
is staged atomically before writing. Background terminal advice can be offered
once at Stop in the same round after fresh revalidation. A known unwritten
offer can be rolled back and retried; an uncertain or acknowledged Stop offer
cannot. Native submission maps retain only token, timing, and payload routing
data. Suppression, reoffer eligibility, and expiry are read from canonical
state. On advice retirement or round closure the resident clears its native
routing data and the corresponding canonical leases.

A background advice submission sends advice to the agent runtime after an edit;
it does not change the source file. Its advice-submission result reports the
host handoff outcome. An acknowledged result establishes a completed handoff,
not that the agent saw the advice. An unknown result is weaker. A duplicate
result is refused. A late result after round or resident lifetime closure is
fenced by the retained owner identity. `OutputStarted` is the canonical event
that claims a pending output writer, `OutputTerminal` records its result, and
`StaleOperation` identifies a callback whose writer identity no longer owns
that output.

`conformance/canonical-delivery-v1.json` and
`conformance/canonical-submission-v1.json` carry independent source free
expected transitions. They cover exact selected units and counts, wrong writer,
duplicate terminal callbacks, a mismatched batch refused at authorization,
atomic multiple finding staging, expiry,
background to Stop reoffer, and rollback. Focused resident tests use fake
clock, source and Jev responses, and host callback ordering, including one
selected advice expiring between collection and submission.
`scripts/check-delivery-boundary.mjs` guards against reinstating the native
finding lease replay and direct handoff policy calls.

Verification: package `npm run test:canonical` passed Bend proofs and 27
independent canonical traces. Root build passed. The root offline suite passed
65 files and 591 tests, with one file and two credential-gated tests skipped.
The spec and standards reviews found no remaining blocking issue after the
selected-unit and post-collection expiry fixes.
