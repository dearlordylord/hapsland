import { configuredRules } from "../policy/rules.ts"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { join } from "node:path"
import { writeFile } from "node:fs/promises"
import { acquireResidentFixture } from "./runtime-fixture.ts"
import { residentPaths } from "./paths.ts"
import { adaptCodexDirectEvent } from "../direct-event/adapter.ts"
import { addEvent, makeGitFixture, put } from "../direct-event/test-fixtures.ts"
import { makeInspectionStorage } from "../inspection/storage.ts"
import { nativeDeferred } from "../test-support/native-deferred.ts"
import type { ResidentDispatchContext } from "./protocol.ts"

describe("resident inspection capture", () => {
  it("captures valid obsolete-lifetime ingress and its refusal without admitting review work", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    await writeFile(join(root, ".hapsland.jsonc"), JSON.stringify({ version: 1, sessionInspection: true }))
    const stored = nativeDeferred<void>()
    const history = makeInspectionStorage(join(root, "inspection"), { retentionMs: 86400000, storageBytes: 1048576 })
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
      inspectionPersistence: {
        write: (record, encoded, allowed) =>
          history.write(record, encoded, allowed).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                if (record.fact.kind === "edit-admission") stored.resolve()
              })
            )
          )
      }
    })
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    if (!observation) throw new Error("missing observation")
    const response = await Effect.runPromise(
      server.handle({
        requestRoute: "shared",
        operation: "admit",
        lifetime: "prior-lifetime",
        observation,
        controlledWriter: true,
        composed: true,
        dispatch: {
          statePath: join(root, "consent"),
          userConfigPath: join(root, "absent-user"),
          credential: null,
          controlled: { answers: {} }
        }
      })
    )
    expect(response.status).toBe("obsolete-lifetime")
    await stored.promise
    const records = await Effect.runPromise(history.snapshot())
    expect(records.map((record) => record.fact)).toEqual([
      { kind: "recording-state", state: "enabled" },
      { kind: "edit-received", candidates: [{ operation: "add", path: "type.ts" }] },
      { kind: "edit-admission", outcome: "obsolete-lifetime" }
    ])
    expect(Effect.runSync(server.stats())).toMatchObject({ pendingAdvice: 0 })
  })
  it("settles real resident review work while optional filesystem publication is stalled", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    await writeFile(join(root, ".hapsland.jsonc"), JSON.stringify({ version: 1, sessionInspection: true }))
    const entered = nativeDeferred<void>()
    const release = nativeDeferred<void>()
    const settled = nativeDeferred<void>()
    const store = makeInspectionStorage(
      join(root, "inspection"),
      { retentionMs: 86400000, storageBytes: 1048576 },
      {
        beforePublication: async () => {
          entered.resolve()
          await release.promise
        },
        settled: () => settled.resolve()
      }
    )
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
      inspectionPersistence: store
    })
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    if (!observation) throw new Error("missing observation")
    const dispatch: ResidentDispatchContext = {
      statePath: join(root, "consent"),
      userConfigPath: join(root, "absent-user.jsonc"),
      credential: null,
      controlled: { answers: {} }
    }
    expect(Effect.runSync(server.admit(observation, dispatch)).status).toBe("accepted")
    await entered.promise
    await Effect.runPromise(server.whenIdle())
    expect((await Effect.runPromise(server.pendingAdviceMetadata())).length).toBe(0)
    await Effect.runPromise(server.close)
    release.resolve()
    await settled.promise
    expect(await Effect.runPromise(store.snapshot())).toEqual([])
  })
  it("records actual admitted edit metadata without patch source or credentials and refreshes opt-out", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const config = join(root, ".hapsland.jsonc")
    await writeFile(config, JSON.stringify({ version: 1, sessionInspection: true }))
    const stored = nativeDeferred<void>()
    const prepared = nativeDeferred<void>()
    const evaluated = nativeDeferred<void>()
    const store = makeInspectionStorage(join(root, "inspection"), { retentionMs: 86400000, storageBytes: 1048576 })
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
      inspectionPersistence: {
        write: (record, encoded, allowed) =>
          store.write(record, encoded, allowed).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                if (record.fact.kind === "edit-admission") stored.resolve()
                if (record.fact.kind === "unit-prepared") prepared.resolve()
                if (record.fact.kind === "evaluation-outcome") evaluated.resolve()
              })
            )
          )
      }
    })
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    if (!observation) throw new Error("missing observation")
    const dispatch: ResidentDispatchContext = {
      statePath: join(root, "consent"),
      userConfigPath: join(root, "absent-user.jsonc"),
      credential: null,
      controlled: {
        answers: Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 0.9 }]))
      }
    }
    expect(Effect.runSync(server.admit(observation, dispatch)).status).toBe("accepted")
    await stored.promise
    await prepared.promise
    await evaluated.promise
    const records = await Effect.runPromise(store.snapshot())
    expect(
      records
        .filter((record) => ["recording-state", "edit-received", "edit-admission"].includes(record.fact.kind))
        .map((record) => record.fact.kind)
    ).toEqual(["recording-state", "edit-received", "edit-admission"])
    const received = records.find((record) => record.fact.kind === "edit-received")!
    expect(received.source.lifetime).toBe(server.lifetime)
    expect(received.scope.runtime).toBe("codex-cli")
    expect(received.fact).toEqual({ kind: "edit-received", candidates: [{ operation: "add", path: "type.ts" }] })
    expect(JSON.stringify(received)).not.toContain("OrderCount")
    expect(records.find((record) => record.fact.kind === "edit-admission")?.correlation).toEqual(received.correlation)
    await Effect.runPromise(server.whenIdle())
    const preparedRecords = await Effect.runPromise(store.snapshot())
    const unit = preparedRecords.find((record) => record.fact.kind === "unit-prepared")
    expect(unit?.correlation.receiptId).toBe(received.correlation.receiptId)
    expect(unit?.correlation.unitId).toMatch(/^[a-f0-9]{64}$/)
    expect(unit?.fact).toMatchObject({ kind: "unit-prepared", declaration: "OrderCount", path: "type.ts" })
    const modelInput = preparedRecords.find((record) => record.fact.kind === "model-input")?.fact
    expect(modelInput?.kind).toBe("model-input")
    if (modelInput?.kind !== "model-input" || modelInput.payload.status !== "available")
      throw new Error("missing model input")
    expect(modelInput.payload.byteLength).toBe(Buffer.byteLength(modelInput.payload.encoded))
    expect(modelInput.payload.encoded).toContain("type OrderCount")
    expect(preparedRecords.find((record) => record.fact.kind === "validated-answers")?.fact).toMatchObject({
      kind: "validated-answers",
      answers: configuredRules.map((rule) => ({ ruleId: rule.id, probability: 0.9 }))
    })
    expect(preparedRecords.find((record) => record.fact.kind === "evaluation-outcome")?.fact).toEqual({
      kind: "evaluation-outcome",
      outcome: "findings"
    })
    await writeFile(config, JSON.stringify({ version: 1, sessionInspection: false }))
    Effect.runSync(server.admit(observation, dispatch))
    await Effect.runPromise(server.whenIdle())
    await Effect.runPromise(server.close)
    const history = await Effect.runPromise(store.snapshot())
    expect(history.filter((record) => record.fact.kind === "edit-received")).toHaveLength(1)
  })
})
