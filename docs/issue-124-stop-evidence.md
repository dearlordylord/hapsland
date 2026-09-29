# #124 canonical Stop decision evidence

**Purpose:** Record the implementation boundary and validation evidence for #124.
**Status:** Integrated #124 implementation checkpoint; evidence is scoped to the runs and fixtures recorded below.
**Authority:** Implementation or validation evidence; this report does not amend accepted product behavior.
**Expected use:** Support #124 acceptance and the #137 source-linked authority review.
**Lifecycle:** Temporary. Review at #124 acceptance and again during #137. Once #137 incorporates the necessary boundary conclusions, exceptions, and validation limitations into its final authority report, consolidate those conclusions there, move any accepted product decision to its contract owner, update inbound links, and delete this snapshot. Keep executable traces and checks in their native artifacts.

`Canonical.step` now decides whether a Stop attempt waits or crosses its
deadline for an explicit group of edit partitions. The group and each edit
partition carry exact canonical round IDs. While any source or Jev unit in
that group remains unfinished, or a native permit, delivery lease, or notice
owner remains pending, the resident keeps the Stop response open before the
deadline. At cutoff, one Bend transition marks the group and scoped rounds as
deciding, releases unfinished review charges, emits exact dispatch operation
IDs to cancel, and emits `FinishReady` or `FinishLimit` from the continuation
count. The resident aborts native jobs by those IDs. Completed findings retain
their canonical result charges. Late work callbacks cannot publish a clear
result from the removed work state; new observation admission is refused
until the decision fence ends.

The old `BendWorkTracker.finishGate` and `cutoff` entry points were removed.
That tracker remains a temporary output selection projection for #125, and
its unfinished work is synchronized after the canonical cutoff. Native
permitted edit tokens still release through canonical admission events. On a
continuing round, `StopGroupEnded` clears the group and edit partition fences;
on closure, the group and edit rounds are retired.

`conformance/canonical-stop-v1.json` is an independent source-free expected
outcome fixture. It checks two partition waiting, deadline cancellation,
late source completion, denied new admission, duplicate cutoff, stale scope
identity, exact review unit charge release, the four continuation limit,
and a completed finding whose dispatch callback is still running. Cutoff
cancels only dispatch entries whose canonical work remains unfinished.
Resident tests use temporary source files, offline Jev results, gated
callbacks, synthetic host events, and fake clock inputs. They check waiting
through later edits, queued and running Jev cancellation, late callback
cleanup, preserved advice, and continued repair work. A held
`afterAdvicePending` callback checks that completed advice is retained and
closure is not misreported as unavailable. Additional
`ComposedDelivery` tests check cross-partition fences and an external owner
that keeps the hook waiting until deadline. `check-stop-boundary.mjs` guards
the installed path against direct legacy Stop decision calls.

Verification: `npm run test:canonical` passed Bend proofs and 18 independent
canonical traces. Root `npm test -- --reporter=dot` passed 65 test files and
589 offline tests, with one file and two credential-gated tests skipped.
The focused `composed-delivery.test.ts` run passed 24 tests, and the held
callback resident regression passed. Typecheck and installed `npm run build`
passed. The final full suite ran after both reviews and the callback fix.

Canonical state contains numeric IDs, stage facts, capacity charges, and
source-free commands. Source text, credentials, Jev request and response
payloads, and host output remain native effects outside Bend.
