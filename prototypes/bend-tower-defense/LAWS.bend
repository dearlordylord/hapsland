# PROPOSED, NOT APPROVED: behavioral laws for a later proof pass.
# The runnable prototype does not import this file.
# Human approval of law scope precedes proofs under the bend-ldd workflow.
import Base
import ./Model.bend as M

# Overkill damage and overspending cannot wrap into a huge unsigned value.
law equal_damage_zero:
  for +hp: U32
  {M.sub(hp, hp) == 0 : U32}

# A zero-cost transaction or zero-damage hit preserves its original amount.
law zero_damage_identity:
  for +hp: U32
  {M.sub(hp, 0) == hp : U32}

# With arbitrary bounded coordinates, range distance is independent of direction.
law distance_symmetric:
  for +x: U32
  for +y: U32
  for +tx: U32
  for +ty: U32
  {M.distance(x, y, tx, ty) == M.distance(tx, ty, x, y) : U32}

# Ordinary tower-defense behavior still needs additional proposed laws for
# affordable placement, pause preservation, wave accounting and one kill bounty.
# The headless examples exercise those cases; they are not universal proofs.

# FLOW GAME PROPOSALS -- NOT APPROVED, NO PROOFS WRITTEN.
# Each proposed theorem needs valid config, unique IDs and bounded U32 premises.
# 1. Accounting: offered = live packets + finished + dropped at every tick.
#    Why: capacity and deadline losses must never vanish or masquerade as coverage.
# 2. Identity/routing: successful transfer preserves ID and age; successor is
#    configured nextFinding for a finding and next for clear work.
#    Why: architecture changes should alter scenario data, not token semantics.
# 3. Reservation: stage occupancy never exceeds resourceLimit; nonheld occupancy
#    fits workers + queueLimit (workers alone for an immediate-refusal station).
#    Why: blocked-ready work still owns capacity; no transient ghost slot exists.
# 4. Backpressure/refusal: blocked ordinary transfers retain source reservation;
#    refused immediate transfers release it and record exactly one drop/refusal.
#    Why: waiting and lost coverage are distinct teaching outcomes.
# 5. Holding: completed service retains a configured resource for holdTicks;
#    reassignment cannot shorten this hold or duplicate completion.
#    Why: processing speed and retained-resource pressure are different limits.
# 6. Workers: allocated + free = configured pool; removing a worker preserves
#    active service and all admitted queue/resource reservations.
#    Why: reallocating must have a real opportunity cost and no capacity exploit.
# 7. Demand independence: pacing alone cannot change authored demand count,
#    per-demand identity or finding classification.
#    Why: compare decisions on the same work, rather than easier hidden outcomes.
# 8. Determinism: identical action/tick sequences give identical full states;
#    paused, preparation and terminal states are identities under advance.
#    Why: frame rate and pause cannot select outcomes or drain resources.
# 9. Damage saturates at zero; terminal loss remains terminal under advance.
#    Why: health underflow must not become an accidental victory.
# These are human-readable drafts, not filled or mechanically proved laws.

# ROAD DEFENSE PROPOSALS -- NOT APPROVED, NO PROOFS WRITTEN.
# Valid geometry/unique identity/finite bounded arithmetic are necessary premises.
# 1. Same queue: approach, arrival, processing, holding and upstream blocking keep
#    the same stage and packet ID until a configured successor transfer succeeds.
#    Why: the road is queue slack, not a second product lifecycle state.
# 2. Recurring damage integrates every inside packet exactly once per tick,
#    including held/blocked packets; all safe-road packets contribute zero.
#    Why: danger begins at a building and remains until work leaves that queue.
# 3. Simultaneous arrivals preserve existing + new inside reservations <= slots;
#    ordinary full destinations keep the packet on their safe road.
#    Why: the visual building limit must match actual admission semantics.
# 4. Processing towers affect only unfinished inside work in physical range;
#    they cannot erase IDs, bypass release conditions or damage safe-road packets.
#    Why: placement/processing changes throughput rather than product outcomes.
# 5. Construction/upgrade spend exactly their displayed cost only when affordable
#    and legal; placement rejects roads, buildings and overlapping structures.
#    Why: construction must have a real and predictable opportunity cost.
# 6. Offered demand is conserved as live + finished + dropped; pacing preserves
#    immutable demand IDs/classes; missed wave demand is represented explicitly.
#    Why: roads must not hide lost coverage or improve a policy's denominator.
# 7. Pause/preparation/terminal advance is exact state identity; fixed-tick
#    batching preserves outcomes; health and pressure residual do not wrap.
#    Why: rendering/pause must not choose mechanics outcomes.

