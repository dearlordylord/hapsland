import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { expect, it } from "vitest"
import { createRun, restoreReplay } from "./index.ts"

it("agrees with native Bend on ordinary, refused and wide-Nat public round boundaries", () => {
  const native = spawnSync("bend", [fileURLToPath(new URL("../conformance/round-boundary.bend", import.meta.url))], {
    encoding: "utf8",
    timeout: 5000
  })
  expect(native.error).toBeUndefined()
  expect(native.status, native.stdout + native.stderr).toBe(0)
  const expected = [0, 1, 1, 1]
  expect(native.stdout.trim()).toBe("[0n, 1n, 1n, 1n]")
  const observed = [0, 1, 2 ** 32 + 17, 2 ** 48 - 1].map((partition) => {
    const inputs = partition === 0 ? [1, 1] : [partition]
    const run = createRun({
      inputs: inputs.map((partition) => ({
        at: 0,
        kind: "canonical" as const,
        event: { kind: "openRound" as const, partition, lifetime: 1 }
      }))
    })
    run.advance({ maxEvents: 2 })
    expect(restoreReplay(run.exportReplay()).observe()).toEqual(run.observe())
    const command = run.observe().observations.at(-1)?.outputs[0]
    return command?.kind === "roundStarted" ? command.id : 0
  })
  expect(observed).toEqual(expected)
})
