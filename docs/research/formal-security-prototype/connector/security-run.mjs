// Bounded model replay against Hapsland's direct-event preparation/evaluation.
// The local enqueue transition is only a fixture marker: resident scheduling is
// covered separately. A strict-policy mismatch is expected on the raw path.
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { rm } from "node:fs/promises";
import { Effect } from "effect";
import { defineDriver, generateTraces, quintRun, stateCheck } from "@firfi/quint-connect/effect";
import { prepareObservation, evaluatePrepared } from "../../../../src/direct-event/pipeline.ts";
import { adaptCodexAdd } from "../../../../src/direct-event/adapter.ts";
import { makeGitFixture, put, addEvent } from "../../../../src/direct-event/test-fixtures.ts";
import { Consent } from "../../../../src/runtime/consent.ts";
import { DEFAULT_BACKEND, DEFAULT_DESTINATION } from "../../../../src/runtime/review-config.ts";
import { configuredRules } from "../../../../src/policy/rules.ts";
import { controlledDecisionModelLayer } from "../../../../src/test-support/controlled-decision-model.ts";

const here = dirname(fileURLToPath(import.meta.url));
const mode = process.argv[2] ?? "strict";
const seed = process.argv[3] ?? "424242";
const nTraces = Number(process.argv[4] ?? (mode === "strict" ? 11 : 1));
const opts = {
  spec: resolve(here, "../model/security.qnt"),
  quintBin: resolve(here, "node_modules/.bin/quint"),
  seed, nTraces, maxSteps: 12, maxSamples: nTraces, step: "replayStep",
  main: "security", backend: "rust", invariants: ["security"],
  ...(mode === "positive" ? { witnesses: ["sentWitness"] } : {}),
};
const actions = new Set([
  "init", "configureStrict", "grantRepo0", "observeAllowedRepo0Job0",
  "prepareJob0", "enqueueJob0", "dispatchJob0",
]);
const integer = (value) => Number(value?.["#bigint"] ?? value);
const mapAt = (value, id) => value["#map"].find(([key]) => integer(key) === id)?.[1];
const effectKinds = (s) => new Set(s.effects["#set"].map((effect) => effect.kind.tag));

