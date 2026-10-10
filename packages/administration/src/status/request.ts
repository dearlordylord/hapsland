import * as Schema from "effect/Schema"

export const StatusRequest = Schema.Struct({
  version: Schema.Literal(1),
  operation: Schema.Literal("status"),
  cwd: Schema.String,
  sessionId: Schema.optionalKey(Schema.NonEmptyString),
  format: Schema.optionalKey(Schema.Literals(["json", "human"]))
})
export type StatusRequest = typeof StatusRequest.Type
