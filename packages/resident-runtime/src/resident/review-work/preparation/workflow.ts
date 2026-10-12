import type { IngressJob } from "../../work-ownership/jobs.ts"
import type { CapacityReservation } from "../../state/capacity/model.ts"
import type { PostContext } from "./post-preparation-host.mjs"
import type { createResidentPreparationBinding } from "../composition/preparation-binding.ts"

/** Per-job host resource scope. Canonical's whole Source machine owns gates,
 * candidate progression, recovery and completion; the binding owns native
 * finalization and retains failed cleanup through resident shutdown. */
export const makeResidentPreparation = (
  deps: PostContext["deps"],
  binding: ReturnType<typeof createResidentPreparationBinding>
) => ({
  residentPrepare: (job: IngressJob, sequence: number) =>
    binding.prepare({
      deps,
      job,
      sequence,
      expectedActivityUnits: [],
      unassignedClaims: new Set<string>(),
      activeWorkspaces: new Set<CapacityReservation>(),
      preparationSignal: job.work?.controller.signal ?? deps.residentLifetimeController.signal
    })
})
