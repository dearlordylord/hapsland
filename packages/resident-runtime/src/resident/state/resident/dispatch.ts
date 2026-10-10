import { type DispatchRegistry, type DispatchState } from "../dispatch.ts"
import * as Effect from "effect/Effect"
import { type ResidentTransaction } from "./transaction.ts"
import { type CapacityLedger, capacityOperations } from "../capacity/operations.ts"

export const residentDispatch = <Pending, DispatchKey, DispatchValue>({
  read,
  commitAllEffect,
  residentLifetime
}: ResidentTransaction<Pending, DispatchKey, DispatchValue>) =>
  ({
    read: read.pipe(Effect.map((current) => current.records.dispatch)),
    modify: <A>(
      operation: (
        current: DispatchRegistry<DispatchKey, DispatchValue>,
        ledger: CapacityLedger
      ) => readonly [A, DispatchRegistry<DispatchKey, DispatchValue>]
    ) =>
      commitAllEffect((draft, records) => {
        const current = records.dispatch
        const owner = capacityOperations(
          (run) => run(draft),
          (run) => run(draft),
          residentLifetime
        )
        const [value, dispatch] = operation(current, owner)
        return [value, { ...records, dispatch }]
      })
  }) satisfies DispatchState<DispatchKey, DispatchValue>
