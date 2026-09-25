# Hapsland agent flow visualization

Disposable, independent Foldkit package for discussing the agent-to-Jev review
and delivery lifecycle. It does not import or change Hapsland's production app.

```sh
cd packages/agent-flow-viz
npm install
npm run dev
```

Open the local address printed by Vite. Select a guided trace or move data one
event at a time. The chart is rendered from the same typed transition definitions
used by the sidecar reducer. Every data arrow is an event; persistent storage is
shown separately from transient processing and external boundaries.

This is a model for discussion, not a trace of a live Codex, Claude, or Jev
session. It models one recipient and one review unit. `Model-visible` is
observer-supplied evidence, never inferred from a completed host write.
