import { Config, Effect, Option } from "effect";

/** Source-free diagnostics and controlled subprocess observation paths. */
export const makeResidentRuntimeConfiguration = Effect.fn("ResidentRuntime.configuration")(function* () {
  const values = yield* Config.all({
    debug: Config.String("REVIEW_RESIDENT_DEBUG").pipe(Config.withDefault("0")),
    admissionAcceptedPath: Config.option(Config.String("REVIEW_RESIDENT_ADMISSION_ACCEPTED_PATH")),
    admissionTracePath: Config.option(Config.String("REVIEW_RESIDENT_ADMISSION_TRACE_PATH")),
    admissionSalt: Config.option(Config.String("HAPSLAND_94_SALT")),
    collectDisconnectPath: Config.option(Config.String("REVIEW_RESIDENT_COLLECT_DISCONNECT_PATH")),
  });
  return Object.freeze({
    debug: values.debug === "1",
    admissionAcceptedPath: Option.getOrUndefined(values.admissionAcceptedPath),
    admissionTracePath: Option.getOrUndefined(values.admissionTracePath),
    admissionSalt: Option.getOrUndefined(values.admissionSalt),
    collectDisconnectPath: Option.getOrUndefined(values.collectDisconnectPath),
  });
});
