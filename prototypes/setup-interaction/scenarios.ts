// THROWAWAY: shared executable scenario drivers, with independent behavior assertions.
import assert from "node:assert/strict"
import { Effect } from "effect"
import { command, type Action, type Event, type Model } from "./domain.ts"
import { createFakeExecutor } from "./fake.ts"
export type Dispatch = (event: Event) => Promise<Model>
export type ScenarioRunner = (
  name: string,
  source: string,
  drive: (dispatch: Dispatch, start: Model) => Promise<Model>
) => Promise<void>
const executors = new WeakMap<Dispatch, ReturnType<typeof createFakeExecutor>>()
const input = (dispatch: Dispatch, m: Model, action: Action) => dispatch({ revision: m.revision, action })
const finish = async (dispatch: Dispatch, m: Model) => {
  const c = command(m)
  assert(c)
  let execute = executors.get(dispatch)
  if (!execute) {
    execute = createFakeExecutor()
    executors.set(dispatch, execute)
  }
  return input(dispatch, m, { kind: "observed", commandId: c.id, outcome: await Effect.runPromise(execute(m)) })
}
export async function runScenarios(scenario: ScenarioRunner) {
  await scenario("two hosts, partial result, project save, separate check", "none", async (d, m) => {
    m = await input(d, m, { kind: "select", hosts: ["Claude", "Codex"] })
    m = await input(d, m, { kind: "approve", yes: true })
    m = await finish(d, m)
    m = await input(d, m, { kind: "approve", yes: true })
    m = await finish(d, m)
    assert.equal(m.results.Codex, "partial: restart required")
    m = await input(d, m, { kind: "destination", destination: "project" })
    assert.equal(command(m), undefined, "destination alone must not write")
    m = await input(d, m, { kind: "approve", yes: true })
    m = await finish(d, m)
    assert.equal(command(m), undefined, "saving alone must not check")
    m = await input(d, m, { kind: "approve", yes: true })
    m = await finish(d, m)
    assert.equal(m.phase, "Done")
    return m
  })
  await scenario(
    "back invalidates approval, wrong command ID ignored, cancel pending ignored",
    "none",
    async (d, m) => {
      m = await input(d, m, { kind: "select", hosts: ["Claude"] })
      const stale = m.revision
      m = await input(d, m, { kind: "back" })
      m = await d({ revision: stale, action: { kind: "approve", yes: true } })
      assert.equal(m.phase, "Select")
      m = await input(d, m, { kind: "select", hosts: ["Codex"] })
      m = await input(d, m, { kind: "approve", yes: true })
      const before = m
      m = await input(d, m, { kind: "cancel" })
      assert.deepEqual(m, before)
      m = await input(d, m, { kind: "observed", commandId: 999, outcome: "complete" })
      assert.deepEqual(m, before)
      m = await finish(d, m)
      m = await input(d, m, { kind: "destination", destination: "user" })
      const saveRevision = m.revision
      m = await input(d, m, { kind: "back" })
      m = await d({ revision: saveRevision, action: { kind: "approve", yes: true } })
      assert.equal(m.phase, "Credential")
      m = await input(d, m, { kind: "cancel" })
      m = await d({ revision: saveRevision, action: { kind: "observed", commandId: saveRevision, outcome: "saved" } })
      assert.equal(m.phase, "Cancelled")
      assert.equal(m.results.Codex, "partial: restart required")
      return m
    }
  )
  for (const destination of ["project", "user", "native", "skip"] as const) {
    await scenario(`destination ${destination} with higher-priority environment`, "environment", async (d, m) => {
      m = await input(d, m, { kind: "select", hosts: ["Pi"] })
      m = await input(d, m, { kind: "approve", yes: false })
      m = await input(d, m, { kind: "destination", destination })
      if (destination === "skip") {
        assert.equal(m.phase, "Done")
        return m
      }
      m = await input(d, m, { kind: "approve", yes: true })
      m = await finish(d, m)
      assert.equal(m.source, "environment (saved credential shadowed)")
      m = await input(d, m, { kind: "approve", yes: false })
      assert.equal(m.check, "not requested")
      return m
    })
  }
  await scenario("keep existing, no save, decline check", "environment", async (d, m) => {
    m = await input(d, m, { kind: "select", hosts: ["Pi"] })
    m = await input(d, m, { kind: "approve", yes: false })
    m = await input(d, m, { kind: "keep" })
    assert.equal(m.phase, "CheckApproval")
    m = await input(d, m, { kind: "approve", yes: false })
    return m
  })
  await scenario("failed save recovers, retains outcomes", "none", async (d, m) => {
    m = await input(d, m, { kind: "select", hosts: ["Claude"] })
    m = await input(d, m, { kind: "approve", yes: false })
    m = await input(d, m, { kind: "destination", destination: "user" })
    m = await input(d, m, { kind: "approve", yes: true })
    m = await input(d, m, { kind: "observed", commandId: m.revision, outcome: "failed" })
    assert.equal(m.phase, "Credential")
    assert.equal(m.results.Claude, "declined")
    return input(d, m, { kind: "cancel" })
  })
}
