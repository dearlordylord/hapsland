# Connector consumer prototype

Throwaway, offline Hapsland consumer of the local `@firfi/quint-connect` RC.116
candidate. It is a development harness, not a release security gate.

## Run

From this directory:

```sh
npm ci --ignore-scripts --no-audit --no-fund
node --experimental-strip-types run.mjs
node --experimental-strip-types security-run.mjs positive 13 1
node --experimental-strip-types security-run.mjs strict 424242 11
```

`package.json` points at the local uncommitted connector candidate in
`/workspace/typescript/quint-connect-rc116-investigation`; build it first with
`pnpm build` in that worktree. The lockfile pins Quint 0.32.0 and Effect
4.0.0-rc.116. The observed run used Node 24.20.0, Linux arm64, and connector
base commit `b6daf2da4a0bb28e4f9825984736baa3dd600224` plus its uncommitted
RC.116 compatibility diff. Nothing here requires Jev credentials or sends a
live request.

The first script checks a small connector fixture. Its `Inspect` action invokes
Hapsland's real `adaptCodexAdd` → `prepareObservation` → `evaluatePrepared`
path with a synthetic file and controlled offline `DecisionModel`. It inspects
generated ITF actions before replay, requires nonempty traces and an `Inspect`
action, counts every executed action, and compares initial and post-action
state. Failure controls:

```sh
node --experimental-strip-types run.mjs mismatch       # initial state mismatch
node --experimental-strip-types run.mjs extra-effect   # post-action effect mismatch
node --experimental-strip-types run.mjs omit           # missing handler
node --experimental-strip-types run.mjs step-omission  # connector's skipped `step`
node --experimental-strip-types run.mjs zero           # no traces
```

All five commands must exit nonzero. In the observed run, the normal smoke
replayed 3 traces and executed 15 `Inspect` actions. The five negative controls
exited 1; `extra-effect` produced a `StateMismatchError` at trace 0, step 1,
and `step-omission` was rejected by the preflight before connector replay.

`security-run.mjs` consumes `../model/security.qnt` through `defineDriver`,
`quintRun`, `stateCheck`, and `getState`. Quint uses the Rust backend, explicit
`replayStep`, fixed seed, and pinned executable. Its preflight rejects unknown
or omitted actions, zero traces, and missing witness/action coverage. It
compares policy revision, real consent grant, production preparation outcome,
the capture hook's source-read observation, and controlled DecisionModel calls
after every action. Seed `13` with one trace is an authorized positive control:
it passed, with one real prepared unit and one provider call. Seed `424242`
with eleven traces includes a queued restrictive-policy witness. It failed at
trace 6, step 8: model `Denied`/no `ProviderSend`, direct function path
`Sent`/one provider call.

The failing strict witness is **not proof of a resident dispatch bug**.
`enqueueJob0` is a local fixture transition, and direct `evaluatePrepared` does
not perform the resident dispatch authorization check. The resident-path
reproduction must decide that question separately. The controlled model sees
provider calls before wire serialization; this script does not validate the
complete HTTP request, durable sinks, native reads, or packaged process. The
fixture preflight and action counter address connector replay integrity only
for generated traces in this bounded run. A permanent gate needs per-action
coverage across the full model and an observed resident/wire sink journal.
