import type { GraphLimits } from "@hapsland/canonical-policy/canonical/graph-limits"
import type { CanonicalEvent } from "@hapsland/canonical-policy/canonical/models"
import type { ReviewBackendSettings } from "@hapsland/runtime-environment/runtime/backend"
import type { List } from "@hapsland/source-artifacts/direct-event/value/codec"
import type { SourcePreparationContext, PreparedSource } from "./contract.ts"
import type { Context, Invocation, Response, InputStep, RulesStep, Step } from "./preparation-finalization-core.js"
import type { Maybe } from "./preparation-core.js"
import { createHash } from "node:crypto"
import { extname } from "node:path"
import { registeredLanguages } from "@hapsland/source-analysis/direct-event/languages/registry"
import { REVIEW_PROVIDERS } from "@hapsland/runtime-environment/runtime/backend"
import { freezeInput } from "@hapsland/review-definition/direct-event/model"
import { TransportFailure } from "@hapsland/runtime-environment/runtime/effect-transport"
import {
  productValue,
  fromProductValue,
  fromBinary64,
  list,
  unlist
} from "@hapsland/source-artifacts/direct-event/value/codec"

export type Execution = { readonly signal?: AbortSignal }
export type CanonicalRuleGate = (
  event: Extract<CanonicalEvent, { kind: "ruleApplicabilityCheck" }>,
  execution: Execution
) => import("@hapsland/runtime-environment/runtime/native-execution").NativeWork<boolean>
export type FinalizationFrame = {
  readonly contract: string
  readonly graphLimits: GraphLimits
  readonly supportingCaptures: ReadonlyMap<
    string,
    { readonly contentHash: string; readonly byteLength: number; readonly text?: string }
  >
  readonly observation: { readonly root: string }
  readonly context: SourcePreparationContext
}
export type FinalizationInput = {
  readonly invocation: bigint | number
  readonly command: bigint | number
  readonly units: readonly unknown[]
  readonly declarations: readonly unknown[]
  readonly path: string
  readonly frame: FinalizationFrame
}
export type FinalizedOutcome = { readonly path: string; readonly prepared: PreparedSource }

const backend = "../../../../runtime-environment/src/runtime/backend/Backend."
const language = "../../../../native-observation/src/direct-event/languages/path-language/PathLanguage."
const configuration = "../../../../runtime-inputs/src/configuration/review-backend/ReviewBackend."
const wire = productValue
const maybe = <Value>(value: Value | undefined): Maybe<Value> =>
  value === undefined ? { $: "None" } : { $: "Some", value }
const encodeSelection = (
  value: ReviewBackendSettings
): Extract<Response, { $: "ProviderFacts" }>["configuration"] extends Maybe<List<infer Layer>>
  ? Layer extends { backend: Maybe<infer Backend> }
    ? Backend
    : never
  : never => ({
  $: `${backend}Selection` as const,
  provider: value.provider,
  model:
    "model" in value
      ? { $: `${backend}Supplied` as const, value: maybe(value.model) }
      : { $: `${backend}Missing` as const },
  fields: list(
    Object.entries(value)
      .filter(([, value]) => typeof value === "string")
      .map(([name, value]) => ({ $: `${backend}Field` as const, name, value }))
  )
})
const codeUnits = (value: List<number>) => {
  const units = unlist(value)
  let text = ""
  for (let index = 0; index < units.length; index += 1024)
    text += String.fromCharCode(...units.slice(index, index + 1024))
  return text
}
const primitive = (value: Extract<InputStep, { $: "FrozenInput.JsonPrimitive" }>["value"]) => {
  switch (value.$) {
    case "CanonicalJson.NullPrimitive":
      return "null"
    case "CanonicalJson.BoolPrimitive":
    case "CanonicalJson.StringPrimitive":
      return JSON.stringify(value.value)
    case "CanonicalJson.NumberPrimitive":
      return JSON.stringify(
        fromBinary64({ ...value.bits, $: "../../../../source-artifacts/src/direct-event/value/Value.Binary64" })
      )
    default:
      throw new TypeError("Unexpected finalization primitive")
  }
}
const gateFacts = (
  step: Extract<RulesStep, { $: "RuleFinalization.CanonicalGate" }>
): Extract<CanonicalEvent, { kind: "ruleApplicabilityCheck" }> => ({
  kind: "ruleApplicabilityCheck",
  consent: step.consent,
  complete: step.complete,
  target: {
    "../../../../agent-flow-bend/RulePolicy.TypeShape": "typeShape",
    "../../../../agent-flow-bend/RulePolicy.FunctionTarget": "functionTarget",
    "../../../../agent-flow-bend/RulePolicy.UnsupportedTarget": "unsupportedTarget"
  }[step.target.$] as Extract<CanonicalEvent, { kind: "ruleApplicabilityCheck" }>["target"],
  globalIncluded: step.global_included,
  globalExcluded: step.global_excluded,
  packEnabled: step.pack_enabled,
  ruleEnabled: step.rule_enabled,
  ruleIncluded: step.rule_included,
  ruleExcluded: step.rule_excluded,
  targetDeclared: step.target_declared,
  capabilitiesAvailable: step.capabilities_available,
  sourceRung: Number(step.source_rung),
  minimumRung: Number(step.minimum_rung)
})
const checkSignal = (signal: AbortSignal | undefined) => {
  if (signal?.aborted) throw new TransportFailure("aborted")
}

