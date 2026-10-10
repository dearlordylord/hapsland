import { selectFile } from "@hapsland/runtime-inputs/configuration/decision"
import { type ReviewSettings } from "@hapsland/review-definition/runtime/review-config"

export const fileSelectionReadiness = (settings: ReviewSettings) => {
  const includesEmpty = settings.configuration.policy.includes.length === 0
  const userExcludeAll = settings.configuration.policy.excludes.some(
    (entry) => entry.origin.layer === "user" && entry.value === "**/*"
  )
  const excludeAll = settings.configuration.policy.excludes.some((entry) => entry.value === "**/*")
  const selected = selectFile({ protected: false, excluded: excludeAll, includesEmpty, included: true }) === "selected"
  return {
    selected,
    observed: includesEmpty
      ? "effective include list selects no files"
      : userExcludeAll
        ? "user file settings exclude all files"
        : excludeAll
          ? "effective file settings exclude all files"
          : "effective file settings loaded"
  }
}
