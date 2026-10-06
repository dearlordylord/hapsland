import * as Config from "effect/Config"
import * as Option from "effect/Option"
import { join } from "node:path"
import { HAPSLAND_CONFIG_DIRECTORY, HAPSLAND_STATE_DIRECTORY } from "./user-paths.ts"

export const statePathConfig = Config.option(Config.NonEmptyString("REVIEW_STATE_PATH")).pipe(
  Config.flatMap(
    Option.match({
      onSome: Config.succeed,
      onNone: () =>
        Config.NonEmptyString("REVIEW_CONSENT_FILE").pipe(
          Config.withDefault(join(HAPSLAND_CONFIG_DIRECTORY, "consent"))
        )
    })
  )
)

export const activityPathConfig = Config.NonEmptyString("REVIEW_ACTIVITY_PATH").pipe(
  Config.withDefault(join(HAPSLAND_STATE_DIRECTORY, "activity"))
)

export const userConfigPathConfig = Config.option(Config.NonEmptyString("REVIEW_USER_CONFIG_PATH"))
