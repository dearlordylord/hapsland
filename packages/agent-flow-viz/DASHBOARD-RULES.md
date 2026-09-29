# Hapsland dashboard rules

**Purpose:** Define the dashboard projection boundary and evidence requirements.
**Status:** Active dashboard development rules.
**Authority:** Maintained guidance implementing the accepted #116 production-authority constraint.
**Expected use:** Assess visualization changes for decision ownership, source-free inputs, and truthful coverage claims.
**Lifecycle:** Maintained with accepted visualization-boundary decisions and projection checks. Review whenever a new interactive control, transition family, native fact, or evidence claim is introduced, and at #137 final authority reconciliation.

The dashboard is a **projection of compiled Bend transitions**. It contains no
Hapsland decision backbone. `Canonical.step` drives the production decision
replay through the same checked adapter as the resident. `ImportGraph.bend`
drives the separate import exploration section. Native effects and Jev
responses remain outside Bend state and are identified as example facts.
The import section initializes the same versioned limits value passed to
compiled Bend, and budget labels read the limits projected from Bend state.
Static captions may describe the default fixture, but must not claim a fixed
limit for a replay using a changed profile.

## Allowed in the dashboard

- Source-free example events and native fact fixtures, including file labels such
  as `A.ts` and edge IDs. A fixture is input, not an expected outcome.
- Runtime traces of Bend state-machine states and transitions, including a
  roll-through of every state and transition when useful. The trace is
  "static" for dashboard purposes when tests check its declared expectations
  against the compiled Bend adapter. Interactive replay reads Bend's state and
  command at every step; the dashboard does not calculate the next state.
- Independently authored expected trace fixtures. Tests must check the
  displayed path's phases and commands step by step, plus relevant terminal
  facts. A claim that a trace covers every state or transition needs a test
  for that coverage.
- Static mappings from a Bend constructor, command, or state to a label, color,
  icon, route, or layout. For example, `SkipImport{X, Excluded}` can display
  “excluded · no read.” Native `Found` can display a resolved import edge.
- File-size labels transcribed from source-free native capture facts. A size
  offered by a capture that Bend rejects must be labeled "reported"; only a
  size accepted into Bend state may be labeled "accepted". Unread files have
  unknown sizes rather than invented estimates.
- Every displayed Hapsland fact must come from the compiled Bend result for
  that replay step. Native facts are inputs; the page may format them and
  format Bend output, but it must not compute a product decision or invent a
  state between transitions.
- A skipped-import label only when Bend emits `SkipImport`; subsequent graph
  branches appear only as later native facts are replayed through Bend.
- Rendering, responsive layout, history navigation, and source-free summaries
  of the Bend result. These cannot change what an event does or whether a unit
  can reach Jev.

## Forbidden in the dashboard

- A second reducer, scheduler, permission gate, capacity calculation, or
  complete/incomplete decision.
- Cursor thresholds or scenario-specific result tables that make a file appear
  captured, excluded, or complete without the corresponding Bend state or
  command.
- Treating a diagram node or editorial label as evidence that the production
  resident executed that path.
- Inferring a Jev finding, clear result, or request from graph completion.
  `UnitComplete` means eligible for later rule selection, not an observed Jev
  call.

## Current projection boundary

[`canonical-replay.ts`](src/canonical-replay.ts) replays guided and manual
source-free events through `src/canonical/adapter.ts`. Its history is a list
of inputs, and each rewind or redo starts from the checked initial state.
`capacity-inventory.generated.ts` comes from compiled Bend admission output
at build time. The renderer uses checked projection totals and ordered Bend
command snapshots for capacity, including within-transition frames.

[`import-graph-view.ts`](src/import-graph-view.ts) replays source-free events
through the checked `stepImportGraph` adapter.
[`import-graph-diagram.ts`](src/import-graph-diagram.ts) builds the displayed
file graph from those native example facts, emitted Bend commands, and Bend
state. Target names are display metadata; capture, exclusion, budget, cycle,
and terminal labels follow Bend output. Its static state-machine boxes explain
possible transitions and highlight the phase returned by Bend.
The import graph view stops at graph traversal; it does not simulate the later
per-rule evidence check or a Jev request.
The independent
[`conformance/import-graph-v1.json`](../../conformance/import-graph-v1.json)
fixture checks phases and commands at every step and final states. Projection and browser checks
verify that the visible graph follows replay, including excluded C receiving
no `ReadSource` command and no unrelated root appearing. The branching tree
also shows denied X without a read, followed by E/G tree-budget skips and a
`TreeLimit` terminal reason from Bend.
