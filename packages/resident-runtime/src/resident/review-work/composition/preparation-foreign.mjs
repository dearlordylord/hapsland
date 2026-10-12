import { verifyCodexPostEditHunks } from "@hapsland/native-observation/direct-event/codex-patch-hunks"
import { languageForPath } from "@hapsland/source-analysis/direct-event/languages/registry"
import { residentRuntime } from "../../state/resident/runtime.ts"
import { providerTransaction, ResidentProviderPermit } from "../../state/resolver-custody/resident-provider-permit.mjs"
import * as Effect from "effect/Effect"
import { GRAPH_LIMIT_CEILINGS } from "@hapsland/canonical-policy/canonical/graph-limits"
import {
  inspectNamedPath,
  resolvedDirectFilePolicy,
  DEFAULT_DIRECT_FILE_POLICY
} from "@hapsland/native-observation/direct-event/selection"
import { captureStable } from "@hapsland/native-observation/direct-event/capture"
import { productValue, fromProductValue, list, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
import { createBendResolver } from "@hapsland/source-analysis/direct-event/graph-resolution"
import {
  inspectGraphFile,
  combinedAnalyzerMaterializationPreflight,
  analyzeTypeFile
} from "@hapsland/source-analysis/direct-event/analyzer"
import { resize } from "../../state/capacity/reservations.ts"
import { analyzeFunctionFile } from "@hapsland/source-analysis/direct-event/function-analyzer"
import { analysisWorkspaceBytes } from "../../work-ownership/workspace.ts"
import { createPreparationCapability } from "@hapsland/review-execution/direct-event/preparation"

/**
 * @typedef {import("@hapsland/review-execution/direct-event/preparation").PreparationPorts} PreparationPorts
 * @typedef {Parameters<ReturnType<typeof createBendResolver>>} RootArguments
 * @typedef {{path: RootArguments[0], capture: RootArguments[1], name: RootArguments[2], context: RootArguments[3]}} RootFacts
 * @typedef {Awaited<ReturnType<PreparationPorts["performEffect"]>>} PreparationReply
 * @typedef {Extract<Extract<PreparationReply["response"], {$: "SourceExtracted"}>["extraction"]["graph"], {$: "Some"}>["value"] extends import("@hapsland/source-artifacts/direct-event/value/codec").List<infer R> ? R : never} RootWire
 */
// Physical engine/effect bindings for one fresh prepareObservation session.
// Candidate/contract/root progression stays in the checked Preparation machine.
/**
 * @param {{
 * connection: {bridge: ReturnType<typeof import("../../state/resolver-custody/resident-owner-transaction.mjs").createResidentOwnerTransaction>, transaction: import("../../state/resolver-custody/provider-authority.ts").NativeTransaction, preparation: Extract<import("../../state/capacity/model.ts").PreparationAdmission, {status: "admitted"}>},
 * owner: import("@hapsland/agent-flow-bend/canonical-resolver-owner").CanonicalResolverOwner,
 * driver: ReturnType<typeof import("./owned-artifact-driver.mjs").createOwnedArtifactDriver>,
 * root: string,
 * rootIdentity: import("@hapsland/native-observation/direct-event/observation").PhysicalRootIdentity,
 * context: Omit<Partial<PreparationPorts["context"]>, "settings"> & {now?: () => number},
 * cache: Map<string, import("@hapsland/native-observation/direct-event/capture").StableCapture>,
 * onRoot?: (facts: RootFacts) => void,
 * settings: PreparationPorts["context"]["settings"],
 * graphLimits?: import("@hapsland/canonical-policy/canonical/graph-limits").GraphLimits,
 * onMaterialization?: (event: {kind: "resize", bytes: number, status: ReturnType<typeof resize>["status"]}) => void,
 * residentContext?: import("../preparation/context.ts").PreparationContext
 * }} options
 * @returns {Omit<ReturnType<typeof createPreparationCapability>, "perform"> & {snapshotCaptures(): Extract<PreparationReply["response"], {$: "RootResolved"}>["captures"], perform(request: Parameters<ReturnType<typeof createPreparationCapability>["perform"]>[0][number], options: Parameters<ReturnType<typeof createPreparationCapability>["perform"]>[1]): ReturnType<ReturnType<typeof createPreparationCapability>["perform"]>}}
 */
export function createPreparationForeign({
  connection,
  owner,
  driver,
  root,
  rootIdentity,
  context,
  cache,
  onRoot,
  settings,
  graphLimits = GRAPH_LIMIT_CEILINGS,
  onMaterialization,
  residentContext
}) {
  /** @type {PreparationPorts["canonicalGate"]} */
  const canonicalGate = async (event) => {
    const result = await Effect.runPromise(connection.bridge.canonical(event))
    if (result.refusal || result.outputs.length !== 1) throw new Error("Canonical finalization gate refused")
    const output = result.outputs[0]
    if (output === undefined || output.$ !== "Canonical.PolicyDecided" || output.decision.$ !== "Canonical.RuleGate")
      throw new Error("Canonical finalization gate missing")
    switch (output.decision.gate.$) {
      case "RulePolicy.Admit":
        return true
      case "RulePolicy.Omit":
        return false
      default:
        throw new TypeError("Invalid Canonical finalization gate")
    }
  }
  /** @type {Map<bigint, import("@hapsland/native-observation/direct-event/capture").StableCapture>} */
  const rootCaptures = new Map()
  /** @type {Map<bigint, import("@hapsland/native-observation/direct-event/selection").EligiblePath>} */
  const selections = new Map()
  /** @type {Map<import("@hapsland/native-observation/direct-event/capture").StableCapture, bigint>} */
  const captureHandles = new Map()
  let nextSelection = 1n,
    nextCapture = 1n
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
      line: BigInt(value.start.line),
      column: BigInt(value.start.column)
    },
    end: {
      $: "../../../../native-observation/src/direct-event/edit-attribution/RootAttribution.Position",
      line: BigInt(value.end.line),
      column: BigInt(value.end.column)
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
        bytes: BigInt(capture.byteLength)
      }))
    )
  /** @type {PreparationPorts["performEffect"]} */
  const performEffect = async (request, options) => {
    const command = request.command
    /** @type {PreparationReply["response"]} */
    let response
    switch (command.$) {
      case "InspectPath": {
        const admission = await Effect.runPromise(
          inspectNamedPath(root, command.candidate.path, currentPolicy(), rootIdentity),
          { signal: options.signal }
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
        const capture = await Effect.runPromise(
          (context.captureSource ?? captureStable)(
            root,
            selected,
            context.captureHooks,
            rootIdentity,
            command.source_cap.$ === "None" ? undefined : Number(command.source_cap.value)
          ),
          { signal: options.signal }
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
            bytes: BigInt(capture.capture.byteLength)
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
        const bytes = analysisWorkspaceBytes(
          command.capture.path,
          Number(command.capture.bytes),
          /** @type {import("@hapsland/source-analysis/direct-event/analyzer").AnalyzerMaterializationPreflight | undefined} */ (
            preflight ?? undefined
          ),
          settings.rules
        )
        const result = Effect.runSync(
          connection.bridge.nativeScoped(options.ownerLease, (draft, records) => [
            resize(draft, connection.preparation.reservation, bytes),
            records
          ])
        ).value
        onMaterialization?.({ kind: "resize", bytes, status: result.status })
        /** @type {Extract<PreparationReply["response"], {$: "MaterializationDone"}>["result"]} */
        let admission
        switch (result.status) {
          case "resized":
            admission = { $: "Resized" }
            break
          case "capacity-refused":
            admission = { $: "CapacityRefused", constraint: result.constraint }
            break
          case "invalid-reservation":
            admission = { $: "InvalidReservation" }
            break
          case "invalid-measurement":
            admission = { $: "InvalidMeasurement" }
            break
          default:
            throw new Error("Unknown materialization resize status")
        }
        response = { $: "MaterializationDone", requested: BigInt(bytes), result: admission }
        break
      }
      case "RejectMaterializationCapacity":
        await Effect.runPromise(
          residentRuntime(providerTransaction(connection.transaction, connection.bridge))
            .rejectCapacity()
            .pipe(Effect.provideService(ResidentProviderPermit, { credential: options.ownerLease }))
        )
        response = { $: "Ack" }
        break
      case "RecordMaterializationCapacity":
        await Effect.runPromise(
          residentContext
            ? residentContext.deps.residentRecordAnalytics(residentContext.job, "capacity-rejected")
            : Effect.void
        )
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
          typeFile = analyzeTypeFile(command.capture.path, command.capture.text, true)
        /** @param {{artifact: import("@hapsland/source-artifacts/direct-event/artifact-model").ReviewArtifact, location: import("@hapsland/native-observation/direct-event/edit-attribution").PostEditLocation}} fact
         * @returns {RootWire}
         */
        const rootFact = ({ artifact, location: span }) => ({
          $: "PreparationSelection.Root",
          id: artifact.id,
          declaration: {
            $: "../../../../native-observation/src/direct-event/edit-attribution/RootAttribution.Declaration",
            path: command.capture.path,
            kind: artifact.kind,
            name: artifact.name,
            location: location(span),
            selection_locations: none
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
        /** @type {import("./owned-artifact-driver.mjs").GraphOutcome | undefined} */
        let terminal
        const child = owner.find(request.invocation, driver.state.children)
        if (child.$ !== "Some") throw new TypeError("Missing preparation parent invocation")
        const parent = child.value
        const resolver = createBendResolver({
          allocateInvocation: () =>
            driver.allocateInvocation({
              $: "Parent",
              invocation: request.invocation,
              generation: parent.generation,
              request: request.id
            }),
          onConstructionFailure: driver.constructionFailed,
          drive: async (...args) => {
            terminal = await driver.drive(...args)
            return terminal
          }
        })
        const unit = await resolver(rootFacts.path, rootFacts.capture, rootFacts.name, rootFacts.context, options)
        if (terminal === undefined) throw new TypeError("Resolver completed without an accepted terminal")
        response = {
          $: "RootResolved",
          unit: unit === undefined ? none : some(productValue(unit)),
          references: "finalFrame" in terminal && terminal.finalFrame.$ === "Some" ? terminal.finalFrame.value.references : list([]),
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
    perform: (request, options) => capability.perform([request], options)
  }
}
