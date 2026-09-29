# Hapsland production decision visualization

**Purpose:** Explain the production decision visualization and how to build and inspect it.
**Status:** Active visualization documentation.
**Authority:** Maintained guidance.
**Expected use:** Run the dashboard and understand the scope of guided/manual replay and its evidence.
**Lifecycle:** Maintained alongside visualization source, fixtures, and build commands. Review whenever the shared adapter, page sections, replay behavior, or capacity projection changes, and at #137 final authority review.

This page replays source-free example events through the same checked
`src/canonical/adapter.ts` and compiled `Canonical.step` used by the resident.
The main flow has 13 distinct places from agent-runtime observation through
preparation, Jev authorization/attempt/response, advice, delivery, and round
closure. Connected source → destination route cards mark active data and control
movement from the current accepted canonical event and emitted commands. The
Stop fork separately shows waiting, decision readiness, continuation, allowance,
and cancellation from their respective checked commands. Rejected events leave every
place and route inactive while showing the Bend reason. The three capacity
figures come from the checked Bend projection: preparation running places,
Jev request permits, and the review capacity ledger's item/byte limits.
It does not connect to a live agent runtime or Jev.

The guided sequences come from the independently authored
`conformance/canonical-v1.json` fixture. The capacity sequence includes two advicees sharing one
ledger, a preparation release followed by accepted → refused → accepted unit
admission, a duplicate event rejection, purpose changes, and exact releases.
Six further sequences cover work, Stop, uncertain output, deadline cancellation,
and lifetime retirement.
The independent `canonical-jev-request-v1.json` traces add explicit Jev
readiness, command, observed start, result, interruption, and eight-permit
saturation cases. A ninth ready request is immediately unavailable in the
guided trace; it never appears as a Jev queue entry.
These finite source-free traces check the page projection and canonical decisions;
installed host behavior requires separate runtime evidence.
Manual input accepts one source-free canonical event as JSON. Guided and manual
events use the same adapter. Rewind, redo, and history jumps replay every event
from the checked initial state; rejected Bend events remain in the history with
unchanged state. Malformed events are refused before reaching Bend.

The **What uses review capacity** inventory is generated during `npm run build`
from compiled Bend admission output. It lists all six current reservation
purposes and their shared resident and per-agent item and byte limits. The
**Review capacity** panel reads its live totals, partitions, and reservations
from the checked projection. The preparation result strip reads ordered
commands and intermediate capacity snapshots emitted by one atomic Bend
transition; its frames are explanations, not additional resident states.

The import graph remains a separate checked Bend model for source reference
exploration. Native timing panels retain the recorded host observations and
unknown intervals without mapping old simplified Flow states onto production.

The retired pre-#119 flow diagram had twelve process/storage/boundary places,
numbered routes, packet counts, and a separate finish decision view. The
current production view replaces those with thirteen canonical places, checked
operation/request identities and queue order, highlighted routes, outcome
branches, and a finish/output decision card. Source capture and Jev/host I/O
remain labeled native boundaries; the import traversal remains a separate
model pending production integration. The dashboard's coverage disclosure
calculates guided event-kind coverage per transition family from the loaded
fixtures, names manual-only families, and links Bend source and native
boundaries.

Run `npm run build` for TypeScript, projection, compiled inventory, and Vite
checks. Run `npm run test:browser` for Chromium controls. The workspace may
need the Chromium system libraries listed by Playwright.
