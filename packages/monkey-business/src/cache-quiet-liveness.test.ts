import { expect, it } from "vitest"
import { createRun, restoreReplay } from "./index.ts"

it.each(["finding", "clear"] as const)(
  "keeps cache and quiet-window progress after a %s Jev result",
  (outcome) => {
    const run = createRun({
      seed: 7,
      outcome,
      jevDelay: 50,
      lifecycles: { collectors: { capacity: 64 }, reuse: { entryLimit: 4, byteLimit: 32768 }, quietWindowMs: 60000 },
      session: {
        agent: "agent-1",
        seed: 7,
        editIntervalMs: 100,
        variationMs: 15,
        editsPerTask: 5,
        taskPauseMs: 500,
        adviceResponse: "ignore",
        repairDelayMs: 300,
        editDurationMs: 1,
        bytes: 100
      }
    })
    run.advance({ untilTime: 2000, maxEvents: 1000 })
    const events = run.observations.map((frame) => frame.event.kind)
    expect(events).toContain("jevRequestSettled")
    expect(events).toContain("cachePrepare")
    expect(events).toContain("cacheCommit")
    expect(events).toContain("quietRoundTick")
    expect(run.now).toBeGreaterThan(158)
    const restored = restoreReplay(JSON.parse(JSON.stringify(run.exportReplay())))
    expect(restored.observe()).toEqual(run.observe())
    for (const candidate of [run, restored]) candidate.advance({ untilTime: 3000, maxEvents: 1000 })
    expect(restored.observe()).toEqual(run.observe())
    expect(run.now).toBeGreaterThan(2000)
  },
  60000
)
