import { monitorEventLoopDelay } from "node:perf_hooks";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFile, rm } from "node:fs/promises";
import { Effect, Exit, Scope } from "effect";

const checkout = resolve(process.argv[2] ?? ".");
const contract = JSON.parse(await readFile(new URL("./benchmark-contract.json", import.meta.url), "utf8"));
const load = (path) => import(pathToFileURL(join(checkout, path)).href);
const [runtimeModule, { residentPaths }, { adaptCodexDirectEvent }, fixtures] = await Promise.all([
  load("src/resident/server.ts"), load("src/resident/paths.ts"), load("src/direct-event/adapter.ts"), load("src/direct-event/test-fixtures.ts"),
]);
const root = await fixtures.makeGitFixture();
const admissions = [], stops = [], saturations = [], shutdowns = [], delays = [];
let peakRetainedBytes = 0, peakRssBytes = 0, maximumConcurrentDecisionEffects = 0;
try {
  const observations = [];
  for (let index = 0; index < contract.workload.editsPerIteration; index += 1) {
    const file = `item-${index}.ts`;
    await fixtures.put(root, file, `export type Item${index}Count = number\n`);
    const observation = await Effect.runPromise(adaptCodexDirectEvent(fixtures.addEvent(root, [file], {
      agent_id: `agent-${index}`, tool_use_id: `tool-${index}`,
    })));
    if (observation === undefined) throw new Error("benchmark fixture could not be observed");
    observations.push(observation);
  }
  for (let pass = -contract.workload.warmups; pass < contract.workload.iterations; pass += 1) {
    const measured = pass >= 0;
    let active = 0, maximum = 0;
    const fixtureScope = await Effect.runPromise(Scope.make());
    const acquireResident = runtimeModule.makeResidentRuntime === undefined
      // The fixed baseline predates scoped runtime acquisition. This branch
      // belongs only to the comparative evidence runner.
      ? (...args) => new runtimeModule.ResidentServer(...args)
      : (...args) => Effect.runPromise(runtimeModule.makeResidentRuntime(...args).pipe(Effect.provideService(Scope.Scope, fixtureScope)));
    const server = await acquireResident(residentPaths(join(root, `runtime-${pass}`)), undefined, {
      jevRequestObserver: (event) => {
        if (event.stage === "started") { active += 1; maximum = Math.max(maximum, active); }
        if (event.stage === "settled" && event.outcome !== "neverSent") active -= 1;
      },
    });
    const monitor = monitorEventLoopDelay({ resolution: 1 });
    monitor.enable();
    try {
      const dispatch = { statePath: join(root, "consent"), userConfigPath: null, credential: null,
        controlled: { delayMs: contract.workload.providerDelayMs } };
      const saturationStarted = performance.now();
      for (const observation of observations) {
        const started = performance.now();
        const admitted = runtimeModule.makeResidentRuntime === undefined
          ? server.admit(observation, dispatch, false, true)
          : await Effect.runPromise(server.admit(observation, dispatch, false, true));
        if (admitted.status !== "accepted") throw new Error("benchmark admission refused");
        if (measured) admissions.push(performance.now() - started);
        peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
      }
      // Stop's deadline observation executes while unrelated edits are active.
      const stopStarted = performance.now();
      await server.handle({ requestRoute: "shared", operation: "begin-stop", lifetime: server.lifetime,
        root, advicee: observations[0].advicee, token: `stop-${pass}` });
      await server.handle({ requestRoute: "shared", operation: "finish-stop", lifetime: server.lifetime,
        root, advicee: observations[0].advicee, token: `stop-${pass}`, close: true });
      if (measured) stops.push(performance.now() - stopStarted);
      await (runtimeModule.makeResidentRuntime === undefined ? server.whenIdle() : Effect.runPromise(server.whenIdle()));
      if (measured) {
        saturations.push(performance.now() - saturationStarted);
        // The fixed class-based baseline exposes synchronous diagnostics.
        const metrics = runtimeModule.makeResidentRuntime === undefined
          ? server.accountingMetrics() : await Effect.runPromise(server.accountingMetrics());
        peakRetainedBytes = Math.max(peakRetainedBytes, metrics.peakLedgerBytes);
        maximumConcurrentDecisionEffects = Math.max(maximumConcurrentDecisionEffects, maximum);
      }
      const shutdownStarted = performance.now();
      await (runtimeModule.makeResidentRuntime === undefined ? server.close() : Effect.runPromise(server.close));
      if (measured) shutdowns.push(performance.now() - shutdownStarted);
    } finally {
      monitor.disable();
      if (measured) delays.push(monitor.percentile(95) / 1e6);
      await (runtimeModule.makeResidentRuntime === undefined ? server.close() : Effect.runPromise(server.close));
      await Effect.runPromise(Scope.close(fixtureScope, Exit.void));
    }
  }
  const p95 = (values) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1] ?? 0;
  console.log(JSON.stringify({
    purpose: "Sanitized offline resident migration benchmark", checkout,
    environment: { node: process.version, platform: process.platform, arch: process.arch },
    workload: contract.workload,
    observations: {
      admissionP95Ms: p95(admissions), stopP95Ms: p95(stops), saturationP95Ms: p95(saturations),
      shutdownP95Ms: p95(shutdowns), eventLoopP95Ms: p95(delays), peakRetainedBytes, peakRssBytes,
      maximumConcurrentDecisionEffects,
    },
    samples: { admission: admissions.length, stop: stops.length, saturation: saturations.length, shutdown: shutdowns.length },
    limitations: contract.limitations,
  }, null, 2));
} finally { await rm(root, { recursive: true, force: true }); }
