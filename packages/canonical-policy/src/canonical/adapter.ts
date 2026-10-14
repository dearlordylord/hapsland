/** Production boundary; composition-only publication remains private to the trusted bridge. */
export {
  CANONICAL_MAX_BYTES,
  CANONICAL_MAX_UNITS,
  probabilityWords,
  encodeCanonicalEvent,
  initialCanonical,
  decideCanonicalConfiguration,
  projectCanonical,
  stepCanonical
} from "./canonical-boundary.ts"
export type { ConfigurationDecisionEvent, ProbabilityWords } from "./canonical-boundary.ts"
export type {
  JevRequestOutcome,
  CompletedEditReason,
  QuietRoundFacts,
  CapacityPurpose,
  CollectorReason,
  ReuseMemberState,
  ProspectiveFacts,
  CleanupFacts,
  CapacityRefusal,
  CapacityCharge,
  CapacityView,
  CanonicalProjection,
  CanonicalActionRequest,
  CanonicalDomainEvent,
  CanonicalPolicyDecision,
  CanonicalOutput,
  CanonicalEvent
} from "./models.ts"
