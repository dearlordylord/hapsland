# #131 canonical retention and lifetime cleanup evidence

**Purpose:** Record the implementation boundary and validation evidence for #131.
**Status:** Integrated #131 implementation checkpoint; evidence is scoped to the runs and fixtures recorded below.
**Authority:** Implementation or validation evidence; this report does not amend accepted product behavior.
**Expected use:** Support #131 acceptance and the #137 source-linked authority review.
**Lifecycle:** Temporary. Review at #131 acceptance and again during #137. Once #137 incorporates the necessary boundary conclusions, exceptions, and validation limitations into its final authority report, consolidate those conclusions there, move any accepted product decision to its contract owner, update inbound links, and delete this snapshot. Keep executable traces and checks in their native artifacts.

`Canonical.step` now selects ticket eviction from retained numeric ticket
identities. The resident assigns monotonically increasing admission IDs and
checks that Bend's oldest ID matches its native handle order before deleting
the handle. Ticket phase updates no longer affect eviction order. During idle
cleanup, the resident supplies native connection and payload-presence facts to
`CleanupCheck`; Bend also requires empty dispatch work, retained work, advice
and lease lists, evaluation claims, and notices. Cache cleanup runs through
the existing canonical `CacheClear` event, then all retained tickets are
evicted through `TicketRetentionCheck`. `CleanupCommit` requires an empty ledger
and retained collection state, and closes the canonical dispatch marker in the
same synchronous turn as the native retiring phase. Repeated cleanup cannot
reopen the lifetime.

The existing canonical transitions continue to own advice expiry,
collection lease expiry, notice pruning, cache partition expiry, and discard
scope. A new `DeliveryReleaseCheck` routes the remaining unacknowledged lease
release decision through `Canonical.step`. Direct resident calls to the old
cleanup, ticket-retention, and lease-release policy exports were removed;
`scripts/check-retention-boundary.mjs` guards these routes. Retained Bend state
contains numeric identities, phases, counts, and a closed marker; source,
credentials, timestamps, native handles, and host output stay outside it.

`conformance/canonical-retention-v1.json` supplies three independent,
source-free traces. They check oldest-ticket eviction after phase reordering,
cleanup with a charged ledger, repeated cleanup after the closed marker, and
unfinished work in one advicee leaving another round intact. Resident tests
use fake clocks, Git source fixtures, controlled offline Jev, and host effects
to exercise ticket expiry and eviction, late callbacks, uncertain writes,
repeated cleanup, and release of capacity. Three focused callback tests now
assert zero retained bytes after late work and uncertain write cleanup, and
that a second cleanup cannot advance a retired lifetime. The capacity ledger
keeps its existing idempotent native reservation release fence.

Verification: Bend proofs and 43 independent canonical traces passed.
`npm run build` passed. The complete offline rerun passed 65 files and 592
tests, with one file and two credential-gated tests skipped. An earlier run
had one unrelated credential CLI child-process timeout while other work ran;
that test passed alone and in the clean full rerun. Both read-only
reviews found no concrete spec gap or documented-standard violation. The standards review suggested sharing the common cleanup-state
predicate; that simplification passed Bend proof, trace, focused resident, and
build checks after review.
