import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { performance } from "node:perf_hooks"

const [checkout, mode, fixturePath, goldenPath] = process.argv.slice(2)
assert.equal(process.argv.slice(2).length, 4)
assert.ok(mode === "prepare" || mode === "measure")
const load = (path) => import(pathToFileURL(checkout + path).href)
const Effect = await load("/node_modules/effect/dist/Effect.js")
const Scope = await load("/node_modules/effect/dist/Scope.js")
const Exit = await load("/node_modules/effect/dist/Exit.js")
const Layer = await load("/node_modules/effect/dist/Layer.js")
const { makeResidentRuntime } = await load("/packages/resident-runtime/dist/resident/server.js")
const { ResidentReviewControls, defaultReviewControls } = await load(
  "/packages/resident-runtime/dist/resident/execution-controls/review-controls.js"
)
const { adaptCodexDirectEvent } = await load("/packages/native-observation/dist/direct-event/adapter.js")
const { captureStable } = await load("/packages/native-observation/dist/direct-event/capture.js")
const { residentPaths } = await load("/packages/resident-transport/dist/resident/paths.js")
const { addEvent } = await load("/scripts/test-support/test-fixtures.ts")
const { root, userConfigPath } = JSON.parse(readFileSync(fixturePath, "utf8"))
const run = Effect.runPromise
const cases = ["clear", "finding", "refusal", "backend-failure", "cancellation"]