function preflight(traces) {
  if (traces.length !== nTraces || traces.length === 0) throw new Error("Wrong or zero trace count");
  const counts = new Map();
  let positive = 0;
  let denied = 0;
  for (const [traceIndex, trace] of traces.entries()) {
    if (trace.states.length < 2) throw new Error(`Empty trace ${traceIndex}`);
    for (const [stepIndex, state] of trace.states.entries()) {
      const name = state["mbt::actionTaken"];
      if (!actions.has(name)) throw new Error(`Unmapped action ${String(name)} at ${traceIndex}:${stepIndex}`);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const final = trace.states.at(-1).s;
    const phase = mapAt(final.jobs, 0).phase.tag;
    if (effectKinds(final).has("ProviderSend")) positive += 1;
    if (phase === "Denied" && effectKinds(final).has("SourceRead")) denied += 1;
  }
  if (!counts.get("prepareJob0") || !counts.get("dispatchJob0")) {
    throw new Error("Required preparation/dispatch actions did not execute");
  }
  if (mode === "positive" && positive === 0) throw new Error("No authorized provider-send witness");
  if (mode === "strict" && denied === 0) {
    throw new Error(`Missing denied witness: denied=${denied}`);
  }
  return { counts, positive, denied };
}

async function main() {
  const traces = await Effect.runPromise(generateTraces(opts).pipe(Effect.timeout("180 seconds")));
  const coverage = preflight(traces);
  const executed = new Map();
  const roots = [];
  const mark = (name) => executed.set(name, (executed.get(name) ?? 0) + 1);
  const driverFactory = defineDriver(Object.fromEntries([...actions].map((name) => [name, {}])), () => {
    let root;
    let consent;
    let granted = false;
    let policyRev = 0;
    let observation;
    let prepared;
    let phase = "Idle";
    let read = false;
    let sent = false;
    return {
      init: () => Effect.promise(async () => {
        root = await makeGitFixture();
        roots.push(root);
        await put(root, "type.ts", "type OrderCount = number\n");
        consent = await Effect.runPromise(Consent.Service.pipe(Effect.provide(Consent.testLayer())));
        mark("init");
      }),
      configureStrict: () => Effect.sync(() => { policyRev = 1; mark("configureStrict"); }),
      grantRepo0: () => Effect.promise(async () => {
        if (!granted) {
          const proposal = await Effect.runPromise(consent.preview(root, DEFAULT_BACKEND, DEFAULT_DESTINATION));
          await Effect.runPromise(consent.enable(proposal));
          granted = true;
        }
        mark("grantRepo0");
      }),
      observeAllowedRepo0Job0: () => Effect.promise(async () => {
        observation = await Effect.runPromise(adaptCodexAdd(addEvent(root)));
        if (observation === undefined) throw new Error("Production event adaptation failed");
        phase = "Observed";
        mark("observeAllowedRepo0Job0");
      }),
      prepareJob0: () => Effect.promise(async () => {
        const result = await Effect.runPromise(prepareObservation(observation, {
          controlledWriter: true,
          recipient: observation.recipient,
          consent,
          settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
          rules: configuredRules,
          policy: () => ({ includes: ["**/*"], excludes: policyRev === 1 ? ["type.ts"] : [] }),
          captureHooks: { sourceRead: () => { read = true; } },
        }));
        const ready = result.outcomes.find((outcome) => outcome.status === "ready");
        prepared = ready?.status === "ready" ? ready.prepared : undefined;
        phase = prepared ? "Prepared" : "Rejected";
        mark("prepareJob0");
      }),
      enqueueJob0: () => Effect.sync(() => { phase = "Queued"; mark("enqueueJob0"); }),
      dispatchJob0: () => Effect.promise(async () => {
        if (prepared === undefined) throw new Error("No prepared unit to dispatch");
        let calls = 0;
        const result = await Effect.runPromise(evaluatePrepared(prepared).pipe(
          Effect.provide(controlledDecisionModelLayer({ onRequest: Effect.sync(() => { calls += 1; }) })),
        ));
        if (result.status !== "evaluated" || calls !== 1) throw new Error("Production provider attempt failed");
        sent = true;
        phase = "Sent";
        mark("dispatchJob0");
      }),
      getState: () => Effect.succeed({ policyRev, granted, phase, read, sent }),
      config: () => ({ statePath: ["s"] }),
    };
  });
  try {
    const result = await Effect.runPromise(quintRun({
      ...opts, driverFactory,
      stateCheck: stateCheck(
        (raw) => Effect.succeed({
          policyRev: integer(raw.policyRev),
          granted: mapAt(raw.consent, 0),
          phase: mapAt(raw.jobs, 0).phase.tag,
          read: effectKinds(raw).has("SourceRead"),
          sent: effectKinds(raw).has("ProviderSend"),
        }),
        (spec, impl) => Object.keys(spec).every((key) => spec[key] === impl[key]),
      ),
    }).pipe(Effect.timeout("180 seconds")));
    if (result.tracesReplayed !== nTraces) throw new Error("Replay count mismatch");
    for (const [name, expected] of coverage.counts) {
      if (executed.get(name) !== expected) throw new Error(`Action ${name} omitted: ${executed.get(name) ?? 0}/${expected}`);
    }
    console.log(JSON.stringify({ status: "pass", mode, seed, traces: result.tracesReplayed,
      positive: coverage.positive, denied: coverage.denied, actions: Object.fromEntries(executed) }));
  } finally {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  }
}

main().catch((error) => {
  console.error(`${mode}: ${error?.message ?? String(error)}`);
  process.exitCode = 1;
});
