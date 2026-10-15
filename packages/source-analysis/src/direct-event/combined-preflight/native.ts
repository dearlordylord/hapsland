import core, { type Step, type Operation } from "./preflight-core.js"
import type {
  AnalyzerMaterializationPreflight,
  TypeScriptPreflightInput,
  TypeScriptPreflightEffects,
  CombinedPreflightPolicy
} from "./contracts.ts"

const unexpected = (): never => {
  throw new TypeError("Unexpected combined preflight native command")
}
const execute = (operation: Operation, effects: TypeScriptPreflightEffects, stack: number[]): void => {
  switch (operation.$) {
    case "Model.Push":
      stack.push(operation.value)
      break
    case "Model.MeasureArtifact":
      stack.push(effects.artifactBytes(operation.function_slot))
      break
    case "Model.MeasureRawSite":
      stack.push(effects.siteBytes(operation.function_slot, operation.site_slot))
      break
    case "Model.MeasureRawPath":
      stack.push(effects.pathBytes())
      break
    case "Model.ReadTypeBytes":
      stack.push(effects.typeBytes())
      break
    case "Model.Add": {
      const right = stack.pop()!,
        left = stack.pop()!
      stack.push(left + right)
      break
    }
    case "Model.Multiply": {
      const right = stack.pop()!,
        left = stack.pop()!
      stack.push(left * right)
      break
    }
    case "Model.Swap": {
      const right = stack.pop()!,
        left = stack.pop()!
      stack.push(right, left)
      break
    }
    case "Model.ObserveSites":
    case "Model.ObserveRootImports":
    case "Model.ReadTypeImports":
    case "Model.InspectGo":
      unexpected()
  }
}
// All advances and replies stay synchronous inside the original Canonical
// Preflight command. Throws leave before an Ack, at their native caller boundary.
const run = (
  initial: Step,
  bound: AnalyzerMaterializationPreflight | undefined,
  effects: TypeScriptPreflightEffects,
  inspectGo: () => boolean
): AnalyzerMaterializationPreflight | undefined => {
  let step = initial
  const stack: number[] = []
  for (;;) {
    switch (step.$) {
      case "Advance":
        step = core.advance(step)
        break
      case "Engine": {
        execute(step.operation, effects, stack)
        for (let remaining = step.remaining; remaining.$ === "Con"; remaining = remaining.tail)
          execute(remaining.head, effects, stack)
        step = core.resume_group(step, { $: "Ack", request: step.request })
        break
      }
      case "AwaitSites": {
        const count = effects.observeSites(step.slot)
        step = core.resume(step, { $: "SitesObserved", request: step.request, count })
        break
      }
      case "AwaitRootImports": {
        const present = effects.rootImports()
        step = core.resume(step, { $: "ImportsObserved", request: step.request, present })
        break
      }
      case "AwaitTypeImports": {
        const present = effects.typeImports()
        step = core.resume(step, { $: "ImportsObserved", request: step.request, present })
        break
      }
      case "AwaitGo": {
        const valid = inspectGo()
        step = core.resume(step, { $: "GoInspected", request: step.request, valid })
        break
      }
      case "Completed":
        switch (step.decision.$) {
          case "Model.Unavailable":
            return undefined
          case "Model.RetainBound":
            return bound
          case "Model.MeasuredEmpty":
            return { declarations: 0, expandedUnitBytes: 0, hasImports: step.decision.imports }
          case "Model.Measured":
            return {
              declarations: step.decision.declarations,
              expandedUnitBytes: stack[0]!,
              hasImports: step.decision.imports
            }
        }
        break
      case "InvalidReply":
        return unexpected()
    }
  }
}
export const runTypeScriptPreflight = (
  input: TypeScriptPreflightInput,
  bound: AnalyzerMaterializationPreflight | undefined,
  effects: TypeScriptPreflightEffects
): AnalyzerMaterializationPreflight | undefined =>
  run(core.typescript(input.parseValid, input.types, input.functions, bound !== undefined), bound, effects, unexpected)

export const runGoPreflight = (
  bound: AnalyzerMaterializationPreflight | undefined,
  inspectGo: () => boolean
): AnalyzerMaterializationPreflight | undefined =>
  run(
    core.go((bound ?? undefined) !== undefined),
    bound,
    {
      artifactBytes: unexpected,
      observeSites: unexpected,
      siteBytes: unexpected,
      pathBytes: unexpected,
      typeBytes: unexpected,
      rootImports: unexpected,
      typeImports: unexpected
    },
    inspectGo
  )

/** Composition entry injects policy into native language bindings. */
export const combinedPreflightPolicy: CombinedPreflightPolicy = {
  typescript: runTypeScriptPreflight,
  go: runGoPreflight
}
