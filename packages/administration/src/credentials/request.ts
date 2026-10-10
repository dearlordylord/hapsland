import * as Schema from "effect/Schema"
export const CredentialsRequest = Schema.Struct({
  version: Schema.Literal(1),
  operation: Schema.Literal("credentials"),
  cwd: Schema.String
})
export type CredentialsRequest = typeof CredentialsRequest.Type
