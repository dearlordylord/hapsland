# Bend migration validation

This records source-free local verification for the generated Bend boundaries.
The resident uses generated Bend at admission, work, round, selection, lease,
capacity, and finish-wait barriers. The aggregate generated `Lifecycle` reducer
now owns the composed Stop cutoff, joining the Round decision fence with exact
Work cancellation IDs in one transition. Its other aggregate events remain an
executable model. The resident dispatcher runs asynchronous Effect
jobs, while Bend owns their source-free identities, unfinished count, pending
finding count, and cancellation IDs.

## Current generated boundaries

- `Handoff.bend` decides finding inclusion and the five item / 2 KiB final
  host output limit. TypeScript measures the exact encoded line and passes
  each advice item's actual work revision, current work generation, credential
  generations, age, and collection readiness to Bend. An individually
  oversized finding yields a bounded operational notice while its advice
  remains resident-owned.
- `Round.bend` owns the composed turn chain's active generation, exclusive
  Stop claim, four continuation slots, decision barrier, output reservation,
  closure fence, and permitted reopen. The resident maps native Stop strings
  to positive IDs and retains host output details outside the model.
- `Admission.bend` issues, consumes, releases, and closes source-free pre-edit
  permits, including a prospective round that closes without a post-edit
  observation. The native hook clock and exact event identity are checked by
  TypeScript before passing numeric facts to Bend.
- `Handoff.bend` validates exclusive finding lease transitions and decides
  suppression for edit, background, and Stop surfaces. The resident retains
  opaque finding fingerprints and replays source-free token transitions.
- `Work.bend` admits source observations, accepts streamed review fanout,
  records current findings and terminal outcomes, and returns the exact source
  and review IDs to cancel at the Stop decision. The finish wait uses Bend's
  unfinished count plus live edit-permit and output-lease facts. The resident
  checks Bend's cancellation IDs against its queued and running jobs and fails
  closed on a mismatch.
- `Lifecycle.bend` atomically begins a claimed Stop decision and cancels that
  round's unfinished Work before TypeScript discards dispatcher jobs.
- `Ledger.bend` decides global and partition item and byte reservations,
  resize, and release. TypeScript retains opaque object capabilities and maps
  exact partition strings to unique numeric IDs.
- `Background.bend` owns the per-partition background-writer claim, release,
  and expiry decisions. The resident maps opaque writer tokens to positive
  IDs and supplies active-round and global-capacity facts.
- `Notice.bend` decides cooldown suppression, refresh, creation, and
  full-table rejection from measured remaining time and key count.
- `Collection.bend` orders candidate work by cycle and sequence and decides
  readiness and pending-advice expiry from elapsed-time facts.
- `Delivery.bend` governs output-token phase transitions, authorized lease
  expiry, and when terminal background output can be reoffered at Stop.
- `Cache.bend` decides successful-review cache admission and whether its oldest
  entry must be evicted for item or byte pressure. TypeScript retains opaque
  cached results and their LRU order.
- The app build and test commands verify SHA-256 source markers in both
  generated artifacts before using them.

## Offline checks

On 2026-09-27, from this worktree:

- `npm test` in `packages/agent-flow-bend`: all proof terms checked; the
  generated lifecycle trace passed; Bend matched the sidecar in 113 traces
  with 5,048 accepted generated steps.
- The focused Bend work, composed-round, and resident-server suite passed:
  3 files and 75 tests. Cases cover streamed fanout, interleaved callback
  settlement, exact cancellation IDs, pre-edit closure, credential rotation at
  the final output barrier, and live background-writer exclusivity at Stop.
- The focused composed-delivery, operational-notice, resident-server, and
  subprocess suite passed 4 files and 84 tests after background-writer and
  cooldown admission moved to Bend. Fractional-time expiry and cooldown
  boundaries are covered. The Bend package checked six writer and four notice
  laws.
- The focused collection, terminal-collection, and resident-server suite
  passed 3 files and 87 tests after collection timing and order moved to Bend.
  The Bend package checked six additional collection laws.
- The focused composed-delivery, resident-server, and terminal-collection suite
  passed 3 files and 89 tests after output-token phase and lease timing moved
  to Bend. A fractional-time lease boundary is covered, with seven Bend laws.
- The focused evaluation-reuse and resident-server suite passed 2 files and 61
  tests after successful-review cache pressure moved to Bend. Its six new
  laws cover exact limits, existing reuse, byte pressure, and empty caches.
- The focused Bend work, composed-delivery, and resident-server suite passed
  3 files and 78 tests after the aggregate Stop cutoff became production
  authority. Two Bend laws check exact IDs and rejection of a wrong Stop token.
- Root `npm run typecheck`, `npm run build`, and `npm test`: passed. The root
  suite reported 65 passing files and 563 passing tests, with one file and
  two tests skipped.
- `npm run conformance:package` passed from a clean local package install on
  Linux arm64 and Node 24.20.0. The CLI, parser, resident, hook, installation,
  local update, and one controlled offline review passed. Real-agent and
  credential lifecycle variants were not requested by that run.
- A deterministic one-time differential trace compared the Bend backed
  `CapacityLedger` against `master:src/resident/capacity.ts` for 2,000
  reserve, resize, release, replace, clear, and snapshot operations: no
  differences.
- A deterministic one-time differential trace compared Codex and Claude
  finding selection against `master:src/resident/collection.ts` for 1,000
  synthetic candidate sets: no differences.

The differential traces used generated IDs, sizes, and finding text. No live
Jev response or credential was printed or stored. A primary-worktree ignored
`.env` exists, but no credential was present in the process environment; this
validation did not read or source the file or execute a paid Jev call.
