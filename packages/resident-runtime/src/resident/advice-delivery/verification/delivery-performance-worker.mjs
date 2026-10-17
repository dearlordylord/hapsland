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
const Deferred = await load("/node_modules/effect/dist/Deferred.js")
const Layer = await load("/node_modules/effect/dist/Layer.js")
const { makeResidentRuntime } = await load("/packages/resident-runtime/dist/resident/server.js")
const { ResidentReviewControls, defaultReviewControls } = await load(
  "/packages/resident-runtime/dist/resident/execution-controls/review-controls.js"
)
const { adaptCodexDirectEvent, adaptClaudeDirectEvent } = await load(
  "/packages/native-observation/dist/direct-event/adapter.js"
)
const { captureStable } = await load("/packages/native-observation/dist/direct-event/capture.js")
const { residentPaths } = await load("/packages/resident-transport/dist/resident/paths.js")
const { monotonicNow } = await load("/packages/resident-transport/dist/resident/hook-clock.js")
const { residentRequestEffect } = await load("/packages/resident-transport/dist/resident/client.js")
const { addEvent } = await load("/scripts/test-support/test-fixtures.ts")
const { root, userConfigPath } = JSON.parse(readFileSync(fixturePath, "utf8"))
const run = Effect.runPromise
const cases = ["local-empty", "local-ready", "ipc-empty", "ipc-ready", "edit-ready"]

const observation = (path, edit) =>
  edit
    ? run(
        adaptClaudeDirectEvent({
          hook_event_name: "PostToolUse",
          tool_name: "Write",
          cwd: root,
          session_id: "delivery-bench",
          tool_use_id: path,
          tool_input: { file_path: join(root, path), content: readFileSync(join(root, path), "utf8") },
          tool_response: {
            filePath: join(root, path),
            content: readFileSync(join(root, path), "utf8"),
            originalFile: null,
            userModified: false
          }
        })
      )
    : run(adaptCodexDirectEvent(addEvent(root, [path])))

