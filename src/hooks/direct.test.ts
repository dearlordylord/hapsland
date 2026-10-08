import { ConfigProvider, Effect, Layer } from "effect"
import { beforeEach, expect, it, vi } from "vitest"
import { makeDirectHookDispatch } from "../../packages/hook-runtime/src/hooks/direct.ts"
import { ResidentStartup, type CollectedAdvice } from "@hapsland/resident-transport/resident/client"
import type { DirectObservation } from "@hapsland/native-observation/direct-event/observation"
import { residentPaths } from "@hapsland/resident-transport/resident/paths"

const ports = vi.hoisted(() => ({
  identity: vi.fn(),
  policy: vi.fn(),
  retire: vi.fn(),
  eligible: vi.fn(),
  record: vi.fn(),
  native: vi.fn(),
  reply: vi.fn(),
  observation: vi.fn(),
  owner: vi.fn(),
  dispatch: vi.fn(),
  dispatchWork: vi.fn(),
  admit: vi.fn(),
  collect: vi.fn(),
  activity: vi.fn(),
  trace: vi.fn(),
  now: vi.fn()
}))
vi.mock("@hapsland/native-observation/direct-event/adapter", () => ({
  isCodexNativeApplyPatch: ports.native,
  adaptCodexReply: ports.reply,
  adaptCodexDirectEvent: ports.observation,
  adaptComposedHookIdentity: ports.identity
}))
vi.mock("@hapsland/resident-transport/resident/client", async (original) => ({
  ...(await original<typeof import("@hapsland/resident-transport/resident/client")>()),
  recordNativeMetadataEffect: ports.record,
  ensureResidentEffect: ports.owner,
  makeResidentDispatchContextEffect: ports.dispatch,
  admitObservationEffect: ports.admit,
  admitAndCollectEffect: ports.collect,
  readComposedEditPolicyEffect: ports.policy,
  retireComposedEditEffect: ports.retire
}))
vi.mock("@hapsland/native-observation/direct-event/selection", () => ({ nativeSelection: ports.eligible }))
vi.mock("@hapsland/activity-observation/activity/status", async (original) => ({
  ...(await original<typeof import("@hapsland/activity-observation/activity/status")>()),
  recordActivity: ports.activity
}))
vi.mock("@hapsland/activity-observation/activity/demo-trace", () => ({ recordDemoTrace: ports.trace }))
vi.mock("@hapsland/resident-transport/resident/hook-clock", () => ({
  get hookMonotonicMillis() {
    return Effect.sync(() => ports.now())
  }
}))

const observation: DirectObservation = {
  root: "/fixture",
  rootIdentity: { rootDevice: "1", rootInode: "2", gitDirectory: "/fixture/.git", gitDevice: "1", gitInode: "3" },
  advicee: {
    host: "codex-cli",
    hostVersion: "0.156.0",
    sessionId: "session",
    turnId: "turn",
    toolUseId: "edit",
    subagentId: null
  },
  candidateRoots: [
    {
      root: "/fixture",
      rootIdentity: { rootDevice: "1", rootInode: "2", gitDirectory: "/fixture/.git", gitDevice: "1", gitInode: "3" }
    }
  ],
  candidates: [{ operation: "add", path: "count.ts", addedLines: ["type Count = number"] }]
}
const advice: CollectedAdvice = {
  output: { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "finding" } },
  token: "token",
  lifetime: "owner",
  paths: residentPaths("/fixture/resident"),
  root: observation.root,
  advicee: observation.advicee,
  activityPath: "/activity",
  findingCount: 1
}
const unused = () => Effect.die("unexpected startup operation")
const startup = Layer.succeed(
  ResidentStartup,
  ResidentStartup.of({
    now: Effect.succeed(100),
    prepare: unused,
    probe: unused,
    launch: unused,
    wait: unused,
    clearDiagnostic: unused,
    diagnostic: unused
  })
)
const run = <A, E>(task: Effect.Effect<A, E, ResidentStartup>) =>
  Effect.runPromise(
    task.pipe(
      Effect.provide(startup),
      Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ REVIEW_DEMO_BUDGET_PATH: "/trace" })))
    )
  )
const dispatcher = (controlledWriter = true) =>
  makeDirectHookDispatch({ deadline: 4000, controlledWriter, composedEdit: true })
const codex = (controlledWriter = true) =>
  run(
    dispatcher(controlledWriter).runDirectCodexHook(
      { native: true },
      "0.156.0",
      undefined,
      "/state",
      "/activity",
      "/user"
    )
  )
