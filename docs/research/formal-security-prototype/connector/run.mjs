// Throwaway connector consumer. It exercises the local RC.116 connector candidate
// and one real Hapsland analyzer call; it is not a production security gate.
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
const seed = "0x5ec0a116";
const nTraces = 3;
const maxSteps = 5;
const opts = {
  spec: resolve(here, "smoke.qnt"),
  quintBin: resolve(here, "node_modules/.bin/quint"),
  seed,
  nTraces,
  maxSteps,
};
const expectedActions = new Set(["init", "Inspect"]);
const mode = process.argv[2] ?? "pass";

function actionCounts(traces) {
  if (traces.length !== nTraces) throw new Error(`Expected ${nTraces} traces; got ${traces.length}`);
  const counts = new Map();
  for (const [traceIndex, trace] of traces.entries()) {
    if (trace.states.length < 2) throw new Error(`Trace ${traceIndex} has no meaningful action`);
    for (const [stepIndex, state] of trace.states.entries()) {
      const action = state["mbt::actionTaken"];
      if (typeof action !== "string" || !expectedActions.has(action)) {
        throw new Error(`Unmapped action ${String(action)} at trace ${traceIndex}, step ${stepIndex}`);
      }
      counts.set(action, (counts.get(action) ?? 0) + 1);
    }
  }
  for (const action of expectedActions) {
    if (!counts.get(action)) throw new Error(`No execution of required action ${action}`);
  }
  return counts;
}

async function main() {
  if (mode === "zero") throw new Error("Zero requested traces are not a valid gate run");
  if (mode === "step-omission") {
    actionCounts(Array.from({ length: nTraces }, () => ({ states: [
      { "mbt::actionTaken": "init" },
      { "mbt::actionTaken": "step" },
    ] })));
    return;
  }

  const traces = await Effect.runPromise(generateTraces(opts).pipe(Effect.timeout("180 seconds")));
  const expected = actionCounts(traces);
  const executed = new Map();
  const driverFactory = defineDriver(
    mode === "omit" ? { init: {} } : { init: {}, Inspect: {} },
    () => {
      let count = 0;
      let ready = false;
      return {
        init: () => Effect.sync(() => {
          count = 0;
          ready = false;
          executed.set("init", (executed.get("init") ?? 0) + 1);
        }),
        Inspect: () => Effect.promise(async () => {
          const root = await makeGitFixture();
          try {
            await put(root, "type.ts", "type OrderCount = number\n");
            const observation = await Effect.runPromise(adaptCodexAdd(addEvent(root)));
            if (observation === undefined) throw new Error("Codex event adaptation failed");
            const prepared = await Effect.runPromise(Effect.gen(function* () {
              const consent = yield* Consent.Service;
              return yield* prepareObservation(observation, {
                controlledWriter: true,
                recipient: observation.recipient,
                consent,
                settings: { backend: DEFAULT_BACKEND, destination: DEFAULT_DESTINATION },
                rules: configuredRules,
              });
            }).pipe(Effect.provide(Consent.testLayer())));
            const item = prepared.outcomes.find((outcome) => outcome.status === "ready");
            if (item?.status !== "ready") throw new Error("Production preparation yielded no ready unit");
            let calls = 0;
            const evaluation = await Effect.runPromise(evaluatePrepared(item.prepared).pipe(
              Effect.provide(controlledDecisionModelLayer({
                onRequest: Effect.sync(() => { calls += 1; }),
              })),
            ));
            if (evaluation.status !== "evaluated" || calls !== 1) {
              throw new Error(`Production evaluation status=${evaluation.status}, calls=${calls}`);
            }
            count += calls + (mode === "extra-effect" ? 1 : 0);
            ready = true;
            executed.set("Inspect", (executed.get("Inspect") ?? 0) + 1);
          } finally {
            await rm(root, { recursive: true, force: true });
          }
        }),
        getState: () => Effect.succeed({ count: mode === "mismatch" ? count + 1 : count, ready }),
      };
    },
  );
  const result = await Effect.runPromise(quintRun({
    ...opts,
    driverFactory,
    stateCheck: stateCheck(
      (raw) => Effect.succeed({
        count: Number(raw.count?.["#bigint"] ?? raw.count),
        ready: raw.ready,
      }),
      (spec, impl) => spec.count === impl.count && spec.ready === impl.ready,
    ),
  }).pipe(Effect.timeout("180 seconds")));
  if (result.tracesReplayed !== nTraces) throw new Error(`Only ${result.tracesReplayed} traces replayed`);
  for (const action of expectedActions) {
    if (executed.get(action) !== expected.get(action)) {
      throw new Error(`Action ${action}: expected ${expected.get(action)} executions; got ${executed.get(action) ?? 0}`);
    }
  }
  console.log(JSON.stringify({ status: "pass", seed: result.seed, traces: result.tracesReplayed, actions: Object.fromEntries(executed) }));
}

main().catch((error) => {
  console.error(`${mode}: ${error?.message ?? String(error)}`);
  process.exitCode = 1;
});
