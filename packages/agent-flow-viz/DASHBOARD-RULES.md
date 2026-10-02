# Hapsland dashboard rules

**Purpose:** Define the dashboard projection boundary and evidence requirements.
**Status:** Active dashboard development rules.
**Authority:** Maintained guidance implementing the accepted #116 production-authority constraint.
**Expected use:** Assess visualization changes for decision ownership, source-free inputs, and truthful coverage claims.
**Lifecycle:** Maintained with accepted visualization-boundary decisions and projection checks. Review whenever a new interactive control, transition family, native fact, or evidence claim is introduced, and at #137 final authority reconciliation.

The dashboard is a **projection of compiled Bend transitions**. It contains no
Hapsland decision backbone. `Canonical.step` drives the production decision
replay through the same checked adapter as the resident. `ImportGraph.bend`
drives the inner preparation trace and standalone import exploration examples. Native effects and Jev
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

## Composed preparation boundary

The default guided showcase and simulator identify each graph by canonical
partition, lifetime, round, preparation operation and artifact index. Graph
steps share main replay controls and chronological history. They execute the
compiled graph adapter while preserving canonical state, work and capacity;
they do not invent outer movement or Jev requests. Supplied root/capture facts
remain synthetic native observations. Graph completion is followed by a separate
supplied preparation result and checked canonical unit admission. This trace
does not execute native parsing or per-rule evidence selection. Graph byte
facts and synthetic reservation sizes are distinct measurements.

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

## Multi-agent visualization boundary

`fleet-simulation.ts` renders one Monkey Business Run fed by independently seeded
SessionGenerators. That Run owns one canonical resident state, event queue,
clock, capacity ledger and Jev execution pool. The frontend must not instantiate
one Run per plane or arbitrate capacity itself. Targeted controls identify the
selected generator; native/backend profiles and replay remain resident-wide.

All planes and shared resource panels use the same global history position.
`projectAgent` filters owned records from that checked snapshot for the local
SVG; it preserves global totals and execution limits. It does not calculate
new decisions or local versions of shared limits. Shared item/byte totals,
per-partition usage and occupied Jev permits must read the checked projection.
Resident-capacity and Jev contacts are attached to the admission and request-
attempt stages. The rails identify the shared resources; they do not by
themselves establish an observed message, request or result. Jev and native
responses remain synthetic observations supplied to the checked reducer.

## Capacity and ownership projections

Capacity indicators format the selected checked snapshot. Occupancy may be counted
or summed from its records, and bar fill may format `used / max`; this presentation
arithmetic never grants capacity or decides whether work fits. The renderer consumes
Bend's refusal, fit and ownership decisions. All six charge purposes share the same
resident/partition ledger; stages and charge purposes do not acquire separate pools.

The multi-agent shared rail receives the complete resident snapshot; each plane
receives its partition projection and the same resident context. Items/bytes,
preparation workers, Jev permits, edit permits and background collectors retain
their actual resident or partition scopes. Selecting another agent changes its
local contribution and inspection, not the shared numerator or denominator.
Preparation occupancy counts running preparation jobs, excluding waiting work and
running reviews. The combined **ONE RESIDENT · EXECUTION POOLS** inset to the
right of Round state contains separately labeled Preparation workers and Jev
request permit rows. Its subtitle is **Shared by all agents**. Each row mirrors
the complete selected resident snapshot and owning-agent palette on every layer,
using its checked maximum. Sort preparation operations and Jev requests by their
own identities; do not pair positions or add links between the rows. Exact owner
identities and request status belong in accessibility labels and the keyboard
stage inspector. Jev request attempt retains the shared count and local started
reference; Scheduling retains its local preparation reference. The top rail
contains no duplicate preparation pool, and the original gold Jev contact stays.
Positions do not identify physical connections or stable sockets.

Effective limits come from checked projection limits or capacity metadata captured
at the selected frame. Known initial configuration and subsequent event-supplied
limits are valid evidence; a future event, current live configuration or production
default cannot supply a historical denominator. If no limit was recorded, show
`n used · limit not recorded` and omit fill. Local edit-permit ceilings are
recorded by partition: a fact for another agent cannot replace the selected
agent's denominator. An explicitly configured uniform initial ceiling may supply
the fallback; without it, a partition whose limit has not yet been observed
remains unknown, including when a different partition's limit is known.
No candidate/group/round is distinct
from zero occupancy. A visual bar may clamp fill while retaining the raw numeric
value and explicit over-limit fact; clamping must not hide an oversized candidate.

Collector claims are resident occupancy plus group ownership. Advice leases are
per-record free/leased states. Stop output is an exclusive selected-group slot,
not an aggregate slot count divided by one. Continuation marks display the selected
current round and delivery group's checked consumed budget; absent or stale
selection requires selection rather than silently choosing another record.
Cache, ticket retention, and diagnostic operational-notice retention are
intentionally omitted from the main diagram and its stage inspectors. Actual
storage charges remain in common ledger totals; backend state and exercises
remain. The empty retained-resource disclosure and its links must not return.

Encoded output details show the latest supplied resident candidate fact through
the selected replay frame, with synthetic provenance and the recorded Bend
`fits`/`limited` decision. Do not infer a fit outcome by comparing bytes in the
renderer, or imply that a previous supplied candidate is an active native writer.
No candidate means its bytes were not supplied, not a measured zero-byte encoding.

Import meters use each artifact's checked files/read/tree/work totals and limits;
they never divide by generated candidate-file count. The existing tree view remains
an accepted-contribution breakdown. Source-size and outgoing-edge figures are the
latest supplied root/capture facts for that artifact and selected history boundary.
Their numeric relation to limits does not establish that Bend evaluated that gate:
a prior gate may have rejected the fact. Label them supplied, keep the checked
terminal outcome separate, and display unrecorded depth as unknown rather than
inferring it from diagram layout. Graph incompleteness alone does not determine
per-rule evidence sufficiency or whether a supplied review unit exists.

These rules document current projection behavior under the existing decision
boundary. Browser checks and Astra rendered review are separate evidence;
neither establishes native effect enforcement or release/platform support.


Demo retention capacities are computed once from the configured generator count
N and stored in replay configuration: cache entries `min(8, max(4, 2*N))`, cache
bytes `entries * 8192`, ticket retention `min(256, 16*N)`, and notice keys
`min(64, 8*N)`. These are one resident-wide demo set, still subject to the shared
ledger, not additional capacity granted per agent. Native constants are unchanged
(cache 8 entries/128 KiB, tickets 256, notices 64). Explicit tiny boundary fixtures
retain their supplied maxima; existing replay values remain explicit and are not
rewritten. Optional scenarios create at most three tickets and two notice
identities independently of these maxima, so ordinary demos do not imply that a
handful of records saturates native retention. The retained-resource inset proposal is rejected; retained resource details
are omitted from the diagram.
