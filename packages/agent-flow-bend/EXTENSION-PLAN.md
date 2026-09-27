# Bend ownership plan for Hapsland

Status: implementation plan derived from common-sense lifecycle safety, the
sidecar, the accepted [Advicing target contract](../../docs/advicing-target-contract.md),
and current resident behavior, in that order. The contract's historical evidence
links are pinned; probe records are not copied into this branch.

The Bend model implements admission, fan-out, outcome tracking,
per-finding selection, finish reservation, lease transitions, logical capacity,
and a shared admission/work/finish lifecycle. The resident now uses generated
Bend for prospective admission and permits, source and review work identities,
round and Stop transitions, final finding selection, per-finding leases, response limits,
logical capacity, and the finish wait and cancellation decisions. Generated
lease offer policy routes background terminal phases to the one-time Stop
reoffer and other phases to ordinary reservation. Generated
admission policy decides permit expiry from an exact native clock fact.
Generated notice selection decides exact fit and host-specific skip or stop behavior.
Background-writer and operational-notice policies also decide their expiry,
capacity, suppression count, and pending-notice coalescing boundaries.
Generated collection policy decides readiness,
expiry, and deterministic order. Generated delivery policy decides token
transition and lease expiry. Generated cache policy decides successful-review
admission and eviction pressure. Generated ticket policy decides unit-state
transitions, failure retention, collection gate priority, and terminal outcomes. The generated
revision policy decides canonical-input reuse and which same-subject older
ticket units and advice are superseded. The generated
`Lifecycle` finish gate and final reservation now own the resident's Stop wait,
decision fence, exact work cancellation
IDs, selected pending unit counts, and continuation slot. The final IPC
barrier releases and replaces a provisional slot if its selected findings
change before encoding. Its
other aggregate events remain executable models rather than the resident's
callback state. `FinishCheck.actionable_findings` still needs to come from the
final Bend selection, and selected IDs must be consumed at write terminal.
The installed adapter uses the aggregate finish gate at Stop and the generated
component policies at their individual effect barriers; the full aggregate
reducer is not yet production authority.

## Boundary and source of truth

Bend owns every pure decision that can admit, move, select, suppress, reserve,
submit, or discard an advicee's work. The generated JavaScript is a compiled
artifact. TypeScript owns runtime hooks, canonical filesystem identity, clocks,
source capture, Jev Effect requests, output formatting, persistence and IPC.
Those effects send facts to Bend; they do not decide advice eligibility or
repair continuation. Every external callback carries the partition, lifetime,
round, and operation token that Bend issued. An adapter rejects malformed wire
values before they reach Bend and maps Bend commands to effects without adding
another policy branch.

One Bend reducer instance is keyed by an exact advicee partition (canonical
physical root, runtime/version, session, optional subagent). The identity
components are canonicalized at the runtime boundary; Bend also stores an
opaque partition digest and checks it on every event. Turn and tool IDs remain
event metadata. Multiple instances have no shared mutable advice. A separate
Bend capacity ledger handles global and partition quotas when needed.

## Required extension, in dependency order

1. **Admission and lifetime fence.** Model pre-edit permits with original
   deadline, tool-use identity, lifetime, round, and one-time consumption.
   Reject stale starts, reused permits, mismatched advicees, late callbacks,
   and arrivals after closure. Keep only source-free digests and counts in
   closure markers. No prompt, poll, turn boundary, or Stop alone opens a round.
2. **Observation fan-out and work.** Separate observation ID from review-unit
   ID. One admitted observation can prepare zero, one, or many units. A source
   reading remains unfinished until preparation closes. Every queued, active,
   or evaluating unit counts toward the all-work finish wait. Clear,
   unavailable, interrupted, and discarded are distinct outcomes; only a
   completed finding becomes pending advice.
3. **Collection and handoff.** Each advice item carries metadata needed for
   eligibility: originating round/partition, review-unit ID, age, snapshot and
   credential generations, count, and encoded-byte cost. Collection consumes
   fresh validation facts at the final handoff barrier. Select at most five
   findings and 2 KiB of final encoded output, preserving fitting leftovers.
   Individually oversized advice yields a bounded limitation. Keep notices
   separate: they can accompany advice within limits but never justify a Stop
   continuation by themselves.
4. **Leases and uncertainty.** Grant tokenized exclusive item leases. Distinguish
   unreserved, reserved, authorized, submitted, uncertain, and released states.
   A live background writer remains exclusive; the finish collector can wait
   within its original deadline or revoke only before write authorization.
   Submitted or uncertain background advice may be reoffered once in the same
   round after fresh validation. An uncertain finish write consumes its slot
   and reoffer. A known failure before authorization releases a provisional
   reservation. No later acknowledgement can mutate a closed round.
5. **Finish and closure.** At most one active finish attempt per advicee. Wait
   for all unfinished work or the original deadline; four reserved
   continuations are the absolute per-round bound. Reserve the continuation
   before output authorization. Decide `block` only for actionable selected
   advice. On `allow`, fence admissions and output first, then emit cancellation
   commands and source-free discard counts. Late effects are ignored by token,
   regardless of best-effort external cancellation. Restart creates a fresh
   lifetime with old tokens invalid and no durable continuation count.
6. **Resource accounting.** Source and Jev capacity changes never evict active
   work; global/partition byte and item reservations are released exactly once.
   Bounded queues and notice cooldowns have explicit eviction/expiry events.
   Time is an input event or validated timestamp, never an implicit clock read
   inside the pure reducer.

## Migration sequence

- Keep `Flow.bend` and its generated JS as the sidecar parity oracle while
  building a richer Bend lifecycle module. Add executable laws for one-time
  permits, work conservation, bounded batches, lease exclusivity, continuation
  bound, and closure fencing. Pair each law with a proof in `PROOF.bend`.
- Feed a deterministic, source-free event ledger through both the production
  resident and Bend. Compare decisions, emitted commands, statuses, and
  cancellation IDs, then switch the resident's pure policy calls to generated
  JS. This adapter should make malformed Bend output fail closed.
- Keep Effect-based Jev integration, source analysis, native hook/IPC code, and
  filesystem work in TypeScript. Remove redundant TypeScript policy branches
  once their calls are served by Bend. Treat the running app's existing tests as
  an oracle only where they agree with the higher-priority lifecycle rules.
- Verify offline conformance, package builds, restart/callback races, and
  bounded native Codex/Claude agent runs. A live Jev run is appropriate only
  at the declared migration milestone when credentials are present; record
  sanitized timing and contract evidence.

The sidecar does not model several requirements above. Its exact parity tests
must remain green for the overlapping event subset, but its behavior is not a
reason to preserve unsafe gaps in the richer Bend reducer.
