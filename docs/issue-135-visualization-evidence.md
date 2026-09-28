# #135 canonical production replay and review capacity

**Purpose:** Record the implementation boundary and validation evidence for #135.
**Status:** Integrated #135 implementation checkpoint; evidence is scoped to the runs and fixtures recorded below.
**Authority:** Implementation or validation evidence; this report does not amend accepted product behavior.
**Expected use:** Support #135 acceptance and the #137 source-linked authority review.
**Lifecycle:** Temporary. Review at #135 acceptance and again during #137. Once #137 incorporates the necessary boundary conclusions, exceptions, and validation limitations into its final authority report, consolidate those conclusions there, move any accepted product decision to its contract owner, update inbound links, and delete this snapshot. Keep executable traces and checks in their native artifacts.

Status: implementation checkpoint, 2026-09-28. Issue: [#135](https://github.com/dearlordylord/hapsland/issues/135).

The full-flow page now replays source-free guided and manual events through
`src/canonical/adapter.ts`, the same checked `Canonical.step` boundary used by
the resident. Seven independent guided sequences cover capacity, work, Stop,
uncertain output, deadlines, and lifetime retirement. Rewind, redo, and history jumps reapply inputs from the checked
initial state. Bend rejections remain in history with unchanged state; malformed
variants are refused at the adapter. Native observations, source/Jev/host
effects, and retained Bend decisions are labeled separately. Native timing
panels remain retained host evidence, with no invented Bend timestamps. The
import graph remains its independent checked model.

The build writes `capacity-inventory.generated.ts` from the compiled Bend
inventory returned by canonical admission. The page maps its six purposes to
labels and shows their shared resident and per-agent item/byte limits. Live
capacity rows, totals, and reservations come from `projectCanonical`. The
accepted → refused → accepted strip reads ordered commands and intermediate
capacity snapshots emitted by one atomic transition, including refusal reason,
unit position, and global/local usage. The true `preparationCompleted` result
and direct capacity replacement both display all four release/unit frames with
before and after event usage. The strip does not mutate the canonical state.

The simplified Flow page adapter, its offline TypeScript oracle, and their
generated JavaScript consumer were retired. `Flow.bend` remains a shared
capacity-type dependency of the unchanged Work policy artifact; no active path
calls `Flow.step`. The canonical ledger remains the reservation authority.
Independent canonical fixtures, proofs, projection
checks, and browser checks cover the retained behavior.

Checks: Bend package `npm test` (proofs, 56 canonical source-free
traces, four import-graph traces); root `npm run build`; visualization
`npm run build` (TypeScript, projection, Vite); and Chromium
`npm run test:browser` using a temporary local library directory because the
workspace image lacks Chromium system libraries. The projection check compares
every guided command and terminal usage against independent source-free fixtures.
The browser check covers guided/manual events, preparation completion and
replacement frames, rewind/redo, capacity rows, result outcomes, import replay,
and native timing. The
root `npm test -- --silent` suite passed: 602 tests passed and 2 skipped.
