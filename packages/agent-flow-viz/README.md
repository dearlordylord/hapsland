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
and cancellation from their respective checked commands. Waiting gives unfinished
reviews time to become advice before the safe deadline; cancellation is requested for
work still unfinished when Hapsland makes its finish decision. The
[accepted advicee contract](../../docs/advicing-target-contract.md) explains
why this bounded wait exists. Rejected events leave every
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
showed `ready #10` but left the Review outcomes → Advice ready / retained connection
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

## Seeded simulation walkthrough

The `Monkey-business · seeded simulation` panel consumes the public
`monkey-business` run API. It maps checked frames onto the existing 13 places
and routes. It adds controls without changing diagram layout or product policy.
All Jev observations are simulated; no credentials or source files are needed.
The simulation has its own **Review capacity** bar and per-agent item/byte totals,
using the same presentation as the canonical examples. It follows the displayed
checked observation, including paused history inspection.

1. Keep seed `7`, edit interval `100`, reservation bytes `100` and Jev delay
   `50`. Click **Start / reset**, then **Single step**. Inspect the event,
   ordered commands, checked before/after projections and synthetic effects.
   **Resume** plays the same virtual engine; playback speed changes observation
   pace without choosing random values or product policy. Edit the speed field
   while running, including temporary empty text, dots or decimal values. The
   **Active speed** remains in use until **Apply playback speed** accepts a finite
   value from `0.01` to `1000`; `1.` applies as `1`. Invalid Apply preserves playback
   and active settings, with a persistent validation message. Other numeric
   drafts likewise require their Apply button. **Start / reset** applies initial
   drafts together. Named Normal, Slow Jev, Failure → recovery and Capacity
   pressure scenarios fill drafts and explain the next action.
2. Pause and inject a burst of `5`. Step through preparation and overlapping
   review. History includes transitions without cross-square movement and
   ordinary Bend refusals, which are product outcomes rather than run errors.
3. Open **Simulated Jev outcome mix**, set Backend failure or Timeout weight to
   `100` and the other weights to `0`, then set delay to `500` and apply the
   profile. New requests use that profile; in-flight completion
   times stay fixed. Inspect identified request effects and results.
4. Set No finding (clear) weight to `100`, others to `0`, with delay `50` for
   recovery, apply it, and suspend edit
   generation. Resume so outstanding work can settle. When suspended work settles, playback waits; **Resume edit generation**
   schedules fresh edits and running playback processes them without an extra
   Resume click. An explicitly paused driver stays paused. Playback pause stops the
   browser driver; edit suspension stops future arrivals. Agent finish attempts
   appear as `stopPolled`; Hapsland's `finishAllowed*` command is a separate checked
   outcome. Suspension itself never emits a finish attempt.
5. Click a history event to pause and inspect its time separately from the live
   endpoint. Use Previous/Next, the retained-event timeline, Return to latest and
   Bookmark. Click a diagram square, or use the collapsed keyboard stage picker,
   to list identified records in the bounded inspector below the diagram. Click
   the selected square again to deselect it. Click a record to filter history to
   its lifecycle. Capacity and control timelines sit below the diagram so
   changing records and control history do not move its position.
   Pending advice counts exclude submitted records; retained submitted advice
   stays visible until checked closure or expiry. The outcome summary counts
   admitted observations, refusals/unavailability, failures and confirmed host submissions
   across the whole run, including records and display frames later retired.
6. Pause and export replay. Copy **Replay JSON**, reset (or open a fresh browser),
   paste JSON and load. Loading reconstructs initial inputs and recorded controls
   to the recorded endpoint. The final frame is reproduced; identity mismatches
   show an error. Download/Import replay file supports the same validated JSON
   and preserves the bookmarked event. **Replay from start** rebuilds initial
   inputs; Resume or Single step executes recorded controls and stops at the
   exact saved endpoint, including metadata-only time/control changes. Drafts
   remain editable while replaying, but new environment controls wait until
   recorded replay completes. Intermediate branching is unsupported.

The initial outcome mix has Finding and No finding (clear) weights of `50`
each; the other four weights are zero. Sliders use relative weights from `0` to
`100`, not percentages. Each displayed probability is its weight divided by the
sum; Finding `100` and Clear `100` therefore mean `50%` each. Sliders are drafts
and never change the active profile until **Apply simulated Jev profile** applies
the mix and delay together. All-zero drafts show an inline message and failed
Apply preserves playback and the previous active profile. Native range controls
support keyboard arrows, Home and End. Named deterministic scenarios set one
outcome to `100` and the others to zero. Replay restores the recorded raw weights
and their normalized probabilities.

The freshness, credential and host output controls are also drafts. **Apply environment facts** records current/stale work and ready/unavailable credentials
at a virtual boundary. A delayed request observes the current freshness when
it settles; changing credentials affects subsequent authorization checks.
**Apply host output profile** records certain, uncertain or failed output,
its delay and lease lifetime for future output authorizations. Already authorized
output keeps its captured profile. Empty or invalid delay/lease drafts never
change active values or stop playback.

Use the **Freshness change** scenario to invalidate an in-flight finding, and
**Credential recovery** to restore readiness after refused request admission.
**Unreadable final source** exercises candidate revalidation before host handoff;
it does not simulate filesystem preparation failure. **Credential rotation**
changes the generation authorizing retained advice. **Uncertain output** exposes delivery uncertainty and recovery; switch to certain
output for future attempts. **Expired delivery lease** sets output delay longer
than its lease to exercise revalidation before delivery. These scenarios fill
drafts; Start / reset applies their initial settings. The active facts display,
checked event details, item lifecycle filter and recorded control timeline
separate proposed settings, applied boundaries and observed product outcomes.
`neverSent` and `interrupted` are additional synthetic Jev outcomes for request
admission investigation. Unavailable Jev requests are not automatically resent;
new edits make fresh admission attempts. Confirmed host submissions establish
simulated handoff, not agent receipt or use. Exported replay preserves these controls and their
execution boundaries.

Reservation size controls supply reservation/review-unit byte facts for checked
admission. They do not establish native capture, evidence-tree, encoded-output
or import traversal enforcement. The package's separate graph scenarios cover
only their declared boundaries. Defaults are illustrative, not empirical agent
or Jev measurements. Multi-agent contention is unsupported.

Each playback batch is bounded at 100 checked events. Browser replay loading
accepts endpoints up to 100,000 events; larger runs require a headless consumer. The package retains the
last 1000 observations and history buttons display the latest 100. Replay export
keeps required inputs/controls independently of rendered history. Paused state
is resumable. Invalid controls and replay identities appear in status. The
retained timeline covers 1000 frames; the button list covers 100. A bookmark
outside retained display history can be recovered by replaying from start.

Run `npm run test:simulation-browser` for focused offline browser checks;
`npm run test:browser` covers existing examples. These validate UI wiring,
separately from design acceptance, native enforcement and release support. An
owner review request should link `/#monkey-business`, name the exact control or
replay case, describe the panel's added behavior and state the requested design
decision. Existing diagram positions have no visual diff.
