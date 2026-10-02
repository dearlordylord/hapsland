import { monitorEventLoopDelay } from "node:perf_hooks";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFile, rm } from "node:fs/promises";
import { Deferred, Effect, Exit, Fiber, Scope } from "effect";

const checkout = resolve(process.argv[2] ?? ".");
const contract = JSON.parse(await readFile(new URL("./physical-retirement-contract.json", import.meta.url), "utf8"));
const load = (path) => import(pathToFileURL(join(checkout, path)).href);
const [runtimeModule, { residentPaths }, { adaptCodexDirectEvent }, fixtures, { configuredRules }] = await Promise.all([
  load("src/resident/server.ts"), load("src/resident/paths.ts"), load("src/direct-event/adapter.ts"),
  load("src/direct-event/test-fixtures.ts"), load("src/policy/rules.ts"),
]);
const root = await fixtures.makeGitFixture();
const samples = { admission: [], stop: [], saturation: [], shutdown: [], eventLoop: [] };
const passes = [];
let phase = "fixture capture";
let failureDiagnostic;
let peakRetainedBytes = 0, peakRssBytes = 0, maximumConcurrentDecisionEffects = 0;
const signal = (deferred) => Effect.runSync(Deferred.succeed(deferred, undefined));
const ensure = (condition, message) => { if (!condition) throw new Error(message); };
try {
  const edits = [];
  for (let index = 0; index < contract.workload.editsPerIteration; index += 1) {
    const file = `held-${index}.ts`;
    await fixtures.put(root, file, `export type Held${index}Count = number\n`);
    const edit = await Effect.runPromise(adaptCodexDirectEvent(fixtures.addEvent(root, [file], {
      agent_id: `agent-${index}`, tool_use_id: `held-${index}`,
    })));
    ensure(edit !== undefined, "fixture observation missing");
    edits.push(edit);
  }
  for (let pass = -contract.workload.warmups; pass < contract.workload.iterations; pass += 1) {
    const measured = pass >= 0;
    const result = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const scope = yield* Scope.make();
      const releases = [];
      const physicalEntries = [];
      for (let index = 0; index < 9; index += 1) {
        releases.push(yield* Deferred.make());
        physicalEntries.push(yield* Deferred.make());
      }
      const eightStarted = yield* Deferred.make();
      const saturated = yield* Deferred.make();
      const firstInterrupted = yield* Deferred.make();
      const firstSettled = yield* Deferred.make();
      const reusedStarted = yield* Deferred.make();
      const closeEntered = yield* Deferred.make();
      const physicalCompletions = [];
      const physicalSignals = [];
      const events = [];
      let entered = 0, physical = 0, peakPhysical = 0, interrupted = 0;
      let server, closeFiber, closedBeforePhysicalCompletion = false;
      const monitor = monitorEventLoopDelay({ resolution: 1 });
      monitor.enable();
      const acquire = runtimeModule.makeResidentRuntime === undefined
        // Fixed historical comparison only; production has no legacy constructor.
        ? Effect.sync(() => new runtimeModule.ResidentServer(residentPaths(join(root, `held-runtime-${pass}`)), undefined, options()))
        : Effect.suspend(() => runtimeModule.makeResidentRuntime(residentPaths(join(root, `held-runtime-${pass}`)), undefined, options())
          .pipe(Effect.provideService(Scope.Scope, scope)));
      function options() {
        return {
          controlledRequestEffect: (abortSignal) => {
            const index = entered++;
            physicalSignals.push(abortSignal);
            physical += 1;
            peakPhysical = Math.max(peakPhysical, physical);
            ensure(index < releases.length, "unexpected extra physical request");
            signal(physicalEntries[index]);
            if (entered === 8) signal(eightStarted);
            if (entered === 9) signal(reusedStarted);
            const completion = Effect.runPromise(Deferred.await(releases[index])).then(() => { physical -= 1; });
            physicalCompletions.push(completion);
            return completion;
          },
          jevRequestObserver: (event) => {
            events.push({ stage: event.stage, request: event.request, physical });
            if (event.stage === "unavailable") signal(saturated);
            if (event.stage === "interrupted") {
              interrupted += 1;
              if (interrupted === 1) signal(firstInterrupted);
            }
            if (event.stage === "settled") signal(firstSettled);
          },
        };
      }
      return yield* Effect.gen(function* () {
        phase = "runtime acquisition";
        server = yield* acquire;
        yield* Effect.promise(() => server.listen());
        const dispatch = { statePath: join(root, "consent"), userConfigPath: null, credential: null,
          controlled: { answers: Object.fromEntries(configuredRules.map(rule => [rule.id, { _tag: "Probability", probability: 0 }])) } };
        const admit = (edit) => {
          const started = performance.now();
          ensure(server.admit(edit, dispatch, false, true).status === "accepted", "admission refused");
          if (measured) samples.admission.push(performance.now() - started);
        };
        const saturationStarted = performance.now();
        for (let index = 0; index < 8; index += 1) {
          admit(edits[index]);
          yield* Deferred.await(physicalEntries[index]);
        }
        phase = "await eight physical starts";
        yield* Deferred.await(eightStarted);
        const exactSaturation = physical === 8 && entered === 8;
        if (measured) samples.saturation.push(performance.now() - saturationStarted);
        admit(edits[8]);
        phase = "await saturated edit refusal";
        yield* Deferred.await(saturated);
        const saturatedDidNotStart = entered === 8 && physical === 8;
        const stopStarted = performance.now();
        yield* Effect.promise(() => server.handle({ requestRoute: "shared", operation: "begin-stop", lifetime: server.lifetime,
          root, advicee: edits[0].advicee, token: `held-stop-${pass}` }));
        yield* Effect.promise(() => server.handle({ requestRoute: "shared", operation: "finish-stop", lifetime: server.lifetime,
          root, advicee: edits[0].advicee, token: `held-stop-${pass}`, close: true }));
        if (measured) samples.stop.push(performance.now() - stopStarted);
        phase = "await round interruption";
        yield* Deferred.await(firstInterrupted);
        yield* Effect.sleep(contract.workload.heldCloseObservationMs);
        const roundRetainsPhysicalPermit = physical === 8 && !events.some(event => event.stage === "settled");
        yield* Deferred.succeed(releases[0], undefined);
        yield* Effect.promise(() => physicalCompletions[0]);
        phase = "await first canonical settlement";
        yield* Deferred.await(firstSettled);
        admit(edits[9]);
        phase = "await reused physical start";
        yield* Deferred.await(reusedStarted);
        const firstInterruption = events.findIndex(event => event.stage === "interrupted");
        const firstRequest = events[firstInterruption]?.request;
        const settlement = events.findIndex(event => event.stage === "settled" && event.request === firstRequest);
        const starts = events.flatMap((event, index) => event.stage === "started" ? [index] : []);
        const reuseFollowsPhysicalSettlement = settlement > firstInterruption &&
          starts[8] > settlement && events[settlement]?.physical === 7 && physical === 8;
        // Keep the fixed class-based baseline measurable without a product compatibility path.
        const metrics = measured ? runtimeModule.makeResidentRuntime === undefined
          ? server.accountingMetrics() : yield* server.accountingMetrics() : undefined;
        peakRetainedBytes = Math.max(peakRetainedBytes, metrics?.peakLedgerBytes ?? 0);
        peakRssBytes = Math.max(peakRssBytes, measured ? process.memoryUsage().rss : 0);
        closeFiber = yield* Effect.forkChild(Effect.promise(() => {
          const completion = server.close();
          signal(closeEntered);
          return completion;
        }).pipe(
          Effect.tap(() => Effect.sync(() => { closedBeforePhysicalCompletion = physical > 0; })),
        ));
        phase = "await shutdown entry";
        yield* Deferred.await(closeEntered);
        yield* Effect.sleep(contract.workload.heldCloseObservationMs);
        const shutdownPendingWhileHeld = closeFiber.pollUnsafe() === undefined && physical === 8;
        const nativeCancellation = physicalSignals.every(abortSignal => abortSignal !== undefined)
          ? physicalSignals.filter(abortSignal => abortSignal.aborted).length : null;
        const interruptedNotificationsBeforeRelease = interrupted;
        const releaseStarted = performance.now();
        for (const release of releases) yield* Deferred.succeed(release, undefined);
        yield* Effect.promise(() => Promise.all(physicalCompletions));
        phase = "await shutdown completion";
        yield* Fiber.join(closeFiber);
        if (measured) samples.shutdown.push(performance.now() - releaseStarted);
        const accounting = server.stats();
        return {
          exactSaturation, saturatedDidNotStart, roundRetainsPhysicalPermit, reuseFollowsPhysicalSettlement,
          shutdownPendingWhileHeld, shutdownWaitsForPhysicalCompletion: !closedBeforePhysicalCompletion,
          canonicalRequestsSettled: events.filter(event => event.stage === "settled").length === entered,
          finalAccountingCleared: physical === 0 && accounting.retainedBytes === 0 && accounting.running === 0 && accounting.queued === 0,
          peakPhysical, physicalStarted: entered, nativeCancellationBeforeRelease: nativeCancellation, interruptedNotificationsBeforeRelease,
        };
      }).pipe(Effect.timeout(contract.workload.iterationTimeoutMs), Effect.onError(() => Effect.sync(() => {
        failureDiagnostic = { entered, physical, interrupted, stages: Object.fromEntries(["started", "interrupted", "settled", "unavailable"].map(stage => [stage, events.filter(event => event.stage === stage).length])) };
      })), Effect.ensuring(Effect.gen(function* () {
        for (const release of releases) yield* Deferred.succeed(release, undefined);
        yield* Effect.promise(() => Promise.all(physicalCompletions));
        if (server !== undefined) yield* Effect.promise(() => server.close());
        yield* Scope.close(scope, Exit.void);
        monitor.disable();
        if (measured) samples.eventLoop.push(monitor.percentile(95) / 1e6);
      })));
    })));
    if (measured) { passes.push(result); maximumConcurrentDecisionEffects = Math.max(maximumConcurrentDecisionEffects, result.peakPhysical); }
  }
  const p95 = values => [...values].sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1] ?? 0;
  console.log(JSON.stringify({
    purpose: "Sanitized deterministic physical-retirement benchmark", authority: "Implementation evidence; no support acceptance",
    checkout, environment: { node: process.version, platform: process.platform, arch: process.arch }, workload: contract.workload,
    observations: { admissionP95Ms: p95(samples.admission), stopP95Ms: p95(samples.stop), saturationP95Ms: p95(samples.saturation),
      shutdownP95Ms: p95(samples.shutdown), eventLoopP95Ms: p95(samples.eventLoop), peakRetainedBytes, peakRssBytes, maximumConcurrentDecisionEffects },
    invariants: Object.fromEntries(Object.keys(passes[0]).filter(key => typeof passes[0][key] === "boolean")
      .map(key => [key, passes.every(pass => pass[key])])),
    passes, samples: Object.fromEntries(Object.entries(samples).map(([key, value]) => [key, value.length])), limitations: contract.limitations,
  }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ purpose: "Sanitized physical-retirement experiment failure", checkout, phase, failure: error?._tag ?? "Error", completedMeasuredPasses: passes.length, diagnostic: failureDiagnostic }, null, 2));
  process.exitCode = 1;
} finally { await rm(root, { recursive: true, force: true }); }
