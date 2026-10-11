import { createHash } from "node:crypto"
import { extname } from "node:path"
import { registeredLanguages } from "@hapsland/source-analysis/direct-event/languages/registry"
import { REVIEW_PROVIDERS } from "@hapsland/runtime-environment/runtime/backend"
import { freezeInput } from "@hapsland/review-definition/direct-event/model"
import { TransportFailure } from "../../../../source-analysis/src/direct-event/graph-resolution/runtime-observation/transport.mjs"
import {
  productValue,
  fromProductValue,
  fromBinary64,
  list,
  unlist
} from "@hapsland/source-artifacts/direct-event/value/codec"

const prefix = "../../../../source-analysis/src/direct-event/graph-resolution/Types."
const backend = "../../../../runtime-environment/src/runtime/backend/Backend."
const language = "../../../../native-observation/src/direct-event/languages/path-language/PathLanguage."
const configuration = "../../../../runtime-inputs/src/configuration/review-backend/ReviewBackend."
const tags = (value, outward = true) => {
  if (Array.isArray(value)) return value.map((item) => tags(item, outward))
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key === "$" && typeof item === "string"
          ? outward
            ? item.replace(/^Types\./, prefix)
            : item.replace(prefix, "Types.")
          : tags(item, outward)
      ])
    )
  return value
}
const wire = (value) => tags(productValue(value))
const label = (value) => value.$.split(".").at(-1)
const maybe = (value) => (value === undefined ? { $: "None" } : { $: "Some", value })
const encodeSelection = (value) => ({
  $: backend + "Selection",
  provider: value.provider,
  model: "model" in value ? { $: backend + "Supplied", value: maybe(value.model) } : { $: backend + "Missing" },
  fields: list(
    Object.entries(value)
      .filter(([, value]) => typeof value === "string")
      .map(([name, value]) => ({ $: backend + "Field", name, value }))
  )
})
const codeUnits = (value) => {
  const units = unlist(value)
  let text = ""
  for (let index = 0; index < units.length; index += 1024)
    text += String.fromCharCode(...units.slice(index, index + 1024))
  return text
}
const primitive = (value) => {
  switch (label(value)) {
    case "NullPrimitive":
      return "null"
    case "BoolPrimitive":
    case "StringPrimitive":
      return JSON.stringify(value.value)
    case "NumberPrimitive":
      return JSON.stringify(
        fromBinary64({ ...value.bits, $: "../../../../source-artifacts/src/direct-event/value/Value.Binary64" })
      )
    default:
      throw new TypeError("Unexpected finalization primitive")
  }
}
const gateFacts = (step) => ({
  kind: "ruleApplicabilityCheck",
  consent: step.consent,
  complete: step.complete,
  target: { TypeShape: "typeShape", FunctionTarget: "functionTarget", UnsupportedTarget: "unsupportedTarget" }[
    label(step.target)
  ],
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
const checkSignal = (signal) => {
  if (signal?.aborted) throw new TransportFailure("aborted")
}

// Called inside the existing RenderUnits owner lease. No private identity
// allocator, admission filter, unit loop, or finalization policy lives here.
export function createPreparationFinalizationConsumer({ machine, canonicalGate }) {
  if (!machine || typeof canonicalGate !== "function") throw new TypeError("Missing finalization engine binding")
  return async ({ invocation, command, units, declarations, path, frame }, options = {}) => {
    checkSignal(options.signal)
    const settings = frame.context.settings
    const context = {
      $: "Context",
      contract: frame.contract,
      path,
      root: frame.observation.root,
      graph_limits: wire(frame.graphLimits),
      declarations: tags(list(declarations.map(productValue))),
      captures: tags(
        list(
          [...frame.supportingCaptures].map(([path, capture]) =>
            productValue({ path, contentHash: capture.contentHash, byteLength: capture.byteLength })
          )
        )
      ),
      bundled: tags(
        list(
          registeredLanguages.flatMap((language) =>
            [...(language.supportingTypes?.(path) ?? new Map()).values()].map(({ artifact }) => productValue(artifact))
          )
        )
      ),
      languages: list(
        registeredLanguages.map(({ id, extensions }) => ({
          $: language + "Registration",
          id,
          extensions: list(extensions)
        }))
      )
    }
    const scope = { $: "Invocation", owner: BigInt(invocation), command: BigInt(command) }
    let step = machine.initial(scope, context, tags(list(units.map(productValue))))
    let encodingError
    for (;;) {
      checkSignal(options.signal)
      switch (label(step)) {
        case "Continue":
          step = machine.advance(step.phase)
          continue
        case "Completed": {
          const outcomes = unlist(step.outcomes).map((value) => fromProductValue(tags(value, false)))
          for (const outcome of outcomes) outcome.prepared.input = freezeInput(outcome.prepared.input)
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
      const state = step.state ?? step.unit.state
      let response
      switch (label(step)) {
        case "ObserveOmission":
          try {
            frame.context.observePreparationOmission?.(step.path, step.name, step.reason)
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
            rules: maybe(current === undefined ? undefined : tags(list(current.map(productValue)))),
            fallback:
              raw === undefined
                ? maybe(settings.rules === undefined ? undefined : tags(list(settings.rules.map(productValue))))
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
                      $: configuration + "Layer",
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
                : { $: backend + "Identity", ...settings.providerIdentity }
            ),
            backends: list(
              Object.values(REVIEW_PROVIDERS).map((provider) => ({
                $: backend + "Declaration",
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
          if (label(nested) === "CanonicalGate")
            response = { $: "CanonicalGate", admit: await canonicalGate(gateFacts(nested), options) }
          else {
            const compile = label(nested.query) === "AnyCompile"
            let valid = true,
              matched = false
            try {
              const expression = new RegExp(codeUnits(nested.query.expression))
              if (!compile) matched = expression.test(codeUnits(nested.query.candidate))
            } catch (error) {
              if (!(error instanceof SyntaxError)) throw error
              valid = false
            }
            response = compile ? { $: "Compiled", valid } : { $: "Tested", valid, matched }
          }
          break
        }
        case "InputRequest": {
          const nested = step.step
          if (label(nested) === "EncodeComponent") {
            try {
              response = { $: "Encoded", value: encodeURIComponent(nested.value) }
            } catch (error) {
              if (!(error instanceof URIError)) throw error
              encodingError = error
              response = { $: "EncodingFailed" }
            }
          } else if (label(nested) === "JsonPrimitive") response = { $: "Serialized", value: primitive(nested.value) }
          else if (label(nested) === "Digest")
            response = { $: "Hashed", value: createHash("sha256").update(nested.bytes, "utf8").digest("hex") }
          else throw new TypeError("Unexpected finalization input engine")
          break
        }
        default:
          throw new TypeError("Unexpected finalization request")
      }
      checkSignal(options.signal)
      step = machine.resume(step, { $: "Reply", invocation: scope, request: state.request, response })
    }
  }
}
