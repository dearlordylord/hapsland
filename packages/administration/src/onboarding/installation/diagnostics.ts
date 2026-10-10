import type { DoctorCheck } from "../doctor.ts"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import { discoverWorkingTreeRoot } from "@hapsland/native-observation/repository/root"
import { loadReviewSettings } from "@hapsland/review-definition/runtime/review-config"
import { resolveCredential } from "@hapsland/credential-storage/credentials/owner"
import { fileSelectionReadiness } from "../../status/readiness.ts"

export const doctorRepositoryChecks = Effect.fn("Cli.doctorRepositoryChecks")(function* (
  cwd: string,
  userConfigPath: string | undefined
) {
  const rootResult = yield* discoverWorkingTreeRoot(cwd).pipe(Effect.result)
  const { credentialDiagnostic } = yield* Effect.promise(() => import("../credential-diagnostics.ts"))
  if (rootResult._tag === "Failure") {
    return {
      repository: {
        stage: "file-selection",
        status: "unsupported",
        observed: "working tree could not be discovered",
        action: "run doctor from a supported Git working tree"
      } satisfies DoctorCheck,
      credential: {
        stage: "credential-accessibility",
        status: "unknown",
        observed: {
          inspectedContext: "doctor-process",
          configuredEnvironmentVariable: "unknown",
          doctorProcessEnvironment: "unknown-not-inspected",
          actualHookAccessibility: "unknown",
          savedCredentialAccessibility: "unknown-not-inspected-by-this-version",
          reason: "repository configuration is unavailable"
        },
        action: "fix repository discovery, then rerun doctor without passing any secret"
      } satisfies DoctorCheck
    }
  }
  const settingsResult = yield* loadReviewSettings(
    rootResult.success,
    userConfigPath === undefined ? {} : { userConfigPath }
  ).pipe(Effect.result)
  if (settingsResult._tag === "Failure") {
    return {
      repository: {
        stage: "file-selection",
        status: "conflict",
        observed: "review configuration is invalid",
        action: "repair the reported review configuration, then rerun doctor"
      } satisfies DoctorCheck,
      credential: {
        stage: "credential-accessibility",
        status: "unknown",
        observed: {
          inspectedContext: "doctor-process",
          configuredEnvironmentVariable: "unknown",
          doctorProcessEnvironment: "unknown-not-inspected",
          actualHookAccessibility: "unknown",
          savedCredentialAccessibility: "unknown-not-inspected-by-this-version",
          reason: "credential selection could not be resolved"
        },
        action: "repair review configuration, then rerun doctor without passing any secret"
      } satisfies DoctorCheck
    }
  }
  const settings = settingsResult.success
  const doctorEnvironmentCredential = yield* Config.option(Config.Redacted(settings.credentialEnvVar)).pipe(
    Effect.map((value) => Option.isSome(value) && Redacted.value(value.value).length > 0)
  )
  const credential = yield* resolveCredential({
    envVar: settings.credentialEnvVar,
    root: settings.configuration.policy.root,
    environmentOnly: settings.configuration.policy.credentialEnvVar.origin.layer !== "built-in"
  })
  const fileSelection = fileSelectionReadiness(settings)
  return {
    repository: {
      stage: "file-selection",
      status: fileSelection.selected ? "ready" : "missing",
      observed: fileSelection.observed,
      ...(!fileSelection.selected
        ? { action: "adjust user file includes or excludes to select the files you want reviewed" }
        : {})
    } satisfies DoctorCheck,
    credential: credentialDiagnostic(credential, settings.credentialEnvVar, doctorEnvironmentCredential)
  }
})
