import { configuredRules } from "../policy/rules.ts"
import { randomUUID } from "node:crypto"
import { residentRequestEffect } from "./client.ts"
import { reviewControlsLayer } from "../test-support/review-controls.ts"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { join } from "node:path"
import { writeFile } from "node:fs/promises"
import { acquireResidentFixture } from "./runtime-fixture.ts"
import { PENDING_ADVICE_EXPIRY_MS } from "./collection.ts"
import { residentPaths } from "./paths.ts"
import { adaptCodexDirectEvent } from "../direct-event/adapter.ts"
import { addEvent, makeGitFixture, put, advicee } from "../direct-event/test-fixtures.ts"
import { makeInspectionStorage } from "../inspection/storage.ts"
import { nativeDeferred } from "../test-support/native-deferred.ts"
import type { ResidentDispatchContext } from "./protocol.ts"

describe("resident inspection capture", () => {
  it("binds writer evidence to the surviving batch at the final socket handoff", async () => {
    const root = await makeGitFixture()
    await put(root, "first.ts", "type FirstCount = number;\n")
    await put(root, "second.ts", "type SecondCount = number;\n")
    await writeFile(join(root, ".hapsland.jsonc"), JSON.stringify({ version: 1, sessionInspection: true }))
    const written = nativeDeferred<void>()
    const store = makeInspectionStorage(join(root, "inspection"), { retentionMs: 86400000, storageBytes: 1048576 })
    let armed = false
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
      reviewControls: reviewControlsLayer({
        beforeResponseHandoff: Effect.fn("InspectionFixture.pruneSource")(() =>
          armed
            ? Effect.promise(() => put(root, "first.ts", "type FirstCount = string;\n")).pipe(Effect.asVoid)
            : Effect.void
        )
      }),
      inspectionPersistence: {
        write: (record, encoded, publication) =>
          store.write(record, encoded, publication).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                if (record.fact.kind === "writer-evidence" && record.fact.state === "written") written.resolve()
              })
            )
          )
      }
    })
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["first.ts", "second.ts"])))
    if (!observation) throw new Error("missing observation")
    const dispatch: ResidentDispatchContext = {
      statePath: join(root, "consent"),
      userConfigPath: join(root, "absent-user"),
      credential: null,
      controlled: {
        answers: Object.fromEntries(
          configuredRules.map((rule, index) => [rule.id, { _tag: "Probability", probability: index === 0 ? 0.9 : 0 }])
        )
      }
    }
    expect(Effect.runSync(server.admit(observation, dispatch, true)).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    await Effect.runPromise(server.listen())
    armed = true
    const response = await Effect.runPromise(
      residentRequestEffect(server.paths, {
        requestRoute: "shared",
        operation: "collect",
        lifetime: server.lifetime,
        root,
        advicee: observation.advicee,
        dispatch,
        composed: true
      })
    )
    expect(response.status).toBe("advice")
    if (response.status !== "advice") throw new Error("missing final response")
    expect(response.findingCount).toBe(1)
    const report = {
      requestRoute: "shared" as const,
      operation: "inspection-writer" as const,
      token: response.token,
      attemptId: randomUUID(),
      lifetime: server.lifetime,
      root,
      advicee: observation.advicee,
      findingCount: 1,
      noticeOnly: false,
      state: "written" as const,
      encoded: JSON.stringify(response.output) + "\n"
    }
    expect(
      await Effect.runPromise(
        residentRequestEffect(server.paths, {
          ...report,
          advicee: { ...observation.advicee, toolUseId: "foreign-edit" }
        })
      )
    ).toEqual({ status: "empty" })
    expect(await Effect.runPromise(residentRequestEffect(server.paths, report))).toEqual({ status: "empty" })
    await written.promise
    // Read after the final report write settles, before teardown can enqueue retirement facts.
    const { records: snapshot } = await Effect.runPromise(store.snapshot())
    const evidence = snapshot.find((record) => record.fact.kind === "writer-evidence")?.fact
    if (evidence?.kind !== "writer-evidence") throw new Error("missing writer evidence")
    expect(evidence.findingIds).toHaveLength(1)
    expect(evidence.evaluations).toHaveLength(1)
    expect(evidence.output).toMatchObject({
      status: "available",
      encoded: Buffer.from(report.encoded).toString("base64")
    })
    expect(snapshot.filter((record) => record.fact.kind === "writer-evidence")).toHaveLength(1)
    const surviving = snapshot.find(
      (record) => record.fact.kind === "unit-prepared" && record.fact.path === "second.ts"
    )
    expect(evidence.evaluations[0]?.evaluationId).toBe(surviving?.correlation.evaluationId)
  })
  it.each([false, true])(
    "distinguishes current findings from finalized retirement or suppression (composed: %s)",
    async (composed) => {
      const root = await makeGitFixture()
      await put(root, "type.ts", "type OrderCount = number;\n")
      await writeFile(join(root, ".hapsland.jsonc"), JSON.stringify({ version: 1, sessionInspection: true }))
      const retained = nativeDeferred<void>()
      const current = nativeDeferred<void>()
      let suppressionStored = false
      let finalizationStored = false
      const store = makeInspectionStorage(join(root, "inspection"), { retentionMs: 86400000, storageBytes: 1048576 })
      const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
        inspectionPersistence: {
          write: (record, encoded, publication) =>
            store.write(record, encoded, publication).pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  if (record.fact.kind !== "finding-fate") return
                  if (record.fact.fate === "retained") retained.resolve()
                  if (record.fact.fate === "current") current.resolve()
                  if (record.fact.fate === "suppressed") suppressionStored = true
                  if (record.fact.reason === "delivery-finalized") finalizationStored = true
                })
              )
            )
        }
      })
      const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
      if (!observation) throw new Error("missing observation")
      const dispatch: ResidentDispatchContext = {
        statePath: join(root, "consent"),
        userConfigPath: join(root, "absent-user"),
        credential: null,
        controlled: {
          answers: Object.fromEntries(
            configuredRules.map((rule, index) => [rule.id, { _tag: "Probability", probability: index === 0 ? 0.9 : 0 }])
          )
        }
      }
      expect(Effect.runSync(server.admit(observation, dispatch, composed)).status).toBe("accepted")
      await Effect.runPromise(server.whenIdle())
      await retained.promise
      const collect = () =>
        !composed
          ? Effect.runPromise(server.collect(root, observation.advicee, dispatch))
          : Effect.runPromise(
              server.handle({
                requestRoute: "shared",
                operation: "collect",
                lifetime: server.lifetime,
                root,
                advicee: observation.advicee,
                dispatch,
                mode: "ordinary",
                composed: true
              })
            )
      const first = await collect()
      expect(first.status).toBe("advice")
      if (first.status !== "advice") throw new Error("missing advice")
      await current.promise
      expect(suppressionStored).toBe(false)
      if (composed)
        expect((await Effect.runPromise(server.beginComposedSubmission(first.token, "background"))).status).toBe(
          "submitting"
        )
      expect((await Effect.runPromise(server.acknowledge(first.token))).status).toBe("acknowledged")
      expect((await Effect.runPromise(server.finalize(first.token))).status).toBe("finalized")
      expect((await collect()).status).toBe("empty")
      await expect.poll(() => (composed ? suppressionStored : finalizationStored), { timeout: 3000 }).toBe(true)
      const { records } = await Effect.runPromise(store.snapshot())
      const fate = records.find(
        (record) => record.fact.kind === "finding-fate" && record.fact.fate === (composed ? "suppressed" : "discarded")
      )
      expect(fate?.fact).toMatchObject({
        fate: composed ? "suppressed" : "discarded",
        reason: composed ? "collection-suppression" : "delivery-finalized"
      })
      expect(records.some((record) => record.fact.kind === "finding-fate" && record.fact.fate === "stale")).toBe(false)
      expect(records.filter((record) => record.fact.kind === "model-input")).toHaveLength(1)
    }
  )

  it("records actual advice expiry without claiming source repair or submission", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number;\n")
    await writeFile(join(root, ".hapsland.jsonc"), JSON.stringify({ version: 1, sessionInspection: true }))
    let clock = 1000
    const retained = nativeDeferred<void>()
    const expired = nativeDeferred<void>()
    const store = makeInspectionStorage(join(root, "inspection"), { retentionMs: 86400000, storageBytes: 1048576 })
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), () => clock, {
      inspectionPersistence: {
        write: (record, encoded, publication) =>
          store.write(record, encoded, publication).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                if (record.fact.kind === "finding-fate" && record.fact.fate === "retained") retained.resolve()
                if (record.fact.kind === "finding-fate" && record.fact.fate === "expired") expired.resolve()
              })
            )
          )
      }
    })
    const dispatch: ResidentDispatchContext = {
      statePath: join(root, "consent"),
      userConfigPath: join(root, "absent-user"),
      credential: null,
      controlled: {
        answers: Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 0.9 }]))
      }
    }
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    if (!observation) throw new Error("missing observation")
    expect(Effect.runSync(server.admit(observation, dispatch)).status).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    await retained.promise
    clock += PENDING_ADVICE_EXPIRY_MS
    expect((await Effect.runPromise(server.collect(root, advicee(), dispatch))).status).toBe("empty")
    await expired.promise
    const { records } = await Effect.runPromise(store.snapshot())
    const fates = records.filter((record) => record.fact.kind === "finding-fate")
    expect(fates.map((record) => record.fact)).toMatchObject([
      { fate: "retained", reason: "pending-advice" },
      { fate: "expired", reason: "retention-expired" }
    ])
    expect(fates[0]?.correlation.evaluationId).toBe(fates[1]?.correlation.evaluationId)
    expect(records.filter((record) => record.fact.kind === "writer-evidence")).toHaveLength(0)
    expect(records.filter((record) => record.fact.kind === "model-input")).toHaveLength(1)
  })

  it("retains incomplete preparation beside a clear independent unit without a request for the failed path", async () => {
    const root = await makeGitFixture()
    await put(root, "good.ts", "type GoodCount = number\n")
    await put(root, "bad.ts", 'import { Amount } from "./support";\ntype BadCount = Amount;\n')
    await put(root, "support.ts", "export type Amount = number;\n")
    await writeFile(join(root, ".hapsland.jsonc"), JSON.stringify({ version: 1, sessionInspection: true }))
    const stored = nativeDeferred<void>()
    const seen = new Set<string>()
    const store = makeInspectionStorage(join(root, "inspection"), { retentionMs: 86400000, storageBytes: 1048576 })
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
      inspectionPersistence: {
        write: (record, encoded, publication) =>
          store.write(record, encoded, publication).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                if (record.fact.kind === "evaluation-outcome" || record.fact.kind === "preparation-skipped")
                  seen.add(record.fact.kind)
                if (seen.size === 2) stored.resolve()
              })
            )
          )
      }
    })
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["good.ts", "bad.ts"])))
    if (!observation) throw new Error("missing observation")
    expect(
      Effect.runSync(
        server.admit(observation, {
          statePath: join(root, "consent"),
          userConfigPath: join(root, "absent-user"),
          credential: null,
          controlled: {
            answers: Object.fromEntries(
              configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 0 }])
            )
          }
        })
      ).status
    ).toBe("accepted")
    await Effect.runPromise(server.whenIdle())
    await stored.promise
    const { records } = await Effect.runPromise(store.snapshot())
    expect(
      records.filter((record) => record.fact.kind === "evaluation-route").map((record) => record.fact)
    ).toMatchObject([{ route: "fresh", path: "good.ts", declaration: "GoodCount" }])
    expect(records.filter((record) => record.fact.kind === "preparation-skipped").map((record) => record.fact)).toEqual(
      [{ kind: "preparation-skipped", path: "bad.ts" }]
    )
    expect(
      records.filter((record) => record.fact.kind === "preparation-omission").map((record) => record.fact)
    ).toMatchObject([{ path: "bad.ts", reason: "import" }])
    expect(records.filter((record) => record.fact.kind === "model-input")).toHaveLength(1)
    expect(records.filter((record) => record.fact.kind === "evaluation-outcome").map((record) => record.fact)).toEqual([
      { kind: "evaluation-outcome", outcome: "clear" }
    ])
  })

  it("links a cached clear review to its captured original without inventing a second request", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    await writeFile(join(root, ".hapsland.jsonc"), JSON.stringify({ version: 1, sessionInspection: true }))
    const persisted = nativeDeferred<void>()
    const store = makeInspectionStorage(join(root, "inspection"), { retentionMs: 86400000, storageBytes: 1048576 })
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
      inspectionPersistence: {
        write: (record, encoded, publication) =>
          store.write(record, encoded, publication).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                if (record.fact.kind === "evaluation-route" && record.fact.route === "cached") persisted.resolve()
              })
            )
          )
      }
    })
    const dispatch: ResidentDispatchContext = {
      statePath: join(root, "consent"),
      userConfigPath: join(root, "absent-user.jsonc"),
      credential: null,
      controlled: {
        answers: Object.fromEntries(configuredRules.map((rule) => [rule.id, { _tag: "Probability", probability: 0 }]))
      }
    }
    for (const tool_use_id of ["first", "repeat"]) {
      const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root, ["type.ts"], { tool_use_id })))
      if (!observation) throw new Error("missing observation")
      expect(Effect.runSync(server.admit(observation, dispatch)).status).toBe("accepted")
      await Effect.runPromise(server.whenIdle())
    }
    await persisted.promise
    const { records } = await Effect.runPromise(store.snapshot())
    const routes = records.filter((record) => record.fact.kind === "evaluation-route")
    expect(routes.map((record) => (record.fact.kind === "evaluation-route" ? record.fact.route : null))).toEqual([
      "fresh",
      "cached"
    ])
    expect(routes[0]?.correlation.receiptId).not.toBe(routes[1]?.correlation.receiptId)
    expect(routes[0]?.correlation.evaluationId).toBe(routes[1]?.correlation.evaluationId)
    expect(routes[1]?.fact).toMatchObject({
      original: { status: "linked", evaluationId: routes[0]?.correlation.evaluationId }
    })
    const invoked = records.filter((record) => record.fact.kind === "model-input")
    expect(invoked).toHaveLength(1)
    expect(invoked[0]?.correlation.evaluationId).toBe(routes[0]?.correlation.evaluationId)
    expect(records.filter((record) => record.fact.kind === "evaluation-outcome").map((record) => record.fact)).toEqual([
      { kind: "evaluation-outcome", outcome: "clear" }
    ])
  })

  it("captures valid obsolete-lifetime ingress and its refusal without admitting review work", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    await writeFile(join(root, ".hapsland.jsonc"), JSON.stringify({ version: 1, sessionInspection: true }))
    const stored = nativeDeferred<void>()
    const history = makeInspectionStorage(join(root, "inspection"), { retentionMs: 86400000, storageBytes: 1048576 })
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
      inspectionPersistence: {
        write: (record, encoded, publication) =>
          history.write(record, encoded, publication).pipe(
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
    const { records } = await Effect.runPromise(history.snapshot())
    expect(records.map((record) => record.fact)).toEqual([
      { kind: "recording-state", state: "enabled" },
      { kind: "source-registration" },
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
    expect((await Effect.runPromise(store.snapshot())).records).toEqual([])
  })
  it("records actual admitted edit metadata without patch source or credentials and refreshes opt-out", async () => {
    const root = await makeGitFixture()
    await put(root, "type.ts", "type OrderCount = number\n")
    const config = join(root, ".hapsland.jsonc")
    await writeFile(config, JSON.stringify({ version: 1, sessionInspection: true }))
    const stored = nativeDeferred<void>()
    const prepared = nativeDeferred<void>()
    const evaluated = nativeDeferred<void>()
    const retired = nativeDeferred<void>()
    const store = makeInspectionStorage(join(root, "inspection"), { retentionMs: 86400000, storageBytes: 1048576 })
    const readOnce = () => Effect.runPromise(store.snapshot())
    const readHistory = async () => {
      let saved: Awaited<ReturnType<typeof readOnce>> | undefined
      // Review completion does not drain the independent journal writer. Retry
      // only this fixture's read; persistence and every fact assertion stay real.
      await expect
        .poll(
          async () => {
            saved = await readOnce().catch(() => undefined)
            return saved !== undefined
          },
          { timeout: 2000 }
        )
        .toBe(true)
      if (saved === undefined) throw new Error("inspection journal never became readable")
      return saved
    }
    const server = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
      inspectionPersistence: {
        write: (record, encoded, publication) =>
          store.write(record, encoded, publication).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                if (record.fact.kind === "edit-admission") stored.resolve()
                if (record.fact.kind === "unit-prepared") prepared.resolve()
                if (record.fact.kind === "finding-fate" && record.fact.fate === "retained") evaluated.resolve()
                if (
                  record.fact.kind === "finding-fate" &&
                  record.fact.fate === "discarded" &&
                  record.fact.reason === "publication-retired"
                )
                  retired.resolve()
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
    await Effect.runPromise(server.whenIdle())
    const { records } = await readHistory()
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
    const { records: preparedRecords } = await readHistory()
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
    const retained = preparedRecords.find((record) => record.fact.kind === "finding-fate")
    expect(retained?.fact).toMatchObject({
      fate: "retained",
      reason: "pending-advice",
      payload: { status: "available" }
    })
    await put(root, "type.ts", "type OrderCount = string;\n")
    await Effect.runPromise(server.collect(root, advicee(), dispatch))
    await retired.promise
    expect(await Effect.runPromise(server.pendingAdviceMetadata())).toHaveLength(0)
    const { records: retiredRecords } = await readHistory()
    const stale = retiredRecords.find((record) => record.fact.kind === "finding-fate" && record.fact.fate === "stale")
    expect(stale?.fact).toMatchObject({ fate: "stale", reason: "resident-stale" })
    if (stale?.fact.kind !== "finding-fate" || retained?.fact.kind !== "finding-fate")
      throw new Error("missing fate evidence")
    expect(stale.fact.adviceId).toBe(retained.fact.adviceId)
    expect(stale.fact.payload).toEqual(retained.fact.payload)
    expect(stale.correlation.evaluationId).toBe(retained.correlation.evaluationId)
    expect(retiredRecords.filter((record) => record.fact.kind === "model-input")).toHaveLength(1)
    await writeFile(config, JSON.stringify({ version: 1, sessionInspection: false }))
    Effect.runSync(server.admit(observation, dispatch))
    await Effect.runPromise(server.whenIdle())
    await Effect.runPromise(server.close)
    const { records: history } = await readHistory()
    expect(history.filter((record) => record.fact.kind === "edit-received")).toHaveLength(1)
  })
})
