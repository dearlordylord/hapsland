import core, {
  type Catalog,
  type Declaration,
  type Failure,
  type NodePlan,
  type Operation,
  type ReferencePlan,
  type Step
} from "./analyzer-core.js"
import { list, unlist } from "@hapsland/source-artifacts/direct-event/value/codec"
import type {
  ArtifactReference,
  ReviewArtifact,
  ReviewNode,
  ReviewUnit
} from "@hapsland/source-artifacts/direct-event/artifact-model"
import type { GraphDeclaration } from "../languages/contracts.ts"

type Reason = "missing-evidence" | "unsupported-reference" | "reference-limit"
export type UnitAnalysis =
  | { readonly status: "ready"; readonly unit: ReviewUnit }
  | {
      readonly status: "unsupported"
      readonly root: ReviewArtifact
      readonly unit: ReviewUnit
      readonly reason: Reason
    }
export type UnitOutcome =
  | { readonly status: "ready"; readonly name: string }
  | { readonly status: "unsupported"; readonly name: string; readonly reason: Reason }
const failures: Record<Failure["$"], Reason> = {
  "Model.MissingEvidence": "missing-evidence",
  "Model.UnsupportedReference": "unsupported-reference",
  "Model.ReferenceLimit": "reference-limit"
}
const omissions = {
  "Model.Unresolved": "unresolved",
  "Model.UnsupportedSyntax": "unsupported",
  "Model.LimitExceeded": "reference-limit"
} as const

// Slots preserve native artifact identity. Encoding carries parser facts only;
// lookup, expanded/referenced identities, limits and failure precedence live in Core.
const encode = (parsed: readonly GraphDeclaration[], supporting: ReadonlyMap<string, GraphDeclaration>) => {
  const artifacts: ReviewArtifact[] = []
  const declaration = (value: GraphDeclaration): Declaration => {
    const slot = artifacts.length
    artifacts.push(value.artifact)
    return {
      $: "Model.Declaration",
      slot,
      identity: value.artifact.id,
      name: value.artifact.name,
      references: list(
        value.references.map((reference) =>
          reference.kind === "named"
            ? {
                $: "Model.Named" as const,
                name: reference.name,
                target_id:
                  reference.targetId === undefined
                    ? { $: "None" as const }
                    : { $: "Some" as const, value: reference.targetId }
              }
            : { $: "Model.Unsupported" as const, name: reference.name }
        )
      )
    }
  }
  const catalog: Catalog = {
    $: "Model.Catalog",
    declarations: list(parsed.map(declaration)),
    supporting: list(
      [...supporting].map(([key, value]) => ({ $: "Model.Supporting" as const, key, declaration: declaration(value) }))
    )
  }
  return { catalog, artifacts }
}
const unexpectedOperation = (): never => {
  throw new TypeError("Unexpected local analyzer native command")
}
const run = (
  catalog: Catalog,
  purpose: "Trees" | "Outcomes" | "Preflight",
  operate: (operation: Operation) => void = unexpectedOperation
): Extract<Step, { $: "Completed" | "PreflightCompleted" }> => {
  let step = core.initial(catalog, { $: purpose })
  for (;;) {
    switch (step.$) {
      case "NextRoot":
      case "Continue":
        step = core.advance(step)
        break
      case "Engine":
        operate(step.operation)
        step = core.resume(step, { $: "Ack", request: step.request })
        break
      case "Completed":
      case "PreflightCompleted":
        return step
      case "Exhausted":
      case "InvalidReply":
        throw new TypeError("Local analyzer refused its own native binding")
    }
  }
}
const materializeReference = (reference: ReferencePlan, artifacts: readonly ReviewArtifact[]): ArtifactReference => {
  const site = { symbol: reference.symbol }
  switch (reference.$) {
    case "Model.Included":
      return { kind: "included", site, target: reference.target }
    case "Model.Expanded":
      return { kind: "expanded", site, node: materialize(reference.node, artifacts) }
    case "Model.Omitted":
      return {
        kind: "omitted",
        site,
        target:
          reference.target.$ === "Some"
            ? { kind: "known", artifactId: reference.target.value }
            : { kind: "unresolved", symbol: reference.symbol },
        reason: omissions[reference.reason.$]
      }
  }
}
const materialize = (node: NodePlan, artifacts: readonly ReviewArtifact[]): ReviewNode => ({
  artifact: artifacts[node.slot]!,
  references: unlist(node.references).map((reference) => materializeReference(reference, artifacts))
})
export const analyzeDeclarations = (
  parsed: readonly GraphDeclaration[],
  supporting: ReadonlyMap<string, GraphDeclaration>
): readonly UnitAnalysis[] => {
  const { catalog, artifacts } = encode(parsed, supporting)
  const completed = run(catalog, "Trees")
  if (completed.$ !== "Completed") throw new TypeError("Unexpected local analyzer terminal")
  return unlist(completed.outcomes).map((outcome) => {
    if (outcome.tree.$ !== "Some") throw new TypeError("Missing local analyzer tree")
    const unit = { root: materialize(outcome.tree.value, artifacts) }
    return outcome.failure.$ === "None"
      ? { status: "ready", unit }
      : { status: "unsupported", root: artifacts[outcome.root]!, unit, reason: failures[outcome.failure.value.$] }
  })
}
export const declarationOutcomes = (
  parsed: readonly GraphDeclaration[],
  supporting: ReadonlyMap<string, GraphDeclaration>
): readonly UnitOutcome[] => {
  const { catalog, artifacts } = encode(parsed, supporting)
  const completed = run(catalog, "Outcomes")
  if (completed.$ !== "Completed") throw new TypeError("Unexpected local analyzer terminal")
  return unlist(completed.outcomes).map((outcome) =>
    outcome.failure.$ === "None"
      ? { status: "ready", name: artifacts[outcome.root]!.name }
      : { status: "unsupported", name: artifacts[outcome.root]!.name, reason: failures[outcome.failure.value.$] }
  )
}
const encodedBytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), "utf8")
const executeOperation = (operation: Operation, artifacts: readonly ReviewArtifact[], stack: number[]): void => {
  switch (operation.$) {
    case "Model.Push":
      stack.push(operation.value)
      break
    case "Model.MeasureArtifact":
      stack.push(encodedBytes(artifacts[operation.slot]))
      break
    case "Model.MeasureText":
      stack.push(encodedBytes(operation.value))
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
  }
}
export const preflightDeclarations = (
  parsed: readonly GraphDeclaration[],
  supporting: ReadonlyMap<string, GraphDeclaration>
): number => {
  const { catalog, artifacts } = encode(parsed, supporting),
    stack: number[] = []
  const completed = run(catalog, "Preflight", (operation) => executeOperation(operation, artifacts, stack))
  if (completed.$ !== "PreflightCompleted") throw new TypeError("Unexpected local analyzer terminal")
  return stack[0]!
}
