import { describe, expect, it } from "vitest"
import { execFileAsync } from "../../scripts/test-harness/process.mjs"
import { Effect } from "effect"
import { join } from "node:path"
import { rename } from "node:fs/promises"
import { nativeDeferred } from "@hapsland/build-tooling/test-support/native-deferred"
import type { InspectionRecord } from "@hapsland/inspection-records/inspection/contract"
import { readFileSync } from "node:fs"
import {
  adaptCodexDirectEvent,
  adaptComposedHookIdentity,
  adaptClaudeDirectEvent
} from "@hapsland/native-observation/direct-event/adapter"
import { addEvent, makeReviewGitFixture, put } from "@hapsland/build-tooling/test-support/test-fixtures"
import { acquireResidentFixture } from "./runtime-fixture.ts"
import type { JevRequestObservation } from "@hapsland/resident-runtime/resident/server"
import { configuredRules } from "@hapsland/build-tooling/test-support/default-rules"
import { monotonicNow } from "@hapsland/resident-transport/resident/hook-clock"
import { prepareObservation } from "@hapsland/review-execution/direct-event/pipeline"
import { loadReviewSettings } from "@hapsland/review-definition/runtime/review-config"
import { residentUnitReservationBytes } from "@hapsland/resident-runtime/resident/server"
import { residentRequestEffect } from "@hapsland/resident-transport/resident/client"
import { residentPaths } from "@hapsland/resident-transport/resident/paths"
import type { ResidentDispatchContext, ResidentEditPolicy } from "@hapsland/resident-transport/resident/protocol"

