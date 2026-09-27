# Bend migration validation

This records source-free local verification for the generated Bend boundaries.
The production migration is still in progress: admission, work callbacks,
finish decisions, and delivery leases are not yet routed through the generated
lifecycle.

## Current generated boundaries

- `Handoff.bend` decides finding inclusion and the five item / 2 KiB final
  host output limit. TypeScript measures the exact encoded line.
- `Ledger.bend` decides global and partition item and byte reservations,
  resize, and release. TypeScript retains opaque object capabilities and maps
  exact partition strings to unique numeric IDs.
- The app build and test commands verify SHA-256 source markers in both
  generated artifacts before using them.

## Offline checks

On 2026-09-27, from this worktree:

- `npm test` in `packages/agent-flow-bend`: all proof terms checked; the
  generated lifecycle trace passed; Bend matched the sidecar in 113 traces
  with 5,048 accepted generated steps.
- Root `npm run typecheck`, `npm run build`, and `npm test`: passed. The root
  suite reported 63 passing files and 501 passing tests, with one file and
  two tests skipped.
- A deterministic one-time differential trace compared the Bend backed
  `CapacityLedger` against `master:src/resident/capacity.ts` for 2,000
  reserve, resize, release, replace, clear, and snapshot operations: no
  differences.
- A deterministic one-time differential trace compared Codex and Claude
  finding selection against `master:src/resident/collection.ts` for 1,000
  synthetic candidate sets: no differences.

The differential traces used generated IDs, sizes, and finding text. No live
Jev response or credential was printed or stored.
