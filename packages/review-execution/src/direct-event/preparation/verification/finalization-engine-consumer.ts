// Finite engine verification only; production dispatches through Canonical.
import {
  createPreparationFinalizationExecution,
  type FinalizationInput,
  type FinalizedOutcome,
  type Execution
} from "../preparation-finalization.ts"

export function createPreparationFinalizationConsumer(
  binding: Parameters<typeof createPreparationFinalizationExecution>[0]
) {
  const createExecution = createPreparationFinalizationExecution(binding)
  return async (input: FinalizationInput, options: Execution = {}): Promise<readonly FinalizedOutcome[]> => {
    const execution = createExecution(input, options)
    let step = execution.initial()
    for (;;) {
      const next = execution.advance(step)
      if (next !== undefined) {
        step = next
        continue
      }
      const accepted = execution.accepted(step)
      if (accepted !== undefined) return accepted
      const synchronous = execution.performSync(step)
      const response = synchronous === undefined ? await execution.performAsync(step) : synchronous.value
      step = execution.resume(step, response)
    }
  }
}