async function invoke(name, phase) {
  const folder = mkdtempSync(join(tmpdir(), "haps-evaluation-"))
  const scope = await run(Scope.make())
  const observations = [],
    controls = []
  let server,
    closed = false,
    requests = 0,
    aborted = 0,
    drained = 0,
    reads = 0
  const entered = Promise.withResolvers(),
    allow = Promise.withResolvers(),
    interrupted = Promise.withResolvers()
  const dispatch = {
    statePath: join(folder, "state"),
    userConfigPath,
    credential: null,
    controlled: {
      answers: { domain: { _tag: "Probability", probability: name === "finding" ? 0.9 : 0 } },
      ...(name === "refusal" ? { requireCredential: true } : {}),
      ...(name === "backend-failure" ? { failure: "evaluation benchmark failure" } : {})
    }
  }
  try {
    const observation = await run(adaptCodexDirectEvent(addEvent(root, ["a.ts"])))
    assert.ok(observation)
    server = await run(
      makeResidentRuntime(residentPaths(join(folder, "runtime")), () => 100_000, {
        jevRequestObserver: (value) => observations.push(value),
        controlledRequestEffect: async (signal) => {
          requests++
          if (name !== "cancellation") return
          const abort = () => {
            aborted++
            interrupted.resolve()
          }
          if (signal.aborted) abort()
          else signal.addEventListener("abort", abort, { once: true })
          entered.resolve()
          try {
            await allow.promise
          } finally {
            signal.removeEventListener("abort", abort)
            drained++
          }
        },
        reviewControls: Layer.succeed(
          ResidentReviewControls,
          ResidentReviewControls.of({
            ...defaultReviewControls,
            beforeEvaluate: () => Effect.sync(() => controls.push("evaluate")),
            afterAdvicePending: () => Effect.sync(() => controls.push("retained")),
            beforeSelection: () => Effect.sync(() => controls.push("select")),
            beforeFinalSelection: () => Effect.sync(() => controls.push("final-selection"))
          })
        ),
        captureSource: (sourceRoot, path, _hooks, identity, maximum) =>
          captureStable(
            sourceRoot,
            path,
            {
              sourceRead: () => {
                reads++
              }
            },
            identity,
            maximum
          )
      }).pipe(Effect.provideService(Scope.Scope, scope))
    )
    const wallStart = Date.now() * 1000,
      start = performance.now(),
      cpu = process.cpuUsage()
    const admission = await run(server.admit(observation, dispatch, true))
    let response = null
    if (name === "cancellation") {
      assert.equal(admission.status, "accepted")
      await entered.promise
      let finished = false
      const closing = run(Scope.close(scope, Exit.void)).then(() => {
        finished = true
      })
      await interrupted.promise
      assert.equal(finished, false, "shutdown must wait for the physical provider")
      assert.equal(drained, 0)
      allow.resolve()
      await closing
      closed = true
    } else {
      await run(server.whenIdle())
      response = await run(server.collect(root, observation.advicee, dispatch))
    }
    const elapsed = (performance.now() - start) / 1000,
      used = process.cpuUsage(cpu),
      wallStop = Date.now() * 1000
    assert.equal(requests, name === "refusal" ? 0 : 1, "actual provider attempts inside the timer")
    if (name !== "refusal") assert.ok(reads > 0, "actual preparation source reads inside the timer")
    assert.equal(aborted, name === "cancellation" ? 1 : 0)
    assert.equal(drained, name === "cancellation" ? 1 : 0)
    const issued = observations.find((item) => item.stage === "issued")
    if (name !== "refusal") {
      assert.ok(issued)
      assert.equal(observations.filter((item) => item.stage === "started").length, 1)
      assert.equal(observations.filter((item) => item.stage === "settled").length, 1)
      for (const item of observations) {
        assert.equal(item.operation, issued.operation)
        assert.equal(item.canonicalPartition, issued.canonicalPartition)
        if (item.request !== undefined) assert.equal(item.request, issued.request)
      }
      assert.equal(
        observations.find((item) => item.stage === "settled").outcome,
        { clear: "clear", finding: "finding", "backend-failure": "backendFailure", cancellation: "interrupted" }[name]
      )
    }
    if (name === "finding") {
      assert.equal(response.status, "advice")
      assert.equal(response.findingCount, 1)
      assert.ok(controls.includes("retained"))
      assert.ok(controls.includes("final-selection"))
    }
    if (name === "clear") assert.equal(response.status, "empty")
    const result = {
      admission,
      response: response?.status === "advice" ? { ...response, token: "<delivery-token>" } : response,
      observations: observations.map(({ stage, outcome }) => ({
        stage,
        ...(outcome === undefined ? {} : { outcome })
      })),
      controls: [...controls],
      requests,
      aborted,
      drained,
      reads
    }
    if (response?.status === "advice") await run(server.releaseDelivery(response.token))
    if (!closed) {
      await run(Scope.close(scope, Exit.void))
      closed = true
    }
    const stats = await run(server.stats())
    for (const key of ["retainedBytes", "pendingEvaluations", "running", "queued"]) assert.equal(stats[key], 0, key)
    assert.equal(existsSync(server.paths.socket), false)
    return {
      name,
      seconds: elapsed,
      cpuSeconds: (used.user + used.system) / 1e6,
      ...(process.env.HAPSLAND_DELIVERY_PROFILE_INTERVALS === "1"
        ? { profileInterval: { start: wallStart, stop: wallStop } }
        : {}),
      result
    }
  } catch (cause) {
    throw new Error(`Evaluation fixture ${name} failed during ${phase}`, { cause })
  } finally {
    allow.resolve()
    if (!closed) await run(Scope.close(scope, Exit.void))
    rmSync(folder, { recursive: true, force: true })
  }
}

const suite = async (phase) => {
  const samples = []
  for (const name of cases) samples.push(await invoke(name, phase))
  return samples
}
const first = await suite(mode === "prepare" ? "prepare" : "validation")
const outcomes = (samples) => samples.map(({ name, result }) => ({ name, result }))
if (mode === "prepare") writeFileSync(goldenPath, JSON.stringify(outcomes(first)))
else {
  const golden = JSON.parse(readFileSync(goldenPath, "utf8"))
  assert.deepEqual(outcomes(first), golden)
  for (let warmup = 0; warmup < 2; warmup++) assert.deepEqual(outcomes(await suite(`warmup-${warmup}`)), golden)
  const samples = await suite("measurement")
  assert.deepEqual(outcomes(samples), golden)
  console.log(
    JSON.stringify({
      seconds: samples.reduce((sum, sample) => sum + sample.seconds, 0),
      cpuSeconds: samples.reduce((sum, sample) => sum + sample.cpuSeconds, 0),
      fixtures: samples.map(({ result: _result, ...sample }) => sample),
      definedAndEqual: true,
      warmups: 3,
      rounds: 1,
      scope:
        "public admission through actual preparation, controlled provider, settlement and local collection; cancellation through physical drain and Scope cleanup; runtime construction and other Scope cleanup outside timers"
    })
  )
}
