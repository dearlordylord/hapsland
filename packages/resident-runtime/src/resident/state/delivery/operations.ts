import { type RepeatEditDiagnostic, type DeliveryDraft } from "./model.ts"
import { bendTime, bendUpperTime } from "./clock.ts"
import type { CapacityLedger } from "../capacity/operations.ts"
import { deliveryBackground } from "./background.ts"
import { deliveryRoundStart } from "./round-start.ts"
import { deliveryEditIdentity } from "./edit-identity.ts"

import { deliveryPermitRegistration } from "./permit-registration.ts"
import { deliveryEditAdmission } from "./edit-admission.ts"
import { deliveryStopGate } from "./stop-gate.ts"
import { deliveryFinishOutput } from "./finish-output.ts"
import { deliveryRoundClosure } from "./round-closure.ts"
import { deliverySubmissionPolicy } from "./submission-policy.ts"
import { deliverySubmission } from "./submission.ts"
import { deliverySubmissionRelease } from "./submission-release.ts"
import { deliveryExpiry } from "./expiry.ts"
import { deliveryView } from "./view.ts"

/** Operations share one draft. Factories are inert: dependency callbacks run only after
 * assembly, inside the owning transaction, never during construction. */
export const deliveryOperations = (
  state: DeliveryDraft,
  canonicalOwner: CapacityLedger,
  reportRepeat: (diagnostic: RepeatEditDiagnostic) => void
) => {
  const background = deliveryBackground(state, canonicalOwner, {
    expire: (...args) => expiry.expire(...args),
    isActive: (...args) => stopGate.isActive(...args),
    markUncertain: (...args) => submission.markUncertain(...args)
  })
  const roundStart = deliveryRoundStart(state, canonicalOwner, {
    expire: (...args) => expiry.expire(...args),
    isActive: (...args) => stopGate.isActive(...args)
  })
  const editIdentity = deliveryEditIdentity(state, canonicalOwner, reportRepeat)
  const clock = { bendTime, bendUpperTime }
  const permitRegistration = deliveryPermitRegistration(state, canonicalOwner, {
    advance: (...args) => roundStart.advance(...args),
    bendTime: (...args) => clock.bendTime(...args),
    bendUpperTime: (...args) => clock.bendUpperTime(...args),
    dropTool: (...args) => editIdentity.dropTool(...args),
    finishPermit: (...args) => editIdentity.finishPermit(...args),
    releaseCompletedPermit: (...args) => editAdmission.releaseCompletedPermit(...args),
    expirePermits: (...args) => editAdmission.expirePermits(...args),
    repeatPending: (...args) => editIdentity.repeatPending(...args),
    checkCompleted: (...args) => editIdentity.checkCompleted(...args),
    toolId: (...args) => editIdentity.toolId(...args)
  })
  const editAdmission = deliveryEditAdmission(state, canonicalOwner, {
    releaseAdmissionPermit: (...args) => permitRegistration.releaseAdmissionPermit(...args),
    finishPermit: (...args) => editIdentity.finishPermit(...args),
    nextAdmissionRound: (...args) => permitRegistration.nextAdmissionRound(...args),
    bendTime: (...args) => clock.bendTime(...args),
    checkCompleted: (...args) => editIdentity.checkCompleted(...args),
    startRound: (...args) => roundStart.startRound(...args),
    readGeneration: (...args) => submissionPolicy.readGeneration(...args),
    isActive: (...args) => stopGate.isActive(...args),
    dropTool: (...args) => editIdentity.dropTool(...args),
    toolId: (...args) => editIdentity.toolId(...args)
  })
  const stopGate = deliveryStopGate(state, canonicalOwner, {
    readGeneration: (...args) => submissionPolicy.readGeneration(...args),
    continuationCount: (...args) => submissionPolicy.continuationCount(...args),
    isDeciding: (...args) => submissionPolicy.isDeciding(...args),
    canonicalCommandAccepted: (...args) => finishOutput.canonicalCommandAccepted(...args),
    finishPermit: (...args) => editIdentity.finishPermit(...args),
    currentStop: (...args) => roundClosure.currentStop(...args)
  })
  const finishOutput = deliveryFinishOutput(state, canonicalOwner, {
    submissionAdviceId: (...args) => submission.submissionAdviceId(...args),
    stageSubmission: (...args) => submission.stageSubmission(...args),
    release: (...args) => submissionRelease.release(...args),
    fingerprintId: (...args) => submission.fingerprintId(...args),
    isActive: (...args) => stopGate.isActive(...args),
    isDeciding: (...args) => submissionPolicy.isDeciding(...args)
  })
  const roundClosure = deliveryRoundClosure(state, canonicalOwner, {
    isActive: (...args) => stopGate.isActive(...args),
    revokeProvisionalFinishOutput: (...args) => finishOutput.revokeProvisionalFinishOutput(...args),
    readGeneration: (...args) => submissionPolicy.readGeneration(...args),
    bendTime: (...args) => clock.bendTime(...args),
    finishPermit: (...args) => editIdentity.finishPermit(...args),
    forget: (...args) => submissionRelease.forget(...args),
    releaseBackground: (...args) => background.releaseBackground(...args),
    continuationCount: (...args) => submissionPolicy.continuationCount(...args),
    stopBarrier: (...args) => submissionPolicy.stopBarrier(...args)
  })
  const submissionPolicy = deliverySubmissionPolicy(state, canonicalOwner, {
    isActive: (...args) => stopGate.isActive(...args)
  })
  const submission = deliverySubmission(state, canonicalOwner, {
    readGeneration: (...args) => submissionPolicy.readGeneration(...args),
    isActive: (...args) => stopGate.isActive(...args),
    canonicalCommandAccepted: (...args) => finishOutput.canonicalCommandAccepted(...args)
  })
  const submissionRelease = deliverySubmissionRelease(state, canonicalOwner, {
    submissionAdviceId: (...args) => submission.submissionAdviceId(...args),
    readGeneration: (...args) => submissionPolicy.readGeneration(...args),
    fingerprintId: (...args) => submission.fingerprintId(...args)
  })
  const expiry = deliveryExpiry(state, canonicalOwner, {
    submissionAdviceId: (...args) => submission.submissionAdviceId(...args),
    markUncertain: (...args) => submission.markUncertain(...args)
  })

  return {
    ...deliveryView(state, canonicalOwner),
    generation: submissionPolicy.readGeneration,
    claimBackground: background.claimBackground,
    releaseBackground: background.releaseBackground,
    advance: roundStart.advance,
    ensureFromHostTurn: permitRegistration.ensureFromHostTurn,
    registerEdit: permitRegistration.registerEdit,
    registerEditDecision: permitRegistration.registerEditDecision,
    retireEdit: permitRegistration.retireEdit,
    admitEdit: editAdmission.admitEdit,
    admitEditObservation: editAdmission.admitEditObservation,
    expirePermits: editAdmission.expirePermits,
    hasPendingEdits: editAdmission.hasPendingEdits,
    isActive: stopGate.isActive,
    beginStop: stopGate.beginStop,
    ownsStop: stopGate.ownsStop,
    finishGate: stopGate.finishGate,
    reserveFinishOutput: finishOutput.reserveFinishOutput,
    decideFinishOutput: finishOutput.decideFinishOutput,
    revokeProvisionalFinishOutput: finishOutput.revokeProvisionalFinishOutput,
    finishSelectionMatches: finishOutput.finishSelectionMatches,
    authorizeFinishOutput: finishOutput.authorizeFinishOutput,
    finishStop: roundClosure.finishStop,
    tickQuietRound: roundClosure.tickQuietRound,
    closureCounts: roundClosure.closureCounts,
    expireStop: roundClosure.expireStop,
    isDeciding: submissionPolicy.isDeciding,
    canSubmit: submissionPolicy.canSubmit,
    canBeginSubmission: submissionPolicy.canBeginSubmission,
    canBeginExistingToken: submissionPolicy.canBeginExistingToken,
    consumeStop: submissionPolicy.consumeStop,
    hasVirtualRoundContinuationBudget: submissionPolicy.hasVirtualRoundContinuationBudget,
    beginSubmission: submission.beginSubmission,
    markSubmitted: submission.markSubmitted,
    markUncertain: submission.markUncertain,
    release: submissionRelease.release,
    forget: submissionRelease.forget,
    suppresses: submissionRelease.suppresses,
    backgroundReofferable: submissionRelease.backgroundReofferable,
    expire: expiry.expire
  }
}
export type ComposedDelivery = ReturnType<typeof deliveryOperations>
export {
  initialDelivery,
  draftDelivery,
  assertDeliveryState,
  MAX_BACKGROUND_WAITERS,
  EDIT_PERMIT_EXPIRY_MS,
  BACKGROUND_WAITER_EXPIRY_MS,
  VIRTUAL_ROUND_QUIET_MS
} from "./model.ts"
export type {
  DeliveryState,
  DeliveryDraft,
  DeliverySurface,
  EditAdmission,
  EditPermit,
  RepeatEditDiagnostic
} from "./model.ts"
export { deliveryView } from "./view.ts"
