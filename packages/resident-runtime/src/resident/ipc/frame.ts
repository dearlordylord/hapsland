import {
  type UpdateRecipient,
  type ResidentRequest,
  type ResidentResponse
} from "@hapsland/resident-transport/resident/protocol"
import { type SocketFrame } from "@hapsland/resident-transport/resident/socket-frame"
import { decodeCurrentResidentFrame } from "@hapsland/resident-transport/resident/protocol"

type ResidentFrameAdmission =
  | { readonly kind: "closed" }
  | { readonly kind: "incompatible"; readonly recipient: UpdateRecipient | undefined; readonly eligible: boolean }
  | { readonly kind: "response"; readonly response: ResidentResponse }
  | { readonly kind: "request"; readonly request: ResidentRequest }

export const classifyResidentFrame = (frame: SocketFrame): ResidentFrameAdmission => {
  if (frame._tag === "Closed") return { kind: "closed" }
  const message = frame._tag === "Frame" ? decodeCurrentResidentFrame(frame.encoded) : undefined
  if (message?.kind === "incompatible") {
    return { kind: "incompatible", recipient: message.recipient, eligible: message.eligible }
  }
  if (message?.kind !== "request") {
    return { kind: "response", response: { status: frame._tag === "Oversized" ? "rejected-capacity" : "unsupported" } }
  }
  return { kind: "request", request: message.request }
}
