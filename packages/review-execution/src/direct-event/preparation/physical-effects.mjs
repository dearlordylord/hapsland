import { awaitNativeWork } from "@hapsland/runtime-environment/runtime/native-execution"
import { verifyCodexPostEditHunks } from "@hapsland/native-observation/direct-event/codex-patch-hunks"
import { languageForPath } from "@hapsland/source-analysis/direct-event/languages/registry"
import * as Effect from "effect/Effect"
import { GRAPH_LIMIT_CEILINGS } from "@hapsland/canonical-policy/canonical/graph-limits"
import {
  inspectNamedPath,
  resolvedDirectFilePolicy,
  DEFAULT_DIRECT_FILE_POLICY
} from "@hapsland/native-observation/direct-event/selection"
import { captureStable } from "@hapsland/native-observation/direct-event/capture"
import { productValue, fromProductValue, list, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
import {
  inspectGraphFile,
  combinedAnalyzerMaterializationPreflight,
  analyzeTypeFile
} from "@hapsland/source-analysis/direct-event/analyzer"
import { analyzeFunctionFile } from "@hapsland/source-analysis/direct-event/function-analyzer"
import { createPreparationCapability } from "./machine.ts"

/**
 * @typedef {import("./machine.ts").PreparationPorts} PreparationPorts
 * @typedef {Parameters<ReturnType<typeof import("@hapsland/source-analysis/direct-event/graph-resolution").createBendResolver>>} RootArguments
 * @typedef {{path: RootArguments[0], capture: RootArguments[1], name: RootArguments[2], context: RootArguments[3]}} RootFacts
 * @typedef {import("./canonical-protocol.ts").PreparationReply} PreparationReply
 * @typedef {Extract<Extract<PreparationReply["response"], {$: "SourceExtracted"}>["extraction"]["graph"], {$: "Some"}>["value"] extends import("@hapsland/source-artifacts/direct-event/value/codec").List<infer R> ? R : never} RootWire
 */
// Physical engine/effect bindings for one fresh prepareObservation session.
// Candidate/contract/root progression stays in the checked Preparation machine.
/**
 * @typedef {Extract<PreparationReply["response"], {$: "MaterializationDone"}>} MaterializationReply
 * @typedef {Extract<PreparationEffectRequest["command"], {$: "AdmitMaterialization"}>["capture"]} CaptureWire
 * @typedef {import("./machine.ts").PreparationEffectRequest} PreparationEffectRequest
 * @typedef {import("./machine.ts").PreparationExecution} PreparationExecution
 * @typedef {{
 * root: string,
 * rootIdentity: import("@hapsland/native-observation/direct-event/observation").PhysicalRootIdentity,
 * context: Omit<Partial<PreparationPorts["context"]>, "settings"> & {now?: () => number},
 * cache: Map<string, import("@hapsland/native-observation/direct-event/capture").StableCapture>,
 * onRoot?: (facts: RootFacts) => void,
 * settings: PreparationPorts["context"]["settings"],
 * graphLimits?: import("@hapsland/canonical-policy/canonical/graph-limits").GraphLimits,
 * canonicalGate: PreparationPorts["canonicalGate"],
 * runFinalization: PreparationPorts["runFinalization"],
 * runEffect?: <A>(effect: Effect.Effect<A>, options?: {signal?: AbortSignal | undefined}) => import("@hapsland/runtime-environment/runtime/native-execution").NativeWork<A>,
 * admitMaterialization: (capture: CaptureWire, preflight: import("@hapsland/source-analysis/direct-event/analyzer").AnalyzerMaterializationPreflight | undefined, execution: PreparationExecution) => import("@hapsland/runtime-environment/runtime/native-execution").NativeWork<MaterializationReply>,
 * rejectMaterializationCapacity: (execution: PreparationExecution) => import("@hapsland/runtime-environment/runtime/native-execution").NativeWork<void>,
 * recordMaterializationCapacity: () => import("@hapsland/runtime-environment/runtime/native-execution").NativeWork<void>,
 * resolveRoot: (request: PreparationEffectRequest, facts: RootFacts, execution: PreparationExecution) => import("@hapsland/runtime-environment/runtime/native-execution").NativeWork<{unit: import("@hapsland/source-artifacts/direct-event/artifact-model").ReviewUnit | undefined, references: Extract<PreparationReply["response"], {$: "RootResolved"}>["references"]}>
 * }} PhysicalPreparationPorts
 * @param {PhysicalPreparationPorts} ports
 */
export function createPhysicalPreparationCapability({
  root,
  rootIdentity,
  context,
  cache,
  onRoot,
  settings,
  graphLimits = GRAPH_LIMIT_CEILINGS,
  canonicalGate,
  runFinalization,
  runEffect = Effect.runPromise,
  admitMaterialization,
  rejectMaterializationCapacity,
  recordMaterializationCapacity,
  resolveRoot
}) {
  /** @type {Map<number, import("@hapsland/native-observation/direct-event/capture").StableCapture>} */
  const rootCaptures = new Map()
  /** @type {Map<number, import("@hapsland/native-observation/direct-event/selection").EligiblePath>} */
  const selections = new Map()
  /** @type {Map<import("@hapsland/native-observation/direct-event/capture").StableCapture, number>} */
  const captureHandles = new Map()
  let nextSelection = 1,
    nextCapture = 1
  /** @param {import("@hapsland/native-observation/direct-event/capture").StableCapture} capture */
  const registerCapture = (capture) => {
    let handle = captureHandles.get(capture)
    if (handle === undefined) {
      handle = nextCapture++
      captureHandles.set(capture, handle)
      rootCaptures.set(handle, capture)
    }
    return handle
  }
  for (const capture of cache.values()) registerCapture(capture)
  const currentPolicy = () =>
    context.policy === undefined
      ? settings.configuration === undefined
        ? DEFAULT_DIRECT_FILE_POLICY
        : resolvedDirectFilePolicy(settings.configuration.policy)
      : typeof context.policy === "function"
        ? context.policy()
        : context.policy
  /** @type {{$: "None"}} */
  const none = { $: "None" }
  /** @template A @param {A} value @returns {{$: "Some", value: A}} */
  const some = (value) => ({ $: "Some", value })
  /** @param {import("@hapsland/native-observation/direct-event/edit-attribution").PostEditLocation} value
   * @returns {RootWire["declaration"]["location"]}
   */
  const location = (value) => ({
    $: "../../../../native-observation/src/direct-event/edit-attribution/RootAttribution.Location",
    start: {
      $: "../../../../native-observation/src/direct-event/edit-attribution/RootAttribution.Position",
      line: Number(BigInt(value.start.line)),
      column: Number(BigInt(value.start.column))
    },
    end: {
      $: "../../../../native-observation/src/direct-event/edit-attribution/RootAttribution.Position",
      line: Number(BigInt(value.end.line)),
      column: Number(BigInt(value.end.column))
    }
  })
  /** @returns {Extract<PreparationReply["response"], {$: "RootResolved"}>["captures"]} */
  const snapshotCaptures = () =>
    list(
      [...cache].map(([path, capture]) => ({
        $: "Capture",
        path,
        handle: registerCapture(capture),
        text: capture.text,
        content_hash: capture.contentHash,
        bytes: Number(BigInt(capture.byteLength))
      }))
    )
  /** @type {PreparationPorts["performEffect"]} */
  const performEffect = function* (request, options) {
    const command = request.command
    /** @type {PreparationReply["response"]} */
    let response
    switch (command.$) {
      case "InspectPath": {
        const admission = yield* awaitNativeWork(
          runEffect(inspectNamedPath(root, command.candidate.path, currentPolicy(), rootIdentity), {
            signal: options.signal
          })
        )
        if (admission.status === "denied") {
          response = { $: "PathDenied", reason: admission.reason }
          break
        }
        const handle = nextSelection++
        selections.set(handle, admission.path)
        response = { $: "PathAllowed", path: admission.path.relativePath, selection: handle }
        break
      }
      case "CaptureSource": {
        const selected = selections.get(command.selection)
        if (!selected) throw new TypeError("Unknown preparation selection handle")
        const capture = yield* awaitNativeWork(
          runEffect(
            (context.captureSource ?? captureStable)(
              root,
              selected,
              context.captureHooks,
              rootIdentity,
              command.source_cap.$ === "None" ? undefined : Number(command.source_cap.value)
            ),
            { signal: options.signal }
          )
        )
        if (capture.status === "unavailable") {
          response = { $: "SourceUnavailable", diagnostic: productValue(capture.diagnostic) }
          break
        }
        const handle = registerCapture(capture.capture)
        cache.set(command.path, capture.capture)
        response = {
          $: "SourceCaptured",
          capture: {
            $: "Capture",
            path: command.path,
            handle,
            text: capture.capture.text,
            content_hash: capture.capture.contentHash,
            bytes: Number(BigInt(capture.capture.byteLength))
          }
        }
        break
      }
      case "Preflight":
        response = {
          $: "PreflightDone",
          value: productValue(
            combinedAnalyzerMaterializationPreflight(command.capture.path, command.capture.text) ?? null
          )
        }
        break
      case "AdmitMaterialization": {
        const preflight = fromProductValue(command.preflight)
        if (
          preflight != null &&
          (typeof preflight !== "object" ||
            !("declarations" in preflight) ||
            typeof preflight.declarations !== "number" ||
            !("expandedUnitBytes" in preflight) ||
            typeof preflight.expandedUnitBytes !== "number" ||
            ("hasImports" in preflight && typeof preflight.hasImports !== "boolean"))
        )
          throw new TypeError("Malformed analyzer materialization preflight")
        response = yield* awaitNativeWork(
          admitMaterialization(
            command.capture,
            /** @type {import("@hapsland/source-analysis/direct-event/analyzer").AnalyzerMaterializationPreflight | undefined} */ (
              preflight ?? undefined
            ),
            options
          )
        )
        break
      }
      case "RejectMaterializationCapacity":
        yield* awaitNativeWork(rejectMaterializationCapacity(options))
        response = { $: "Ack" }
        break
      case "RecordMaterializationCapacity":
        yield* awaitNativeWork(recordMaterializationCapacity())
        response = { $: "Ack" }
        break
      case "VerifyNativePatch": {
        const hunks = verifyCodexPostEditHunks(command.command, command.capture.path, command.capture.text)
        response = {
          $: "NativePatchVerified",
          hunks:
            hunks === undefined
              ? none
              : some(
                  list(
                    hunks.map((hunk) => ({
                      $: "../../../../native-observation/src/direct-event/edit-attribution/RootAttribution.Hunk",
                      path: hunk.path,
                      verified: true,
                      location: location(hunk.location)
                    }))
                  )
                )
        }
        break
      }
      case "ClassifyAmbiguity": {
        const spans = unlist(command.spans).map((span) => ({
          start: { line: Number(span.start.line), column: Number(span.start.column) },
          end: { line: Number(span.end.line), column: Number(span.end.column) }
        }))
        const reason = languageForPath(command.capture.path)?.unselectedTypeEditReason?.(command.capture.text, spans)
        response = { $: "AmbiguityClassified", reason: reason === undefined ? none : some(reason) }
        break
      }
      case "ExtractSource": {
        const facts = inspectGraphFile(command.capture.path, command.capture.text)
        const functions = analyzeFunctionFile(command.capture.path, command.capture.text),
          hasCapturedGraph =
            facts !== undefined ||
            (functions !== undefined && functions.functions.size > 0 && functions.types.size === 0),
          typeFile = analyzeTypeFile(command.capture.path, command.capture.text, hasCapturedGraph)
        /** @param {{artifact: import("@hapsland/source-artifacts/direct-event/artifact-model").ReviewArtifact, location: import("@hapsland/native-observation/direct-event/edit-attribution").PostEditLocation, selectionLocations?: readonly import("@hapsland/native-observation/direct-event/edit-attribution").PostEditLocation[]}} fact
         * @returns {RootWire}
         */
        const rootFact = ({ artifact, location: span, selectionLocations }) => ({
          $: "PreparationSelection.Root",
          id: artifact.id,
          declaration: {
            $: "../../../../native-observation/src/direct-event/edit-attribution/RootAttribution.Declaration",
            path: command.capture.path,
            kind: artifact.kind,
            name: artifact.name,
            location: location(span),
            selection_locations: selectionLocations === undefined ? none : some(list(selectionLocations.map(location)))
          }
        })
        response = {
          $: "SourceExtracted",
          extraction: {
            $: "Extraction",
            graph: facts === undefined ? none : some(list([...facts.declarations.values()].map(rootFact))),
            functions:
              functions === undefined
                ? none
                : some({
                    $: "FunctionFile",
                    failure: functions.failure === undefined ? none : some(functions.failure),
                    functions: list([...functions.functions.values()].map(rootFact)),
                    exclusions: list(
                      [...functions.excludedFunctions].map(([name, value]) => ({
                        $: "Exclusion",
                        name,
                        reason: value.reason,
                        location: location(value.location)
                      }))
                    )
                  }),
            type_file:
              typeFile.status === "unsupported"
                ? { $: "TypeUnavailable", reason: typeFile.reason }
                : {
                    $: "TypeAnalyzed",
                    analyses: list(
                      typeFile.units.map((unit) =>
                        unit.status === "ready"
                          ? { $: "NativeReady", name: unit.unit.root.artifact.name }
                          : { $: "NativeUnsupported", name: unit.root.name, reason: unit.reason }
                      )
                    )
                  }
          }
        }
        break
      }
      case "ResolveRoot": {
        const capture = rootCaptures.get(command.capture.handle)
        if (capture === undefined) throw new TypeError("Unknown preparation root capture")
        /** @type {RootFacts} */
        const rootFacts = {
          path: command.capture.path,
          capture,
          name: command.root.name,
          context: {
            analysisConfiguration:
              settings.configuration?.policy.layers.reduce(
                (current, layer) => ({ ...current, ...layer.document.analysis }),
                {}
              ) ?? {},
            analysisConfigurationIdentity: settings.configuration?.policy.digest ?? "unconfigured",
            root,
            rootIdentity,
            policy: currentPolicy(),
            limits: graphLimits,
            branch: command.contract.$ === "PreparationSelection.FunctionContract" ? "function" : "type",
            captureCache: cache,
            ...(context.graphNow === undefined
              ? context.now === undefined
                ? {}
                : { now: context.now }
              : { now: context.graphNow }),
            ...(context.captureHooks === undefined ? {} : { captureHooks: context.captureHooks }),
            ...(context.captureSource === undefined ? {} : { captureSource: context.captureSource }),
            ...(context.observeCaptureDiagnostic === undefined
              ? {}
              : {
                  observeCaptureDiagnostic: (sourcePath, diagnostic) =>
                    context.observeCaptureDiagnostic?.(command.capture.path, sourcePath, diagnostic)
                })
          }
        }
        onRoot?.(rootFacts)
        const { unit, references } = yield* awaitNativeWork(resolveRoot(request, rootFacts, options))
        response = {
          $: "RootResolved",
          unit: unit === undefined ? none : some(productValue(unit)),
          references,
          captures: snapshotCaptures()
        }
        break
      }
      default:
        throw new Error("Unexpected preparation provider")
    }
    return { $: "Reply", invocation: request.invocation, id: request.id, response }
  }
  const capability = createPreparationCapability({
    canonicalGate,
    runFinalization,
    performEffect,
    context: {
      get settings() {
        return settings
      },
      get rules() {
        return context.rules
      },
      get observePreparationOmission() {
        const observer = context.observePreparationOmission
        if (observer === undefined) return undefined
        /** @type {NonNullable<PreparationPorts["context"]["observePreparationOmission"]>} */
        const observe = (...args) => observer.apply(context, args)
        return observe
      }
    },
    root,
    graphLimits,
    capturedSources: cache
  })
  return {
    ...capability,
    snapshotCaptures,
    /** @param {Parameters<typeof capability.perform>[0][number]} request
     * @param {Parameters<typeof capability.perform>[1]} options
     */
    perform: (request, options) => capability.perform([request], options),
    /** @param {Parameters<typeof capability.perform>[0][number]} request
     * @param {Parameters<typeof capability.perform>[1]} options
     */
    performEffect: (request, options) => capability.performEffect([request], options)
  }
}