describe("target-root virtual rounds", () => {
  it("selects the admitted root's credential context when the first provisional root becomes stale", async () => {
    const a = await makeReviewGitFixture()
    const b = await makeReviewGitFixture()
    const c = await makeReviewGitFixture()
    const replacement = await makeReviewGitFixture()
    const user = await put(a, "user.jsonc", JSON.stringify({ version: 1 }))
    const bPath = await put(b, "type.ts", "type OrderCount = number\n")
    const cPath = await put(c, "type.ts", "type OrderCount = number\n")
    await put(replacement, "type.ts", "type OrderCount = number\n")
    for (const [root, name] of [
      [b, "B_KEY"],
      [c, "C_KEY"]
    ] as const) {
      const config = JSON.parse(readFileSync(join(root, ".hapsland.jsonc"), "utf8"))
      await put(root, ".hapsland.jsonc", JSON.stringify({ ...config, credentialEnvVar: name }))
    }
    const event = addEvent(a, [bPath, cPath])
    const before = await Effect.runPromise(
      adaptComposedHookIdentity({ ...event, hook_event_name: "PreToolUse" }, "codex-cli", "PreToolUse")
    )
    if (before === undefined) throw new Error("missing mixed credential identity")
    const server = await acquireResidentFixture(residentPaths(join(a, "runtime")))
    for (const root of [b, c])
      expect(
        (
          await Effect.runPromise(
            server.handle({
              requestRoute: "shared",
              operation: "register-edit",
              lifetime: server.lifetime,
              root,
              advicee: before.advicee,
              startedAt: monotonicNow(),
              userConfigPath: user
            })
          )
        ).status
      ).toBe("advanced")
    await rename(b, `${b}-before`)
    await rename(replacement, b)
    const observation = await Effect.runPromise(adaptCodexDirectEvent(event))
    if (observation === undefined) throw new Error("missing mixed credential observation")
    const credential = (name: string) => ({
      name,
      environmentValue: "offline-fixture",
      generation: 0,
      statePath: join(a, "credential-state")
    })
    const dispatch: ResidentDispatchContext = {
      statePath: join(a, "state"),
      userConfigPath: user,
      credential: credential("B_KEY"),
      sourceContexts: [
        { root: b, credential: credential("B_KEY"), sessionAnalytics: false },
        { root: c, credential: credential("C_KEY"), sessionAnalytics: false }
      ],
      controlled: { requireCredential: true, capturePath: join(a, "calls"), answers: {} }
    }
    expect((await Effect.runPromise(server.admit(observation, dispatch, true, true))).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    expect(readFileSync(join(a, "calls"), "utf8")).toBe("called\n")
    expect(
      await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "recipient-root",
          lifetime: server.lifetime,
          root: a,
          advicee: observation.advicee
        })
      )
    ).toEqual({ status: "recipient-root", root: c })
  })
  it("accounts for long physical source keys in the retained outcome reservation", async () => {
    const root = await makeReviewGitFixture()
    const user = await put(root, "user.jsonc", JSON.stringify({ version: 1 }))
    const target = await put(root, "type.ts", "type OrderCount = number\n")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, [target])))
    if (observation === undefined) throw new Error("missing reservation observation")
    const settings = await Effect.runPromise(loadReviewSettings(root, { userConfigPath: user }))
    const result = await Effect.runPromise(
      prepareObservation(observation, { controlledWriter: true, advicee: observation.advicee, settings })
    )
    const ready = result.outcomes.find((outcome) => outcome.status === "ready")
    if (ready?.status !== "ready") throw new Error("missing reservation unit")
    const dispatch: ResidentDispatchContext = {
      statePath: "/tmp/state",
      userConfigPath: user,
      credential: null,
      controlled: { answers: {} }
    }
    // Filesystem path length is irrelevant to this pure upper-bound calculation.
    // Hold the payload and snapshots fixed to isolate retained root-qualified identities.
    const shortRoot = "/r"
    const longRoot = `/${"r".repeat(16000)}`
    const charge = (root: string) =>
      residentUnitReservationBytes({ ...observation, root }, dispatch, { ...ready.prepared, root })
    expect(charge(longRoot) - charge(shortRoot)).toBeGreaterThanOrEqual(6 * (longRoot.length - shortRoot.length))
  })
  it.each([false, true])("uses the skipped target's own inspection consent (%s) through IPC", async (enabled) => {
    const a = await makeReviewGitFixture()
    const b = await makeReviewGitFixture()
    const c = await makeReviewGitFixture()
    const user = await put(a, "user.jsonc", JSON.stringify({ version: 1 }))
    await put(b, ".hapsland.jsonc", JSON.stringify({ version: 1, sessionInspection: true }))
    await put(c, ".hapsland.jsonc", JSON.stringify({ version: 1, sessionInspection: enabled }))
    const target = await put(b, "value.ts", "const value = 1\n")
    const skipped = await put(c, "value.ts", "const secretFromOtherRoot = 2\n")
    const records: InspectionRecord[] = []
    const written = nativeDeferred<void>()
    const server = await acquireResidentFixture(residentPaths(join(a, "runtime")), undefined, {
      inspectionPersistence: {
        write: (record) =>
          Effect.sync(() => {
            records.push(record)
            if (record.scope.root === c && record.fact.kind === "edit-admission") written.resolve()
          })
      }
    })
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(a, [target])))
    const other = await Effect.runPromise(adaptCodexDirectEvent(addEvent(c, [skipped], { tool_use_id: "skipped" })))
    if (observation === undefined || other === undefined) throw new Error("missing native target")
    const dispatch: ResidentDispatchContext = {
      statePath: join(a, "state"),
      userConfigPath: user,
      credential: null,
      controlled: { answers: {} }
    }
    expect((await Effect.runPromise(server.admit(observation, dispatch, true))).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    await Effect.runPromise(server.listen())
    const call = (request: Parameters<typeof residentRequestEffect>[1]) =>
      Effect.runPromise(residentRequestEffect(server.paths, request))
    expect(
      await call({
        requestRoute: "shared",
        operation: "edit-policy",
        lifetime: server.lifetime,
        root: c,
        advicee: other.advicee,
        targetPaths: [skipped]
      })
    ).toEqual({ status: "skipped-other-root" })
    // A policy lookup alone is not a native observation and must not invent a receipt.
    expect(records.some((record) => record.fact.kind === "edit-received" && record.scope.root === c)).toBe(false)
    expect(
      await call({
        requestRoute: "shared",
        operation: "record-native",
        lifetime: server.lifetime,
        userConfigPath: user,
        metadata: [
          {
            root: c,
            rootIdentity: other.rootIdentity,
            advicee: other.advicee,
            admission: "skipped-other-root",
            candidates: [{ position: 0, operation: "add", path: "value.ts", selection: { status: "not-evaluated" } }]
          }
        ]
      })
    ).toEqual({ status: "empty" })
    if (enabled) {
      await written.promise
      const receipt = records.filter((record) => record.scope.root === c && record.correlation.receiptId !== undefined)
      expect(receipt.map(({ fact }) => fact.kind)).toEqual(["edit-received", "edit-admission"])
      expect(receipt[1]?.fact).toEqual({ kind: "edit-admission", outcome: "skipped-other-root" })
    } else expect(records.every(({ scope }) => scope.root === b)).toBe(true)
    expect(JSON.stringify(records)).not.toContain("secretFromOtherRoot")
  })
  it("rejects replacement of a physical target after its pre-edit capture without selecting a root", async () => {
    const a = await makeReviewGitFixture()
    const b = await makeReviewGitFixture()
    const replacement = await makeReviewGitFixture()
    const user = await put(a, "user.jsonc", JSON.stringify({ version: 1 }))
    const oldTarget = await put(b, "value.ts", "const value = 1\n")
    await put(replacement, "value.ts", "const value = 2\n")
    const event = addEvent(a, [oldTarget])
    const before = await Effect.runPromise(
      adaptComposedHookIdentity({ ...event, hook_event_name: "PreToolUse" }, "codex-cli", "PreToolUse")
    )
    if (before === undefined) throw new Error("missing physical pre-edit identity")
    const server = await acquireResidentFixture(residentPaths(join(a, "runtime")))
    expect(
      (
        await Effect.runPromise(
          server.handle({
            requestRoute: "shared",
            operation: "register-edit",
            lifetime: server.lifetime,
            root: b,
            advicee: before.advicee,
            startedAt: monotonicNow(),
            userConfigPath: user
          })
        )
      ).status
    ).toBe("advanced")
    await rename(b, `${b}-old`)
    await rename(replacement, b)
    const observation = await Effect.runPromise(adaptCodexDirectEvent(event))
    if (observation === undefined) throw new Error("missing replacement observation")
    const dispatch: ResidentDispatchContext = {
      statePath: join(a, "state"),
      userConfigPath: user,
      credential: null,
      controlled: { answers: {} }
    }
    expect((await Effect.runPromise(server.admit(observation, dispatch, true, true))).status).toBe("rejected-stale")
    expect(
      await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "recipient-root",
          lifetime: server.lifetime,
          root: b,
          advicee: observation.advicee
        })
      )
    ).toEqual({ status: "recipient-root", root: null })
    const freshTarget = await put(a, "value.ts", "const value = 3\n")
    const fresh = await Effect.runPromise(adaptCodexDirectEvent(addEvent(a, [freshTarget], { tool_use_id: "fresh" })))
    if (fresh === undefined) throw new Error("missing fresh root")
    expect((await Effect.runPromise(server.admit(fresh, dispatch, true))).status).toBe("accepted")
  })
  it("does not pin a rejected observation reservation", async () => {
    const a = await makeReviewGitFixture()
    const b = await makeReviewGitFixture()
    const user = await put(a, "user.jsonc", JSON.stringify({ version: 1 }))
    const target = await put(b, "value.ts", "const value = 1\n")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(a, [target])))
    if (observation === undefined) throw new Error("missing capacity observation")
    const server = await acquireResidentFixture(residentPaths(join(a, "runtime")))
    const dispatch: ResidentDispatchContext = {
      statePath: join(a, "state"),
      userConfigPath: user,
      credential: null,
      controlled: { answers: {} }
    }
    // Exercise resident byte admission itself, below the IPC frame's independent refusal boundary.
    const oversized = {
      ...observation,
      nativePatchCommand: undefined,
      candidateRoots: undefined,
      candidates: [{ operation: "add" as const, path: "value.ts", addedLines: ["x".repeat(33 * 1024 * 1024)] }]
    }
    const { nativePatchCommand: _command, candidateRoots: _roots, ...boundedShape } = oversized
    expect((await Effect.runPromise(server.admit(boundedShape, dispatch, true))).status).toBe("rejected-capacity")
    expect(
      await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "recipient-root",
          lifetime: server.lifetime,
          root: b,
          advicee: observation.advicee
        })
      )
    ).toEqual({ status: "recipient-root", root: null })
    const freshTarget = await put(a, "value.ts", "const value = 2\n")
    const fresh = await Effect.runPromise(adaptCodexDirectEvent(addEvent(a, [freshTarget], { tool_use_id: "fresh" })))
    if (fresh === undefined) throw new Error("missing fresh capacity target")
    expect((await Effect.runPromise(server.admit(fresh, dispatch, true))).status).toBe("accepted")
  })
  it("uses the immutable pre-edit policy and skips native source capture for another pinned root", async () => {
    const a = await makeReviewGitFixture()
    const b = await makeReviewGitFixture()
    const c = await makeReviewGitFixture()
    const user = await put(a, "user.jsonc", JSON.stringify({ version: 1 }))
    await put(b, ".hapsland.jsonc", JSON.stringify({ version: 1 }))
    const fileB = await put(b, "type.ts", "type OrderCount = number\n")
    const fileC = await put(c, "type.ts", "type OtherCount = number\n")
    const server = await acquireResidentFixture(residentPaths(join(a, "runtime")))
    const native = (path: string, text: string, tool: string) => ({
      hook_event_name: "PostToolUse",
      cwd: a,
      session_id: "native-session",
      tool_use_id: tool,
      tool_name: "Write",
      tool_input: { file_path: path, content: text },
      tool_response: { filePath: path, content: text, originalFile: null, userModified: false }
    })
    const advicee = {
      host: "claude-code",
      hostVersion: "2.1.218",
      sessionId: "native-session",
      turnId: null,
      toolUseId: "b",
      subagentId: null
    } as const
    expect(
      (
        await Effect.runPromise(
          server.handle({
            requestRoute: "shared",
            operation: "register-edit",
            lifetime: server.lifetime,
            root: b,
            advicee,
            startedAt: monotonicNow(),
            userConfigPath: user
          })
        )
      ).status
    ).toBe("advanced")
    await put(b, ".hapsland.jsonc", "invalid configuration after tool start")
    let capturedPolicy: ResidentEditPolicy | undefined
    const policy = (root: string, identity: typeof advicee) =>
      server
        .handle({
          requestRoute: "shared",
          operation: "edit-policy",
          lifetime: server.lifetime,
          root,
          advicee: identity
        })
        .pipe(
          Effect.catch(() => Effect.succeed(undefined)),
          Effect.map((response) => {
            capturedPolicy = response?.status === "edit-policy" ? response.policy : undefined
            return capturedPolicy?.filePolicy
          })
        )
    const observation = await Effect.runPromise(
      adaptClaudeDirectEvent(native(fileB, "type OrderCount = number\n", "b"), {
        capturePolicy: (root, identity) => policy(root, identity as typeof advicee)
      })
    )
    expect(observation?.root).toBe(b)
    expect(capturedPolicy?.credentialEnvVar).toBeDefined()
    if (observation === undefined) throw new Error("immutable policy failed")
    const dispatch: ResidentDispatchContext = {
      statePath: join(a, "state"),
      userConfigPath: user,
      credential: null,
      controlled: { answers: {} }
    }
    expect((await Effect.runPromise(server.admit(observation, dispatch, true, true))).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    let captures = 0
    const skipped = await Effect.runPromise(
      adaptClaudeDirectEvent(native(fileC, "type OtherCount = number\n", "c"), {
        capturePolicy: (root, identity) => policy(root, identity as typeof advicee),
        captureHooks: {
          sourceRead: () => {
            captures += 1
          }
        }
      })
    )
    expect(skipped).toBeUndefined()
    expect(captures).toBe(0)
    expect(
      await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "recipient-root",
          lifetime: server.lifetime,
          root: c,
          advicee
        })
      )
    ).toMatchObject({ status: "recipient-root", root: b })
  })
  it("keeps main, identified children and another session independently pinned and addressed", async () => {
    const a = await makeReviewGitFixture()
    const b = await makeReviewGitFixture()
    const c = await makeReviewGitFixture()
    const targetB = await put(b, "type.ts", "type OrderCount = number\n")
    const targetC = await put(c, "type.ts", "type OrderCount = number\n")
    const user = await put(a, "user.jsonc", JSON.stringify({ version: 1 }))
    const capturePath = join(a, "calls")
    const dispatch: ResidentDispatchContext = {
      statePath: join(a, "state"),
      userConfigPath: user,
      credential: null,
      controlled: {
        capturePath,
        answers: Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 0.9 }]))
      }
    }
    const server = await acquireResidentFixture(residentPaths(join(a, "runtime")))
    const recipients = [
      { session_id: "shared", agent_id: undefined, target: targetB, root: b },
      { session_id: "shared", agent_id: "child-one", target: targetC, root: c },
      { session_id: "shared", agent_id: "child-two", target: targetB, root: b },
      { session_id: "separate", agent_id: undefined, target: targetC, root: c }
    ]
    for (const [index, recipient] of recipients.entries()) {
      const observation = await Effect.runPromise(
        adaptCodexDirectEvent(
          addEvent(a, [recipient.target], {
            session_id: recipient.session_id,
            agent_id: recipient.agent_id,
            tool_use_id: `recipient-${index}`
          })
        )
      )
      if (observation === undefined) throw new Error("missing attributed target")
      expect((await Effect.runPromise(server.admit(observation, dispatch, true))).status).toBe("accepted")
      await Effect.runPromise(server.whenIdle())
      expect(
        await Effect.runPromise(
          server.handle({
            requestRoute: "shared",
            operation: "recipient-root",
            lifetime: server.lifetime,
            root: a,
            advicee: observation.advicee
          })
        )
      ).toEqual({ status: "recipient-root", root: recipient.root })
      const collected = await Effect.runPromise(
        server.collect(a, observation.advicee, { ...dispatch, deliveryCwd: a }, "ordinary", undefined, true)
      )
      expect(collected).toMatchObject({
        status: "advice",
        output: { hookSpecificOutput: { additionalContext: expect.stringContaining(recipient.target) } }
      })
      if (collected.status === "advice" && "hookSpecificOutput" in collected.output)
        expect(collected.output.hookSpecificOutput.additionalContext).not.toContain(
          recipient.root === b ? targetC : targetB
        )
    }
    expect(readFileSync(capturePath, "utf8")).toBe("called\n".repeat(recipients.length))
  })
  it("atomically pins one source when eligible first edits arrive concurrently", async () => {
    const a = await makeReviewGitFixture()
    const b = await makeReviewGitFixture()
    const c = await makeReviewGitFixture()
    const user = await put(a, "user.jsonc", JSON.stringify({ version: 1 }))
    const observations = await Promise.all(
      [b, c].map(async (root, index) => {
        const target = await put(root, "value.ts", "const value = 1\n")
        return Effect.runPromise(adaptCodexDirectEvent(addEvent(a, [target], { tool_use_id: `concurrent-${index}` })))
      })
    )
    const server = await acquireResidentFixture(residentPaths(join(a, "runtime")))
    const dispatch: ResidentDispatchContext = {
      statePath: join(a, "state"),
      userConfigPath: user,
      credential: null,
      controlled: { answers: {} }
    }
    const results = await Promise.all(
      observations.map((observation) => {
        if (observation === undefined) throw new Error("missing concurrent target")
        return Effect.runPromise(server.admit(observation, dispatch, true))
      })
    )
    expect(results.map(({ status }) => status).sort()).toEqual(["accepted", "skipped-other-root"])
    await Effect.runPromise(server.whenIdle())
    // A file edit with no semantic declaration still establishes the round's source pin.
    expect(
      await Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "recipient-root",
          lifetime: server.lifetime,
          root: a,
          advicee: observations[0]!.advicee
        })
      )
    ).toMatchObject({ status: "recipient-root", root: b })
  })
  it("registers absent targets per root and chooses the first eligible candidate in a mixed patch", async () => {
    const a = await makeReviewGitFixture()
    const b = await makeReviewGitFixture()
    const c = await makeReviewGitFixture()
    await put(a, ".hapsland.jsonc", JSON.stringify({ version: 1, excludes: ["**/*"] }))
    const user = await put(a, "user.jsonc", JSON.stringify({ version: 1 }))
    const paths = [join(a, "excluded.ts"), join(b, "new/type.ts"), join(c, "new/other.ts")]
    const event = addEvent(a, paths)
    const before = await Effect.runPromise(
      adaptComposedHookIdentity({ ...event, hook_event_name: "PreToolUse" }, "codex-cli", "PreToolUse")
    )
    expect(before?.editRoots).toEqual([a, b, c])
    if (before === undefined) throw new Error("missing pre-edit identity")
    const server = await acquireResidentFixture(residentPaths(join(a, "runtime")))
    for (const root of before.editRoots ?? [])
      expect(
        (
          await Effect.runPromise(
            server.handle({
              requestRoute: "shared",
              operation: "register-edit",
              lifetime: server.lifetime,
              root,
              advicee: before.advicee,
              userConfigPath: user,
              startedAt: monotonicNow()
            })
          )
        ).status
      ).toBe("advanced")
    await put(a, "excluded.ts", "type OrderCount = number\n")
    await put(b, "new/type.ts", "type OrderCount = number\n")
    await put(c, "new/other.ts", "type OrderCount = number\n")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(event))
    if (observation === undefined) throw new Error("missing mixed observation")
    const dispatch: ResidentDispatchContext = {
      statePath: join(a, "state"),
      userConfigPath: user,
      credential: null,
      controlled: {
        capturePath: join(a, "calls"),
        answers: Object.fromEntries(
          configuredRules.map((rule) => [
            rule.id,
            { _tag: "Probability", probability: rule.id === "bare_domain_value" ? 0.9 : 0 }
          ])
        )
      }
    }
    expect((await Effect.runPromise(server.admit(observation, dispatch, true, true))).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    expect(readFileSync(join(a, "calls"), "utf8")).toBe("called\n")
    const result = await Effect.runPromise(
      server.collect(a, observation.advicee, dispatch, "ordinary", undefined, true)
    )
    expect(result).toMatchObject({ status: "advice" })
    if (result.status === "advice") {
      expect(result.output.hookSpecificOutput.additionalContext).toContain(paths[1])
      expect(result.output.hookSpecificOutput.additionalContext).not.toContain(paths[2])
    }
  })
  it("skips another root without losing advice, and fences old events when a fresh round chooses that root", async () => {
    const a = await makeReviewGitFixture()
    const b = await makeReviewGitFixture()
    const c = await makeReviewGitFixture()
    const user = await put(a, "user.jsonc", JSON.stringify({ version: 1 }))
    const targetB = await put(b, "type.ts", "type OrderCount = number\n")
    const targetC = await put(c, "type.ts", "type OrderCount = number\n")
    const bEdit = await Effect.runPromise(adaptCodexDirectEvent(addEvent(a, [targetB], { tool_use_id: "b" })))
    const cEdit = await Effect.runPromise(adaptCodexDirectEvent(addEvent(a, [targetC], { tool_use_id: "c" })))
    if (bEdit === undefined || cEdit === undefined) throw new Error("missing target observations")
    const dispatch: ResidentDispatchContext = {
      statePath: join(a, "state"),
      userConfigPath: user,
      credential: null,
      controlled: {
        capturePath: join(a, "calls"),
        answers: Object.fromEntries(
          configuredRules.map((rule) => [
            rule.id,
            { _tag: "Probability", probability: rule.id === "bare_domain_value" ? 0.9 : 0 }
          ])
        )
      }
    }
    const requests: JevRequestObservation[] = []
    const server = await acquireResidentFixture(residentPaths(join(a, "runtime")), undefined, {
      jevRequestObserver: (request) => {
        requests.push(request)
      }
    })
    expect((await Effect.runPromise(server.admit(bEdit, dispatch, true))).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    const registerC = (tool: string, startedAt: number) =>
      Effect.runPromise(
        server.handle({
          requestRoute: "shared",
          operation: "register-edit",
          lifetime: server.lifetime,
          root: c,
          advicee: { ...cEdit.advicee, toolUseId: tool },
          userConfigPath: user,
          startedAt
        })
      )
    const oldStart = monotonicNow()
    expect((await registerC("c", oldStart)).status).toBe("skipped-other-root")
    expect((await Effect.runPromise(server.admit(cEdit, dispatch, true, true))).status).toBe("skipped-other-root")
    expect((await Effect.runPromise(server.admit(cEdit, dispatch, true, true))).status).toBe("skipped-other-root")
    expect(await Effect.runPromise(server.pendingAdviceMetadata())).toHaveLength(1)
    const returning = { ...bEdit, advicee: { ...bEdit.advicee, toolUseId: "return" } }
    expect((await Effect.runPromise(server.admit(returning, dispatch, true))).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    expect(readFileSync(join(a, "calls"), "utf8")).toBe("called\n")
    for (const operation of ["begin-stop", "finish-stop"] as const) {
      expect(
        (
          await Effect.runPromise(
            server.handle({
              requestRoute: "shared",
              operation,
              lifetime: server.lifetime,
              root: a,
              advicee: bEdit.advicee,
              token: "finish",
              ...(operation === "finish-stop" ? { close: true } : {})
            })
          )
        ).status
      ).toBe("advanced")
    }
    expect((await registerC("delayed", oldStart)).status).toBe("rejected-stale")
    // Target discovery supplies a real post-closure opportunity, independently of a host turn ID.
    const fresh = await Effect.runPromise(adaptCodexDirectEvent(addEvent(a, [targetC], { tool_use_id: "fresh" })))
    if (fresh === undefined) throw new Error("missing fresh observation")
    expect((await registerC("fresh", monotonicNow())).status).toBe("advanced")
    expect((await Effect.runPromise(server.admit(fresh, dispatch, true, true))).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    expect(requests.filter((request) => request.stage === "issued").map((request) => request.hapslandRound)).toEqual([
      1, 2
    ])
    expect(
      await Effect.runPromise(server.collect("/outside-git", fresh.advicee, dispatch, "ordinary", undefined, true))
    ).toMatchObject({
      status: "advice",
      output: { hookSpecificOutput: { additionalContext: expect.stringContaining(targetC) } }
    })
  })
  it.each(["independent repository", "linked worktree"])(
    "reviews a %s target with its settings and delivers from another cwd",
    async (kind) => {
      const a = await makeReviewGitFixture()
      const b = kind === "independent repository" ? await makeReviewGitFixture() : `${a}-linked`
      if (kind === "linked worktree") {
        await execFileAsync("git", ["-C", a, "commit", "--allow-empty", "-qm", "linked fixture"])
        await execFileAsync("git", ["-C", a, "worktree", "add", "--detach", b, "HEAD"])
      }
      const target = await put(b, "type.ts", "type OrderCount = number\n")
      await put(a, ".hapsland.jsonc", JSON.stringify({ version: 1, rules: [] }))
      await put(
        b,
        "rule.json",
        JSON.stringify({
          version: 1,
          id: "target-domain",
          question: "Is a domain value a bare primitive?",
          criteria: { false: "No", true: "Yes" },
          threshold: 0.7,
          message: "target project rule",
          inputs: [{ languages: ["typescript"], kind: "type", requires: ["root-declaration"] }]
        })
      )
      await put(b, ".hapsland.jsonc", JSON.stringify({ version: 1, rules: [{ path: "rule.json" }] }))
      const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(a, [target])))
      expect(observation?.root).toBe(b)
      if (observation === undefined) throw new Error("missing target observation")
      const capturePath = join(a, "calls")
      const user = await put(a, "user.jsonc", JSON.stringify({ version: 1 }))
      const dispatch: ResidentDispatchContext = {
        statePath: join(a, "state"),
        userConfigPath: user,
        credential: null,
        controlled: { capturePath, answers: { "target-domain": { _tag: "Probability", probability: 0.9 } } }
      }
      const requests: JevRequestObservation[] = []
      const server = await acquireResidentFixture(residentPaths(join(a, "runtime")), undefined, {
        jevRequestObserver: (request) => {
          requests.push(request)
        }
      })
      expect((await Effect.runPromise(server.admit(observation, dispatch, true))).status).toBe("accepted")
      await Effect.runPromise(server.whenIdle())
      expect(readFileSync(capturePath, "utf8")).toBe("called\n")
      expect(requests.filter((request) => request.stage === "settled")).toMatchObject([{ outcome: "finding" }])
      expect(await Effect.runPromise(server.pendingAdviceMetadata())).toHaveLength(1)
      await Effect.runPromise(server.listen())
      const collected = await Effect.runPromise(
        residentRequestEffect(server.paths, {
          requestRoute: "shared",
          operation: "collect",
          lifetime: server.lifetime,
          root: a,
          advicee: observation.advicee,
          dispatch: { ...dispatch, deliveryCwd: a },
          composed: true
        })
      )
      expect(collected).toMatchObject({
        status: "advice",
        output: { hookSpecificOutput: { additionalContext: expect.stringContaining("target project rule") } }
      })
      if (collected.status === "advice" && "hookSpecificOutput" in collected.output)
        expect(collected.output.hookSpecificOutput.additionalContext).toContain(target)
    }
  )
})
