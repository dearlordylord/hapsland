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

The example has one recipient and one review work item. Initial payloads are
scenario input, not live records. Two job kinds share one modeled review
scheduler. Review status is an operation, not an invented outcome store.
Completed response writes and status updates leave the payload flow. A separate
example history records these emissions; it does not represent production storage
and cannot feed pending-advice selection.

Host requests and pending findings are different inputs to advice selection.
The page ends at the hook response write. There is no modeled receipt, model
visibility signal, or advice-consumption event. The agent host owns further use.
Sending advice again at Stop is an approved design that production does not yet
implement. The example does not enforce production size limits, deadlines,
relevance expiry, or the complete set of recipient checks.

Run `npm run build` for TypeScript checking and the Vite production build.
