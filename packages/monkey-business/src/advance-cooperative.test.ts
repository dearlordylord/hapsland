import { describe, expect, it } from "vitest"
import { createRun, type Run, type AdvanceOptions } from "./index.ts"

const snapshot = (run: Run) => ({
  observations: run.observations,
  observation: run.observe(),
  projection: run.projection,
  runtime: run.runtimeSnapshot(),
  queue: run.queuedFacts,
  replay: run.exportReplay()
})

const finishInTurns = async (iterator: Generator<void, unknown>, turnSizes: readonly number[]) => {
  let result = iterator.next()
  let turn = 0
  while (!result.done) {
    const steps = turnSizes[turn++ % turnSizes.length]!
    for (let step = 0; step < steps && !result.done; step++) result = iterator.next()
    await Promise.resolve()
  }
  return result.value
}

describe("cooperative Run advancement", () => {
  it.each([1, 6])("matches synchronous advancement for seed %i across yield schedules", async (seed) => {
    const config = {
      seed,
      inputs: [
        { at: 0, kind: "edit" as const, bytes: 10, unitBytes: [5] },
        { at: 30, kind: "edit" as const, bytes: 10, unitBytes: [5] }
      ]
    }
    const synchronous = createRun(config)
    const cooperative = createRun(config)
    const options: AdvanceOptions[] = [{ maxEvents: 1 }, { untilTime: 10 }, { untilTime: 50, maxEvents: 3 }, {}]
    const schedules = [[1], [3, 1], [2, 5, 1], [7]] as const

    for (let index = 0; index < options.length; index++) {
      const expected = synchronous.advance(options[index])
      const actual = await finishInTurns(cooperative.beginAdvance(options[index]), schedules[index]!)
      expect(actual).toEqual(expected)
      expect(snapshot(cooperative)).toEqual(snapshot(synchronous))
    }
  })

  it.each([1, 6])("preserves a bounded seed-7 run with %i agent sessions", async (agents) => {
    const config = {
      seed: 7,
      sessions: Array.from({ length: agents }, (_, index) => ({
        agent: `agent-${index + 1}`,
        seed: 7 + index,
        editIntervalMs: 10,
        variationMs: 0,
        editsPerTask: 1,
        taskPauseMs: 5,
        bytes: 10,
        unitBytes: [5]
      }))
    }
    const synchronous = createRun(config)
    const cooperative = createRun(config)
    expect(synchronous.observe().agentScopes).toHaveLength(agents)
    expect(cooperative.observe().agentScopes).toHaveLength(agents)

    const options = { untilTime: 500, maxEvents: 60 }
    const expected = synchronous.advance(options)
    const actual = await finishInTurns(cooperative.beginAdvance(options), [3, 1])
    expect(actual).toEqual(expected)
    expect(snapshot(cooperative)).toEqual(snapshot(synchronous))
  })

  it("yields after a metadata-only step and normalizes once at its time boundary", () => {
    const run = createRun({ session: { editIntervalMs: 100, variationMs: 0 }, inputs: [] })
    const advance = run.beginAdvance({ untilTime: 50 })

    expect(run.exportReplay().normalizations).toEqual([])
    const yielded = advance.next()
    expect(yielded.done).toBe(false)
    expect(run.eventCount).toBe(0)
    expect(run.queueTakeCount).toBeGreaterThan(0)
    expect(run.exportReplay().normalizations).toEqual([])

    expect(advance.next()).toEqual({ done: true, value: { reason: "timeLimit", events: 0, now: 0 } })
    expect(run.exportReplay().normalizations).toHaveLength(1)
  })

  it("validates options before mutation and leaves an unstarted iterator inert when closed", () => {
    const run = createRun()
    const before = snapshot(run)
    expect(() => run.beginAdvance({ maxEvents: -1 } as never)).toThrow()
    expect(() => run.beginAdvance({ untilTime: -1 } as never)).toThrow()
    expect(snapshot(run)).toEqual(before)

    const returned = run.beginAdvance()
    expect(returned.return({ reason: "idle", events: 0, now: run.now })).toEqual({
      done: true,
      value: { reason: "idle", events: 0, now: run.now }
    })
    expect(snapshot(run)).toEqual(before)

    const thrown = run.beginAdvance()
    const error = new Error("closed before start")
    expect(() => thrown.throw(error)).toThrow(error)
    expect(snapshot(run)).toEqual(before)
  })

  it("normalizes once when a suspended advance is returned or thrown into", () => {
    for (const close of ["return", "throw"] as const) {
      const run = createRun({ inputs: [{ at: 0, kind: "edit", bytes: 10, unitBytes: [5] }] })
      const advance = run.beginAdvance()
      expect(advance.next().done).toBe(false)
      expect(run.exportReplay().normalizations).toEqual([])

      if (close === "return") {
        advance.return({ reason: "idle", events: 0, now: run.now })
      } else {
        const error = new Error("closed after yield")
        try {
          advance.throw(error)
          throw new Error("expected iterator.throw to rethrow")
        } catch (caught) {
          expect(caught).toBe(error)
        }
      }

      expect(run.exportReplay().normalizations).toHaveLength(1)
      advance.next()
      expect(run.exportReplay().normalizations).toHaveLength(1)
    }
  })

  it("chooses idle after normalization removes the last queued fact", () => {
    const run = createRun({
      inputs: [{ at: 0, kind: "edit", bytes: 10, unitBytes: [5], outcome: "finding" }],
      preparationDelay: 2,
      jevDelay: 5
    })
    run.advance({ untilTime: 0 })
    const target = { partition: 1, lifetime: 1, round: 1, token: 51 }
    run.applyControl({
      kind: "backgroundWriter",
      action: "claim",
      agent: "agent-1",
      capture: {
        target,
        claimStarted: 0,
        claimLifetimeMs: 100,
        capacity: 2,
        response: { partition: 1, lifetime: 1, round: 1, started: 0, deadline: 30, admittedBlock: false }
      }
    })
    run.advance({ untilTime: 7 })
    run.applyControl({ kind: "backgroundWriter", action: "attempt", agent: "agent-1", target, currentBlock: false })
    run.advance()
    const background = run.observations.find(
      (frame) => frame.event.kind === "submissionBegin" && frame.event.surface === "background"
    )
    expect(background).toBeDefined()
    const terminal = run.observations.find(
      (frame) =>
        frame.event.kind === "submissionTerminal" &&
        background?.event.kind === "submissionBegin" &&
        frame.event.advice === background.event.advice &&
        frame.callbackReceipt
    )
    expect(terminal?.callbackReceipt).toBeDefined()
    expect(run.queuedFacts).toEqual([])

    run.applyControl({ kind: "callback", action: "duplicate", target: terminal!.callbackReceipt!.target })
    expect(run.queuedFacts).toHaveLength(1)
    const before = {
      events: run.eventCount,
      takes: run.queueTakeCount,
      normalizations: run.exportReplay().normalizations.length
    }
    expect(run.advance({ maxEvents: 0 })).toEqual({ reason: "idle", events: 0, now: run.now })
    expect(run.queuedFacts).toEqual([])
    expect(run.eventCount).toBe(before.events)
    expect(run.queueTakeCount).toBe(before.takes)
    expect(run.exportReplay().normalizations).toHaveLength(before.normalizations + 1)
  })
})
