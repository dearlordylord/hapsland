import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { adaptClaudeDirectEvent } from "@hapsland/native-observation/direct-event/adapter"
import { makeReviewGitFixture, put } from "../direct-event/test-fixtures.ts"
import type { DirectObservation } from "@hapsland/native-observation/direct-event/observation"
import { reviewControlsLayer } from "../test-support/review-controls.ts"
import { runClient } from "../test-support/client-runtime.ts"
import { residentRequestEffect } from "@hapsland/resident-transport/resident/client"
import { monotonicNow } from "@hapsland/resident-transport/resident/hook-clock"
import { residentPaths } from "@hapsland/resident-transport/resident/paths"
import type { ResidentDispatchContext } from "@hapsland/resident-transport/resident/protocol"
import { acquireResidentFixture, type ResidentRuntime } from "./runtime-fixture.ts"

const rule = (message: string) =>
  JSON.stringify({
    version: 1,
    id: "domain",
    question: "Is a domain value a bare primitive?",
    criteria: { false: "No", true: "Yes" },
    threshold: 0.7,
    message,
    inputs: [{ languages: ["typescript"], kind: "type", requires: ["root-declaration"] }]
  })
const fixture = async (options: Parameters<typeof acquireResidentFixture>[2] = {}) => {
  const root = await makeReviewGitFixture()
  const user = join(root, "user.jsonc")
  const capturePath = join(root, "calls")
  await put(root, "user.jsonc", JSON.stringify({ version: 1, claudeFeedbackMode: "block-current-findings" }))
  await put(root, "rule.jsonc", rule("original edit rule"))
  await put(root, ".hapsland.jsonc", JSON.stringify({ version: 1, rules: [{ path: "rule.jsonc" }] }))
  const content = "type Count = number\n"
  const path = await put(root, "type.ts", content)
  const observation = await Effect.runPromise(
    adaptClaudeDirectEvent({
      hook_event_name: "PostToolUse",
      tool_name: "Write",
      cwd: root,
      session_id: "session",
      tool_use_id: "edit",
      tool_input: { file_path: path, content },
      tool_response: { filePath: path, content, originalFile: null, userModified: false }
    })
  )
  if (observation === undefined) throw new Error("missing edit observation")
  const dispatch: ResidentDispatchContext = {
    statePath: join(root, "state"),
    userConfigPath: user,
    credential: null,
    controlled: { capturePath, answers: { domain: { _tag: "Probability", probability: 0.9 } } }
  }
  const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, options)
  return { root, user, capturePath, observation, dispatch, server }
}
const register = async (server: ResidentRuntime, observation: DirectObservation, userConfigPath: string) => {
  expect(
    (
      await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "register-edit",
          lifetime: server.lifetime,
          root: observation.root,
          advicee: observation.advicee,
          userConfigPath,
          startedAt: monotonicNow()
        })
      )
    ).status
  ).toBe("advanced")
}
const send = (server: ResidentRuntime, observation: DirectObservation, dispatch: ResidentDispatchContext) =>
  runClient(
    residentRequestEffect(
      server.paths,
      {
        requestRoute: "edit",
        operation: "admit-and-collect",
        lifetime: server.lifetime,
        observation,
        controlledWriter: true,
        composed: true,
        dispatch,
        waitMs: 1_500
      },
      2_500
    )
  )