async function invoke(name) {
  const edit = name === "edit-ready",
    ready = name.endsWith("ready"),
    ipc = !name.startsWith("local")
  const folder = mkdtempSync(join(tmpdir(), "haps-delivery-"))
  const scope = await run(Scope.make()),
    allow = await run(Deferred.make())
  const events = []
  let held = false,
    server,
    closed = false
  const dispatch = {
    statePath: join(folder, "state"),
    userConfigPath,
    credential: null,
    controlled: { answers: { domain: { _tag: "Probability", probability: 0.9 } } }
  }
  try {
    const a = await observation("a.ts", edit)
    assert.ok(a)
    server = await run(
      makeResidentRuntime(residentPaths(join(folder, "runtime")), () => 100_000, {
        reviewControls: Layer.succeed(
          ResidentReviewControls,
          ResidentReviewControls.of({
            ...defaultReviewControls,
            beforeEvaluate: () => Effect.suspend(() => (held ? Deferred.await(allow) : Effect.void)),
            beforeSelection: () => Effect.sync(() => events.push("select")),
            beforeFinalSelection: () => Effect.sync(() => events.push("final-selection")),
            beforeResponseHandoff: () => Effect.sync(() => events.push("transport-barrier"))
          })
        ),
        captureSource: (sourceRoot, path, _hooks, identity, maximum) =>
          captureStable(
            sourceRoot,
            path,
            {
              sourceRead: (read) => {
                if (read === "a.ts") events.push("read:a.ts")
              }
            },
            identity,
            maximum
          )
      }).pipe(Effect.provideService(Scope.Scope, scope))
    )
    if (ready) {
      assert.equal((await run(server.admit(a, dispatch, true))).status, "accepted")
      await run(server.whenIdle())
      assert.equal((await run(server.pendingAdviceMetadata())).length, 1)
    }
    if (ipc) await run(server.listen())
    let request
    if (edit) {
      const b = await observation("b.ts", true)
      assert.ok(b)
      assert.equal(
        (
          await run(
            server.handle({
              requestRoute: "shared",
              operation: "register-edit",
              lifetime: server.lifetime,
              root,
              advicee: b.advicee,
              userConfigPath,
              startedAt: monotonicNow()
            })
          )
        ).status,
        "advanced"
      )
      held = true
      request = {
        requestRoute: "edit",
        operation: "admit-and-collect",
        lifetime: server.lifetime,
        observation: b,
        controlledWriter: true,
        composed: true,
        dispatch,
        waitMs: 1500
      }
    } else
      request = {
        requestRoute: "shared",
        operation: "collect",
        lifetime: server.lifetime,
        root,
        advicee: a.advicee,
        dispatch,
        composed: true
      }
    events.length = 0
    const started = performance.now(),
      cpu = process.cpuUsage()
    const response = await run(
      ipc ? residentRequestEffect(server.paths, request, 2500) : server.collect(root, a.advicee, dispatch)
    )
    const elapsed = (performance.now() - started) / 1000,
      used = process.cpuUsage(cpu)
    assert.equal(response.status, ready ? "advice" : "empty")
    assert.equal(events.filter((event) => event === "transport-barrier").length, ipc ? 1 : 0)
    if (ready) {
      assert.equal(response.findingCount, 1)
      assert.ok(events.includes("read:a.ts"), "freshness must read actual ready source")
      assert.equal(
        events.filter((event) => event === "select").length,
        1,
        "ready edit must finish in one collection pass"
      )
    }
    const result = {
      response: response.status === "advice" ? { ...response, token: "<delivery-token>" } : response,
      events: [...events]
    }
    if (response.status === "advice") await run(server.releaseDelivery(response.token))
    held = false
    await run(Deferred.succeed(allow, undefined))
    await run(server.whenIdle())
    assert.ok((await run(server.pendingAdviceMetadata())).every((item) => item.delivery === "available"))
    await run(Scope.close(scope, Exit.void))
    closed = true
    const stats = await run(server.stats())
    assert.equal(stats.retainedBytes, 0)
    assert.equal(stats.pendingEvaluations, 0)
    assert.equal(stats.running, 0)
    assert.equal(stats.queued, 0)
    assert.equal(existsSync(server.paths.socket), false)
    return { name, seconds: elapsed, cpuSeconds: (used.user + used.system) / 1e6, result }
  } finally {
    held = false
    await run(Deferred.succeed(allow, undefined))
    if (!closed) await run(Scope.close(scope, Exit.void))
    rmSync(folder, { recursive: true, force: true })
  }
}

const suite = async () => {
  const samples = []
  for (const name of cases) samples.push(await invoke(name))
  return samples
}
const first = await suite(),
  actual = first.map(({ name, result }) => ({ name, result }))
if (mode === "prepare") {
  writeFileSync(goldenPath, JSON.stringify(actual))
} else {
  const golden = JSON.parse(readFileSync(goldenPath, "utf8"))
  assert.deepEqual(actual, golden)
  for (let warmup = 0; warmup < 2; warmup++)
    assert.deepEqual(
      (await suite()).map(({ name, result }) => ({ name, result })),
      golden
    )
  const samples = await suite()
  assert.deepEqual(
    samples.map(({ name, result }) => ({ name, result })),
    golden
  )
  console.log(
    JSON.stringify({
      seconds: samples.reduce((sum, sample) => sum + sample.seconds, 0),
      cpuSeconds: samples.reduce((sum, sample) => sum + sample.cpuSeconds, 0),
      fixtures: samples.map(({ result: _result, ...sample }) => sample),
      definedAndEqual: true,
      warmups: 3,
      rounds: 1,
      scope:
        "whole ready/empty local and IPC collection, plus ready edit; real freshness/authorization; preparation and cleanup outside timers"
    })
  )
}
