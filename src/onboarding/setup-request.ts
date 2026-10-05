import * as Schema from "effect/Schema"

export const SETUP_REVIEW_CHOICES = ["enabled", "disabled"] as const
export const SETUP_CREDENTIAL_CHOICES = ["saved", "environment", "skip"] as const

const setupOperationsFor = <const Fields extends Schema.Struct.Fields>(fields: Fields) =>
  Schema.Struct({
    version: Schema.Literal(1),
    operation: Schema.Literal("setup"),
    scope: Schema.Struct({ cwd: Schema.NonEmptyString, review: Schema.Literals(SETUP_REVIEW_CHOICES) }),
    credential: Schema.Literals(SETUP_CREDENTIAL_CHOICES),
    rulesProposalDigest: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))),
    installProposalDigest: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))),
    interactive: Schema.optionalKey(Schema.Boolean),
    newKey: Schema.optionalKey(Schema.Boolean),
    ...fields
  })
export const SetupOperation = Schema.Union([
  setupOperationsFor({
    host: Schema.Literal("codex"),
    codexHome: Schema.optionalKey(Schema.NonEmptyString),
    codexExecutable: Schema.optionalKey(Schema.NonEmptyString)
  }),
  setupOperationsFor({
    host: Schema.Literal("pi"),
    piHome: Schema.optionalKey(Schema.NonEmptyString),
    piExecutable: Schema.optionalKey(Schema.NonEmptyString)
  }),
  setupOperationsFor({
    host: Schema.Literal("claude"),
    claudeHome: Schema.optionalKey(Schema.NonEmptyString),
    claudeExecutable: Schema.optionalKey(Schema.NonEmptyString)
  })
])
export type SetupOperation = typeof SetupOperation.Type
