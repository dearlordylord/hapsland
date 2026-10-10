import type { admitReview } from "@hapsland/runtime-inputs/configuration/decision"
import { type CredentialResolution } from "@hapsland/credential-storage/credentials/owner"

type DispatchAuthorityCredentialStatus = CredentialResolution["status"] | "not-checked" | "not-required"

export type DispatchAuthorityObservation = {
  readonly kind: "dispatchAuthority"
  readonly sequence: number
  readonly evaluationId: string
  readonly path: string
  readonly decision: "allow" | "deny"
  readonly reason: string
  readonly policyDigest: string
  readonly selected: boolean | null
  readonly admission: ReturnType<typeof admitReview>
  readonly physicalRootVerified: boolean | null
  readonly expectedRootIdentitySha256: string
  readonly credentialStatus: DispatchAuthorityCredentialStatus
  readonly credentialGeneration: number | null
}

export type DispatchAuthorityObservationDetails = {
  readonly decision: DispatchAuthorityObservation["decision"]
  readonly reason: string
  readonly policyDigest: string
  readonly selected: boolean | null
  readonly admission: ReturnType<typeof admitReview>
  readonly physicalRootVerified: boolean | null
  readonly credentialStatus: DispatchAuthorityCredentialStatus
  readonly credentialGeneration: number | null
}
