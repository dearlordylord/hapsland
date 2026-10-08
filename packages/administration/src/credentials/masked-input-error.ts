import { Schema } from "effect"

export class MaskedInputError extends Schema.TaggedError<MaskedInputError>()("MaskedInputError", {
  message: Schema.String,
  reason: Schema.Literals(["cancelled", "invalid"])
}) {}
