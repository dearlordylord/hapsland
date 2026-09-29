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
closure. A connected SVG draws numbered paths between those places, following
the earlier Flow.bend diagram's spatial layout. The
[`agent-flow-projection`](../agent-flow-projection/README.md) package reads checked
reducer projections and assigns identified items to conceptual flow stages.
The FoldKit view maps those stages to named, positioned squares and draws
possible connections. The package compares checked state before and after each replay step to locate
work, dispatch entries, requests, advice, and delivery by stable identity.
Connections that cannot be established from that comparison use explicit
event, command, or supplied-fact rules in the projection package, with their evidence type
shown to the viewer. Dashed paths show commands, which do not prove that a
native effect happened or that the destination holds data. A step with no
cross-square movement explains its changed square or decision instead of
inventing an arrow. `collectionFindingRetained` stays at the collection
step because it keeps an existing finding for a later batch. The `finishAllowed`
commands also stay at collection: they do not authorize host output or change
the round in that Bend step. Node contents come from the checked canonical state;
the Stop fork shows waiting, decision readiness, continuation, allowance,
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

The default guided case starts with `openRound` for the first edit. Its step
panel explains the production cause: the resident receives an attributed edit,
checks and consumes an edit permit, then observation admission asks the canonical
ledger for a round. The ledger emits `openRound` if that partition has no round
ID yet. The source-free trace supplies `openRound` directly and omits the native
arrival and permit events.
It then follows both findings through advice leases, acknowledged output,
finalization, and round retirement. At its last step, the checked projection
has no active round, work, capacity charges, ready advice, leases, submission
batches, or output slot. Retained source-free counters are separate from those
active resources. The round retirement connection is shown only when the
checked round disappears; an output authorization alone does not close it.

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

The pre-#119 Flow.bend diagram's connected routes, numbered arrows, and
separate finish decision view informed this production diagram. Its retired
illustrative reducer and TypeScript page were removed from the active source.
The current
view projects thirteen canonical places, checked operation/request identities
and queue order, highlighted paths, outcome branches, and a finish/output
decision card. Source capture and Jev/host I/O remain labeled native boundaries.
The separate import section replays ImportGraph.bend decisions from source-free
fixtures; it is not a second production reducer. The dashboard's coverage disclosure
calculates guided event-kind coverage per transition family from the loaded
fixtures, names manual-only families, and links Bend source and native
boundaries.

## Inspecting the changed connection

For the Jev result color, inspect the "clear is a distinct observed request
result" guided case at step 7/8 in the [connected diagram](index.html):
[before](docs/assets/production-flow-jev-clear-before-color.png) and
[after](docs/assets/production-flow-jev-clear-after-color.png). The Awaiting
Jev result square changes from gold to blue because it displays checked Bend
work and request permits. Connection 13 into Review outcomes changes from
orange to gold when the external clear result is supplied. A `neverSent` result
does not light that gold connection. This color change does not alter reducer
state, stage inference, or possible routes.

In the default guided example, inspect step 25, `collectionReady` for advice
`#10`: [before the inferred projection](docs/assets/production-flow-before-inference-step-25.png)
and [after](docs/assets/production-flow-inferred-step-25.png). The earlier view
showed `ready #10` but left the Review outcomes → Pending advice connection
inactive. The current view lights connection 14 from the checked new ready
advice and labels its source as a supplied native fact. Connection 16 separately
shows Bend's `collectionEligible` command. [Step 24](docs/assets/production-flow-inferred-step-24.png)
shows the preceding `retainFinding` command as purple while Pending advice
still says `ready none`; it does not claim storage happened yet. The exact
producing work ID for advice `#10` is not projected, so that relationship is
disclosed rather than inferred. These images document this code change; #147
design acceptance still requires owner inspection of the interactive cases.
The other named owner-review panels are [ninth Jev request refusal](docs/assets/production-flow-inferred-jev-refusal.png)
(guided step 29/34: eight in flight, immediate unavailable command, no Jev
queue) and [Stop wait](docs/assets/production-flow-inferred-stop-wait.png)
("many units admit in order and Stop waits," step 4/7: `waitForWork`
at collection while the round remains active).

Run `npm run build` for TypeScript, checked connection evidence, projection, compiled inventory, and Vite
checks. Run `npm run test:browser` for Chromium controls. The workspace may
need the Chromium system libraries listed by Playwright.
