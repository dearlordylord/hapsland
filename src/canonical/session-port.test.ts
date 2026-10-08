import { describe, expect, test } from "vitest"
import { fileURLToPath } from "node:url"
import { execFileSync } from "../../scripts/test-harness/process.mjs"
import {
  SessionGenerator,
  type SessionConfig,
  type SessionControl
} from "../../packages/monkey-business/src/session.ts"
import { SessionGenerator as Reference } from "../../packages/monkey-business/src/session-reference.fixture.ts"

describe("shared Bend session port", () => {
  test("generated module matches its source and generator", () => {
    execFileSync(process.execPath, [
      fileURLToPath(new URL("../../packages/monkey-business-bend/build-session.mjs", import.meta.url)),
      "--check"
    ])
  })
  test("preserves the independent pre-port stream across seeds, Unicode, controls and large clocks", () => {
    const agents = ["agent-1", "é", "a😀z", "𝌆", "a\u0000b"]
    const responses = ["ignore", "noAction", "promptRepair", "delayedRepair"] as const
    for (let seed = 0; seed < 40; seed++) {
      const config: SessionConfig = {
        seed: seed === 39 ? 0xffffffff : seed,
        agent: agents[seed % agents.length]!,
        editIntervalMs: seed % 3 === 0 ? 1_000_000_000 : seed + 1,
        variationMs: seed % 3 === 0 ? 1_000_000_000 : seed * 4,
        editsPerTask: 1 + (seed % 9),
        taskPauseMs: seed * 7,
        adviceResponse: responses[seed % 4]!,
        repairDelayMs: seed * 3,
        bytes: 123,
        unitBytes: [1, 2, 333]
      }
      const actual = new SessionGenerator(config),
        expected = new Reference(config)
      for (let step = 0; step < 120; step++) {
        const now = step % 19 === 0 ? Number.MAX_SAFE_INTEGER - 3 : step * 17
        let a, b
        if (step % 11 === 0) {
          a = actual.onFinish(now, step % 2 === 0)
          b = expected.onFinish(now, step % 2 === 0)
        } else if (step % 7 === 0) {
          a = actual.onAdvice(now)
          b = expected.onAdvice(now)
        } else if (step % 5 === 0) {
          const controls: SessionControl[] = [
            { kind: "editPace", intervalMs: step + 1 },
            { kind: "suspendArrivals", suspended: step % 2 === 0 },
            { kind: "burst", count: 3 },
            { kind: "sizes", reservationBytes: 900, reviewUnitBytes: [] }
          ]
          const control = controls[(step / 5) % 4]!
          a = actual.apply(control, now)
          b = expected.apply(control, now)
        } else {
          a = actual.next(now)
          b = expected.next(now)
        }
        expect(a).toEqual(b)
        for (const input of a) expect(actual.valid(input)).toBe(expected.valid(input))
        expect(actual.valid({ generation: 1, recurring: true })).toBe(
          expected.valid({ generation: 1, recurring: true })
        )
      }
    }
  })
})
