# Hapsland production decision visualization

**Purpose:** Explain the production decision visualization and how to build and inspect it.
**Status:** Active visualization documentation.
**Authority:** Maintained guidance.
**Expected use:** Run the dashboard and understand the scope of guided/manual replay and its evidence.
**Lifecycle:** Maintained alongside visualization source, fixtures, and build commands. Review whenever the shared adapter, page sections, replay behavior, or capacity projection changes, and at #137 final authority review.

This page replays source-free example events through the same checked
`src/canonical/adapter.ts` and compiled `Canonical.step` used by the resident.
The main flow has 14 distinct places from agent-runtime observation through
preparation, Jev authorization/attempt/response, advice, delivery, and round
closure. A connected SVG draws numbered paths between those places, following
the earlier Flow.bend diagram's spatial layout. The
[`agent-flow-projection`](../agent-flow-projection/README.md) package reads checked
reducer projections and assigns identified items to conceptual flow stages.
The FoldKit view maps those stages to named, positioned squares and draws
possible connections. The package compares checked state before and after each replay step to locate
work, dispatch entries, requests, advice, and delivery by stable identity.
The view numbers source reads, preparations, review items, Jev requests,
advice, and each capacity-charge purpose separately in creation order. These presentation numbers come from
accepted reducer transitions. Square details retain the canonical operation
or request ID used to connect records. If a simulation's retained history
starts after the run began, the view shows the canonical ID without guessing
a presentation number.
Connections that cannot be established from that comparison use explicit
event, command, or supplied-fact rules in the projection package, with their evidence type
shown to the viewer. Dashed paths show commands, which do not prove that a
native effect happened or that the destination holds data. Checked relations without a drawn route are disclosed in decision details
instead of crashing or inventing a connection. A step with no
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

The default guided case starts with an edit permit. The first accepted edit
consumes that permit and opens the virtual round in the same Bend transition;
the next observation-admission event creates source work. The source-free trace
shows these reducer events but omits the agent-runtime hook payloads.
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

The default guided showcase and seeded simulation compose checked ImportGraph
steps inside the main flow's **Read & prepare source** stage. **Next** or
**Single step** advances root facts, resolve, path gate, read authorization,
capture facts and graph completion before `preparationCompleted`. The compact state machine inside the preparation square identifies its
canonical operation and artifact; inner steps preserve
canonical work and capacity and do not light outer movement arrows. Previous,
redo, history selection and replay reconstruct the graph at the selected step.
The first edit's illustrative A → B graph uses source-free facts (1,000 source
bytes and 400 evidence bytes per file). The second edit's Preparation #2
(canonical operation 5) reuses
the standalone **Branching tree budget** facts. Its terminal graph has seven
files read and 20 KiB of accepted tree bytes, with denied X unread and E/G
contributions skipped by the tree budget. The mini square shows files read and
accepted evidence-tree bytes. Click **Read & prepare source** to reuse the
file-graph and tree-budget widgets for that operation's own selected history;
artifact, complete and incomplete counts distinguish tree count from byte size.
The standalone controls remain independent. An incomplete graph does not
itself determine per-rule eligibility; the demo supplies its unit offer separately. Synthetic review-unit reservation sizes are
separate supplied measurements; this does not validate native artifact sizing,
parsing, per-rule selection, or filesystem capture. Other canonical conformance
cases retain their declared event boundaries without added graph facts.
The standalone import examples retain path-denial and tree-budget cases for
component inspection. Native timing panels retain the recorded host observations and
unknown intervals without mapping old simplified Flow states onto production.

Disclosure headers use shared pointer, hover, spacing and keyboard-focus styles
throughout the dashboard. Buttons, selectors and sliders share control states;
disabled buttons retain a default cursor. Interactive diagram squares are named,
focusable buttons supporting Enter and Space, alongside the keyboard stage
selector. Long disclosure labels wrap at narrow widths. Run
`npm run test:usability` for the browser check of these interactions and layout.

