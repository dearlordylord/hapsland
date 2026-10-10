import { appendFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { RepeatEditDiagnostic } from "../state/composed-delivery.ts"
import { type Finding } from "@hapsland/delivery-output/direct-event/output"
import { recordAnalytics, type AnalyticsKind } from "@hapsland/activity-observation/activity/analytics"
import * as Effect from "effect/Effect"
import { createHash } from "node:crypto"
import { canonicalValue } from "@hapsland/review-definition/direct-event/model"
import { type ResidentDispatchContext } from "@hapsland/resident-transport/resident/protocol"
import { type ResidentLedger, type UnitJob, type Job } from "../work-ownership/jobs.ts"
import { type JevRequestObservation } from "./request-observation.ts"
import {
  type DispatchAuthorityObservation,
  type DispatchAuthorityObservationDetails
} from "../authorization/observation.ts"

type Dependencies = {
  readonly residentDispatchAuthorityObserver: ((observation: DispatchAuthorityObservation) => void) | undefined
  readonly residentLedger: ResidentLedger
  readonly lifetime: string
  readonly residentJevRequestObserver: ((observation: JevRequestObservation) => void) | undefined
}
const residentObserveDispatchAuthority = Effect.fn("ResidentRuntime.observeDispatchAuthority")(function* (
  deps: Dependencies,
  job: UnitJob,
  details: DispatchAuthorityObservationDetails
): Effect.fn.Return<void> {
  const observer = deps.residentDispatchAuthorityObserver
  if (observer === undefined) return
  const observation: DispatchAuthorityObservation = {
    kind: "dispatchAuthority",
    sequence: yield* deps.residentLedger.runtime.nextAuthoritySequence(),
    evaluationId: createHash("sha256").update(job.evaluationKey, "utf8").digest("hex"),
    path: job.prepared.input.path,
    ...details,
    expectedRootIdentitySha256: createHash("sha256")
      .update(canonicalValue(job.observation.rootIdentity), "utf8")
      .digest("hex")
  }
  try {
    observer(observation)
  } catch {
    // Fixture observation must not change resident dispatch behavior.
  }
})
const residentRecordAnalytics = Effect.fn("ResidentRuntime.recordAnalytics")(
  (
    deps: Dependencies,
    job: Pick<Job, "observation" | "dispatch"> & { readonly analyticsEnabled?: boolean },
    kind: AnalyticsKind,
    findings: ReadonlyArray<Finding> = []
  ) =>
    Effect.sync(() => {
      const enabled = job.analyticsEnabled ?? job.dispatch.sessionAnalytics === true
      if (!enabled || job.dispatch.activityPath === undefined) return
      recordAnalytics({
        enabled,
        statePath: job.dispatch.activityPath,
        root: job.observation.root,
        advicee: job.observation.advicee,
        lifetime: deps.lifetime,
        kind,
        controlled: job.dispatch.controlled !== null,
        findings: findings.length,
        ruleIds: findings.map((finding) => finding.ruleId)
      })
    })
)
function residentObserveJevRequest(deps: Dependencies, observation: JevRequestObservation): void {
  try {
    deps.residentJevRequestObserver?.(observation)
  } catch {
    // Fixture observation must not change request execution.
  }
}

const residentOptionalUserConfig = (dispatch: ResidentDispatchContext): string | undefined =>
  dispatch.userConfigPath ?? undefined
export const makeResidentReviewObservation = (deps: Dependencies) => {
  return {
    residentRecordAnalytics: residentRecordAnalytics.bind(null, deps),
    residentOptionalUserConfig,
    residentObserveJevRequest: residentObserveJevRequest.bind(null, deps),
    residentObserveDispatchAuthority: residentObserveDispatchAuthority.bind(null, deps)
  }
}
export const recordRepeatEditDiagnostic = (directory: string, diagnostic: RepeatEditDiagnostic): void => {
  // Keep diagnostics source-free and bounded even for an indefinitely running resident.
  const path = join(directory, "repeat-edits.log")
  const line = `${JSON.stringify({ at: Date.now(), ...diagnostic })}\n`
  const limit = 256 * 1024
  try {
    writeFileSync(join(directory, "repeat-edits-observed"), "1\n", { flag: "wx", mode: 0o600 })
  } catch {
    /* The marker is already present or diagnostics are unavailable. */
  }
  try {
    const size = statSync(path).size
    if (size + Buffer.byteLength(line) > limit) writeFileSync(path, line, { mode: 0o600 })
    else appendFileSync(path, line, { mode: 0o600 })
  } catch {
    try {
      writeFileSync(path, line, { mode: 0o600 })
    } catch {
      /* logging cannot block admission */
    }
  }
}
