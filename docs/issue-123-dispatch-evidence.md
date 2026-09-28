# #123 canonical dispatch evidence

**Purpose:** Record the implementation boundary and validation evidence for #123.
**Status:** Integrated #123 implementation checkpoint; evidence is scoped to the runs and fixtures recorded below.
**Authority:** Implementation or validation evidence; this report does not amend accepted product behavior.
**Expected use:** Support #123 acceptance and the #137 source-linked authority review.
**Lifecycle:** Temporary. Review at #123 acceptance and again during #137. Once #137 incorporates the necessary boundary conclusions, exceptions, and validation limitations into its final authority report, consolidate those conclusions there, move any accepted product decision to its contract owner, update inbound links, and delete this snapshot. Keep executable traces and checks in their native artifacts.

`Canonical.step` now owns the resident dispatch queue, finite cycle counter,
FIFO sequence, two-slot concurrency ceiling, and queued versus running discard
decisions. `DispatchCycles` retains native job handles and invokes promises only
for `DispatchStarted` commands. It reports exact operation, partition, lifetime,
and round on enqueue and completion; a late or duplicate completion is denied.
Duplicate and closed admissions reach Bend before the native handle map changes;
the map is checked against the canonical live operation set after each command.
The resident reports cancellation candidates as numeric operation IDs and
executes only the canonical discard commands. The named-versus-whole-cohort
discard choice also enters `Canonical.step`.

`conformance/canonical-dispatch-v1.json` records independent source-free
expectations for FIFO promotion from cycle 1 to cycle 2, two concurrent starts,
reordered completions, wrong lifetime, duplicate completion, queued versus
running discard, repeated discard, and closure. The resident dispatcher tests
use gated promises to check finite cycles and maximum concurrent execution.
Resident server fixtures use temporary source files, a fake clock, controlled
offline Jev results, and synthetic host events: one checks sequence 1 then 2
in cycle 2, and another holds the first Jev result until the second has
arrived, confirming that cycle completion waits for both. The gated Stop
fixture releases its running callback after a synthetic deadline and confirms
that no advice is published. The `check-dispatch-boundary.mjs` guard
prevents the former TypeScript queue, pump, counters, and direct discard-scope
policy call from returning to the installed resident path.

Canonical dispatch retains numeric identities and stage facts only. Source,
semantic evidence, credentials, Jev requests, and host responses remain native
effects outside the Bend state. `#124` still owns Stop waiting and its older
`BendWorkTracker` projection; this slice does not change that policy.
