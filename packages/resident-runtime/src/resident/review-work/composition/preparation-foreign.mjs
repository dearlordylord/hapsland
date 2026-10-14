import { createFinalizationSession } from "@hapsland/review-execution/direct-event/preparation"
import * as Effect from "effect/Effect"
import { ResidentProviderPermit } from "../../state/resolver-custody/resident-provider-permit.mjs"
import { resize } from "../../state/capacity/reservations.ts"
import { analysisWorkspaceBytes } from "../../work-ownership/workspace.ts"
import { createBendResolver } from "@hapsland/source-analysis/direct-event/graph-resolution"
import { list } from "@hapsland/source-artifacts/direct-event/value/codec"
import { createPhysicalPreparationCapability } from "@hapsland/review-execution/direct-event/preparation/physical-effects"
/**
 * @typedef {import("@hapsland/review-execution/direct-event/preparation").PreparationPorts} PreparationPorts
 * @typedef {Parameters<Parameters<typeof createBendResolver>[0]["drive"]>[0]} GraphSession
 * @typedef {Pick<ReturnType<typeof import("./owned-artifact-driver.mjs").createOwnedArtifactDriver<GraphSession | import("@hapsland/review-execution/direct-event/preparation").FinalizationSession>>, "state" | "allocateInvocation" | "constructionFailed" | "drive">} GraphDriver
 * @typedef {import("@hapsland/review-execution/direct-event/preparation/physical-effects").RootFacts} RootFacts
 * @typedef {Awaited<ReturnType<PreparationPorts["performEffect"]>>} PreparationReply
 */
/**
 * @param {{
 * connection: {bridge: ReturnType<typeof import("../../state/resolver-custody/resident-owner-transaction.mjs").createResidentOwnerTransaction>, runtime: Pick<ReturnType<typeof import("../../state/resident/runtime.ts").residentRuntime>, "rejectCapacity">, preparation: Extract<import("../../state/capacity/model.ts").PreparationAdmission, {status: "admitted"}>},
 * owner: import("@hapsland/agent-flow-bend/canonical-resolver-owner").CanonicalResolverOwner,
 * driver: GraphDriver,
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
 * @returns {ReturnType<typeof createPhysicalPreparationCapability>}
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
  graphLimits,
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
  return createPhysicalPreparationCapability({
    root,
    rootIdentity,
    context,
    cache,
    settings,
    ...(graphLimits === undefined ? {} : { graphLimits }),
    ...(onRoot === undefined ? {} : { onRoot }),
    canonicalGate,
    async runFinalization(input, execution) {
      const parent = execution.ownerLease
      const invocation = driver.allocateInvocation({
        $: "Parent",
        invocation: parent.invocation,
        generation: parent.generation,
        request: parent.request
      })
      const session = createFinalizationSession(invocation, input, execution, canonicalGate)
      const result = await driver.drive(session, session.input, execution)
      if (!("finalization" in result)) throw new TypeError("Canonical did not accept finalization")
      return result.finalization
    },
    async admitMaterialization(capture, preflight, options) {
      const bytes = analysisWorkspaceBytes(
        capture.path,
        Number(capture.bytes),
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
      return { $: "MaterializationDone", requested: BigInt(bytes), result: admission }
    },
    async rejectMaterializationCapacity(options) {
      await Effect.runPromise(
        connection.runtime
          .rejectCapacity()
          .pipe(Effect.provideService(ResidentProviderPermit, { credential: options.ownerLease }))
      )
    },
    async recordMaterializationCapacity() {
      await Effect.runPromise(
        residentContext
          ? residentContext.deps.residentRecordAnalytics(residentContext.job, "capacity-rejected")
          : Effect.void
      )
    },
    async resolveRoot(request, rootFacts, options) {
      /** @type {import("@hapsland/source-analysis/direct-event/graph-resolution/composition").GraphOutcome | undefined} */
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
      return {
        unit,
        references:
          "finalFrame" in terminal && terminal.finalFrame.$ === "Some" ? terminal.finalFrame.value.references : list([])
      }
    }
  })
}
