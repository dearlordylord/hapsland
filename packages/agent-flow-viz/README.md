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

The example has one advicee and one review work item. Initial payloads are
scenario input, not live records. Two job kinds share one modeled review
scheduler. Review status is an operation, not an invented outcome store.
Completed response writes and status updates leave the payload flow. A separate
example history records these emissions; it does not represent production storage
and cannot feed pending-advice selection.

Agent runtime requests and pending findings are different inputs to advice selection.
The page ends at the hook response write. There is no modeled receipt, model
visibility signal, or advice-consumption event. The agent runtime owns further use.
Sending advice again at Stop is an approved design that production does not yet
implement. The example does not enforce production size limits, deadlines,
relevance expiry, or the complete set of advicee checks.

Run `npm run build` for TypeScript checking and the Vite production build.

The diagram uses one Agent actor: session identity plus an optional native child
agent ID. Claude Code and Codex are adapter metadata on that actor. It does not
merge identities across sessions or children. The reducer still simulates one
agent only; it does not demonstrate concurrent agents or multiple tabs.

Known model gap: the current reducer requires a prompt before a main agent's
edit or background advice request. Production Hapsland can review edits and
collect background advice without a Stop allowance. The reducer also branches
on `agentKind`; the proposed uniform Agent model has not been applied yet.
