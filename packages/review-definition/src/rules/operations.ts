import * as Effect from "effect/Effect"
import { ConfigurationError, configurationError } from "@hapsland/runtime-inputs/configuration/errors"

/** Preserve schema diagnostics; native filesystem failures name the local repair target. */
export const ruleOperation = Effect.fn("Rules.localOperation")(<A>(source: string, field: string, read: () => A) =>
  Effect.try({
    try: read,
    catch: (cause) =>
      cause instanceof ConfigurationError
        ? cause
        : configurationError(source, field, "local rule operation failed; check the file path and permissions")
  })
)
