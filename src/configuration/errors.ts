import * as Schema from "effect/Schema";

/** Bounded, source-labelled configuration failure safe for process output. */
export class ConfigurationError extends Schema.TaggedError<ConfigurationError>()(
  "ConfigurationError",
  {
    source: Schema.String,
    field: Schema.String,
    reason: Schema.String,
  },
) {}

export const configurationError = (
  source: string,
  field: string,
  reason: string,
): ConfigurationError =>
  new ConfigurationError({
    source,
    field,
    reason: reason.replaceAll(/\s+/g, " ").slice(0, 240),
  });
