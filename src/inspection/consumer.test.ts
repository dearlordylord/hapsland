import { request } from "node:http"
import { join } from "node:path"
import { writeFile } from "node:fs/promises"
import { Effect, Scope, Exit } from "effect"
import { expect, it } from "vitest"
import { makeInspectionHttpServer } from "./http.ts"
import { inspectionSourceId, type InspectionRecord } from "./contract.ts"
import { makeInspectionStorage } from "./storage.ts"
import { acquireResidentFixture } from "../resident/runtime-fixture.ts"
import { residentPaths } from "../resident/paths.ts"
import { adaptCodexDirectEvent } from "../direct-event/adapter.ts"
import { addEvent, makeGitFixture, put } from "../direct-event/test-fixtures.ts"
import { configuredRules, connectDefaultRuleFixture } from "../test-support/default-rules.ts"
import { nativeDeferred } from "../test-support/native-deferred.ts"

it("disconnects a stalled public feed while real resident reviews and persistence continue", async () => {
  const root = await makeGitFixture()
  await writeFile(
    join(root, ".hapsland.jsonc"),
    JSON.stringify({ version: 1, rules: connectDefaultRuleFixture(root), sessionInspection: true })
  )
  const history = makeInspectionStorage(join(root, "inspection"), { retentionMs: 86400000, storageBytes: 1048576 })
  const published = nativeDeferred<void>()
  const resident = await acquireResidentFixture(residentPaths(join(root, "runtime")), undefined, {
    inspectionPersistence: {
      write: (record, encoded, publication) =>
        history.write(record, encoded, publication).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              if (record.fact.kind === "evaluation-outcome") published.resolve()
            })
          )
        )
    }
  })
  // Saturation data is only transport load. Review/persistence evidence comes from the real resident below.
  const fill: InspectionRecord[] = Array.from({ length: 24 }, (_, index) => ({
    version: 1,
    source: {
      id: inspectionSourceId("/load/endpoint.json", "load"),
      endpoint: "/load/endpoint.json",
      lifetime: "load"
    },
    sequence: index + 1,
    capturedAt: 0,
    consentEpoch: 1,
    scope: { root: "/load", runtime: null, runtimeVersion: null, sessionId: null, subagentId: null },
    correlation: {},
    fact: {
      kind: "edit-received",
      candidates: Array.from({ length: 8 }, () => ({ operation: "update" as const, path: "x".repeat(7200) }))
    }
  }))
  const scope = await Effect.runPromise(Scope.make())
  let call: ReturnType<typeof request> | undefined
  try {
    const server = await Effect.runPromise(
      makeInspectionHttpServer({
        snapshot: () =>
          history.snapshot().pipe(Effect.map((journal) => ({ ...journal, records: [...fill, ...journal.records] })))
      }).pipe(Effect.provideService(Scope.Scope, scope))
    )
    const initial = (await (await fetch(`${server.url}snapshot`)).json()) as { watermark: { cursor: string } }
    const response = await new Promise<import("node:http").IncomingMessage>((resolve, reject) => {
      call = request(`${server.url}events`, { headers: { "last-event-id": initial.watermark.cursor } }, (message) => {
        message.pause()
        resolve(message)
      })
      call.on("error", reject)
      call.end()
    })
    expect(response.headers["x-inspection-replay"]).toBe("Send Last-Event-ID or cursor to resume retained history")
    const closed = new Promise<void>((resolve) => {
      response.once("close", resolve)
      response.on("error", () => {})
    })
    await put(root, "type.ts", "type OrderCount = number\n")
    const observation = await Effect.runPromise(adaptCodexDirectEvent(addEvent(root)))
    if (!observation) throw new Error("missing observation")
    expect(
      (
        await Effect.runPromise(
          resident.admit(observation, {
            statePath: join(root, "consent"),
            userConfigPath: join(root, "absent-user"),
            credential: null,
            controlled: {
              answers: Object.fromEntries(
                configuredRules.map((rule) => [rule.id, { _tag: "Probability" as const, probability: 0 }])
              )
            }
          })
        )
      ).status
    ).toBe("accepted")
    await published.promise
    await Effect.runPromise(resident.whenIdle())
    // SSE polling can own the non-waiting journal lock. Unavailability is a truthful
    // snapshot response, so wait finitely for a readable snapshot rather than treating it as records.
    let live: { records: InspectionRecord[] } | undefined
    for (let attempt = 0; attempt < 100; attempt++) {
      const value = (await (await fetch(`${server.url}snapshot`)).json()) as
        | { records: InspectionRecord[] }
        | { status: "unavailable" }
      if ("records" in value) {
        live = value
        break
      }
      expect(value.status).toBe("unavailable")
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    if (live === undefined) throw new Error("persisted history remained unavailable")
    expect(live.records.some((record) => record.fact.kind === "evaluation-outcome" && record.scope.root === root)).toBe(
      true
    )
    // Keep the peer's readable side paused long enough for TCP backpressure and the production drain deadline.
    await new Promise((resolve) => setTimeout(resolve, 12000))
    response.resume()
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("stalled feed did not close")), 3000)
      void closed.then(() => {
        clearTimeout(timer)
        resolve()
      })
    })
    const recovered = await fetch(`${server.url}events`, { headers: { "last-event-id": initial.watermark.cursor } })
    const reader = recovered.body!.getReader()
    let event = ""
    const decoder = new TextDecoder()
    while (!event.includes("\n\n")) {
      const chunk = await reader.read()
      if (chunk.done) throw new Error("recovery ended before a complete event")
      event += decoder.decode(chunk.value, { stream: true })
      if (Buffer.byteLength(event) > 1048576 + 16384) throw new Error("recovery exceeded stream bound")
    }
    expect(event).toContain('"evaluation-outcome"')
    await reader.cancel()
  } finally {
    call?.destroy()
    await Effect.runPromise(resident.close)
    await Effect.runPromise(Scope.close(scope, Exit.void))
  }
}, 20000)
