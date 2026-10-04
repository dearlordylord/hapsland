import { DEFAULT_CHILD_TIMEOUT_MS } from "../../scripts/test-harness/policy.mjs"
import { runClient } from "../test-support/client-runtime.ts"
import { nativeDeferred as deferred } from "../test-support/native-deferred.ts"
import { reviewControlsLayer } from "../test-support/review-controls.ts"
import { Layer } from "effect"
import { ResidentPreparationControls, defaultPreparationControls } from "./preparation-controls.ts"
import { spawnSync } from "../../scripts/test-harness/process.mjs"
import { afterEach, describe, expect, it } from "vitest"
import * as Effect from "effect/Effect"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import { readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { adaptCodexDirectEvent } from "../direct-event/adapter.ts"
import { addEvent, makeGitFixture, put } from "../direct-event/test-fixtures.ts"
import { configuredRules } from "../policy/rules.ts"
import { readAnalytics } from "../activity/analytics.ts"
import { makeResidentDispatchContextEffect as makeResidentDispatchContext } from "./client.ts"
import { residentPaths } from "./paths.ts"
import { acquireResidentFixture } from "./runtime-fixture.ts"
import type { ResidentDispatchContext } from "./protocol.ts"
import { readCredentialState } from "../credentials/secret-service.ts"

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})
const setup = async (enabled = true) => {
  const root = await makeGitFixture()
  directories.push(root)
  await put(root, "type.ts", "type OrderCount = number\n")
  const userConfigPath = await put(root, "user.jsonc", JSON.stringify({ version: 1, sessionAnalytics: enabled }))
  const activityPath = join(root, "activity")
  const dispatch: ResidentDispatchContext = {
    statePath: join(root, "state"),
    activityPath,
    userConfigPath,
    sessionAnalytics: enabled,
    credential: null,
    controlled: {}
  }
  const read = () => readAnalytics({ enabled, statePath: activityPath, root, sessionId: "session" })
  const observation = async (id: string, path = "type.ts") => {
    const value = await Effect.runPromise(
      adaptCodexDirectEvent(
        addEvent(root, [path], {
          tool_use_id: id,
          tool_input: {
            command: `*** Begin Patch\n*** Add File: ${path}\n${readFileSync(join(root, path), "utf8")
              .trim()
              .split("\n")
              .map((line) => `+${line}`)
              .join("\n")}\n*** End Patch`
          }
        })
      )
    )
    if (value === undefined) throw new Error("fixture observation missing")
    return value
  }
  return { root, dispatch, read, observation }
}

