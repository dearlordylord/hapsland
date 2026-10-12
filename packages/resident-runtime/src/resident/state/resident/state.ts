import * as Effect from "effect/Effect"
import { type CapacityLimits, defaultLimits } from "../capacity/model.ts"
import { makeResidentTransaction, residentStateFacades } from "./assembly.ts"

export const makeResidentState = <Pending = never, DispatchKey = string, DispatchValue = never>(
  limits: CapacityLimits = defaultLimits,
  requestedLifetime?: string
) =>
  makeResidentTransaction<Pending, DispatchKey, DispatchValue>(limits, requestedLifetime).pipe(
    Effect.map(residentStateFacades),
    Effect.withSpan("ResidentState.make")
  )

export {
  encodedBytesWithin,
  GLOBAL_ITEM_LIMIT,
  GLOBAL_BYTE_LIMIT,
  PARTITION_ITEM_LIMIT,
  PARTITION_BYTE_LIMIT,
  MAX_PARTITION_IDENTITIES,
  MAX_PARTITION_KEY_BYTES,
  MAX_PARTITION_IDENTITY_BYTES,
  MAX_COLLECTION_TOKEN_IDENTITIES,
  MAX_COLLECTION_TOKEN_KEY_BYTES
} from "../capacity/model.ts"
export type {
  CapacityLimits,
  CapacityReservation,
  PreparationAdmission,
  CapacityResize,
  CapacitySnapshot
} from "../capacity/model.ts"
export type { CapacityLedger } from "../capacity/operations.ts"
export type { AdviceCapture } from "./model.ts"
export type { CapacityPurpose } from "@hapsland/canonical-policy/canonical/adapter"
