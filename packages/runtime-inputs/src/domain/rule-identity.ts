import * as Schema from "effect/Schema"

/** Stable rule identity; an optional namespace is identity rather than a file path. */
export const RuleIdentitySchema = Schema.String.check(
  Schema.isPattern(/^(?!\.{1,2}(?:\/|$))(?!.*\/\.{1,2}(?:\/|$))[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+)*$/u)
)