// Called inside the existing RenderUnits owner lease. No private identity
// allocator, admission filter, unit loop, or finalization policy lives here.
export function createPreparationFinalizationExecution({
  machine,
  canonicalGate
}: {
  readonly machine: typeof import("./preparation-finalization-core.js").default
  readonly canonicalGate: CanonicalRuleGate
}) {
  if (!machine || typeof canonicalGate !== "function") throw new TypeError("Missing finalization engine binding")
  return ({ invocation, command, units, declarations, path, frame }: FinalizationInput, options: Execution = {}) => {
    checkSignal(options.signal)
    const settings = frame.context.settings
    const context: Context = {
      $: "Context",
      contract: frame.contract,
      path,
      root: frame.observation.root,
      graph_limits: wire(frame.graphLimits),
      declarations: list(declarations.map(productValue)),
      captures: list(
        [...frame.supportingCaptures].map(([path, capture]) =>
          productValue({ path, contentHash: capture.contentHash, byteLength: capture.byteLength })
        )
      ),
      bundled: list(
        registeredLanguages.flatMap((language) =>
          [
            ...(language.supportingTypes?.(path, frame.supportingCaptures.get(path)?.text ?? "") ?? new Map()).values()
          ].map(({ artifact }) => productValue(artifact))
        )
      ),
      languages: list(
        registeredLanguages.map(({ id, extensions }) => ({
          $: `${language}Registration` as const,
          id,
          extensions: list(extensions)
        }))
      )
    }
    const scope: Invocation = { $: "Invocation", owner: BigInt(invocation), command: BigInt(command) }
    let encodingError: URIError | undefined
    return {
      initial: () => machine.initial(scope, context, list(units.map(productValue))),
      advance(step: Step): Step | undefined {
        checkSignal(options.signal)
        return step.$ === "Continue" ? machine.advance(step.phase) : undefined
      },
      accepted(step: Step): readonly FinalizedOutcome[] | undefined {
        switch (step.$) {
          case "Completed": {
            const outcomes = unlist(step.outcomes).map((value) => fromProductValue(value) as FinalizedOutcome)
            for (const outcome of outcomes)
              (outcome.prepared as { input: PreparedSource["input"] }).input = freezeInput(outcome.prepared.input)
            checkSignal(options.signal)
            return outcomes
          }
          case "TypeError":
            throw new TypeError(step.message)
          case "URIError":
            if (!encodingError) throw new TypeError("Missing URI engine exception")
            throw encodingError
          case "InvalidReply":
            throw new TypeError("Invalid finalization engine reply")
          case "InvalidInput":
            throw new TypeError("Invalid finalization producer input")
        }
        return undefined
      },
      performSync(step: Step): { readonly value: Response } | undefined {
        if (step.$ === "RulesRequest" && step.step.$ === "RuleFinalization.CanonicalGate") return undefined
        let response: Response
        switch (step.$) {
          case "ObserveOmission":
            try {
              frame.context.observePreparationOmission?.(
                step.path,
                step.name,
                step.reason as "missing-evidence" | "no-applicable-rule"
              )
              response = { $: "Observed" }
            } catch {
              response = { $: "ObserverSynchronouslyThrew" }
            }
            break
          case "PathExtension":
            response = { $: "Extension", value: extname(step.path).toLowerCase() }
            break
          case "ReadCurrentRules": {
            const raw = frame.context.rules
            const current = typeof raw === "function" ? raw() : raw
            response = {
              $: "CurrentRules",
              rules: maybe(current === undefined ? undefined : list(current.map(productValue))),
              fallback:
                raw === undefined
                  ? maybe(settings.rules === undefined ? undefined : list(settings.rules.map(productValue)))
                  : { $: "None" }
            }
            break
          }
          case "ReadProviderFacts": {
            const layers = settings.configuration?.policy.layers
            response = {
              $: "ProviderFacts",
              configuration: maybe(
                layers === undefined
                  ? undefined
                  : list(
                      layers.map((layer) => ({
                        $: `${configuration}Layer` as const,
                        name: layer.name,
                        backend: maybe(
                          layer.document.reviewBackend === undefined
                            ? undefined
                            : encodeSelection(layer.document.reviewBackend)
                        )
                      }))
                    )
              ),
              identity: maybe(
                settings.providerIdentity === undefined
                  ? undefined
                  : { $: `${backend}Identity` as const, ...settings.providerIdentity }
              ),
              backends: list(
                Object.values(REVIEW_PROVIDERS).map((provider) => ({
                  $: `${backend}Declaration` as const,
                  id: provider.id,
                  default_model: maybe(provider.defaultModel),
                  destination: provider.destination
                }))
              )
            }
            break
          }
          case "RulesRequest": {
            const nested = step.step
            if (
              nested.$ === "RuleFinalization.Engine" &&
              (nested.query.$ === "../../../../runtime-inputs/src/matcher/glob/Glob.AnyCompile" ||
                nested.query.$ === "../../../../runtime-inputs/src/matcher/glob/Glob.AnyTest")
            ) {
              const compile = nested.query.$ === "../../../../runtime-inputs/src/matcher/glob/Glob.AnyCompile"
              let valid = true,
                matched = false
              try {
                const expression = new RegExp(codeUnits(nested.query.expression))
                if (nested.query.$ === "../../../../runtime-inputs/src/matcher/glob/Glob.AnyTest")
                  matched = expression.test(codeUnits(nested.query.candidate))
              } catch (error) {
                if (!(error instanceof SyntaxError)) throw error
                valid = false
              }
              response = compile ? { $: "Compiled", valid } : { $: "Tested", valid, matched }
            } else throw new TypeError("Unexpected finalization rules engine")
            break
          }
          case "InputRequest": {
            const nested = step.step
            if (nested.$ === "FrozenInput.EncodeComponent") {
              try {
                response = { $: "Encoded", value: encodeURIComponent(nested.value) }
              } catch (error) {
                if (!(error instanceof URIError)) throw error
                encodingError = error
                response = { $: "EncodingFailed" }
              }
            } else if (nested.$ === "FrozenInput.JsonPrimitive")
              response = { $: "Serialized", value: primitive(nested.value) }
            else if (nested.$ === "FrozenInput.Digest")
              response = { $: "Hashed", value: createHash("sha256").update(nested.bytes, "utf8").digest("hex") }
            else throw new TypeError("Unexpected finalization input engine")
            break
          }
          default:
            throw new TypeError("Unexpected finalization request")
        }
        return { value: response }
      },
      performPending(step: Step) {
        if (step.$ !== "RulesRequest" || step.step.$ !== "RuleFinalization.CanonicalGate")
          throw new TypeError("Unexpected asynchronous finalization engine")
        const pending = canonicalGate(gateFacts(step.step), options)
        return { pending, map: (admit: boolean): Response => ({ $: "CanonicalGate", admit }) }
      },
      resume(step: Step, response: Response): Step {
        checkSignal(options.signal)
        if (!("state" in step) && !("unit" in step)) throw new TypeError("Unexpected finalization reply boundary")
        const state = "state" in step ? step.state : step.unit.state
        return machine.resume(step, { $: "Reply", invocation: scope, request: state.request, response })
      }
    }
  }
}
