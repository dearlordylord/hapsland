# #122 observation and review transition evidence

The resident admits each source observation through `Canonical.step`, then
returns measured source and prepared unit facts to the same state. A source can
yield no units or several units. Each prepared unit receives a canonical
operation ID and a capacity reservation ID; those IDs follow queued, active,
completed, interrupted, and discarded callbacks. TypeScript retains source,
semantic input, credentials, Jev requests, and host effects by native handles.
The canonical state retains only numeric identity, lifetime, round, work stage,
parent observation ID, reservation, byte count, and capacity purpose.

The canonical review observation transition receives the current-work fact and
the completed Jev outcome. A current finding changes its reservation purpose
to `storedResult` and remains pending. A stale finding, clear result, or failed
review releases its review reservation. The existing revalidation effect may
temporarily mark a retained finding charge as `adviceRecheck`; it restores the
`storedResult` purpose before delivery or final cleanup. The compiled capacity
inventory includes both purposes and their shared limits.

`conformance/canonical-review-v1.json` gives independent source-free
expectations for zero, one, and multiple units, exact parent/operation IDs,
wrong lifetime and round, duplicate completion, stale finding retirement,
unavailable work, and queued discard. The resident server tests use temporary
source files, controlled offline Jev answers, synthetic host and IPC events,
and callback order gates. `server.test.ts` verifies one observation fan-outs to
two independently retained results with a fake clock, controlled Jev answers,
and temporary source files; the delivery-lease test holds a running unit at a
callback gate while queued units are discarded by a synthetic Stop/deadline
event. The unavailable path requires canonical completion before publishing
failure effects. The boundary guard prevents the direct prepared,
empty, evaluation, and failure policy wrappers from returning to the resident.

`StaleOperation` covers both a duplicate notification for an already completed
unit and a late notification after its unit was retired. The transition can
prove that neither currently owns a live operation, but it does not retain a
terminal ID history to distinguish those causes. The event ledger and native
callback timing must be consulted for diagnosis; neither case creates a
second finding or capacity charge.

The older `BendWorkTracker` remains as a Stop policy projection until #124
migrates Stop waiting and cancellation. It has no source-bearing payload. The
installed review result and capacity decisions above now enter the canonical
transition; #123 moves scheduling order and #124 moves the Stop projection.
