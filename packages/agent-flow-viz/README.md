# Hapsland agent flow visualization

Independent Foldkit discussion page for Hapsland's review and advice flow.
It does not import or change the production app.

```sh
cd packages/agent-flow-viz
npm install
npm run dev
```

Select a guided example, move to its next or previous event, or apply an event
directly. The process diagram groups
related events into one numbered connection. The event list shows each variant,
its information, and whether its prerequisites currently hold.
Left and Right Arrow move through a guided example when focus is outside text inputs.

The backbone is the guarded `stepFlow` reducer. There is no separate explicit
state-machine definition. The page displays reducer state and explains its
updates; process boxes are not presented as lifecycle states.

The example uses one opaque Agent identity. Runtime adapters handle session and
subagent identifiers; the reducer has no root/child branches. It models one
resident lifetime and one review item at a time, not concurrent agents or tabs.

A proven fresh edit opens a Hapsland round. Further edits stay in that round.
Stop means the agent tries to finish: waiting does not close the round. Selecting
Stop advice reserves one of four continuation requests before the output write.
That advice continues the same round. Allowing Stop closes the Hapsland round,
cancels modeled Jev work, and removes every live packet, reservation and delivery
record. The round number and count remain as a source-free display summary.
A fresh edit can open the next round; repeated Stop cannot. Runtime turn IDs are
adapter metadata, not Hapsland round IDs.

The reducer takes trusted, normalized events. The adapter must establish fresh
edit identity and bind callbacks to their originating round before invoking it.
This example does not implement that adapter or simulate late callbacks crossing
into a new round, uncertain output writes, cancellation failure, or restart.
The four-request bound applies per Hapsland round while one resident process
runs. A resident restart resets the count by accepted product policy; count
persistence across restarts is not planned.

Two job kinds share one modeled review scheduler. Review status is an operation,
not an invented outcome store. Completed response writes and status updates leave
the payload flow. Example history records these emissions only for the page; it
cannot feed pending-advice selection and is not retained production advice.

Background advice remains available for one Stop reoffer in the same round,
including when written during the Stop wait. Stop output retires that advice;
round closure discards all advice. Distinct findings can justify another Stop
continuation without a fresh edit in the contract; this one-item example does
not simulate multiple findings or overflow. The page ends at the hook response write and
has no modeled receipt or advice-consumption event. The agent runtime owns its
further use. These are #105 target semantics, not a claim that production already
implements them. The example does not simulate size limits, deadlines, relevance
expiry, or the complete set of advicee checks.

Run `npm run build` for TypeScript checking and the Vite production build.

## Native timing evidence at the bottom of the page

The lower timeline defaults to matched before/after Stop repair runs on Codex and
Claude. Seven selectable cases retain successful background opportunities,
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
paths have event order only: identifiers are checked as `EventId`, labels come
from `TRANSITIONS`, and module initialization replays the paths through `stepFlow`.
The page labels this partial reducer coverage. Those checks establish acceptance
of the abstract companion path; they do not validate native timestamps or prove
unobserved runtime behavior. The existing reducer cannot replay a repair while
background advice remains retained; this limit is explicit in that case.

The timeline is a Foldkit view in `timeline-view.ts`. The existing flow graph,
guided trace controls, and left/right keyboard navigation remain independent.
