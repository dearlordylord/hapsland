import { list } from "@hapsland/source-artifacts/direct-event/value/codec"
import type { DirectObservation } from "@hapsland/native-observation/direct-event/observation"
import { TYPE_INPUT_CONTRACT, FUNCTION_INPUT_CONTRACT } from "@hapsland/review-definition/rules/targets"
import { createPreparationForeign } from "./preparation-foreign.mjs"
import type { PreparationSession } from "../preparation/source-preparation-provider.mjs"

type Input = PreparationSession["input"]["preparation"]
type Item<L> = L extends { readonly $: "Con"; readonly head: infer A } ? A : never
type Contract = Item<Input["contracts"]>
type Operation = Item<Input["candidates"]>["operation"]

type ForeignPorts = Parameters<typeof createPreparationForeign>[0]
type SessionPorts = Omit<ForeignPorts, "graphLimits"> & {
  readonly graphLimits: NonNullable<ForeignPorts["graphLimits"]>
  readonly invocation: number
  readonly observation: DirectObservation
  readonly candidate: DirectObservation["candidates"][number]
}

const operations: Record<DirectObservation["candidates"][number]["operation"], Operation> = {
  add: { $: "CandidateAdd" },
  update: { $: "CandidateUpdate" },
  delete: { $: "CandidateDelete" },
  move: { $: "CandidateMove" }
}
const contract = (name: string): Contract =>
  name === TYPE_INPUT_CONTRACT
    ? { $: "PreparationSelection.TypeContract" }
    : name === FUNCTION_INPUT_CONTRACT
      ? { $: "PreparationSelection.FunctionContract" }
      : { $: "PreparationSelection.OtherContract", name }

/** Fresh resident candidate only. Native facts are encoded unchanged; the Bend
 * machine selects contracts, roots and progression. The caller supplies the
 * admitted workspace and exact Canonical invocation, and owns cache lifetime.
 * Frozen/line-scoped replays are separate inputs, never inferred here. */
export function createResidentPreparationSession(ports: SessionPorts): PreparationSession {
  const { invocation, observation, candidate, context, graphLimits } = ports
  if (graphLimits === undefined) throw new TypeError("Missing resident preparation graph limits")
  const foreign = createPreparationForeign(ports)
  const verified = observation.verifiedPostEditHunks
  const selectedContract = typeof context.inputContract === "function" ? context.inputContract() : context.inputContract
  const contracts = selectedContract === undefined ? [TYPE_INPUT_CONTRACT, FUNCTION_INPUT_CONTRACT] : [selectedContract]
  return {
    invocation,
    machine: foreign.machine,
    perform: foreign.perform,
    decode: foreign.decode,
    revoke() {},
    close() {},
    input: {
      invocation: BigInt(invocation),
      preparation: {
        $: "Input",
        candidates: list([
          {
            $: "Candidate",
            path: candidate.path,
            operation: operations[candidate.operation],
            added_lines: list(candidate.addedLines ?? [])
          }
        ]),
        contracts: list(contracts.map(contract)),
        limits: {
          $: "../../../../agent-flow-bend/ImportGraph.Limits",
          version: 1n,
          source_bytes: BigInt(graphLimits.sourceBytes),
          tree_bytes: BigInt(graphLimits.treeBytes),
          files: BigInt(graphLimits.files),
          read_bytes: BigInt(graphLimits.readBytes),
          outgoing_edges: BigInt(graphLimits.outgoingEdges),
          depth: BigInt(graphLimits.depth),
          work: BigInt(graphLimits.work)
        },
        frozen: { $: "None" },
        line: { $: "None" },
        verified:
          verified === undefined
            ? { $: "None" }
            : {
                $: "Some",
                value: {
                  $: "PreparationSelection.VerifiedSpans",
                  path: verified.path,
                  content_hash: verified.contentHash,
                  hunks: list(
                    verified.hunks.map((hunk) => ({
                      $: "../../../../native-observation/src/direct-event/edit-attribution/RootAttribution.Hunk",
                      path: hunk.path,
                      verified: hunk.verified,
                      location: {
                        $: "../../../../native-observation/src/direct-event/edit-attribution/RootAttribution.Location",
                        start: {
                          $: "../../../../native-observation/src/direct-event/edit-attribution/RootAttribution.Position",
                          line: BigInt(hunk.location.start.line),
                          column: BigInt(hunk.location.start.column)
                        },
                        end: {
                          $: "../../../../native-observation/src/direct-event/edit-attribution/RootAttribution.Position",
                          line: BigInt(hunk.location.end.line),
                          column: BigInt(hunk.location.end.column)
                        }
                      }
                    }))
                  )
                }
              },
        native_patch:
          observation.nativePatchCommand === undefined
            ? { $: "None" }
            : { $: "Some", value: observation.nativePatchCommand },
        advicee_host: observation.advicee.host,
        before_analyze: true
      }
    }
  }
}
