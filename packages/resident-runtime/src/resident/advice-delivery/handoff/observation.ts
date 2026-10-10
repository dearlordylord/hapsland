import { type DirectObservation } from "@hapsland/native-observation/direct-event/observation"
import { captureInspectionFate } from "@hapsland/review-execution/inspection/capture"
import { MAX_INSPECTION_MESSAGE_BYTES } from "@hapsland/inspection-records/inspection/contract"
import { type Finding } from "@hapsland/delivery-output/direct-event/output"
import type { Advice, AdviceContent } from "../../state/advice-records.ts"
import { type ResidentResponse } from "@hapsland/resident-transport/resident/protocol"
import { type HandoffRequest } from "../authority.ts"
import { type Dependencies } from "./context.ts"

const inspectionMessageOwner = (
  deps: Pick<Dependencies, "inspection">,
  request: HandoffRequest,
  handoff: ReadonlyArray<Advice>
): { root: string; advicee: DirectObservation["advicee"] } | undefined => {
  const owner = handoff[0]?.observation ?? (request.operation === "admit-and-collect" ? request.observation : request)
  if (!("root" in owner) || !("advicee" in owner) || !deps.inspection.isEnabled(owner.root)) return undefined
  return owner
}

export const inspectionObserveHandoffMessage = (
  deps: Pick<Dependencies, "inspection" | "residentInspection">,
  request: HandoffRequest,
  finalResponse: ResidentResponse,
  findings: ReadonlyArray<Finding>,
  finalContents: ReadonlyArray<AdviceContent>,
  handoff: ReadonlyArray<Advice>
): void => {
  if (finalResponse.status !== "advice") return
  const messageOwner = inspectionMessageOwner(deps, request, handoff)
  if (messageOwner === undefined) return
  const payload = captureInspectionFate(findings, "retained", "pending-advice").payload
  if (payload.status === "available") {
    const text =
      "hookSpecificOutput" in finalResponse.output
        ? finalResponse.output.hookSpecificOutput.additionalContext
        : finalResponse.output.reason
    deps.inspection.offer(
      {
        root: messageOwner.root,
        runtime: messageOwner.advicee.host,
        runtimeVersion: messageOwner.advicee.hostVersion,
        sessionId: messageOwner.advicee.sessionId,
        subagentId: messageOwner.advicee.subagentId
      },
      { batchId: finalResponse.token },
      {
        kind: "agent-message",
        findingIds: payload.findingIds,
        recipient: { turnId: messageOwner.advicee.turnId, toolUseId: messageOwner.advicee.toolUseId },
        evaluations: finalContents.flatMap((content, index) => {
          if (!content.delivery?.findings.length) return []
          const advice = handoff[index]!
          const evaluationId = deps.residentInspection.evaluationId(advice.evaluationKey)
          return [
            { semanticIdentity: advice.prepared.identity, ...(evaluationId === undefined ? {} : { evaluationId }) }
          ]
        }),
        message:
          Buffer.byteLength(text, "utf8") <= MAX_INSPECTION_MESSAGE_BYTES
            ? { status: "available", text }
            : { status: "missing", reason: "oversized" }
      }
    )
  }
}
