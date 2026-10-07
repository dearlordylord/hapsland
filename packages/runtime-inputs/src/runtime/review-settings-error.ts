import * as Schema from "effect/Schema"

/** Settings failures shared by configuration loading and resident dispatch. */
export class ReviewConfigError extends Schema.TaggedError<ReviewConfigError>()("ReviewConfigError", {
  source: Schema.String,
  field: Schema.String,
  reason: Schema.String
}) {}
