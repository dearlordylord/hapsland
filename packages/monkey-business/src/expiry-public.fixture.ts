import { createRun, type RunInput } from "./index.ts"

// Clock observations supply only elapsed time. They do not prescribe notice
// expiry, reservation release, or collection outcomes.
export const expiryTicks = (times: readonly number[]): RunInput[] =>
  times.map((at) => ({ at, kind: "canonical", event: { kind: "collectionExpiryCheck", elapsed: 0, lifetime: 1 } }))
export const collectNotice = (run: ReturnType<typeof createRun>, partition: number) => {
  run.applyControl({ kind: "noticeCollect", partition, group: 7, composed: false, authorityBound: false, allowed: [] })
  run.advance({ untilTime: run.now, maxEvents: 100 })
  return run.observations.findLast((frame) => frame.event.kind === "noticeSelect")?.commands
}
export const reportNotice = (run: ReturnType<typeof createRun>, partition: number, key: number) => {
  run.applyControl({ kind: "noticeFailure", target: { partition, group: 7, key }, diagnostic: "backend" })
  run.advance({ untilTime: run.now, maxEvents: 100 })
}
export const makeExpiryRun = (times: readonly number[], pendingMs: number, cooldownMs: number) => {
  const run = createRun({
    sessions: [{ agent: "first" }, { agent: "second" }],
    expiryProfile: { pendingMs, leaseMs: 2, cooldownMs },
    inputs: expiryTicks(times)
  })
  run.applyControl({ kind: "suspendArrivals", suspended: true })
  run.advance({ untilTime: 0, maxEvents: 100 })
  return run
}
