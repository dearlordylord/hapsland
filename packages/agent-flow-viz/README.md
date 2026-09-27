# Hapsland agent flow visualization

Independent Foldkit discussion page for Hapsland's review and advice flow.
It does not import or change the production app.
The [product vocabulary](../../CONTEXT.md) defines the terms, and the
[Advicing target contract](../../docs/advicing-target-contract.md) states
the accepted behavior. This reducer models a stated subset of that contract;
its accepted paths do not establish production conformance.
The separate [Bend model](../agent-flow-bend/README.md) begins with a proved
one-item Jev-finding transition; it does not yet formalize this full reducer.

```sh
cd packages/agent-flow-viz
npm install
npm run dev
```

Select a guided example, move to its next event, or apply an event directly.
History has one current position and a retained future tail. Previous, Redo,
and clickable history move that position without deleting the tail. Repeating
the next recorded event follows it; a different accepted event at that position
discards only the future tail. Guided and manual origins are part of what makes
an event the same recorded step, because only a guided event advances the guide.
Manual events do not cancel a guided example or advance its cursor.
Each guided edit binds its planned review item to the actual item ID created in
the mixed run, so later guided steps cannot silently act on an extra item.
If the next guided event is unavailable, the page names that event, item, and
reducer rejection while keeping the guide selected; further manual events or a
rewind can restore a path forward. The process diagram groups
related events into one numbered connection. The event list shows each variant,
its information, and whether its prerequisites currently hold. The event panel
probes every known event and each item at its input location against the current
reducer state: accepted item-specific actions are selectable, while unavailable
actions are disabled with a reason. An actual click
runs the reducer again, so the panel does not introduce a separate validity rule.
Left and Right Arrow move through a guided example when focus is outside text inputs.

The backbone is the guarded `stepFlow` reducer. There is no separate explicit
state-machine definition. Accepted steps emit typed domain changes. The typed
`generation.ts` projection replays editorial scenarios and derives graph
connections and abstract timeline steps from those changes. Diagram layout and
wording live outside the reducer; process boxes are not lifecycle states.
TypeScript requires a presentation entry for each model node, and build-time
replay rejects any node unused by all accepted routes. Descriptive wording is
editorial and is not semantically proved by those checks.
The build checks that every native timing row names a retained source and has
a valid interval. It cannot prove that a transcribed time matches its source.

The sidecar model follows one agent at a time. Runtime adapters handle session and
subagent identifiers; the reducer carries no agent identifier or root/child branches.
It models one resident lifetime with multiple review items, not concurrent agents
or tabs. Each packet has a stable item ID and a typed location. Edit observations
and prepared review items have separate queues. Other items can be
in source reading, in flight at Jev, or pending as advice at the same time.
The reducer owns two settable positive capacities, initially 3 each: concurrent
source readings and concurrent Jev requests (`N`). Changing either is a reducer
event in the same undo/redo history as flow events. Reducing a capacity below
current occupancy leaves active work in place and prevents new starts until
occupancy falls below the new capacity. The sidecar does not replicate resident
dispatch cycles or scheduling timing. No agent-ID map is needed for this
one-agent model.

A round is an episode of agent work whose actual end is controlled by the agent
runtime. Hapsland may not observe that end. A virtual round is Hapsland's own
review and advice period. A proven fresh edit opens one. Further edits stay in
that virtual round. **Finish attempt** means the runtime invokes its API hook
named `Stop` (or `SubagentStop`). **Finish-decision wait** means Hapsland holds
that hook call open while review work completes; the agent has not necessarily
finished. **Continue-with-advice response** means Hapsland returns the runtime's
`block` decision with ordinary review advice. **Allow-finish response** means
Hapsland returns `allow`. These are hook response outcomes, not separate kinds
of advice or Jev API calls. Selecting advice for a continue-with-advice response
reserves one of four continuation requests before the output write. That response
asks the runtime to continue the same virtual round. An allow-finish response
closes the virtual round,
cancels modeled Jev work, and removes every live packet, reservation and delivery
record. The round number and count remain as a source-free display summary.
A fresh edit can open the next virtual round; a repeated finish attempt cannot.
The agent's round may still continue if another hook blocks its finish. Runtime turn IDs are
adapter metadata, not virtual round IDs.

The reducer takes trusted, normalized events. The adapter must establish fresh
edit identity and bind callbacks to their originating virtual round before invoking it.
This model does not implement that adapter or simulate late callbacks crossing
into a new virtual round, uncertain output writes, cancellation failure, or restart.
The four-request bound applies per virtual round while one resident process
runs. A resident restart resets the count by accepted product policy; count
persistence across restarts is not planned.

