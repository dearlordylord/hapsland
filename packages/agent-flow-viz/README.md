# Hapsland agent flow visualization

Independent Foldkit discussion page for Hapsland's review and advice flow.
It does not import or change the production app.

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
or tabs. Each packet has a stable item ID and a typed location. The `workQueue`
location is FIFO and can hold capture jobs and prepared review items. Other items
can be preparing, awaiting a Jev send, in flight at Jev, awaiting result handling,
or pending as advice at the same time. The model allows two active preparation or evaluation jobs, matching the current
production `BACKEND_CONCURRENCY` constant; it does not replicate the resident
dispatch cycles or scheduling timing. No agent-ID map
is needed for this one-agent model.

A round is an episode of agent work whose actual end is controlled by the agent
runtime. Hapsland may not observe that end. A virtual round is Hapsland's own
review and advice period. A proven fresh edit opens one. Further edits stay in
that virtual round. Stop means the agent tries to finish: waiting does not close
the virtual round. Selecting advice for the Stop response reserves one of its
four continuation requests before the output write. That advice continues the
same virtual round. Allowing Stop closes the virtual round,
cancels modeled Jev work, and removes every live packet, reservation and delivery
record. The round number and count remain as a source-free display summary.
A fresh edit can open the next virtual round; repeated Stop cannot. The agent's
round may still continue if another hook blocks its finish. Runtime turn IDs are
adapter metadata, not virtual round IDs.

The reducer takes trusted, normalized events. The adapter must establish fresh
edit identity and bind callbacks to their originating virtual round before invoking it.
This model does not implement that adapter or simulate late callbacks crossing
into a new virtual round, uncertain output writes, cancellation failure, or restart.
The four-request bound applies per virtual round while one resident process
runs. A resident restart resets the count by accepted product policy; count
persistence across restarts is not planned.

The review work queue holds capture jobs and later prepared review work items.
Review status is an operation,
not an invented outcome store. Completed response writes and status updates leave
the payload flow. Example history records these emissions only for the page; it
cannot feed pending-advice selection and is not retained production advice.

Each background-submitted finding remains available for one Stop reoffer in the same virtual round,
including when written during the Stop wait. Stop output retires that advice;
round closure discards all advice. Distinct findings can justify another Stop
continuation without a fresh edit. This model can hold several distinct findings,
but it does not simulate delivery batch sizing or overflow. The page ends at the hook response write and
has no modeled receipt or advice-consumption event. The agent runtime owns its
further use. The #105 candidate implements reoffer and round cleanup; this
model covers only the subset described here. It does not simulate size limits, deadlines, relevance
expiry, or the complete set of advicee checks.

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

The timeline distinguishes three paths: Stop waits for its first advice;
background hook output during an existing Stop wait and that Stop reoffers; or the
wait expires and Hapsland allows finish and closes its virtual round. The race companion
starts Stop before review completion. The final-message companion retains the
separate order where background hook output completes before Stop starts. Native hook process
intervals include startup and output work, not just review waiting.
