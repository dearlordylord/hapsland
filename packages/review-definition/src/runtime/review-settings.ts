import { Cache, Context, Effect, Exit, Layer, Schema } from "effect"
import { join, resolve } from "node:path"
import { freezeCanonicalData } from "@hapsland/canonical-policy/canonical/immutable"
import {
  DEFAULT_USER_CONFIGURATION_FILE,
  PROJECT_CONFIGURATION_FILE
} from "@hapsland/runtime-inputs/configuration/load"
import type { ConfigurationCapture } from "@hapsland/runtime-inputs/configuration/types"
import type { CompiledRule } from "../rules/compiler.ts"
import { loadReviewSettings, type ReviewSettings } from "./review-config.ts"
import type { ReviewConfigError } from "@hapsland/runtime-inputs/runtime/review-settings-error"

export const REVIEW_SETTINGS_CACHE_CAPACITY = 128
export const REVIEW_SETTINGS_CACHE_TTL_MS = 5_000

export const WorkingTreeRoot = Schema.NonEmptyString.check(Schema.isPattern(/^\//)).pipe(
  Schema.brand("WorkingTreeRoot")
)
export type WorkingTreeRoot = typeof WorkingTreeRoot.Type
export const ConfigurationFilePath = Schema.NonEmptyString.check(Schema.isPattern(/^\//)).pipe(
  Schema.brand("ConfigurationFilePath")
)
export type ConfigurationFilePath = typeof ConfigurationFilePath.Type

export const SettingsSource = Schema.Struct({
  root: WorkingTreeRoot,
  userConfiguration: ConfigurationFilePath,
  projectConfiguration: ConfigurationFilePath
})
export interface SettingsSource extends Schema.Schema.Type<typeof SettingsSource> {}

/** Normalize strings only at the filesystem / IPC boundary. */
export const settingsSource = (root: string, userConfigPath?: string): SettingsSource => {
  const canonicalRoot = resolve(root)
  return Schema.decodeUnknownSync(SettingsSource)({
    root: canonicalRoot,
    userConfiguration: resolve(userConfigPath ?? DEFAULT_USER_CONFIGURATION_FILE),
    projectConfiguration: join(canonicalRoot, PROJECT_CONFIGURATION_FILE)
  })
}

/** Shared immutable configuration and compiled rules retained for an edit's entire lifetime. */
export interface ReviewSettingsSnapshot extends ReviewSettings {
  readonly source: SettingsSource
  readonly configuration: ConfigurationCapture
  readonly rules: ReadonlyArray<CompiledRule>
  readonly ruleDigests: ReadonlyArray<string>
}

export interface ReviewSettingsOperations {
  readonly capture: (source: SettingsSource) => Effect.Effect<ReviewSettingsSnapshot, ReviewConfigError>
}
export class ReviewSettingsService extends Context.Service<ReviewSettingsService, ReviewSettingsOperations>()(
  "@hapsland/ReviewSettings"
) {}

export const makeReviewSettings = Effect.fn("ReviewSettings.make")(function* () {
  const cache = yield* Cache.makeWith(
    Effect.fn("ReviewSettings.load")(function* (source: SettingsSource) {
      const settings = yield* loadReviewSettings(source.root, {
        userConfigPath: source.userConfiguration,
        projectConfigPath: source.projectConfiguration
      })
      return freezeCanonicalData({
        ...settings,
        source,
        rules: settings.rules ?? [],
        ruleDigests: settings.ruleDigests ?? []
      })
    }),
    {
      capacity: REVIEW_SETTINGS_CACHE_CAPACITY,
      timeToLive: (exit) => (Exit.isSuccess(exit) ? REVIEW_SETTINGS_CACHE_TTL_MS : 0)
    }
  )
  return ReviewSettingsService.of({
    capture: Effect.fn("ReviewSettings.capture")((source) => Cache.get(cache, Object.freeze({ ...source })))
  })
})
export const reviewSettingsLayer = Layer.effect(ReviewSettingsService, makeReviewSettings())
