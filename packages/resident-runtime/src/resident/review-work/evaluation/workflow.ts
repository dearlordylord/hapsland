import type { UnitJob } from "../../work-ownership/jobs.ts"
import type { EvaluationDependencies } from "./native-retention.ts"
import type { createResidentPreparationBinding } from "../composition/preparation-binding.ts"

export const makeResidentEvaluation = (
  deps: EvaluationDependencies,
  owner: Pick<ReturnType<typeof createResidentPreparationBinding>, "evaluate">
) => ({ residentEvaluateUnit: (job: UnitJob, sequence: number) => owner.evaluate(deps, job, sequence) })
