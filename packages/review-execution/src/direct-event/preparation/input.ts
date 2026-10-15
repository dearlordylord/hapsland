import { list } from "@hapsland/source-artifacts/direct-event/value/codec"
import type { DirectObservation } from "@hapsland/native-observation/direct-event/observation"
import type { GraphLimits } from "@hapsland/canonical-policy/canonical/graph-limits"
import { TYPE_INPUT_CONTRACT, FUNCTION_INPUT_CONTRACT } from "@hapsland/review-definition/rules/targets"
import type { Input } from "./preparation-core.js"
import type { SourcePreparationContext } from "./contract.ts"
type Item<L> = L extends { readonly $: "Con"; readonly head: infer A } ? A : never
type Contract = Item<Input["contracts"]>
type Operation = Item<Input["candidates"]>["operation"]
export type PreparationObservation = Omit<DirectObservation, "advicee"> & {
  readonly advicee?: DirectObservation["advicee"]
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

/** Mechanical encoding into the existing whole Preparation ABI. Canonical
 * supplies the outer invocation; Bend owns all candidate/root progression.
 * Source-only calls carry no advicee; an empty host field makes no identity claim.
 */
export function encodePreparationInput({
  observation,
  candidates = observation.candidates,
  context,
  graphLimits,
  frozenNames,
  line,
  beforeAnalyze
}: {
  readonly observation: PreparationObservation
  readonly candidates?: DirectObservation["candidates"]
  readonly context: Pick<SourcePreparationContext, "inputContract">
  readonly graphLimits: GraphLimits
  readonly frozenNames?: ReadonlyMap<string, ReadonlySet<string>>
  readonly line?: number
  readonly beforeAnalyze: boolean
}): Input {
  const verified = observation.verifiedPostEditHunks
  const selectedContract = typeof context.inputContract === "function" ? context.inputContract() : context.inputContract
  const contracts = selectedContract === undefined ? [TYPE_INPUT_CONTRACT, FUNCTION_INPUT_CONTRACT] : [selectedContract]
  return {
    $: "Input",
    candidates: list(
      candidates.map((candidate) => ({
        $: "Candidate",
        path: candidate.path,
        operation: operations[candidate.operation],
        added_lines: list(candidate.addedLines ?? [])
      }))
    ),
    contracts: list(contracts.map(contract)),
    limits: {
      $: "../../../../agent-flow-bend/ImportGraph.Limits",
      version: 1,
      source_bytes: Number(graphLimits.sourceBytes),
      tree_bytes: Number(graphLimits.treeBytes),
      files: Number(graphLimits.files),
      read_bytes: Number(graphLimits.readBytes),
      outgoing_edges: Number(graphLimits.outgoingEdges),
      depth: Number(graphLimits.depth),
      work: Number(graphLimits.work)
    },
    frozen:
      frozenNames === undefined
        ? { $: "None" }
        : {
            $: "Some",
            value: list([...frozenNames].map(([path, names]) => ({ $: "FrozenPath", path, names: list([...names]) })))
          },
    line: line === undefined ? { $: "None" } : { $: "Some", value: Number(line) },
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
                      line: Number(hunk.location.start.line),
                      column: Number(hunk.location.start.column)
                    },
                    end: {
                      $: "../../../../native-observation/src/direct-event/edit-attribution/RootAttribution.Position",
                      line: Number(hunk.location.end.line),
                      column: Number(hunk.location.end.column)
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
    advicee_host: observation.advicee?.host ?? "",
    before_analyze: beforeAnalyze
  }
}
