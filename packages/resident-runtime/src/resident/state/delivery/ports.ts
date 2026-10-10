import type { CompletedEditReason } from "@hapsland/canonical-policy/canonical/adapter"
import {
  type AdmissionProjection,
  type Round,
  type PermitTransition,
  type StopRecord,
  type DeliverySurface,
  type Submission
} from "./model.ts"

export type DeliveryPorts = {
  submissionTokenId: (token: string) => number
  expire: (now: number) => void
  isActive: (partition: string, generation?: number) => boolean
  release: (token: string) => void
  markUncertain: (token: string) => boolean
  advance: (partition: string, marker: string, now: number, _promptDigest?: string) => boolean
  bendTime: (ms: number) => number
  bendUpperTime: (ms: number) => number
  dropTool: (key: string) => void
  finishPermit: (key: string, reason: CompletedEditReason) => void
  releaseCompletedPermit: (partition: string, key: string, permit: { readonly token: number }) => void
  expirePermits: (now?: number) => void
  repeatPending: (key: string) => void
  checkCompleted: (key: string) => boolean
  toolId: (key: string) => number
  releaseAdmissionPermit: (partition: string, token: number) => void
  nextAdmissionRound: (admission: AdmissionProjection | undefined) => number
  startRound: (partition: string, quietMs: number) => Round
  readGeneration: (partition: string) => number
  continuationCount: (partition: string, round?: number) => number
  isDeciding: (partition: string) => boolean
  canonicalCommandAccepted: (result: PermitTransition, expected: PermitTransition["outputs"][number]["kind"]) => boolean
  currentStop: (partition: string, token: string) => StopRecord | undefined
  submissionAdviceId: (adviceId: string) => number
  stageSubmission: (
    adviceId: string,
    partition: string,
    token: string,
    findings: ReadonlyArray<unknown>,
    surface: DeliverySurface,
    now: number,
    status: "reserved" | "authorized",
    unit?: number
  ) => Submission | undefined
  fingerprintId: (adviceId: string, digest: string) => number
  revokeProvisionalFinishOutput: (partition: string, attempt: string, outputToken: string) => boolean
  forget: (adviceId: string) => void
  releaseBackground: (partition: string, token: string) => void
  stopBarrier: (partition: string) => boolean
}
