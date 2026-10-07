import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { unlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { makeInspectionHttpServer } from "@hapsland/administration/inspection/http"
import { connectDefaultRuleFixture } from "@hapsland/build-tooling/test-support/default-rules"
import { makeInspectionStorage } from "@hapsland/inspection-records/inspection/storage"
import type { InspectionRecord } from "@hapsland/inspection-records/inspection/contract"
import {
  setupInstalledPi,
  cleanupInstalledPi,
  cleanupPiFixtures,
  fixture,
  before,
  result
} from "@hapsland/build-tooling/test-support/pi-installed"

describe("Pi native extension inspection through production command and public feed", () => {
  const stateHome = realpathSync(mkdtempSync(join(tmpdir(), "hapsland-pi-inspection-")))
  beforeAll(() => setupInstalledPi("installed"), 240_000)
  afterEach(cleanupPiFixtures)
  afterAll(() => {
    cleanupInstalledPi()
    rmSync(stateHome, { recursive: true, force: true })
  })

  it.each(["edit", "finish", "oversized", "unavailable", "lost-ack", "session-switch", "opt-out"] as const)(
    "retains the resident message for %s native delivery",
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
      const rulePaths = connectDefaultRuleFixture(f.root)
      writeFileSync(join(f.root, ".hapsland.jsonc"), JSON.stringify({ version: 1, rules: [rulePaths[0]] }))
      writeFileSync(join(f.root, "user.json"), JSON.stringify({ version: 1, sessionInspection: variant !== "opt-out" }))
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
                    return records.filter((r) => r.fact.kind === "agent-message").length
                  },
                  { timeout: 5000, interval: 200 }
                )
                .toBe(variant === "opt-out" ? 0 : 1)
              if (variant === "opt-out") return
              const messages = records.filter((r) => r.fact.kind === "agent-message")
              expect(messages).toHaveLength(1)
              const message = messages[0]!
              if (message.fact.kind !== "agent-message") throw new Error("missing resident message")
              expect(message.scope.runtime).toBe("pi")
              expect(message.scope.sessionId).toBe("pi-boundary-session")
              expect(message.fact.findingIds.length).toBeGreaterThan(0)
              expect(message.fact.evaluations.length).toBeGreaterThan(0)
              expect(message.fact.message).toMatchObject({ status: "available" })
              if (message.fact.message.status === "available") expect(message.fact.message.text).toContain("Hapsland")
              // Native output variants do not affect resident-owned message capture.
              if (variant === "unavailable") expect(output.entries[0].content).toBeInstanceOf(Date)
            })
          })
        )
      )
    },
    20000
  )
})