describe("edit-owned settings", () => {
  it("retains registration rules and feedback through review, socket handoff and later collection", async () => {
    const f = await fixture()
    await register(f.server, f.observation, f.user)
    // A partially saved rule and changed file policy cannot replace this edit's snapshot.
    await put(f.root, "rule.jsonc", "{")
    await put(f.root, "user.jsonc", JSON.stringify({ version: 1, claudeFeedbackMode: "advisory" }))
    await put(f.root, ".hapsland.jsonc", JSON.stringify({ version: 1, excludes: ["type.ts"], rules: [] }))
    await f.server.listen().pipe(Effect.runPromise)
    const response = await send(f.server, f.observation, f.dispatch)
    expect(response.status).toBe("advice")
    if (response.status !== "advice") throw new Error("missing snapshot advice")
    expect(response.output).toMatchObject({ decision: "block", reason: expect.stringContaining("original edit rule") })
    await Effect.runPromise(f.server.releaseDelivery(response.token))
    const later = await Effect.runPromise(f.server.collect(f.root, f.observation.advicee, f.dispatch))
    expect(later).toMatchObject({
      status: "advice",
      output: { hookSpecificOutput: { additionalContext: expect.stringContaining("original edit rule") } }
    })
  })

  it("keeps distinct delivery snapshots when edits have identical semantic review inputs", async () => {
    const f = await fixture()
    const advisoryUser = await put(
      f.root,
      "advisory-user.jsonc",
      JSON.stringify({ version: 1, claudeFeedbackMode: "advisory" })
    )
    const advisoryDispatch = { ...f.dispatch, userConfigPath: advisoryUser }
    await register(f.server, f.observation, advisoryUser)
    expect((await Effect.runPromise(f.server.admit(f.observation, advisoryDispatch, true, true))).status).toBe(
      "accepted"
    )
    await Effect.runPromise(f.server.whenIdle())
    const second = { ...f.observation, advicee: { ...f.observation.advicee, toolUseId: "second" } }
    await register(f.server, second, f.user)
    expect((await Effect.runPromise(f.server.admit(second, f.dispatch, true, true))).status).toBe("accepted")
    await Effect.runPromise(f.server.whenIdle())
    expect(readFileSync(f.capturePath, "utf8").trim().split("\n")).toHaveLength(2)
    expect(await Effect.runPromise(f.server.pendingAdviceMetadata())).toHaveLength(2)
  })

  it("delivers advisory advice in a blocking response context without elevating its mode", async () => {
    const f = await fixture()
    const advisoryUser = await put(
      f.root,
      "advisory-user.jsonc",
      JSON.stringify({ version: 1, claudeFeedbackMode: "advisory" })
    )
    await register(f.server, f.observation, advisoryUser)
    expect(
      (
        await Effect.runPromise(
          f.server.admit(f.observation, { ...f.dispatch, userConfigPath: advisoryUser }, true, true)
        )
      ).status
    ).toBe("accepted")
    await Effect.runPromise(f.server.whenIdle())
    const collector: DirectObservation = {
      ...f.observation,
      advicee: { ...f.observation.advicee, toolUseId: "collector" },
      candidates: [{ operation: "delete", path: "collector.ts", addedLines: [] }]
    }
    await register(f.server, collector, f.user)
    await Effect.runPromise(f.server.listen())
    const response = await send(f.server, collector, f.dispatch)
    expect(response).toMatchObject({
      status: "advice",
      output: { hookSpecificOutput: { additionalContext: expect.stringContaining("original edit rule") } }
    })
    if (response.status === "advice") expect(response.output).not.toHaveProperty("decision")
  })
  it("downgrades mixed delivery when the last blocking finding becomes stale at handoff", async () => {
    const change: { path?: string } = {}
    const f = await fixture({
      reviewControls: reviewControlsLayer({
        beforeResponseHandoff: Effect.fn("EditSettings.changeSource")(function* () {
          if (change.path !== undefined) writeFileSync(change.path, "type OtherCount = string\n")
        })
      })
    })
    const advisoryUser = await put(
      f.root,
      "advisory-user.jsonc",
      JSON.stringify({ version: 1, claudeFeedbackMode: "advisory" })
    )
    await register(f.server, f.observation, advisoryUser)
    await Effect.runPromise(f.server.admit(f.observation, { ...f.dispatch, userConfigPath: advisoryUser }, true, true))
    await Effect.runPromise(f.server.whenIdle())
    const content = "type OtherCount = number\n"
    const path = await put(f.root, "other.ts", content)
    const blocking = await Effect.runPromise(
      adaptClaudeDirectEvent({
        hook_event_name: "PostToolUse",
        tool_name: "Write",
        cwd: f.root,
        session_id: "session",
        tool_use_id: "blocking",
        tool_input: { file_path: path, content },
        tool_response: { filePath: path, content, originalFile: null, userModified: false }
      })
    )
    if (blocking === undefined) throw new Error("missing blocking observation")
    await register(f.server, blocking, f.user)
    await Effect.runPromise(f.server.admit(blocking, f.dispatch, true, true))
    await Effect.runPromise(f.server.whenIdle())
    expect(await Effect.runPromise(f.server.pendingAdviceMetadata())).toHaveLength(2)
    const collector: DirectObservation = {
      ...blocking,
      advicee: { ...blocking.advicee, toolUseId: "collector" },
      candidates: [{ operation: "delete", path: "collector.ts", addedLines: [] }]
    }
    await register(f.server, collector, f.user)
    await Effect.runPromise(f.server.listen())
    change.path = path
    const response = await send(f.server, collector, f.dispatch)
    expect(response).toMatchObject({
      status: "advice",
      findingCount: 1,
      output: { hookSpecificOutput: { additionalContext: expect.stringContaining("type.ts") } }
    })
    if (response.status === "advice") {
      expect(response.output).not.toHaveProperty("decision")
      if ("hookSpecificOutput" in response.output)
        expect(response.output.hookSpecificOutput.additionalContext).not.toContain("other.ts")
    }
  })

  it("retains original environment-only authority after credential configuration changes", async () => {
    const f = await fixture()
    await put(f.root, "user.jsonc", JSON.stringify({ version: 1, credentialEnvVar: "TYPESAFE_API_KEY" }))
    const credentialState = join(f.root, "credential-state.json")
    await put(f.root, "credential-state.json", JSON.stringify({ version: 1, generation: 1, savedUseSuspended: false }))
    await register(f.server, f.observation, f.user)
    await put(f.root, "user.jsonc", JSON.stringify({ version: 1 }))
    const dispatch: ResidentDispatchContext = {
      ...f.dispatch,
      credential: {
        name: "TYPESAFE_API_KEY",
        environmentValue: "synthetic-test-value",
        generation: 1,
        statePath: credentialState
      },
      controlled: { ...f.dispatch.controlled, requireCredential: true }
    }
    expect((await Effect.runPromise(f.server.admit(f.observation, dispatch, true, true))).status).toBe("accepted")
    await Effect.runPromise(f.server.whenIdle())
    await put(f.root, "credential-state.json", JSON.stringify({ version: 1, generation: 1, savedUseSuspended: true }))
    expect(await Effect.runPromise(f.server.collect(f.root, f.observation.advicee, dispatch))).toMatchObject({
      status: "advice"
    })
  })
})
