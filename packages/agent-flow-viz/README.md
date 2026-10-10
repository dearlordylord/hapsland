# Hapsland production decision visualization

<!--
**Purpose:** Explain the production decision visualization and how to build and inspect it.
**Audience:** Contributors, including coding agents maintaining this package and its consumers.
**Status:** Active visualization documentation.
**Authority:** Maintained guidance.
**Expected use:** Run the dashboard and understand the scope of guided/manual replay and its evidence.
**Lifecycle:** Maintained alongside visualization source, fixtures, and build commands. Review whenever the shared adapter, page sections, replay behavior, or capacity projection changes, and at #137 final authority review.
-->

## Public site and shared import replay

The local **inspection dashboard** uses a separate development command:
`npm run dev:inspection` from the repository root. It serves current inspection
page source with automatic browser reload. Its bundled production command is
`hapsland dashboard`. See [the inspection guide](../../docs/status.md#opt-in-local-inspection).
The Vite commands below serve the public site and decision visualization.

Install development dependencies from the repository root with the pinned Bun
runtime and `bun install --frozen-lockfile` before running this workspace's
commands. The root `bun.lock` and catalog own dependency versions; this private
workspace uses shared workspace packages and has no independent npm lockfile.
`npm run` remains a script launcher after that root installation.

`npm run docs:generate` from the repository root updates generated documentation,
including the dashboard's possible flow connections in the marked Mermaid block
in `docs/architecture.md`.
The pure serializer is `../agent-flow-projection/src/production-flow-mermaid.ts`; it uses the same stage
titles and connections as the SVG view. `npm run docs:generated:check` rejects a stale
block in fast checks, pre-commit and the deterministic runner precheck.
`npm run architecture:generate` updates only this diagram.
This static export is not a replay trace or evidence that a native effect occurred.

Run `npm run dev` in this package and open `/site.html` for the FoldKit public
site, or `/index.html` for the full dashboard. `npm run build` emits both entries
with relative asset paths. Building is separate from deploying either page.

The dashboard's entry cards describe four tasks: resident simulation, guided
replay, import exploration and timing comparison. For a first walkthrough,
choose **Guided replay**, select a scenario and apply its next event. In the
resident simulator, start a run, select an advicee and inspect a stage or an
event. Its inspection navigation jumps to the stage inspector, event history
and scenario settings. The selected event and its recorded facts precede the
settings disclosure; changing a live setting does not rewrite historical facts.
These are development examples with synthetic observations, separate from the
local inspection dashboard and its recorded agent sessions.

`npm run build:pages` prepares the Cloudflare Pages bundle: the public site at
`/`, the dashboard at `/dashboard.html`, and favicons at the root. The existing
`/site.html` address redirects to `/`. `npm run deploy:pages` builds and publishes
to the `hapsland` Pages project on its production branch, `master`, using the
authenticated Wrangler account. The custom domain is `hapsland.dearlordylord.com`.
Gandi DNS must point the `hapsland` CNAME to the project's `pages.dev` hostname;
register the domain with the Pages project before setting that record.

The primary illustration adapts the research video's circular review flow in
`src/review-loop-renderer.ts`, with FoldKit phase controls and a shared HTML code
stage. Desktop uses the full actor loop; mobile uses a compact actor overview.
Its six stages are edit, expanded code and question, Jev rule result, configured
feedback to the agent, possible edit, and recheck. The public page keeps the review loop, file settings, rules, and setup; source-control replay and verification panels remain on the architecture dashboard.
The illustration reuses the existing video example: a three-line local diff
(`title`, added `coverWidth`, `public`) expands to Gallery → ImageFile → Dimensions.
The opening shows the edited lines; expansion reveals why related code matters.
The diff stays local and is not sent to Jev.
Here, `coverWidth` means the current cover image width, also represented by
`cover.dimensions.width`; a snapshot or layout width would be a different design.
The example shows the built-in duplicate-encoding question, the configured
feedback message, and an edit that removes the second copy of the width. It
explains the design consequence directly rather than asking readers to interpret
classifier scores. Historical measurements and their provenance remain in the
study linked in `src/site-example.ts`; the site is not a live review or a
current-integration benchmark. Function review is
explained separately through the built-in `noul/r9_body_reaches_undeclared`.
The README retains its repair GIF; the interactive site does not repeat it.
The animation starts immediately and repeats all six stages. Clicking a stage
selects it and restarts its four-second interval without pausing playback.
The stage buttons are the only playback navigation. Reduced-motion users get
static frames selected through those same buttons; changing that preference
stops motion. The hero's six review cards support timed progress, swiping,
mouse dragging and arrow-key navigation. No page calls Jev or reads repository source.

`src/import-graph-replay.ts` owns shared scenario replay through the compiled
ImportGraph adapter. `src/import-graph-diagram.ts` owns the shared graph display
projection. The dashboard uses these modules for graph replay. The public page uses `src/site.ts` for its illustration and controls.

Run `npm run test:site` for headless scenario checks and Chromium interactions.
The scenario checks distinguish exclusion before a read command from a size
omission after synthetic capture. Browser checks cover continuous playback,
stage selection, review-card progress and gestures, mobile overflow and reduced motion.
Chromium requires the same system libraries as the dashboard browser checks.

The adapted drawing primitives preserve their research-source provenance.
The animation and example code explain the flow; production rules and checked
replay remain the behavior authorities. It shows no numeric classifier scores,
pass seal, or commit gate. A possible agent edit is illustrative, not guaranteed.
The shared HTML stage keeps expanded source readable in both layouts. TypeScript,
the production build, and browser checks cover the adapted renderer, six-stage
controls, paused Canvas output, mobile resizing, manual reduced-motion steps, and
clipboard contents on secure and HTTP/IP origins. The linked captures below show
the current circular composition.

The hero highlights the latest platform download beside the agent setup link,
with an always-visible, copyable Homebrew command directly below.
The setup section follows installation, agent setup and checking a new edit.
It highlights ready-made archives above the copyable agent instruction, with
the manual setup command in a disclosure. The final step links to opt-in local
recording and the inspection dashboard; recording contains source and does not
backfill older edits. Text is owned by `../agent-flow-projection/src/setup-copy.ts`.
The agent instruction also generates marked sections in the root README and
installation guide through `npm run docs:generate`; `docs:generated:check` rejects drift.
FoldKit commands call `src/site-clipboard.ts`. Secure origins use Clipboard API,
with a temporary selection fallback for the HTTP/IP preview. Browser checks
read the clipboard to verify the copied text, including the fallback. Commands
follow the [installation guide](../../docs/installation-workflows.md).

For design review, inspect the [opening diff](docs/assets/site-hero-edit.png),
[recheck frame](docs/assets/site-hero-recheck.png), and new [related-definitions frame](docs/assets/site-hero-related.png),
[review-question frame](docs/assets/site-hero-context.png), and
[agent-feedback frame](docs/assets/site-hero-feedback.png).
This is a new site view; the existing dashboard layout has no visual diff from
the shared-module extraction. [Mobile](docs/assets/site-mobile.png) and
[desktop](docs/assets/site-desktop.png) captures cover page composition. These
are implementation observations and Astra design review inputs, not owner
acceptance, native capture evidence, or release claims.

This page replays source-free example events through the same checked
`packages/canonical-policy/src/canonical/adapter.ts` and compiled `Canonical.step` used by the resident.
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
event, categorized output, or supplied-fact rules in the projection package, with their evidence type
shown to the viewer. Dashed paths show action requests, which do not prove that a
native effect happened or that the destination holds data. Checked relations without a drawn route are disclosed in decision details
instead of crashing or inventing a connection. A step with no
cross-square movement explains its changed square or decision instead of
inventing an arrow. `collectionFindingRetained` stays at the collection
step because it keeps an existing finding for a later batch. The `finishAllowed`
decisions also stay at collection: they do not authorize host output or change
the round in that Bend step. Node contents come from the checked canonical state;
the Stop fork shows waiting, decision readiness, continuation, allowance,
and cancellation from their respective checked outputs. Waiting gives unfinished
reviews time to become advice before the safe deadline; cancellation is requested for
work still unfinished when Hapsland makes its finish decision. The
[accepted advicee contract](../../docs/advicing-target-contract.md) explains
why this bounded wait exists. Rejected events leave every
place and route inactive while showing the Bend reason. Capacity figures come from checked Bend records and limits, with frame-captured
metadata for event-supplied ceilings. Preparation workers, Jev permits and the
common ledger retain their actual shared scopes.
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
outputs and intermediate capacity snapshots emitted by one atomic Bend
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

The view projects fourteen canonical places, checked operation/request identities
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
charge. The `findingRetained` event appears in Review outcomes; the route to
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

In the default replay, steps 27–28 distinguish `findingRetained` from advice
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

## Multi-agent layers in one resident

The Monkey Business panel renders one to six agent diagrams as planes in CSS
3D. Every plane uses the same `productionFlowView` SVG widget as guided replay.
The installed stack is FoldKit + SVG; CSS `preserve-3d` keeps labels and stage
selection available without another rendering dependency.

Set **Agents** and choose **Start resident**. One Monkey Business Run owns the
canonical state, event queue, clock, capacity ledger and Jev request pool.
Its `sessions` array supplies independent SessionGenerators with distinct
agent names and reproducible seeds. Generator events enter the same checked
Bend resident; admission and global contention are decided there.

The **Global review capacity** panel displays the resident's checked item/byte
totals and per-partition usage. The **ONE RESIDENT · EXECUTION POOLS** inset to
the right of Round state displays separately labeled Preparation workers and
Jev request permit rows, each using its checked resident maximum. Every agent
layer mirrors the same complete resident snapshot and ownership palette.
Preparation jobs are sorted by operation identity and Jev requests by request
identity; positions across rows do not correspond. Exact owners and identities
are accessible from the slots and keyboard stage inspector. Jev request attempt
keeps a concise shared-count and local-started reference. Scheduling keeps its
local preparation contribution. The original gold Jev contact remains. These
positions represent execution capacity, not connections or stable socket IDs.

**Play resident**, **Pause resident** and **Step resident** advance one global
chronological history. Every plane displays its partition of the same selected
resident snapshot, via `projectAgent`; selecting a historical event updates all
planes and shared resource panels together. Per-agent filtering only projects
owned records and does not re-run or replace any product decision.

Hovering or keyboard-focusing a layer card makes the other planes transparent
without changing selection; leaving restores the full stack. Selecting an
agent targets its edit pace, bursts, reservation size and arrival suspension.
The **Simulated edit duration (virtual ms)** setting beside Edit interval
controls time between PRE and POST. Start seeds every agent; Apply changes future
edits for the selected agent. In-progress edits keep captured timing. The default
is 1 ms; 300 ms duration with 100 ms interval makes overlapping permits visible.
This supplied timing does not change Jev delay, permit expiry or edit cadence.
Native environment, file-tree, output and Jev profiles are resident-wide.
**Start / reset** resets the entire resident. Replay JSON stays at version one
and includes all configured sessions, globally ordered inputs and targeted
controls; export/load always applies to the entire resident.

Drag the 3D viewport to rotate the layers. Mouse dragging changes rotation and
tilt; horizontal touch dragging rotates while vertical touch gestures scroll
the page. Rotation wraps through a full turn. A drag does not activate a stage;
a click or tap opens its inspector. **Tilt**, **Rotation**, **Layer spacing** and
**Zoom** also position the layers. Zoom spans 20–200%; wheel or touchpad pinch
over the viewport and two-finger touch pinch zoom around its center. Wheel inputs
are normalized, bounded and batched once per animation frame for gentle zoom;
the 3D surface does not expose transient native scrollbars. Page
scrolling outside the viewport is unchanged; Reset view restores 72%. Agent 1 is
the front/top plane, matching sidebar order. A colored dot marks the current
checked event owner independently of selected or hovered agent; unattributed
resident events show no dot. **Focus selected agent** opens that diagram
without perspective, using the available width and the diagram’s natural aspect
ratio; **3D layers** returns to the stack. Focus view removes the reserved 3D
stage height. On narrow screens, focus preserves readable diagram scale with
horizontal scrolling instead of shrinking all labels into an unreadable overview.

Run `npm run test:render-browser` for a fixed six-agent, 601-event snapshot
and 30 camera updates, followed by ten arrivals of new checked snapshots.
The check reports sampled view CPU time and DOM size,
then checks camera isolation, agent focus, history refresh and guided handlers.
Simulator execution is outside the timed camera exercise. For a before/after
comparison on the same host, run it with `-- --baseline=COMMIT` and then without
that option; the baseline supplies only renderer and projection source files. These
browser timings do not establish native throughput or a universal frame rate.
Camera-only updates reuse the checked diagrams and inspector; unrelated live
updates reuse the guided examples. The 3D planes omit explanatory DOM that their
layout hides, while the guided replay retains it.

Run `npm run test:ensemble-browser` for shared history/replay, targeted generator
controls, the combined eight-permit pool, historical resource projections,
hover/focus, rotation and narrow layout. The case to inspect is **Agents = 3**:
three independently generated workloads compete for one resident's resources,
while hover or focus reveals each agent's local state. Synthetic inputs and
Jev responses remain example facts; this is not live runtime validation.

## Seeded simulation walkthrough

The Monkey Business ensemble at `/#monkey-business` consumes the public
`monkey-business` run API. It maps checked canonical frames onto the existing places and routes, with
checked graph frames inside preparation. It adds controls without changing diagram layout or product policy.
All Jev observations are simulated; no credentials or source files are needed.
The simulation has one **Global review capacity** panel with item and byte bars
and per-agent item/byte totals,
using the same presentation as the canonical examples. It follows the displayed
checked observation, including paused history inspection.

1. Keep seed `7`, edit interval `100`, reservation bytes `100` and Jev delay
   `50`. Click **Start / reset**, then **Single step**. Inspect the event,
   ordered outputs, checked before/after projections and synthetic effects.
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
related facets can overlap and are not added into a total. Selected fixed-size squares replace redundant facet-count rows with compact
resource indicators. Full facet counts and IDs remain in tooltips and the live
record inspector; a sampled row shows at most one complete ID and `+N more`
when that sample fits.

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
or Jev measurements. Multi-agent contention is checked by the shared Bend resident; it is not a measurement of native throughput.

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
decision. Each agent layer reuses the SVG layout.

## Capacity inspection in the shared resident

The Work reservations inset shows shared resident item and byte bars; the
Execution limits inset shows preparation workers and Jev request permits.
Admission retains partition item/byte bars and shows two edit-permit rows:
the selected agent's count/recorded ceiling and all agents' count/resident ceiling.
Advice collection shows resident-wide background collector claims against their
recorded capacity, separate from advice leases and host output slots. Claim
groups and owner tokens remain in the SVG title and inspector; unknown capacity
shows the count without a bar. The shared heading shows agent/event status.
Admission's transient event facts remain in its SVG title and checked event details
so the two permit rows stay readable. Cache retention,
and operational-failure diagnostic notice retention are intentionally omitted
from the main diagram. Their actual storage charges remain in shared ledger
totals; backend state and selectable exercises remain available.

Select an agent and a stage to inspect its local records beside the resident
resources. Advice details mark individual records free or leased. Host output
shows one Stop output slot cell for the selected known delivery group: `0/1`
free or `1/1` occupied. Its title records the occupied slot's exact round and
phase. Without a current known group, it prompts for selection and shows no cell.
Several occupied groups each retain their own exclusive slot; they never become
an aggregate `N/1` meter. Round details
require a current round and group for the four consumed/available continuation
marks. Multiple groups never become an aggregate `N / 1` output-slot meter.
Selections that no longer identify a current group or round show a selection
prompt. All views read the same selected history frame; changing agents preserves
shared totals. Local edit-permit ceilings follow the selected partition's
recorded facts, with a known configured uniform ceiling as fallback. A later
fact for another agent does not change that local denominator. Unknown
historical limits show `limit not recorded` with no fill.

Output details label the resident's **latest supplied simulated encoded bytes**,
raw candidate size, item count and recorded checked fit decision. Oversized bytes
remain visible. This is a supplied fact through the selected frame, not a measured
native encoding or claim that its writer is still active. The optional resource
exercise selector applies on **Start resident** and is persisted in replay;
notices remain selectable source-free exercises. Fit and oversized
scenarios also gate generated advice handoff through checked fit decisions.

Expanded preparation shows four per-artifact budget meters: files read, source
bytes read, accepted tree bytes and traversal work. The existing tree bar explains
accepted file contributions. Latest supplied source/outgoing-edge facts show
numbers and limits separately from the checked terminal reason. Depth remains
`Fact not recorded` because the current projection does not expose its checked
value. Generated-file completion is separate from file-cap utilization, and an
incomplete graph retains its reason even when accepted totals are below the cap.

The simulator uses opt-in checked lifecycle profiles for prospective permits,
collector claims, paired/changed evaluation fixtures and quiet closure. Its
source-free identity and native-effect boundaries are documented in the
[Monkey Business README](../monkey-business/README.md). No renderer calculates
admission, rule eligibility, reuse or output authorization.

Run `npm run test:resource-browser` for resource metadata/selection, optional
fixtures, encoded candidate display, import detail and narrow-layout checks.
`node scripts/check-edit-permits-browser.mjs` covers occupied 16/64 permit
placement, different local ceilings, unknown history, replay and narrow layouts.
`node scripts/check-collectors-browser.mjs` covers shared collector placement,
checked release/expiry, recorded and unknown historical maxima, agent selection
and replay across 3D, focused and narrow views.
`npm run test:stop-slot-browser` covers the selected-group cell, held/free and
multiple occupied groups, unknown historical selection and replay.
`test:execution-pools-browser` covers both pool rows, ownership, saturation,
keyboard inspection and replay; `test:ensemble-browser` covers shared pools/history and agent selection;
`test:simulation-browser` covers the single-agent controls and inspector.
Keep individual suite outcomes in the working validation record: a passing
resource or ensemble suite does not imply all guided-browser assertions pass.
Astra rendered review of the 11 requested case groups found no remaining UX
blocker after the reviewed corrections. That scoped visual review remains
separate from executable driver checks and native enforcement.


Demo retention capacities are computed once from the configured generator count
N and stored in replay configuration: cache entries `min(8, max(4, 2*N))`, cache
bytes `entries * 8192`, notice keys
`min(64, 8*N)`. These are one resident-wide demo set, still subject to the shared
ledger, not additional capacity granted per agent. Native constants are unchanged
(cache 8 entries/128 KiB, notices 64). Explicit tiny boundary fixtures
retain their supplied maxima; existing replay values remain explicit and are not
rewritten. Optional scenarios create at most two notice
identities independently of these maxima, so ordinary demos do not imply that a
handful of records saturates native retention. Retained resource details
are omitted from the diagram.


The Monkey dashboard starts new demos with edit-permit ceilings of 16 per agent
and 64 for the shared resident. Explicit replay/fixture ceilings remain unchanged;
native permit defaults remain 32 per advicee and 4096 per resident.


Review responses use response authority.
