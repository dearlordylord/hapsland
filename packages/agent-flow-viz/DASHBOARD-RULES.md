# Hapsland dashboard rules

The dashboard is a **projection of compiled Bend transitions**. It contains no
Hapsland decision backbone. `Flow.bend` currently drives the abstract flow page;
`ImportGraph.bend` drives the separate import exploration section. The production
resident does not yet call either as its single canonical transition. The page
must state that scope until #119–#137 change the production boundary.

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
  icon, route, or layout. For example, `UnitIncomplete{Excluded}` can display
  “excluded · no read.” Native `Found` can display a resolved import edge.
- File-size labels transcribed from source-free native capture facts. A size
  offered by a capture that Bend rejects must be labeled "reported"; only a
  size accepted into Bend state may be labeled "accepted". Unread files have
  unknown sizes rather than invented estimates.
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

[`import-graph-view.ts`](src/import-graph-view.ts) replays source-free events
through the checked `stepImportGraph` adapter.
[`import-graph-diagram.ts`](src/import-graph-diagram.ts) builds the displayed
file graph from those native example facts, emitted Bend commands, and Bend
state. Target names are display metadata; capture, exclusion, budget, cycle,
and terminal labels follow Bend output. Its static state-machine boxes explain
possible transitions and highlight the phase returned by Bend. The independent
[`conformance/import-graph-v1.json`](../../conformance/import-graph-v1.json)
fixture checks phases and commands at every step and final states. Projection and browser checks
verify that the visible graph follows replay, including excluded C receiving
no `ReadSource` command while independent D completes.
