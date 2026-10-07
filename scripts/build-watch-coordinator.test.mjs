import { test } from "node:test"
import assert from "node:assert/strict"
import { runBuildWatch } from "./build-watch-coordinator.mjs"
const options = (extra = {}) => ({ deadline: Date.now() + 5000, intervalMs: 1, ...extra })
test("unchanged inputs and outputs do not rerun the producer", async () => {
  const control = new AbortController(),
    states = []
  let builds = 0,
    observations = 0
  await runBuildWatch(
    options({
      signal: control.signal,
      observe: async () => {
        if (++observations === 5) control.abort()
        return { source: "a", output: "complete" }
      },
      build: async () => {
        builds++
      },
      status: async (state) => states.push(state.state)
    })
  )
  assert.equal(builds, 1)
  assert.deepEqual(states, ["building", "ready", "stopped"])
})
test("source drift during a build cannot become ready", async () => {
  const control = new AbortController(),
    states = []
  let source = "old",
    builds = 0
  await runBuildWatch(
    options({
      signal: control.signal,
      observe: async () => ({ source, output: "current" }),
      build: async () => {
        if (++builds === 1) source = "new"
      },
      status: async (state) => {
        states.push(state.state)
        if (state.state === "ready") control.abort()
      }
    })
  )
  assert.equal(builds, 2)
  assert.deepEqual(states, ["building", "drift", "building", "ready", "stopped"])
})
test("failure waits for a repair and then publishes current readiness", async () => {
  const control = new AbortController(),
    states = []
  let source = "broken",
    builds = 0,
    observations = 0
  await runBuildWatch(
    options({
      signal: control.signal,
      observe: async () => {
        if (++observations === 4) source = "repaired"
        return { source, output: "artifact" }
      },
      build: async () => {
        builds++
        if (source === "broken") throw new Error("compile failed")
      },
      status: async (state) => {
        states.push(state.state)
        if (state.state === "ready") control.abort()
      }
    })
  )
  assert.equal(builds, 2)
  assert.deepEqual(states, ["building", "failed", "building", "ready", "stopped"])
})
test("deleted or corrupt outputs trigger repair without a source change", async () => {
  const control = new AbortController(),
    states = []
  let output = "valid",
    builds = 0,
    observations = 0
  await runBuildWatch(
    options({
      signal: control.signal,
      observe: async () => {
        if (++observations === 3) output = "missing"
        return { source: "same", output }
      },
      build: async () => {
        builds++
        output = "valid"
      },
      status: async (state) => {
        states.push(state.state)
        if (state.state === "ready" && builds === 2) control.abort()
      }
    })
  )
  assert.equal(builds, 2)
  assert.deepEqual(states, ["building", "ready", "building", "ready", "stopped"])
})
test("a repair arriving during a failed build is retried", async () => {
  const control = new AbortController(),
    states = []
  let source = "broken",
    builds = 0
  await runBuildWatch(
    options({
      signal: control.signal,
      observe: async () => ({ source, output: "current" }),
      build: async () => {
        if (++builds === 1) {
          source = "fixed"
          throw new Error("old input failed")
        }
      },
      status: async (state) => {
        states.push(state.state)
        if (state.state === "ready") control.abort()
      }
    })
  )
  assert.equal(builds, 2)
  assert.deepEqual(states, ["building", "failed", "building", "ready", "stopped"])
})

test("invalid graph observations stay failed and recover after correction", async () => {
  const control = new AbortController(),
    states = []
  let observations = 0,
    builds = 0
  await runBuildWatch(
    options({
      signal: control.signal,
      observe: async () => {
        if (++observations === 1) throw new Error("invalid manifest")
        return { source: "fixed", output: "current" }
      },
      build: async () => {
        builds++
      },
      status: async (state) => {
        states.push(state.state)
        if (state.state === "ready") control.abort()
      }
    })
  )
  assert.equal(builds, 1)
  assert.deepEqual(states, ["failed", "building", "ready", "stopped"])
})