const claude = () => run(dispatcher().runDirectBoundedHook(observation, undefined, "/state", "/activity", "/user"))
beforeEach(() => {
  vi.clearAllMocks()
  ports.identity.mockReturnValue(Effect.succeed(undefined))
  ports.policy.mockReturnValue(Effect.succeed({ filePolicy: {} }))
  ports.retire.mockReturnValue(Effect.succeed(true))
  ports.eligible.mockReturnValue(Effect.succeed({ status: "selected" }))
  ports.record.mockReturnValue(Effect.void)
  ports.native.mockReturnValue(true)
  ports.reply.mockReturnValue(Effect.succeed(observation))
  ports.observation.mockReturnValue(Effect.succeed(observation))
  ports.owner.mockReturnValue(Effect.succeed({ lifetime: "owner" }))
  ports.dispatch.mockReturnValue(
    Effect.sync(() => {
      ports.dispatchWork()
      return { captured: true }
    })
  )
  ports.admit.mockReturnValue(Effect.void)
  ports.collect.mockReturnValue(Effect.succeed({ status: "advice", advice }))
  ports.now.mockReturnValue(100)
})
it("leaves non-native events unhandled without starting a resident or adapting attribution", async () => {
  ports.native.mockReturnValue(false)
  expect(await codex()).toEqual({ handled: false })
  expect(ports.reply).not.toHaveBeenCalled()
  expect(ports.owner).not.toHaveBeenCalled()
})
it("admits the exact controlled Codex observation while keeping native output quiet", async () => {
  expect(await codex()).toEqual({ handled: true, output: {} })
  expect(ports.owner).toHaveBeenCalledWith(undefined, 3400)
  expect(ports.dispatch).toHaveBeenCalledWith("/fixture", "/state", "/activity", "/user", undefined, { filePolicy: {} })
  expect(ports.admit).toHaveBeenCalledWith(
    expect.objectContaining(observation),
    true,
    { captured: true, sourceContexts: [{ root: "/fixture", credential: undefined, sessionAnalytics: false }] },
    undefined,
    true
  )
  expect(ports.trace).toHaveBeenCalledWith("/trace", observation.root, observation.advicee, { kind: "edit" })
  expect(ports.activity).not.toHaveBeenCalled()
})
it.each(["uncontrolled", "dispatch-failure", "admission-failure"])(
  "suppresses unavailable Codex admission: %s",
  async (kind) => {
    if (kind === "dispatch-failure") ports.dispatch.mockReturnValue(Effect.fail(new Error("configuration unavailable")))
    if (kind === "admission-failure") ports.admit.mockReturnValue(Effect.fail(new Error("admission unavailable")))
    expect(await codex(kind !== "uncontrolled")).toEqual({ handled: true, output: {} })
    if (kind !== "admission-failure") expect(ports.admit).not.toHaveBeenCalled()
    expect(ports.activity).toHaveBeenCalledWith({
      statePath: "/activity",
      root: observation.root,
      advicee: observation.advicee,
      lifetime: "owner",
      stage: "unavailable"
    })
  }
)
it("keeps unsupported native shapes quiet and records incomplete attribution without creating work", async () => {
  ports.observation.mockReturnValue(Effect.succeed(undefined))
  expect(await codex()).toEqual({ handled: true, output: {} })
  expect(ports.admit).not.toHaveBeenCalled()
  expect(ports.trace).not.toHaveBeenCalled()
  expect(ports.activity).toHaveBeenCalledWith(expect.objectContaining({ lifetime: "owner", stage: "incomplete" }))
})
it.each([true, false])(
  "does not invent activity attribution when resident startup fails (reply=%s)",
  async (hasReply) => {
    if (!hasReply) ports.reply.mockReturnValue(Effect.succeed(undefined))
    ports.owner.mockReturnValue(Effect.fail(new Error("resident unavailable")))
    expect(await codex()).toEqual({ handled: true, output: {} })
    expect(ports.dispatch).not.toHaveBeenCalled()
    expect(ports.admit).not.toHaveBeenCalled()
    expect(ports.activity).toHaveBeenCalledTimes(hasReply ? 1 : 0)
  }
)
it("does not create a dispatch for an unattributed reply", async () => {
  ports.reply.mockReturnValue(Effect.succeed(undefined))
  ports.observation.mockReturnValue(Effect.succeed(undefined))
  expect(await codex()).toEqual({ handled: true, output: {} })
  expect(ports.dispatch).not.toHaveBeenCalled()
  expect(ports.admit).not.toHaveBeenCalled()
  expect(ports.activity).not.toHaveBeenCalled()
})
it("returns collected Claude advice with its exact delivery authority", async () => {
  const result = await claude()
  expect(result).toEqual({ _tag: "DirectEventReady", value: advice.output, collected: advice })
  expect(dispatcher().isDirectEventReady(result)).toBe(true)
  expect(ports.collect).toHaveBeenCalledWith(observation, { captured: true }, 3850)
})
it("does not dispatch an absent Claude observation", async () => {
  expect(await run(dispatcher().runDirectBoundedHook(undefined, undefined, "/state", "/activity", undefined))).toEqual(
    {}
  )
  expect(ports.dispatch).not.toHaveBeenCalled()
})
it.each(["expired", "dispatch-failure", "collection-failure", "empty"])(
  "does not expose Claude advice without a current successful admission: %s",
  async (kind) => {
    if (kind === "expired") ports.now.mockReturnValue(4000)
    if (kind === "dispatch-failure") ports.dispatch.mockReturnValue(Effect.fail(new Error("configuration unavailable")))
    if (kind === "collection-failure") ports.collect.mockReturnValue(Effect.fail(new Error("collection unavailable")))
    if (kind === "empty") ports.collect.mockReturnValue(Effect.succeed({ status: "empty" }))
    expect(await claude()).toEqual({})
    if (kind === "expired") expect(ports.dispatchWork).not.toHaveBeenCalled()
    if (kind === "expired" || kind === "dispatch-failure") expect(ports.collect).not.toHaveBeenCalled()
  }
)
it.each([undefined, null, "ready", {}, { _tag: "other", value: {} }, { _tag: "DirectEventReady" }])(
  "does not classify an unrelated output as collected advice: %j",
  (value) => {
    expect(dispatcher().isDirectEventReady(value)).toBe(false)
  }
)
