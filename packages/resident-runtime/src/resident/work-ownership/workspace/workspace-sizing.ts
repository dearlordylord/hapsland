import { MAX_SOURCE_BYTES } from "@hapsland/native-observation/direct-event/capture"
import { MAX_TYPE_DECLARATIONS } from "@hapsland/source-analysis/direct-event/languages/contracts"
import { unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
import { logicalBytes } from "../../state/encoded-size.ts"
import type core from "./workspace-sizing-core.js"
import type { Literal, Mode, Primitive, Reply } from "./workspace-sizing-core.js"

const literal = (value: Literal): number => {
  switch (value.$) {
    case "WorkspaceMaxSource":
      return MAX_SOURCE_BYTES
    case "WorkspaceMaxDeclarations":
      return MAX_TYPE_DECLARATIONS
    case "WorkspaceZero":
      return 0
    case "WorkspaceEight":
      return 8
    case "WorkspaceFour":
      return 4
    case "WorkspaceMetadataMargin":
      return 512
    case "WorkspaceAnalysisMargin":
      return 4096
    case "WorkspaceImportWorkspace":
      return 8 * 1024 * 1024
  }
}

/** One synchronous recipe; native values/coercion remain opaque to the Bend ABI. */
export const runWorkspaceSizing = (
  machine: typeof core,
  mode: Mode,
  path: unknown,
  sourceBytes: unknown,
  preflight?: unknown,
  rules?: unknown
): number => {
  const values = new Map<number, unknown>([
    [0, path],
    [1, sourceBytes],
    [2, preflight],
    [3, rules]
  ])
  const primitive = (kind: Primitive, args: readonly number[]): unknown => {
    const first = values.get(args[0]!)
    const second = values.get(args[1]!)
    switch (kind.$) {
      case "WorkspaceIdentity":
        return first
      case "WorkspaceIsUndefined":
        return first === undefined
      case "WorkspaceIsNullish":
        return first === null || first === undefined
      case "WorkspaceSafeInteger":
        return Number.isSafeInteger(first)
      case "WorkspaceLess":
        return (first as number) < (second as number)
      case "WorkspaceGreater":
        return (first as number) > (second as number)
      case "WorkspaceTruthy":
        return Boolean(first)
      case "WorkspaceMeasure":
        return logicalBytes(first)
      case "WorkspaceMultiply":
        return (first as number) * (second as number)
      case "WorkspaceAdd":
        return (first as number) + (second as number)
    }
  }
  let step = machine.initial(mode)
  while (step.$ !== "WorkspaceDone") {
    if (step.$ === "WorkspaceRejected") throw new Error("Workspace sizing cursor rejected its native receipt")
    const operation = step.operation
    let reply: Reply = { $: "WorkspaceAck" }
    switch (operation.$) {
      case "WorkspaceConstant":
        values.set(operation.target, literal(operation.value))
        break
      case "WorkspaceReadOptional":
        values.set(
          operation.target,
          (values.get(operation.source) as Record<string, unknown> | null | undefined)?.[operation.field]
        )
        break
      case "WorkspaceCall":
        values.set(operation.target, primitive(operation.primitive, unlist(operation.arguments)))
        break
      case "WorkspaceBranch":
        reply = { $: "WorkspaceFlag", value: primitive(operation.primitive, unlist(operation.arguments)) as boolean }
        break
      case "WorkspaceInvalidSource":
        throw new RangeError("invalid captured source workspace measurement")
    }
    step = machine.resume(step, reply)
  }
  return values.get(step.result) as number
}
