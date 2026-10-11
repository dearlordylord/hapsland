import { verifyCodexPostEditHunks } from "@hapsland/native-observation/direct-event/codex-patch-hunks"
import { languageForPath } from "@hapsland/source-analysis/direct-event/languages/registry"
import { residentRuntime } from "../../state/resident/runtime.ts"
import { providerTransaction, ResidentProviderPermit } from "../../state/resolver-custody/resident-provider-permit.mjs"
import assert from "node:assert/strict"
import * as Effect from "effect/Effect"
import { GRAPH_LIMIT_CEILINGS } from "../../../../../canonical-policy/dist/canonical/graph-limits.js"
import {
  eligibleNamedPath,
  DEFAULT_DIRECT_FILE_POLICY
} from "../../../../../native-observation/dist/direct-event/selection.js"
import { captureStable } from "../../../../../native-observation/dist/direct-event/capture.js"
import { productValue, fromProductValue, list, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
import { createBendResolver } from "@hapsland/source-analysis/direct-event/graph-resolution"
import {
  inspectGraphFile,
  combinedAnalyzerMaterializationPreflight,
  analyzeTypeFile
} from "../../../../../source-analysis/dist/direct-event/analyzer.js"
import { resize } from "../../state/capacity/reservations.ts"
import { analyzeFunctionFile } from "@hapsland/source-analysis/direct-event/function-analyzer"
import { analysisWorkspaceBytes } from "../../work-ownership/workspace.ts"
import { createPreparationCapability } from "@hapsland/review-execution/direct-event/preparation"

// Physical engine/effect bindings for one fresh prepareObservation session.
// Candidate/contract/root progression stays in the checked Preparation machine.
export function createPreparationForeign({
  connection,
  owner,
  driver,
  registry,
  root,
  rootIdentity,
  context,
  cache,
  mode = "two-roots",
  onRoot,
  settings,
  graphLimits = GRAPH_LIMIT_CEILINGS,
  onMaterialization,
  residentContext
}) {
  const canonicalGate = async (event) => {
    const result = await Effect.runPromise(connection.bridge.canonical(event))
    if (result.refusal || result.outputs.length !== 1) throw new Error("Canonical finalization gate refused")
    const output = result.outputs[0]
    if (output.$ !== "Canonical.PolicyDecided" || output.decision.$ !== "Canonical.RuleGate")
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
  const rootCaptures = new Map(),
    selections = new Map()
  const graphContext = {
    ...context,
    analysisConfiguration:
      settings.configuration?.policy.layers.reduce(
        (current, layer) => ({ ...current, ...layer.document.analysis }),
        {}
      ) ?? {},
    analysisConfigurationIdentity: settings.configuration?.policy.digest ?? "unconfigured"
  }
  let roots = 0
  const none = { $: "None" },
    some = (value) => ({ $: "Some", value })
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
  const snapshotCaptures = () =>
    list(
      [...cache].map(([path, capture], index) => ({
        $: "Capture",
        path,
        handle: BigInt(index + 1),
        text: capture.text,
        content_hash: capture.contentHash,
        bytes: BigInt(capture.byteLength)
      }))
    )
  const performEffect = async (request, options) => {
    const command = request.command
    let response
    switch (command.$) {
      case "InspectPath": {
        const selected = await Effect.runPromise(
          eligibleNamedPath(root, command.candidate.path, DEFAULT_DIRECT_FILE_POLICY, rootIdentity)
        )
        assert.ok(selected)
        selections.set(1n, selected)
        response = { $: "PathAllowed", path: command.candidate.path, selection: 1n }
        break
      }
      case "CaptureSource": {
        const capture = await Effect.runPromise(
          (context.captureSource ?? captureStable)(root, selections.get(command.selection), {}, rootIdentity)
        )
        assert.equal(capture.status, "captured")
        rootCaptures.set(1n, capture.capture)
        cache.set(command.path, capture.capture)
        response = {
          $: "SourceCaptured",
          capture: {
            $: "Capture",
            path: command.path,
            handle: 1n,
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
        const bytes =
          mode === "resize-refused"
            ? 200000000
            : analysisWorkspaceBytes(
                command.capture.path,
                Number(command.capture.bytes),
                fromProductValue(command.preflight) ?? undefined,
                settings.rules
              )
        const result = Effect.runSync(
          connection.bridge.nativeScoped(options.ownerLease, (draft, records) => [
            resize(draft, connection.preparation.reservation, bytes),
            records
          ])
        ).value
        onMaterialization?.({ kind: "resize", bytes, status: result.status })
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
            throw new Error("Unknown materialization resize status " + result.status)
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
        roots++
        const rootFacts = {
          path: command.capture.path,
          capture: rootCaptures.get(command.capture.handle),
          name: command.root.name,
          context: {
            ...graphContext,
            branch: command.contract.$ === "PreparationSelection.FunctionContract" ? "function" : "type"
          }
        }
        onRoot?.(rootFacts)
        if (mode === "first-refused" && roots === 1) {
          response = { $: "RootResolved", unit: none, references: list([]), captures: snapshotCaptures() }
          break
        }
        let terminal
        const parent = owner.find(request.invocation, driver.state.children).value
        const resolver = createBendResolver({
          registry,
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
        response = {
          $: "RootResolved",
          unit: unit === undefined ? none : some(productValue(unit)),
          references: terminal.finalFrame?.$ === "Some" ? terminal.finalFrame.value.references : list([]),
          captures: snapshotCaptures()
        }
        break
      }
      default:
        throw new Error("Unexpected preparation provider " + command.$)
    }
    return { $: "Reply", invocation: request.invocation, id: request.id, response }
  }
  const capability = createPreparationCapability({
    canonicalGate,
    performEffect,
    context: { ...context, settings },
    root,
    graphLimits,
    capturedSources: cache
  })
  return { ...capability, perform: (request, options) => capability.perform([request], options) }
}
