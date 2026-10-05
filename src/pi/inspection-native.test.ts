import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { unlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { makeInspectionHttpServer } from "../inspection/http.ts"
import { configuredRules } from "../policy/rules.ts"
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

  it.each(["edit", "finish", "oversized", "unavailable", "lost-ack", "session-switch", "opt-out"] as const)(
    "retains truthful %s native offer evidence",
    async (variant) => {
      const isolatedState = realpathSync(mkdtempSync(join(stateHome, "case-")))
      const ackGate = join(isolatedState, "ack-reply")
      const lostAck = variant === "lost-ack" || variant === "session-switch"
      const finish = variant !== "edit" && variant !== "opt-out"
      const f = fixture(
        true,
        {},
        {
          env: {
            XDG_STATE_HOME: isolatedState,
            ...(lostAck ? { REVIEW_RESIDENT_ACK_RESPONSE_GATE_PATH: ackGate } : {})
          }
        }
      )
      const context = { ...f.context, cwd: realpathSync(f.root) }
      writeFileSync(
        join(f.root, "user.json"),
        JSON.stringify({
          version: 1,
          sessionInspection: variant !== "opt-out",
          ruleOverrides: Object.fromEntries(configuredRules.map((rule, index) => [rule.id, { enabled: index === 0 }]))
        })
      )
      if (variant === "opt-out") writeFileSync(join(f.root, "backend.gate"), "release\n")
      if (lostAck) writeFileSync(`${ackGate}.enabled`, "enabled\n")
      await f.prepareResident()
      await f.call("tool_call", before, context)
      writeFileSync(join(f.root, "type.ts"), "type OrderCount = number\n")
      let editOutput = await f.call("tool_result", result, context)
      if (variant === "edit" && editOutput === undefined) {
        await f.waitForWork(1)
        writeFileSync(join(f.root, "backend.gate"), "release\n")
        await f.waitForAdvice()
        await unlink(join(f.root, "backend.gate"))
        editOutput = (await f.offerOnLaterEdits(context)).output
      }
      if (variant === "edit") {
        writeFileSync(join(f.root, "backend.gate"), "release\n")
        expect(editOutput?.content).toBeDefined()
      }
      let finishOutput
      if (finish || editOutput === undefined) {
        if (finish) {
          expect(editOutput).toBeUndefined()
          await f.waitForWork(1)
          writeFileSync(join(f.root, "backend.gate"), "release\n")
        }
        const pending = f.call(
          "agent_before_settle",
          {
            entries:
              variant === "oversized"
                ? [{ type: "custom_message", customType: "original", content: "λ".repeat(9000), display: false }]
                : variant === "unavailable"
                  ? [{ type: "custom_message", customType: "original", content: new Date(0), display: false }]
                  : [],
            continue: false,
            context: { canContinue: true },
            outcome: "completed"
          },
          context
        )
        if (variant === "session-switch") {
          await expect.poll(() => existsSync(`${ackGate}.entered`), { timeout: 5000, interval: 20 }).toBe(true)
          await f.call("session_before_switch", {}, context)
        }
        finishOutput = await pending
      }
      const output = editOutput ?? finishOutput
      if (variant === "session-switch") expect(output).toBeUndefined()
      else expect(output).toBeDefined()
      if (lostAck) expect(existsSync(`${ackGate}.entered`)).toBe(true)
      const history = makeInspectionStorage(join(isolatedState, "hapsland", "inspection"), {
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
                    if (variant === "opt-out") return snapshot.records === undefined ? -1 : records.length
                    return records.filter(
                      (r) =>
                        r.fact.kind === "writer-evidence" && r.fact.state === (lostAck ? "uncertain" : "acknowledged")
                    ).length
                  },
                  { timeout: 5000, interval: 200 }
                )
                .toBe(variant === "opt-out" ? 0 : 1)
              if (variant === "opt-out") return
              const writers = records.filter((r) => r.fact.kind === "writer-evidence")
              expect(writers.map((r) => (r.fact.kind === "writer-evidence" ? r.fact.state : ""))).toEqual([
                "ready",
                "authorized",
                "write-started",
                "uncertain",
                ...(lostAck ? [] : ["acknowledged"])
              ])
              expect(
                writers.every((r) => r.scope.runtime === "pi" && r.scope.sessionId === "pi-boundary-session")
              ).toBe(true)
              expect(new Set(writers.map((r) => r.correlation.attemptId)).size).toBe(1)
              for (const record of writers) {
                if (record.fact.kind !== "writer-evidence") continue
                expect(record.fact.findingIds.length).toBeGreaterThan(0)
                expect(record.fact.evaluations.length).toBeGreaterThan(0)
                expect(record.fact.output).toBeDefined()
              }
              const exact = writers.find((r) => r.fact.kind === "writer-evidence" && r.fact.state === "uncertain")!
              expect(exact.fact.kind).toBe("writer-evidence")
              if (exact.fact.kind !== "writer-evidence") throw new Error("missing writer evidence")
              if (variant === "oversized") expect(exact.fact.output).toEqual({ status: "missing", reason: "oversized" })
              else if (variant === "unavailable") {
                expect(exact.fact.output).toEqual({ status: "missing", reason: "unavailable" })
                expect(output.entries[0].content).toBeInstanceOf(Date)
              } else {
                expect(exact.fact.output.status).toBe("available")
                if (exact.fact.output.status !== "available") throw new Error("missing native output")
                if (variant !== "session-switch")
                  expect(Buffer.from(exact.fact.output.encoded, "base64").toString("utf8")).toBe(JSON.stringify(output))
                else
                  expect(
                    JSON.parse(Buffer.from(exact.fact.output.encoded, "base64").toString("utf8")).entries[0].customType
                  ).toBe("hapsland")
              }
            })
          })
        )
      )
    },
    20000
  )
})
