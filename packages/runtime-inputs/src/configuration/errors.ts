import * as Schema from "effect/Schema"
import * as SchemaIssue from "effect/SchemaIssue"

/** Bounded, source-labelled configuration failure safe for process output. */
export class ConfigurationError extends Schema.TaggedError<ConfigurationError>()("ConfigurationError", {
  source: Schema.String,
  field: Schema.String,
  reason: Schema.String
}) {}

export const configurationError = (source: string, field: string, reason: string): ConfigurationError =>
  new ConfigurationError({ source, field, reason: reason.replaceAll(/\s+/g, " ").slice(0, 240) })

const issuePathSegment = (item: unknown): unknown =>
  typeof item === "object" && item !== null && "key" in item ? item.key : item
const appendIssuePath = (field: string, segment: unknown): string => {
  if (typeof segment === "number") return `${field}[${segment}]`
  if (typeof segment !== "string") return field
  return field.length === 0 ? segment : `${field}.${segment}`
}
const issuePath = (path: ReadonlyArray<unknown> | undefined): string => {
  let field = ""
  for (const item of path ?? []) field = appendIssuePath(field, issuePathSegment(item))
  return field.length === 0 ? "$" : field
}

/** Convert a pinned Effect Schema issue into a bounded source-labelled diagnostic. */
export const schemaConfigurationError = (source: string, cause: unknown, fallback: string): ConfigurationError => {
  if (!Schema.isSchemaError(cause)) return configurationError(source, "$", fallback)
  const first = SchemaIssue.makeFormatterStandardSchemaV1()(cause.issue).issues[0]
  return configurationError(source, first === undefined ? "$" : issuePath(first.path), first?.message ?? fallback)
}
