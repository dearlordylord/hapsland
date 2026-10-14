import type { GraphLimits } from "@hapsland/canonical-policy/canonical/graph-limits"
import preparationCore from "./preparation-core.js"
import { createPreparationMachine, type ResolverWire } from "./preparation-dispatcher.ts"
import {
  type FinalizationInput,
  type FinalizedOutcome,
  type CanonicalRuleGate,
  type Execution
} from "./preparation-finalization.ts"
import { decodePreparationResult } from "./preparation-result-codec.ts"
import type { Command, Request, Reply } from "./preparation-core.js"
import type { SourcePreparationContext } from "./contract.ts"
import { productValue, fromProductValue, list, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
import { TYPE_INPUT_CONTRACT, FUNCTION_INPUT_CONTRACT } from "@hapsland/review-definition/rules/targets"

export type PreparationEffectRequest = Omit<ResolverWire<Request>, "command"> & {
  readonly command: Exclude<ResolverWire<Command>, { readonly $: "RenderUnits" }>
}
export type PreparationExecution = Execution & {
  readonly ownerLease: {
    readonly invocation: bigint
    readonly generation: bigint
    readonly lease: bigint
    readonly request: bigint
  }
}
export type PreparationPorts = {
  readonly canonicalGate: CanonicalRuleGate
  readonly runFinalization: (
    input: FinalizationInput,
    execution: PreparationExecution
  ) => Promise<readonly FinalizedOutcome[]>
  readonly performEffect: (
    request: PreparationEffectRequest,
    execution: PreparationExecution
  ) => Promise<ResolverWire<Reply>>
  readonly context: SourcePreparationContext
  readonly root: string
  readonly graphLimits: GraphLimits
  readonly capturedSources: ReadonlyMap<
    string,
    { readonly contentHash: string; readonly byteLength: number; readonly text?: string }
  >
}

/** Binding for the existing Canonical-owned driver. It allocates no invocation,
 * owns no lifecycle and decodes only after the caller's actual result acceptance.
 * Finalization policy stays inside this capability; external ports provide facts.
 */
export function createPreparationCapability(ports: PreparationPorts) {
  return {
    machine: createPreparationMachine(preparationCore),
    async perform(
      requests: readonly ResolverWire<Request>[],
      execution: PreparationExecution
    ): Promise<ResolverWire<Reply>> {
      if (requests.length !== 1) throw new TypeError("Preparation requires one driver request")
      const request = requests[0]!
      if (execution.ownerLease.invocation !== request.invocation || execution.ownerLease.request !== request.id)
        throw new TypeError("Preparation request disagrees with owner lease")
      const command = request.command
      if (command.$ !== "RenderUnits") return ports.performEffect({ ...request, command }, execution)
      const contract =
        command.contract.$ === "PreparationSelection.FunctionContract"
          ? FUNCTION_INPUT_CONTRACT
          : command.contract.$ === "PreparationSelection.TypeContract"
            ? TYPE_INPUT_CONTRACT
            : command.contract.name
      const declarations = unlist(command.declarations).map(({ id, declaration }) => ({
        artifact: { id, kind: declaration.kind, name: declaration.name },
        location: {
          start: { line: Number(declaration.location.start.line), column: Number(declaration.location.start.column) },
          end: { line: Number(declaration.location.end.line), column: Number(declaration.location.end.column) }
        }
      }))
      const outcomes = await ports.runFinalization(
        {
          invocation: request.invocation,
          command: request.id,
          units: unlist(command.units).map(fromProductValue),
          declarations,
          path: command.context.capture.path,
          frame: {
            contract,
            graphLimits: ports.graphLimits,
            supportingCaptures: ports.capturedSources,
            observation: { root: ports.root },
            context: ports.context
          }
        },
        execution
      )
      return {
        $: "Reply",
        invocation: request.invocation,
        id: request.id,
        response: {
          $: "UnitsRendered",
          outcomes: list(
            outcomes.map((outcome) => ({
              $: "OutcomeReady" as const,
              path: outcome.path,
              prepared: productValue(outcome.prepared)
            }))
          )
        }
      }
    },
    decode: decodePreparationResult
  }
}

export type {
  DirectReviewContext,
  SourcePreparationContext,
  PreparedObservation,
  PreparedSource,
  PrepareOutcome
} from "./contract.ts"
