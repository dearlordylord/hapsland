/** Production boundary; composition-only publication remains private to the trusted bridge. */
export {
  CANONICAL_MAX_BYTES,
  CANONICAL_MAX_UNITS,
  probabilityWords,
  encodeCanonicalEvent,
  initialCanonical,
  projectCanonical,
  stepCanonical
} from "./canonical-boundary.ts"
export type { ProbabilityWords } from "./canonical-boundary.ts"
export type {
  ReviewServiceRequestOutcome,
  CompletedEditReason,
  QuietRoundFacts,
  CapacityPurpose,
  CollectorReason,
  ReuseMemberState,
  ProspectiveFacts,
  CleanupFacts,
  CapacityRefusal,
  ReviewCapacityReservationRecord,
  CapacityView,
  CanonicalProjection,
  ResidentActionCommand,
  CanonicalDomainEvent,
  CanonicalPolicyDecision,
  CanonicalOutput,
  CanonicalEvent
} from "./models.ts"
