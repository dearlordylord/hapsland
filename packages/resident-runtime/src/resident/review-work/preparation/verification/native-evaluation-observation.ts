import type { PreparationContext } from "../context.ts"
import type { PlannedPreparationItem } from "./native-preparation-planning.ts"

export const observePlannedEvaluation = (
  context: PreparationContext<"inspection" | "residentInspection">,
  item: PlannedPreparationItem
): void => {
  const inspectionEvaluationRouteFact = (
    item: PlannedPreparationItem,
    evaluationId: string | undefined
  ): Parameters<typeof context.deps.inspection.offer>[2] => ({
    kind: "evaluation-route",
    route:
      item.kind === "owner"
        ? "fresh"
        : item.kind === "cached"
          ? "cached"
          : item.join === "advice"
            ? "existing-advice"
            : item.join === "pending"
              ? "joined-pending"
              : "joined-claimed",
    semanticIdentity: item.outcome.prepared.identity,
    path: item.outcome.path,
    declaration: item.outcome.prepared.input.declaration.name,
    original:
      evaluationId === undefined ? { status: "missing", reason: "not-captured" } : { status: "linked", evaluationId }
  })
  const receipt = context.job.inspectionReceipt
  if (item.kind === "owner") context.deps.residentInspection.forgetOrigin(item.evaluationKey)
  if (receipt === undefined || !context.deps.inspection.isEnabled(receipt.scope.root)) return
  if (item.kind === "owner") context.deps.residentInspection.registerOrigin(item.evaluationKey)
  const evaluationId = context.deps.residentInspection.evaluationId(item.evaluationKey)
  context.deps.inspection.offer(
    receipt.scope,
    { ...receipt.correlation, ...(evaluationId === undefined ? {} : { evaluationId }) },
    inspectionEvaluationRouteFact(item, evaluationId)
  )
}