The simulator's **Generated import trees** panel configures minimum/maximum
candidate files, maximum imports per file, maximum import depth (root 0),
denied import targets, and source/evidence byte ranges. **Balanced trees** and
**Tree budget pressure** draft presets; **Start / reset** applies the draft,
while **Apply to future preparations** affects only preparations that start
later. The applied profile and unapplied drafts are shown separately. Recorded
replay blocks new controls until its endpoint. Invalid ranges or shapes that
cannot contain the requested file count are rejected without changing the
applied profile. Import permissions differ from final-source readability.

The existing run seed reproduces each generated artifact independently of Jev
outcomes and playback. Click **Read & prepare source** to inspect generated-file
count, reached file graph, observed permission denials, and checked graph bytes.
Unread descendants do not acquire outcomes. Generation can exceed checked caps
(8 file reads, depth 4, 20 KiB evidence) for pressure cases; reservation bytes
remain a separate synthetic admission fact.

The pre-#119 Flow.bend diagram's connected routes, numbered arrows, and
separate finish decision view informed this production diagram. Its retired
illustrative reducer and TypeScript page were removed from the active source.
The current
view projects fourteen canonical places, checked operation/request identities
and queue order, highlighted paths, outcome branches, and a finish/output
decision card. Source capture and Jev/host I/O remain labeled native boundaries.
Both the composed preparation detail and standalone import section replay
ImportGraph.bend decisions from source-free facts; neither is a second production reducer. The dashboard's coverage disclosure
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

In the default guided example, step 27 shows Review item #1's finding. The
Admission & capacity square displays its unit charge becoming a stored result
charge. The retain-finding command appears in Review outcomes; the route to
Ready advice lights at step 28 after Bend checks the finding, edit, remaining
work, and supplied joined-work status. The Ready advice square names Review
item #1 as its source. Review item #2's finding at step 30 stays visible with
its unfinished sibling Review item #3. Step 36 reports `clear` for that sibling
and releases its unit charge without making advice. Step 38 explicitly shows
`Advice #2 ← Review item #2`; the Ready advice count is labeled `awaiting
delivery`. These are interactive replay cases for #147 owner inspection.
The other named owner-review panels are [ninth Jev request refusal](docs/assets/production-flow-inferred-jev-refusal.png)
(guided step 29/34: eight in flight, immediate unavailable command, no Jev
queue) and [Stop wait](docs/assets/production-flow-inferred-stop-wait.png)
("many units admit in order and Stop waits," step 4/7: `waitForWork`
at collection while the round remains active).

## Guided-scenario adjacency

Review guided scenarios as sequences, not only as individually correct steps.
Adjacent events can suggest a cause that the checked state does not support.
For every visible increase, decrease, or arrow, identify the source record by
stable ID, the event that changed it, and any earlier event that made the change
possible. When a later result merely removes a blocker, the scenario must keep
the earlier source of the resulting item visible or state that lineage at the
transition. Do not reorder events solely to make an ambiguous sequence look
causal; preserve useful cases where a finding waits for another review, and
make the waiting relationship explicit. A command, a native attempt, and an
observed result remain separate steps even when adjacent.

In the default replay, steps 27–28 distinguish `retainFinding` from advice
readiness; steps 30–38 are the stronger adjacency risk. Review item #2's finding
is the source of Advice #2. Review item #3's `clear` removes the last unfinished
review for the same edit; it does not create that advice. At step 38, the
`collectionReady` check also uses the resident-supplied joined-work fact. The
delivery sequence at steps 42–47 similarly distinguishes a reserved Stop slot,
authorized submissions, and acknowledged output; proximity alone does not
prove a host write or use of advice by the agent. Recheck these relationships
whenever the default event order or square presentation changes.
The default diagram shows each Stop-output phase in a visible current-step
caption. `finishAuthorized` lights the `Advice output authorized` branch;
`deliveryAckReady` reports only that an acknowledgment check passed. The
following `finishTerminal` event records both advice submissions and the Stop
result together. The showcase has no native host-write observation event.