Edit observations enter their own queue. Source reading and analysis produces
review work items in a separate queue. The reducer starts waiting source jobs
and Jev requests when their respective slots are available. Source-reading
capacity and Jev-request capacity are independent reducer properties, both
settable from the page. A reduction below current occupancy lets active work
finish and pauses further starts until a slot opens. Each admitted edit stays
unfinished while it waits for source reading, while source is analyzed, while a
prepared review item waits, and while Jev evaluates it. A Jev finding completes
that item and enters pending advice in the same reducer step; a clear result
completes it and records review status in the same step. There is no stored Jev
result queue or separate event to retain a finding. Completed response writes
and status updates leave the payload flow. Example history records emissions
only for the page; it cannot feed pending-advice selection.

Each background-submitted finding remains available for one reoffer through a
later finish-attempt hook call in the same virtual round, including when the
background write completes during the finish-decision wait. The installed edit
integration starts a bounded background advice wait for matching edits. The
sidecar records that start automatically with an edit; it does not require a
manually fired background event. An open finish-hook call is separate state.
An idle background wait cannot delay a finish decision, but a background write
with reserved advice can finish during the open call. While at least one review
item remains unfinished, the finish call stays open until all items complete or
a deadline event arrives. For example, if two items are unfinished, the first
Jev response leaves one unfinished; the second leaves zero and causes an
immediate decision. Once four continuation requests have been reserved in the
virtual round, the next finish attempt may allow immediately even with
unfinished work. The policy selects all
available actionable findings as one abstract batch, requests a hook response
write, and discards old work. The reducer records the response command; it does
not claim the write completed or the agent used the advice. The agent runtime
owns further use. This model does not simulate batch size or byte limits,
wall-clock progression, relevance expiry, or the complete set of advicee checks.
Jev error behavior is outside this refinement. The reducer guards one primary
location per live item and checks accepted steps for lost or duplicated items;
one delivery lease can carry a copy. TypeScript and projection checks cover
event routes and diagrams. The two-item guided trace makes the lifecycle
boundary visible. None of these checks proves every possible event sequence.

Run `npm run build` for TypeScript coverage checking, reducer replay of every
displayed abstract path, and the Vite production build. A rejected path fails
the build.

## Native timing evidence at the bottom of the page

Use the prominent “Jump to timing diagrams” link at the top, or open
`/#timing-diagrams` on the preview origin. The diagrams remain at the bottom
of the same demo.

The lower timeline defaults to matched before/after Stop repair runs on Codex and
Claude. Eight selectable cases retain successful background opportunities,
Stop reoffer, Codex foreground Bash, Claude streamed messages, all three unproven
Claude foreground-tool attempts, and the bounded observation after runtime exit.
Required product behavior and exploratory timing probes have separate labels
from observed/unproven results. Cleanup is required even though the native
post-exit timing probe is exploratory.

`timeline.ts` stores a small, sanitized projection of the retained #105 evidence
with links pinned to its repository commit. The native cases used a controlled
Effect reviewer, not live Jev. Timed panels share an axis within each case, in
seconds from each process launch. Hook-return timestamps are labeled as such;
independent file checks and observations without retained timestamps remain in
outcome text. The two-second post-exit observation is not drawn with an invented
exact end timestamp. Grey bands mark missing evidence about runtime advice
handling; they do not assert a model request or consumption interval.

`TimelineEntry` distinguishes native observations, unknown intervals, and reducer
events. Native timing rows are evidence projections, not reducer state. Companion
paths supply event order only: `generation.ts` replays them through `stepFlow`
and derives their labels, state, and changes from accepted steps. The page labels
this partial reducer coverage. Those checks establish acceptance of the abstract
companion path; they do not validate native timestamps or prove unobserved runtime
behavior. A repair edit can enter while earlier background advice remains
retained, although its native timing still comes from separate evidence.

The timeline is a Foldkit view in `timeline-view.ts`. The flow graph and abstract
companions share the reducer projection. Native timing rows remain separate
evidence. Guided trace controls retain left/right keyboard navigation.

The main graph draws routes emitted by accepted reducer changes. The smaller
finish-decision diagram reads the reducer's typed decision change, including
selected advice IDs, discarded IDs, and cancellation requests. Its layout and
labels are presentation code; the reducer contains no diagram wording. A
response command and an observed background hook write have separate graph
endpoints. The graph highlights all routes produced by the latest accepted
input, including automatic scheduling and finish-decision changes.

The timeline distinguishes three paths: a finish-decision wait receives its
first advice; a background hook write completes during an existing
finish-decision wait and Hapsland reoffers that advice; or the wait expires and
Hapsland allows finish and closes its virtual round. The race companion starts
the runtime's Stop hook before review completion. The final-message companion
retains the separate order where background hook output completes before that
hook call starts. Native hook process
intervals include startup and output work, not just review waiting.
