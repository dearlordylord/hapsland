import { type DirectObservation } from "@hapsland/native-observation/direct-event/observation"
import { sourceScopeKey } from "../recipient/identity.ts"

/** Limits shared evaluations to the same source scope, work cohort, credentials and settings. */
export const evaluationReuseScopeKey = (
  observation: DirectObservation,
  workId: string,
  credentialGeneration: number | "controlled",
  settingsDigest: string
) =>
  `${sourceScopeKey(observation.root, observation.advicee)}\0work:${workId}\0credential-generation:${credentialGeneration}\0settings:${settingsDigest}`
