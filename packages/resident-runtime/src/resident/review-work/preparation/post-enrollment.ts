import { randomUUID } from "node:crypto"
import { unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
import type { EvaluatedUnit } from "@hapsland/review-execution/direct-event/pipeline"
import type { AdviceInitial } from "../../state/advice-records.ts"
import type { CachedEvaluation } from "../../state/evaluation-reuse.ts"
import type { UnitJob } from "../../work-ownership/jobs.ts"
import { residentSettingsEnvironmentOnly } from "../../authorization/credentials.ts"
import core, { type EnrollmentOperation, type EnrollmentReply } from "./post-preparation-core.js"

type Context = { readonly sequence: number; readonly deps: { readonly residentNow: () => number } }
type Ports = {
  readonly uuid: () => string
  readonly now: () => number
  readonly environmentOnly: typeof residentSettingsEnvironmentOnly
}

/** Native value/record interpreter; all field selection and branching belongs to Post. */
export const enrollCachedAdvice = (
  unit: UnitJob,
  planned: { readonly cached: CachedEvaluation },
  context: Context,
  ports: Ports = {
    uuid: randomUUID,
    now: () => context.deps.residentNow(),
    environmentOnly: residentSettingsEnvironmentOnly
  }
): { readonly initial: AdviceInitial; readonly evaluation: EvaluatedUnit } => {
  const values = new Map<bigint, unknown>([
    [0n, unit],
    [1n, planned],
    [2n, context]
  ])
  const initial: Record<string, unknown> = {}
  const execute = (operation: Exclude<EnrollmentOperation, { readonly $: "EnrollmentChoose" }>): void => {
    switch (operation.$) {
      case "EnrollmentRead": {
        let value = values.get(operation.source)
        for (const field of unlist(operation.path)) value = (value as Record<string, unknown>)[field]
        values.set(operation.target, value)
        break
      }
      case "EnrollmentConstant":
        switch (operation.literal.$) {
          case "EnrollmentTrue":
            values.set(operation.target, true)
            break
          case "EnrollmentFalse":
            values.set(operation.target, false)
            break
          case "EnrollmentNullValue":
            values.set(operation.target, null)
            break
        }
        break
      case "EnrollmentRecord":
        values.set(
          operation.target,
          Object.fromEntries(unlist(operation.fields).map((field) => [field.name, values.get(field.value)]))
        )
        break
      case "EnrollmentArray":
        values.set(
          operation.target,
          unlist(operation.values).map((handle) => values.get(handle))
        )
        break
      case "EnrollmentPut":
        initial[operation.name] = values.get(operation.value)
        break
      case "EnrollmentCall": {
        const args = unlist(operation.arguments)
        switch (operation.primitive.$) {
          case "EnrollmentUuid":
            values.set(operation.target, ports.uuid())
            break
          case "EnrollmentNow":
            values.set(operation.target, ports.now())
            break
          case "EnrollmentEnvironmentOnly":
            values.set(
              operation.target,
              ports.environmentOnly(values.get(args[0]!) as Parameters<Ports["environmentOnly"]>[0])
            )
            break
        }
        break
      }
    }
  }
  let step = core.enrollment_initial()
  while (step.$ !== "EnrollmentDone") {
    let reply: EnrollmentReply = { $: "EnrollmentAck" }
    switch (step.$) {
      case "EnrollmentAwait":
        if (step.operation.$ === "EnrollmentChoose") throw new Error("Unexpanded Post enrollment branch")
        execute(step.operation)
        break
      case "EnrollmentInspect": {
        const value = values.get(step.source)
        switch (step.check.$) {
          case "EnrollmentNull":
            reply = { $: "EnrollmentFlag", value: value === null }
            break
          case "EnrollmentNullish":
            reply = { $: "EnrollmentFlag", value: value === null || value === undefined }
            break
          case "EnrollmentUndefined":
            reply = { $: "EnrollmentFlag", value: value === undefined }
            break
          case "EnrollmentTrueCheck":
            reply = { $: "EnrollmentFlag", value: value === true }
            break
        }
        break
      }
      case "EnrollmentRejected":
        throw new Error("Post enrollment cursor rejected its native receipt")
    }
    step = core.enrollment_resume(step, reply)
  }
  return { initial: initial as AdviceInitial, evaluation: values.get(step.evaluation) as EvaluatedUnit }
}