Run `npm run build` for TypeScript, checked connection evidence, projection, compiled inventory, and Vite
checks. Run `npm run test:browser` for Chromium controls. The workspace may
need the Chromium system libraries listed by Playwright.

## Guided replay navigation

Left/Right moves through one retained history event at a time; holding either key uses keyboard repeat for fast movement. Right replays existing future events before adding the next guided event, preserving manual entries. Next and Shift+Left/Right use guided action boundaries. In the default case, one action collects advice in reducer events 40–41 and another stages the two advice records in events 43–44. Both events in each action remain in the checked history; Left/Right and the timeline show the intermediate state. At step 45 Bend authorizes both advice records with their common Stop slot; step 47 records both outcomes with the slot. The two records share one output token and produce one Stop response, not two host writes. Other guided actions span one canonical event, while preparation frames remain inspectable. At the recorded frontier, Shift+Right completes the preparation trace and advances to the next guided action after retained history.

The **History timeline** covers the complete planned scenario from the start,
including inner preparation events (100 events for the default 59-step scenario).
Recorded manual events add positions; invalid event shapes add none, while checked
rejected events remain visible. The progress line distinguishes the planned
horizon from the recorded event count. Dragging beyond the recorded frontier
executes the remaining guided facts through the same checked reducers in one
pass. Seeking within recorded history preserves its future and resets the
selected capacity frame. If manual facts invalidate a later preparation,
seeking stops at the last checked event and explains the blocked continuation;
the slider keeps the planned horizon. Rewind and replace the conflicting manual
branch, or reset, to continue. Arrow shortcuts are suppressed while editing a
form field; focused sliders retain their native keyboard behavior.

Run `npm run test:replay-browser` for repeated-key events, guided boundaries with several manual events per step, mouse seeking, retained future preservation and input focus checks.

## Seeded simulation walkthrough

The `Monkey-business · seeded simulation` panel consumes the public
`monkey-business` run API. It maps checked canonical frames onto the existing places and routes, with
checked graph frames inside preparation. It adds controls without changing diagram layout or product policy.
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
   and active settings, with a persistent validation message. Press Enter in an Apply field to submit its form. Other numeric
   drafts require their Apply button, except live Jev delay. **Start / reset** applies initial
   drafts together. Named Normal, Slow Jev, Failure → recovery and Capacity
   pressure scenarios fill drafts and explain the next action.
2. Pause and inject a burst of `5`. Step through preparation and overlapping
   review. History includes transitions without cross-square movement and
   ordinary Bend refusals, which are product outcomes rather than run errors.
3. Open **Simulated Jev outcome mix**, set Backend failure or Timeout weight to
   `100` and the other weights to `0`, then set delay to `500`. New requests use that profile; in-flight completion
   times stay fixed. Inspect identified request effects and results.
4. Set No finding (clear) weight to `100`, others to `0`, with delay `50` for
   recovery, and suspend edit
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

Both diagrams display exact checked record counts in each square, including
zero and singular states. Source preparation keeps running preparation dispatch,
source reading and preparing counts separate; review dispatch appears with
review work items. Queue counts describe mixed dispatch entries. Advice keeps
pending-ready, retained-submitted and leased records separate. Host output shows
finish slots and pending, submitted and uncertain advice phases. Counts for
related facets can overlap and are not added into a total. Each fixed-size
square shows all its facet rows, with at most one complete ID and `+N more` when
that sample fits. Full IDs remain in tooltips and the live record inspector.

The initial outcome mix has Finding and No finding (clear) weights of `50`
each; the other four weights are zero. Sliders use relative weights from `0` to
`100`, not percentages. Each displayed probability is its weight divided by the
sum; Finding `100` and Clear `100` therefore mean `50%` each. Sliders update the active profile immediately for new requests. Jev delay also updates
immediately when it is a valid integer. Blank or malformed delay drafts and an
all-zero mix retain their last valid applied values without pausing playback.
Delay and mix edits validate independently. Recorded replay reconstruction blocks
live profile changes until it reaches its endpoint. Native range controls
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
