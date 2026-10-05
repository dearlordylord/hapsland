import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { makeInspectionHttpServer } from "../inspection/http.ts"
import { makeInspectionStorage } from "../inspection/storage.ts"
import type { InspectionRecord } from "../inspection/contract.ts"
import {
  setupInstalledPi,
  cleanupInstalledPi,
  cleanupPiFixtures,
  fixture,
  before,
  result
} from "../test-support/pi-installed.ts"

describe("Pi native extension inspection through production command and public feed", () => {
  const stateHome = realpathSync(mkdtempSync(join(tmpdir(), "hapsland-pi-inspection-")))
  beforeAll(() => setupInstalledPi("source"))
  afterEach(cleanupPiFixtures)
  afterAll(() => {
    cleanupInstalledPi()
    rmSync(stateHome, { recursive: true, force: true })
  })

  it("retains the exact native offer and resident ACK without asserting native acceptance", async () => {
    const f = fixture(true, {}, { env: { XDG_STATE_HOME: stateHome } })
    const context = { ...f.context, cwd: realpathSync(f.root) }
    writeFileSync(join(f.root, "user.json"), JSON.stringify({ version: 1, sessionInspection: true }))
    writeFileSync(join(f.root, "backend.gate"), "release\n")
    await f.prepareResident()
    await f.call("tool_call", before, context)
    writeFileSync(join(f.root, "type.ts"), "type OrderCount = number\n")
    const editOutput = await f.call("tool_result", result, context)
    const finishOutput = await f.call(
      "agent_before_settle",
      { entries: [], continue: false, context: { canContinue: true }, outcome: "completed" },
      context
    )
    const output = editOutput ?? finishOutput
    expect(output).toBeDefined()
    const history = makeInspectionStorage(join(stateHome, "hapsland", "inspection"), {
      retentionMs: 86400000,
      storageBytes: 134217728
    })
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const server = yield* makeInspectionHttpServer(history)
          yield* Effect.promise(async () => {
            let records: InspectionRecord[] = []
            await expect
              .poll(
                async () => {
                  const response = await fetch(`${server.url}snapshot`)
                  const snapshot = (await response.json()) as { records?: InspectionRecord[] }
                  records = snapshot.records ?? []
                  return records.filter((r) => r.fact.kind === "writer-evidence" && r.fact.state === "acknowledged")
                    .length
                },
                { timeout: 5000, interval: 200 }
              )
              .toBe(1)
            const writers = records.filter((r) => r.fact.kind === "writer-evidence")
            expect(writers.map((r) => (r.fact.kind === "writer-evidence" ? r.fact.state : ""))).toEqual([
              "ready",
              "authorized",
              "write-started",
              "uncertain",
              "acknowledged"
            ])
            expect(writers.every((r) => r.scope.runtime === "pi" && r.scope.sessionId === "pi-boundary-session")).toBe(
              true
            )
            expect(new Set(writers.map((r) => r.correlation.attemptId)).size).toBe(1)
            for (const record of writers) {
              if (record.fact.kind !== "writer-evidence") continue
              expect(record.fact.findingIds.length).toBeGreaterThan(0)
              expect(record.fact.evaluations.length).toBeGreaterThan(0)
              expect(record.fact.output).toBeDefined()
            }
            const exact = writers.find((r) => r.fact.kind === "writer-evidence" && r.fact.state === "uncertain")!
            if (exact.fact.kind === "writer-evidence" && exact.fact.output.status === "available")
              expect(Buffer.from(exact.fact.output.encoded, "base64").toString("utf8")).toBe(JSON.stringify(output))
          })
        })
      )
    )
  }, 20000)
})
