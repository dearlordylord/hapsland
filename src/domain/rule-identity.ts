import * as Schema from "effect/Schema"

/**
 * Shared structural constraint for local pack and rule identities.
 * The slash, colon, and backslash separators and whitespace are reserved by
 * qualified identity and path resolution.
 */
export const RuleIdentitySchema = Schema.String.check(Schema.isMinLength(1), Schema.isPattern(/^[^/:\\\s]+$/u))
