import type { PreparedUnit } from "@hapsland/review-definition/direct-event/model"
import { toCodexDirectEventOutput } from "@hapsland/delivery-output/direct-event/output"
import { findingFromProbability } from "@hapsland/review-definition/rules/decision"
import { MAX_IPC_FRAME_BYTES, type ResidentDispatchContext } from "@hapsland/resident-transport/resident/protocol"
import type { DirectObservation } from "@hapsland/native-observation/direct-event/observation"
import { unlist, hostNatural } from "@hapsland/source-artifacts/direct-event/value/codec"
import { workSubject } from "../../state/revision.ts"
import { residentEvaluationIdentity } from "../../state/evaluation-reuse.ts"
import { logicalBytes } from "../../state/encoded-size.ts"
import { recipientPartition, sourcePartition } from "../../recipient/identity.ts"
import { evaluationSourcePartition } from "../../work-ownership/identity.ts"
import core, { type SizingMode, type SizingOperation, type SizingReply } from "./post-preparation-core.js"

const readPath = (root: unknown, path: readonly string[]): unknown => {
  let value = root
  for (const field of path) value = (value as Record<string, unknown>)[field]
  return value
}

/** Interpret a Post-selected recipe synchronously; native values never leave this invocation. */
export const measurePostSizing = (
  mode: SizingMode,
  prepared: PreparedUnit,
  observation?: DirectObservation,
  dispatch?: ResidentDispatchContext
): number | boolean => {
  const values = new Map<bigint, unknown>([
    [0n, prepared],
    [1n, observation],
    [2n, dispatch]
  ])
  let rules: PreparedUnit["input"]["rules"] = [],
    rule: PreparedUnit["input"]["rules"][number] | undefined
  const execute = (operation: Exclude<SizingOperation, { readonly $: "SizingFindings" }>): unknown => {
    switch (operation.$) {
      case "SizingRead":
        return readPath(values.get(operation.source), unlist(operation.path))
      case "SizingRecord":
        return Object.fromEntries(unlist(operation.fields).map((field) => [field.name, values.get(field.value)]))
      case "SizingArray":
        return unlist(operation.values).map((handle) => values.get(handle))
      case "SizingConstant":
        switch (operation.literal.$) {
          case "SizingUnitKind":
            return "unit"
          case "SizingZeroUuid":
            return "00000000-0000-0000-0000-000000000000"
          case "SizingMaxGeneration":
            return Number.MAX_SAFE_INTEGER
          case "SizingDigestPlaceholder":
            return "f".repeat(64)
          case "SizingOne":
            return 1
          case "SizingProbabilityMargin":
            return 24
          case "SizingOverhead":
            return 1024
          case "SizingFrameBytes":
            return MAX_IPC_FRAME_BYTES
        }
        break
      case "SizingCall": {
        const args = unlist(operation.arguments)
        const read = <T>(index: number): T => values.get(args[index]!) as T
        switch (operation.primitive.$) {
          case "SizingOutput":
            return toCodexDirectEventOutput(read(0))
          case "SizingMeasure":
            return logicalBytes(read(0))
          case "SizingRecipient":
            return recipientPartition(read(0))
          case "SizingEvaluationPartition":
            return evaluationSourcePartition(read(0), read(1), read(2), read(3))
          case "SizingEvaluationIdentity":
            return residentEvaluationIdentity(read(0), read(1))
          case "SizingSourcePartition":
            return sourcePartition(read(0), read(1))
          case "SizingWorkSubject":
            return workSubject(read(0), read(1))
          case "SizingSubtract":
            return read<number>(0) - read<number>(1)
          case "SizingMultiply":
            return read<number>(0) * read<number>(1)
          case "SizingAdd":
            return read<number>(0) + read<number>(1)
          case "SizingMaximum":
            return Math.max(read<number>(0), read<number>(1))
          case "SizingLessEqual":
            return read<number>(0) <= read<number>(1)
        }
      }
    }
  }
  let step = core.sizing_initial(mode)
  while (step.$ !== "SizingDone") {
    let reply: SizingReply = { $: "SizingAck" }
    switch (step.$) {
      case "SizingAwait":
        if (step.operation.$ === "SizingFindings") throw new Error("Unexpanded sizing findings instruction")
        values.set(step.operation.target, execute(step.operation))
        break
      case "SizingRules":
        rules = prepared.input.rules
        values.set(step.target, [])
        reply = {
          $: "SizingLength",
          length: BigInt(Math.min(Math.max(Math.trunc(+rules.length) || 0, 0), Number.MAX_SAFE_INTEGER))
        }
        break
      case "SizingPresence":
        reply = { $: "SizingFlag", value: hostNatural(step.index) in rules }
        break
      case "SizingThreshold":
        rule = rules[hostNatural(step.index)]
        reply = { $: "SizingFlag", value: findingFromProbability(1, rule!.threshold) }
        break
      case "SizingFinding": {
        const sources = [prepared, rule, 1]
        const finding = Object.fromEntries(
          unlist(step.fields).map((field) => [
            field.name,
            readPath(sources[hostNatural(field.source)], unlist(field.path))
          ])
        )
        ;(values.get(step.target) as unknown[]).push(finding)
        break
      }
      case "SizingRejected":
        throw new Error("Post sizing cursor rejected its native receipt")
    }
    step = core.sizing_resume(step, reply)
  }
  return values.get(step.result) as number
}
