import { writerAction } from "../writer-controls"
import { collectionResponseAction } from "../collection-response-controls"
import { outputAttemptAction } from "../output-attempt-controls"
import { noticeAction } from "../notice-controls"
import { callbackAction } from "../callback-controls"
import { adviceeLifecycleAction } from "../advicee-lifecycle-controls"
import { permitAction } from "../permit-controls"
import { jevFaultAction } from "../jev-fault-controls"

import { type SimulationModel } from "./model"

import { number } from "./input"

import type { SimulationRun } from "./run-model"
export const applySimulationControl = (
  model: SimulationModel,
  action: string,
  run: Pick<SimulationRun, "applyControl" | "observe" | "futurePermitProfile" | "interventions" | "now"> | undefined,
  replaySource: boolean
): SimulationModel | undefined => {
  const lifecycle = adviceeLifecycleAction(action)
  const permit = permitAction(action)
  if (lifecycle || permit || action === "permitLimits" || action === "permitTiming") {
    if (replaySource)
      return { ...model, feedback: "Finish recorded replay before applying activity or permit controls." }
    if (!run) return { ...model, feedback: "Start a resident run before applying activity or permit controls." }
    const control =
      lifecycle ??
      permit ??
      (action === "permitLimits"
        ? {
            kind: "editPermitLimits" as const,
            limits: {
              perAdvicee: number(model.permitPerAdvicee, "Per-advicee pending permits", 1, 65536),
              resident: number(model.permitResident, "Resident pending permits", 1, 65536)
            }
          }
        : {
            kind: "permitProfile" as const,
            profile: {
              ...run.futurePermitProfile,
              durationMs: number(model.permitDuration, "PRE to POST duration", 0, 1_000_000_000),
              lifetimeMs: number(model.permitLifetime, "Permit lifetime", 1, 1_000_000_000)
            }
          })
    run.applyControl(control)
    return {
      ...model,
      selected: -1,
      revision: model.revision + 1,
      feedback: `Applied ${control.kind} at ${run.now} virtual ms; issued facts keep their original capture.`
    }
  }
  const writer = writerAction(action)
  if (writer) {
    if (!run || replaySource)
      return { ...model, feedback: "Start a live run before changing background advice waiters." }
    run.applyControl(writer)
    const report = run.observe().writerReports.at(-1)
    return {
      ...model,
      selected: -1,
      revision: model.revision + 1,
      feedback: report?.result ?? "Background waiter requested"
    }
  }
  const response = collectionResponseAction(action)
  if (response) {
    if (!run || replaySource)
      return { ...model, feedback: "Start a live run before changing edit response collection." }
    run.applyControl(response)
    const report = run.observe().collectionResponseReports.at(-1)
    return {
      ...model,
      selected: -1,
      revision: model.revision + 1,
      feedback: report?.result ?? "Response collection requested"
    }
  }
  const notice = noticeAction(action)
  if (notice) {
    if (!run || replaySource)
      return { ...model, feedback: "Start a live resident run before applying notice controls." }
    run.applyControl(notice)
    return {
      ...model,
      selected: -1,
      revision: model.revision + 1,
      feedback:
        notice.kind === "expiryProfile"
          ? "Updated lifetimes for newly retained notices."
          : `Requested notice action at ${run.now} virtual ms.`
    }
  }
  const delivery = callbackAction(action)
  if (delivery && run) {
    if (replaySource) return { ...model, feedback: "Finish recorded replay before changing completion delivery." }
    run.applyControl(delivery)
    return { ...model, feedback: run.observe().callbackReports.at(-1)?.result ?? "Completion delivery requested" }
  }
  const output = outputAttemptAction(action)
  if (output) {
    if (!run || replaySource)
      return { ...model, feedback: "Start a live resident run before changing advice delivery outcomes." }
    run.applyControl(output)
    const report = run.observe().outputReports.at(-1)
    return {
      ...model,
      selected: -1,
      revision: model.revision + 1,
      feedback: report?.result ?? "Advice delivery result requested"
    }
  }
  const intervention = jevFaultAction(action)
  if (intervention) {
    if (!run) return { ...model, feedback: "Start a resident run before applying an intervention." }
    run.applyControl(intervention)
    const report = run.interventions.at(-1)
    return {
      ...model,
      selected: -1,
      revision: model.revision + 1,
      feedback: `Intervention ${report?.result ?? "unavailable"} at ${run.now} virtual ms.`
    }
  }
}
