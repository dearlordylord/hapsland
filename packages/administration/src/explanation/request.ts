import * as Schema from "effect/Schema"
export const ExplainRequest = Schema.Struct({
  version: Schema.Literal(1),
  operation: Schema.Literal("explain"),
  cwd: Schema.String,
  path: Schema.String
})
export type ExplainRequest = typeof ExplainRequest.Type