# ROAD QUEUE INCREMENT PROPOSALS -- NOT APPROVED, NO PROOFS WRITTEN.
# Valid scenario, unique packet IDs and bounded arithmetic are necessary premises.
# 1. Independent capacities: storage occupancy <= slots, active service <= workers.
#    Why: a free storage place must not create a parallel request permit.
# 2. Active service: queued and group-held packets receive no natural service
#    or processor effort; only eligible worker-active or selected writer members
#    can progress. Freed workers promote eligible work.
#    Why: increasing speed must not silently grant unlimited concurrency.
# 3. Ordinary readiness: an edit becomes eligible only after every authored
#    sibling has been offered and all preparation/review units have settled.
#    Completed unrelated edits remain independently eligible.
#    Why: new preparation dispatch does not imply a cohort-wide advice barrier.
# 4. Outcome preservation: speed, placement, upgrades and pacing preserve edit
#    membership, finding classification and authored encoded-byte sizes.
#    Why: honest throughput comparisons cannot suppress findings to improve score.
# 5. Output: each reservation fits its configured encoded-byte limit, has one
#    writer, releases each member exactly once on acknowledgement, and leaves
#    overflow live. Timed flushes prevent sparse partial batches waiting forever.
#    Why: batching and delivery ownership must be visible, bounded and conserved.
# 6. Stop: automatic entry fixes its cutoff; preparation, review and an active
#    writer can keep WAIT pending. Decision cancels unfinished work once and
#    enables completed partial findings; late pre-decision work cannot return.
#    Why: an empty output queue does not establish that the round can finish.
# 7. Responses: one Stop response selects at most one byte-bounded batch; finite
#    continuation attempts preserve retained overflow without claiming repair.
#    Why: a finish response cannot mean unlimited batch delivery.
# 8. Conservation: offered = live + clear + submitted + refused + cancelled +
#    limited. Retained output remains live, including an incomplete debrief.
#    Why: unavailable, cancelled and oversized work must never masquerade as clear.
# 9. Automatic operation: all worker/tower/batch/Stop progression follows ticks
#    without an activation key; pause and terminal states preserve full state.
#    Why: player decisions are construction and placement, not repeated firing.

# AUTOMATIC SUPPORT FAMILY PROPOSALS -- NOT APPROVED, NO PROOFS WRITTEN.
# 1. Parallelizer adds at most two aggregate permits to its nearest covered
#    ordinary service pool; storage, road limits and writer ownership are unchanged.
#    Why: concurrency is a separate scarce resource from queue storage.
# 2. Coordinator accelerates only an already worker-active unfinished sibling
#    of a completed retained finding; greatest blocked finding count wins, then
#    least remaining effort and lowest ID. It never changes scheduler permits,
#    readiness or outcomes; multiple unfinished siblings can still block release.
#    Why: speeding a dependency is not permission to pretend that it is settled.
# 3. Packager reduces only modeled item encoding overhead of FUTURE reservations,
#    never immutable finding content, identifiers, hard byte capacity, writer
#    count, reserved bytes or acknowledgement requirements. It raises ordinary
#    batch target; flush timeout and Stop still override that target.
#    Why: more efficient packing has a latency tradeoff and cannot rewrite leases.
# 4. Shield mitigation consumes its finite pressure-job-tick charge exactly once,
#    never exceeds half arrived pressure at any covered building or globally
#    on a tick, and never changes jobs,
#    service, readiness, Stop deadline or outcome counters. Only legitimate wave
#    start restores its charge; upgrade and repeated N cannot restore it.
#    Why: temporary health relief must preserve the unresolved architectural debt.
# 5. All four effects are automatic, range-bound and budgeted by construction;
#    pause and terminal advance preserve tower charges and cumulative prevention.
#    Why: the lesson is placement and allocation rather than activation timing.
