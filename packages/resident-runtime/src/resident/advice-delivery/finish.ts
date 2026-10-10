import type { ResidentLedger } from "../work-ownership/jobs.ts"
import type { RoundWork } from "../state/round-records.ts"
import * as Effect from "effect/Effect"
import { type ResidentResponse } from "@hapsland/resident-transport/resident/protocol"

type Dependencies = { readonly residentLedger: ResidentLedger }

export const residentFindingResponse = (
  response: ResidentResponse
): response is Extract<ResidentResponse, { status: "advice" }> =>
  response.status === "advice" && response.findingCount > 0

export const residentNoticeResponse = (response: ResidentResponse): boolean =>
  response.status === "advice" && response.findingCount === 0

export const residentResponseToken = (response: ResidentResponse): string =>
  response.status === "advice" ? response.token : ""

const residentPendingBindingCount = (
  pending: ReadonlyArray<{ readonly operation: number; readonly count: number }>,
  operation: number
): number => pending.find((item) => item.operation === operation)?.count ?? 0

export const residentFinishBindingValid = (
  deps: Dependencies,
  response: ResidentResponse,
  round: RoundWork | undefined,
  count: number,
  selected: ReadonlyArray<Effect.Success<ReturnType<typeof deps.residentLedger.advice.snapshots>>[number]>,
  pending: ReadonlyArray<{ readonly operation: number; readonly count: number }>
): boolean => {
  if (response.status !== "advice" || response.findingCount === 0) return true
  return (
    round !== undefined &&
    count === response.findingCount &&
    selected.every(
      ({ capability: advice, content }) =>
        advice.round === round &&
        advice.workUnitId !== undefined &&
        content.delivery !== undefined &&
        content.delivery.findings.length <= residentPendingBindingCount(pending, advice.canonicalOperationId)
    )
  )
}

export const residentFinishSelection = Effect.fn("ResidentRuntime.finishSelection")(function* (
  deps: Dependencies,
  response: ResidentResponse
) {
  const advice =
    response.status === "advice"
      ? (yield* deps.residentLedger.advice.snapshots()).filter(
          ({ content }) => content.delivery?.token === response.token
        )
      : []
  const selected = advice.map(({ capability: item, content }) => ({
    id: item.id,
    unit: item.canonicalOperationId,
    findings: content.delivery?.findings ?? []
  }))
  const count = selected.reduce((count, item) => count + item.findings.length, 0)
  return { advice, selected, count }
})
