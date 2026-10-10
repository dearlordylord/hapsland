import { formatStatusOutcome } from "../interaction/outcome.ts"
import type { readAnalytics, formatAnalyticsHuman } from "@hapsland/activity-observation/activity/analytics"
import type { formatActivityHuman } from "@hapsland/activity-observation/activity/status"
import { effectiveSessionAnalytics } from "@hapsland/runtime-inputs/configuration/resolve"
import * as Effect from "effect/Effect"
import {
  DEFAULT_CREDENTIAL_ENV_VAR,
  loadReviewSettings,
  type ReviewSettings
} from "@hapsland/review-definition/runtime/review-config"
import { inspectResidentEffect } from "@hapsland/resident-transport/resident/client"
import { resolveCredential } from "@hapsland/credential-storage/credentials/owner"
import { readActivity } from "@hapsland/activity-observation/activity/status"
import type { StatusRequest } from "./request.ts"
import { fileSelectionReadiness } from "./readiness.ts"

type StatusOperation = StatusRequest

type StatusCredential = Effect.Success<ReturnType<typeof resolveCredential>>

const statusFileSelection = (settings: ReviewSettings | undefined): string =>
  settings === undefined ? "unavailable" : fileSelectionReadiness(settings).selected ? "configured" : "none"

const statusReadiness = (settings: ReviewSettings | undefined, credential: StatusCredential) => {
  const configuration = settings === undefined ? "invalid" : "ready"
  const fileSelection = statusFileSelection(settings)
  const present = credential.status === "present"
  return {
    status: configuration === "ready" && present && fileSelection === "configured" ? "ready" : "not-ready",
    configuration,
    fileSelection,
    credentials: {
      envVar: settings?.credentialEnvVar ?? DEFAULT_CREDENTIAL_ENV_VAR,
      present,
      source: credential.source,
      ...(credential.file === undefined ? {} : { file: credential.file }),
      status: credential.status
    }
  }
}

const statusCredential = Effect.fn("Cli.statusCredential")(function* (settings: ReviewSettings | undefined) {
  return yield* resolveCredential({
    envVar: settings?.credentialEnvVar ?? DEFAULT_CREDENTIAL_ENV_VAR,
    ...(settings === undefined ? {} : { root: settings.configuration.policy.root }),
    environmentOnly:
      settings !== undefined && settings.configuration.policy.credentialEnvVar.origin.layer !== "built-in"
  })
})

/**
 * Status is observational: a malformed current configuration must be
 * reported as readiness state, not prevent an explicit session receipt
 * from being read.  It also deliberately stops before constructing any
 * review/backend layer.
 */
const statusConfiguration = Effect.fn("Cli.statusConfiguration")(function* (
  root: string,
  userConfigPath: string | undefined
) {
  const configuration = yield* loadReviewSettings(root, userConfigPath === undefined ? {} : { userConfigPath }).pipe(
    Effect.result
  )
  return configuration._tag === "Success" ? configuration.success : undefined
})

const humanStatusReceipt = (
  operation: StatusOperation,
  output: ReturnType<typeof statusOutput>,
  formatActivity: typeof formatActivityHuman,
  formatAnalytics: typeof formatAnalyticsHuman
) =>
  `${formatStatusOutcome(output.readiness.status, `readiness: ${output.readiness.status} (configuration=${output.readiness.configuration}, files=${output.readiness.fileSelection}, credentials=${output.readiness.credentials.present ? "present" : "absent"})`)}\n${formatActivity(operation.sessionId ?? "<session id required>", output.activity)}\n${formatAnalytics(output.analytics)}`

const statusOutput = (
  operation: StatusOperation,
  root: string,
  readiness: ReturnType<typeof statusReadiness>,
  residentActivity: ReturnType<typeof readActivity>,
  analytics: ReturnType<typeof readAnalytics>
) => ({
  version: 1,
  operation: "status",
  repository: { canonicalRoot: root },
  ...(operation.sessionId === undefined ? {} : { sessionId: operation.sessionId }),
  readiness,
  activity: residentActivity,
  analytics,
  activitySource: "resident-v1"
})

export const runStatusOperation = Effect.fn("Cli.runStatusOperation")(function* (
  operation: StatusOperation,
  root: string,
  activityPath: string,
  userConfigPath: string | undefined
) {
  const settings = yield* statusConfiguration(root, userConfigPath)
  const { readAnalytics, formatAnalyticsHuman } = yield* Effect.promise(
    () => import("@hapsland/activity-observation/activity/analytics")
  )
  const { formatActivityHuman } = yield* Effect.promise(() => import("@hapsland/activity-observation/activity/status"))
  const credential = yield* statusCredential(settings)
  const readiness = statusReadiness(settings, credential)
  const resident = yield* inspectResidentEffect()
  const residentActivity = readActivity({
    statePath: activityPath,
    root,
    sessionId: operation.sessionId ?? "",
    resident
  })
  const analytics = readAnalytics({
    enabled: settings !== undefined && effectiveSessionAnalytics(settings.configuration.policy),
    statePath: activityPath,
    root,
    sessionId: operation.sessionId ?? ""
  })
  const output = statusOutput(operation, root, readiness, residentActivity, analytics)
  return operation.format === "human"
    ? humanStatusReceipt(operation, output, formatActivityHuman, formatAnalyticsHuman)
    : output
})
