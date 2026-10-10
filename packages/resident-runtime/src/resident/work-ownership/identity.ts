import { type DirectObservation } from "@hapsland/native-observation/direct-event/observation"
import { sourcePartition } from "../recipient/identity.ts"

export const evaluationSourcePartition = (
  observation: DirectObservation,
  workId: string,
  credentialGeneration: number | "controlled",
  settingsDigest: string
) =>
  `${sourcePartition(observation.root, observation.advicee)}\0work:${workId}\0credential-generation:${credentialGeneration}\0settings:${settingsDigest}`