describe("resident session analytics", () => {
  it("propagates project analytics overrides through native dispatch", async () => {
    for (const projectEnabled of [true, false]) {
      const f = await setup(!projectEnabled)
      await put(f.root, ".hapsland.jsonc", JSON.stringify({ version: 1, sessionAnalytics: projectEnabled }))
      const context = await runClient(
        makeResidentDispatchContext(
          f.root,
          f.dispatch.statePath,
          f.dispatch.activityPath ?? "",
          f.dispatch.userConfigPath ?? undefined,
          {}
        )
      )
      expect(context.sessionAnalytics).toBe(projectEnabled)
    }
  })

  it("propagates user opt-in through the native dispatch context", async () => {
    const f = await setup()
    const context = await runClient(
      makeResidentDispatchContext(
        f.root,
        f.dispatch.statePath,
        f.dispatch.activityPath ?? "",
        f.dispatch.userConfigPath ?? undefined,
        {}
      )
    )
    expect(context.sessionAnalytics).toBe(true)
  })

  it("counts quiet clear reviews, cache reuse and skipped candidates separately", async () => {
    const f = await setup()
    const server = await acquireResidentFixture(residentPaths(join(f.root, "runtime")))
    try {
      for (const id of ["first", "repeated"]) {
        expect(Effect.runSync(server.admit(await f.observation(id), f.dispatch)).status).toBe("accepted")
        await Effect.runPromise(server.whenIdle())
      }
      await put(f.root, "empty.ts", "const value = 1;\n")
      expect(Effect.runSync(server.admit(await f.observation("skipped", "empty.ts"), f.dispatch)).status).toBe(
        "accepted"
      )
      await Effect.runPromise(server.whenIdle())
      await put(
        f.root,
        "user.jsonc",
        JSON.stringify({
          version: 1,
          sessionAnalytics: true,
          ruleOverrides: Object.fromEntries(configuredRules.map((rule) => [rule.id, { enabled: false }]))
        })
      )
      expect(Effect.runSync(server.admit(await f.observation("rules-disabled"), f.dispatch)).status).toBe("accepted")
      await Effect.runPromise(server.whenIdle())
      expect(f.read()).toMatchObject({
        status: "recorded",
        totals: { requestsStarted: 0 },
        controlledTotals: {
          requestsStarted: 1,
          requestsSucceeded: 1,
          clearReviews: 1,
          cacheHits: 1,
          skippedCandidates: 1,
          incompleteCandidates: 1
        }
      })
    } finally {
      await Effect.runPromise(server.close)
    }
  })

  it("counts pending joins without inventing additional provider requests", async () => {
    const f = await setup()
    const entered = deferred()
    const release = deferred()
    const prepared = deferred()
    let preparations = 0
    const server = await acquireResidentFixture(residentPaths(join(f.root, "runtime")), undefined, {
      reviewControls: reviewControlsLayer({
        beforeEvaluate: Effect.fn("NativeFixture.beforeEvaluate")(function* () {
          yield* entered.complete(undefined)
          yield* release.wait
        })
      }),
      preparationControls: Layer.succeed(
        ResidentPreparationControls,
        ResidentPreparationControls.of({
          ...defaultPreparationControls,
          afterPrepare: Effect.gen(function* () {
            if (++preparations === 2) yield* prepared.complete(undefined)
          })
        })
      )
    })
    try {
      expect(Effect.runSync(server.admit(await f.observation("owner"), f.dispatch)).status).toBe("accepted")
      await entered.promise
      expect(Effect.runSync(server.admit(await f.observation("join"), f.dispatch)).status).toBe("accepted")
      await prepared.promise
      release.resolve()
      await Effect.runPromise(server.whenIdle())
      expect(f.read().controlledTotals).toMatchObject({
        requestsStarted: 1,
        requestsSucceeded: 1,
        joinedReviews: 1,
        cacheHits: 0
      })
    } finally {
      release.resolve()
      await Effect.runPromise(server.close)
    }
  })

  it("records detected rule IDs and acknowledged submission once", async () => {
    const f = await setup()
    const dispatch = {
      ...f.dispatch,
      controlled: {
        answers: Object.fromEntries(
          configuredRules.map((rule) => [
            rule.id,
            { _tag: "Probability", probability: rule.id === "r6_bare_domain_value" ? 0.9 : 0 }
          ])
        )
      }
    }
    const server = await acquireResidentFixture(residentPaths(join(f.root, "runtime")))
    try {
      const observation = await f.observation("finding")
      expect(Effect.runSync(server.admit(observation, dispatch, true)).status).toBe("accepted")
      await Effect.runPromise(server.whenIdle())
      expect(f.read().controlledTotals).toMatchObject({
        requestsStarted: 1,
        requestsSucceeded: 1,
        reviewsWithFindings: 1,
        findings: 1
      })
      expect(f.read().details.find((detail) => detail.kind === "request-findings")?.ruleIds).toEqual([
        "r6_bare_domain_value"
      ])
      const response = await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "collect",
          lifetime: server.lifetime,
          root: f.root,
          advicee: observation.advicee,
          dispatch,
          mode: "ordinary",
          composed: true
        })
      )
      if (response.status !== "advice") throw new Error("fixture finding was not collected")
      expect((await Effect.runPromise(server.beginComposedSubmission(response.token, "background"))).status).toBe(
        "submitting"
      )
      expect((await Effect.runPromise(server.acknowledge(response.token))).status).toBe("acknowledged")
      await Effect.runPromise(server.acknowledge(response.token))
      expect(f.read().controlledTotals).toMatchObject({ submissions: 1, submittedFindings: 1 })
      expect((await Effect.runPromise(server.finalize(response.token))).status).toBe("finalized")
    } finally {
      await Effect.runPromise(server.close)
    }
  })

  it("does not record successful reviews after user recording is disabled", async () => {
    const f = await setup()
    const entered = deferred()
    const release = deferred()
    const server = await acquireResidentFixture(residentPaths(join(f.root, "runtime")), undefined, {
      reviewControls: reviewControlsLayer({
        beforeEvaluate: Effect.fn("NativeFixture.beforeEvaluate")(function* () {
          yield* entered.complete(undefined)
          yield* release.wait
        })
      })
    })
    try {
      expect(Effect.runSync(server.admit(await f.observation("disabled"), f.dispatch)).status).toBe("accepted")
      await entered.promise
      await put(f.root, "user.jsonc", '{"version":1,"sessionAnalytics":false}')
      release.resolve()
      await Effect.runPromise(server.whenIdle())
      expect(f.read()).toMatchObject({ status: "no-observation", controlledTotals: { requestsStarted: 0 } })
    } finally {
      release.resolve()
      await Effect.runPromise(server.close)
    }
  })

  it("counts the real Jev provider path through an offline HTTP transport", async () => {
    const f = await setup()
    let requests = 0
    const credentialStatePath = join(f.root, "credential-state")
    const dispatch: ResidentDispatchContext = {
      ...f.dispatch,
      controlled: null,
      credential: {
        name: "TYPESAFE_API_KEY",
        environmentValue: "ANALYTICS_SYNTHETIC_KEY",
        environmentOnly: true,
        generation: readCredentialState(credentialStatePath).generation,
        statePath: credentialStatePath
      }
    }
    const server = await acquireResidentFixture(residentPaths(join(f.root, "runtime")), undefined, {
      offlineHttpClient: HttpClient.make((request) => {
        requests++
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            new Response(
              JSON.stringify({
                model: "jev-latest",
                answers: Object.fromEntries(configuredRules.map((rule) => [rule.id, { type: "noul", noul: 0 }])),
                usage: { input_tokens: 1, output_tokens: 1 }
              }),
              { status: 200, headers: { "content-type": "application/json" } }
            )
          )
        )
      })
    })
    try {
      expect(Effect.runSync(server.admit(await f.observation("jev"), dispatch)).status).toBe("accepted")
      await Effect.runPromise(server.whenIdle())
      expect(requests).toBe(1)
      expect(f.read()).toMatchObject({
        totals: { requestsStarted: 1, requestsSucceeded: 1, clearReviews: 1 },
        controlledTotals: { requestsStarted: 0 }
      })
    } finally {
      await Effect.runPromise(server.close)
    }
  })

  it("records request interruption separately from discarded queued work during shutdown", async () => {
    const f = await setup()
    const entered = deferred()
    const release = deferred()
    const interrupted = deferred()
    const server = await acquireResidentFixture(residentPaths(join(f.root, "runtime")), undefined, {
      controlledRequestEffect: async (signal) => {
        const abort = () => interrupted.resolve()
        if (signal.aborted) abort()
        else signal.addEventListener("abort", abort, { once: true })
        entered.resolve()
        try {
          await release.promise
        } finally {
          signal.removeEventListener("abort", abort)
        }
      }
    })
    try {
      expect(Effect.runSync(server.admit(await f.observation("interrupted"), f.dispatch)).status).toBe("accepted")
      await entered.promise
      expect(f.read().controlledTotals.requestsStarted).toBe(1)
      let closed = false
      const closing = Effect.runPromise(server.close).then(() => {
        closed = true
      })
      await interrupted.promise
      expect(closed).toBe(false)
      expect(f.read().controlledTotals.requestsSucceeded).toBe(0)
      release.resolve()
      await closing
      expect(f.read().controlledTotals).toMatchObject({
        requestsStarted: 1,
        requestsInterrupted: 1,
        requestsSucceeded: 0,
        discardedWork: 0
      })
    } finally {
      release.resolve()
      await Effect.runPromise(server.close)
    }
  })

  it("exposes opted-in history through JSON and human status without making requests", async () => {
    const f = await setup()
    const server = await acquireResidentFixture(residentPaths(join(f.root, "runtime")))
    try {
      expect(Effect.runSync(server.admit(await f.observation("status"), f.dispatch)).status).toBe("accepted")
      await Effect.runPromise(server.whenIdle())
      const input = JSON.stringify({ version: 1, operation: "status", cwd: f.root, sessionId: "session" })
      const env = {
        ...process.env,
        REVIEW_USER_CONFIG_PATH: f.dispatch.userConfigPath ?? "",
        REVIEW_ACTIVITY_PATH: f.dispatch.activityPath ?? "",
        REVIEW_RESIDENT_DIR: join(f.root, "runtime"),
        REVIEW_CREDENTIAL_STATE_PATH: join(f.root, "credentials"),
        TYPESAFE_API_KEY: "STATUS_SYNTHETIC_KEY"
      }
      const json = spawnSync(process.execPath, ["src/cli.ts", "--status"], {
        env,
        input,
        encoding: "utf8",
        timeout: DEFAULT_CHILD_TIMEOUT_MS
      })
      expect(json.status).toBe(0)
      expect(JSON.parse(json.stdout)).toMatchObject({
        analytics: {
          enabled: true,
          status: "recorded",
          totals: { requestsStarted: 0 },
          controlledTotals: { requestsStarted: 1, clearReviews: 1 }
        }
      })
      const human = spawnSync(process.execPath, ["src/cli.ts", "--status", "--status-human"], {
        env,
        input,
        encoding: "utf8",
        timeout: DEFAULT_CHILD_TIMEOUT_MS
      })
      expect(human.status).toBe(0)
      expect(human.stdout).toContain("analytics: recorded (recording=enabled)")
      expect(human.stdout).toContain("controlled request-clear")
      expect(f.read().controlledTotals.requestsStarted).toBe(1)
    } finally {
      await Effect.runPromise(server.close)
    }
  })

  it("records provider failure and does not reuse it", async () => {
    const f = await setup()
    const server = await acquireResidentFixture(residentPaths(join(f.root, "runtime")))
    try {
      const dispatch = { ...f.dispatch, controlled: { failure: "synthetic offline failure" } }
      for (const id of ["failure-1", "failure-2"]) {
        expect(Effect.runSync(server.admit(await f.observation(id), dispatch)).status).toBe("accepted")
        await Effect.runPromise(server.whenIdle())
      }
      expect(f.read().controlledTotals).toMatchObject({
        requestsStarted: 2,
        requestsFailed: 2,
        requestsSucceeded: 0,
        cacheHits: 0
      })
    } finally {
      await Effect.runPromise(server.close)
    }
  })
})
