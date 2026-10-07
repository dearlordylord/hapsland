import type { ServerResponse } from "node:http"

export const MAX_INSPECTION_DRAIN_MS = 5000

/** Inspector-only response lifetime: a stalled socket holds no journal lock or review permit. */
export const watchInspectionConsumer = (response: ServerResponse): void => {
  let blockedAt: number | undefined
  const drained = () => {
    blockedAt = undefined
  }
  const timer = setInterval(() => {
    if (!response.writableNeedDrain) {
      blockedAt = undefined
      return
    }
    const now = performance.now()
    if (blockedAt === undefined) blockedAt = now
    else if (now - blockedAt >= MAX_INSPECTION_DRAIN_MS) response.destroy()
  }, 100)
  timer.unref()
  const cleanup = () => {
    clearInterval(timer)
    response.removeListener("drain", drained)
    response.removeListener("close", cleanup)
    response.removeListener("finish", cleanup)
  }
  response.on("drain", drained)
  response.once("close", cleanup)
  response.once("finish", cleanup)
}
