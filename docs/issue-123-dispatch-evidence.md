# #123 canonical dispatch evidence

`Canonical.step` now owns the resident dispatch queue, finite cycle counter,
FIFO sequence, two-slot concurrency ceiling, and queued versus running discard
decisions. `DispatchCycles` retains native job handles and invokes promises only
for `DispatchStarted` commands. It reports exact operation, partition, lifetime,
and round on enqueue and completion; a late or duplicate completion is denied.
The resident reports cancellation candidates as numeric operation IDs and
executes only the canonical discard commands. The named-versus-whole-cohort
discard choice also enters `Canonical.step`.

`conformance/canonical-dispatch-v1.json` records independent source-free
expectations for FIFO promotion from cycle 1 to cycle 2, two concurrent starts,
reordered completions, wrong lifetime, duplicate completion, queued versus
running discard, repeated discard, and closure. The resident dispatcher tests
use gated promises to check finite cycles and maximum concurrent execution;
the resident server fixture checks one source observation producing two
controlled offline Jev results in cycle 2, with exact sequence 1 then 2 under
a fake clock. Existing gated Stop fixtures check interruption and closure
orders against synthetic host events. The `check-dispatch-boundary.mjs` guard
prevents the former TypeScript queue, pump, counters, and direct discard-scope
policy call from returning to the installed resident path.

Canonical dispatch retains numeric identities and stage facts only. Source,
semantic evidence, credentials, Jev requests, and host responses remain native
effects outside the Bend state. `#124` still owns Stop waiting and its older
`BendWorkTracker` projection; this slice does not change that policy.
