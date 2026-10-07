import * as Effect from "effect/Effect"
import { readFile, realpath } from "node:fs/promises"
import { dirname, isAbsolute, relative, resolve } from "node:path"
import { configurationError, ConfigurationError } from "@hapsland/runtime-inputs/configuration/errors"
import type { ConfigurationLayer } from "@hapsland/runtime-inputs/configuration/resolve"
import type {
  RuleReference as ConfigurationRuleReference,
  RuleSettings
} from "@hapsland/runtime-inputs/configuration/types"
import { decodeRuleText, type DecodedRule, type RuleOrigin } from "./schema.ts"
export type RuleReference = Exclude<ConfigurationRuleReference, string> & { readonly origin: RuleOrigin }
export type LoadedRule = DecodedRule & {
  readonly origin: RuleOrigin
  readonly path: string
  readonly enabled: boolean
  readonly reference: RuleReference
}
export type LoadRulesOptions = { readonly root: string; readonly layers: ReadonlyArray<ConfigurationLayer> }
const validate = Effect.fn("Rules.validate")(<A>(source: string, field: string, read: () => A) =>
  Effect.try({
    try: read,
    catch: (cause) =>
      cause instanceof ConfigurationError ? cause : configurationError(source, field, "rule loading failed")
  })
)
const read = Effect.fn("Rules.read")(<A>(source: string, field: string, run: () => Promise<A>, reason: string) =>
  Effect.tryPromise({ try: run, catch: () => configurationError(source, field, reason) }).pipe(Effect.uninterruptible)
)
const mergeSettings = (existing: RuleSettings, incoming: RuleSettings): RuleSettings => ({
  ...existing,
  ...incoming,
  ...(existing.excludes === undefined && incoming.excludes === undefined
    ? {}
    : { excludes: [...new Set([...(existing.excludes ?? []), ...(incoming.excludes ?? [])])] })
})
type InheritedReference = Extract<RuleReference, { readonly id: string }>
type AuthoredReference = Extract<RuleReference, { readonly path: string }>
const inheritRule = Effect.fn("Rules.inherit")(function* (
  reference: InheritedReference,
  loaded: Map<string, LoadedRule>,
  seen: Set<string>
) {
  const { origin } = reference
  const previous = loaded.get(reference.id)
  if (previous === undefined)
    return yield* configurationError(
      origin.source,
      origin.field,
      `inherited rule '${reference.id}' needs an earlier path declaration`
    )
  if (seen.has(reference.id))
    return yield* configurationError(
      origin.source,
      origin.field,
      `duplicate rule '${reference.id}' from '${previous.path}'`
    )
  seen.add(reference.id)
  loaded.set(reference.id, {
    ...previous,
    origin,
    enabled: reference.enabled ?? previous.enabled,
    reference: { ...mergeSettings(previous.reference, reference), id: reference.id, origin }
  })
})
const outsideWorkingTree = (offset: string): boolean =>
  offset === ".." || offset.startsWith(`..\\`) || offset.startsWith("../") || isAbsolute(offset)
const checkRuleLocation = Effect.fn("Rules.checkLocation")(function* (root: string, path: string, origin: RuleOrigin) {
  const inside = relative(root, path)
  if (origin.layer === "project" && outsideWorkingTree(inside))
    return yield* configurationError(
      origin.source,
      origin.field,
      "project rule references must stay inside the Git working tree"
    )
})
const checkRuleIdentity = Effect.fn("Rules.checkIdentity")(function* (
  decoded: DecodedRule,
  path: string,
  origin: RuleOrigin,
  previous: LoadedRule | undefined,
  seen: Set<string>
) {
  if (previous !== undefined && (previous.path !== path || seen.has(decoded.id)))
    return yield* configurationError(
      origin.source,
      origin.field,
      `duplicate or rebound rule ID '${decoded.id}': '${previous.path}' and '${path}'`
    )
})
const mergeLoadedRule = (
  decoded: DecodedRule,
  reference: AuthoredReference,
  path: string,
  previous: LoadedRule | undefined
): LoadedRule => {
  const origin = reference.origin
  const merged = previous === undefined ? reference : { ...mergeSettings(previous.reference, reference), path, origin }
  return { ...decoded, path, origin, reference: merged, enabled: reference.enabled ?? previous?.enabled ?? true }
}
const loadAuthoredRule = Effect.fn("Rules.loadAuthored")(function* (
  root: string,
  reference: AuthoredReference,
  loaded: Map<string, LoadedRule>,
  seen: Set<string>
) {
  const { origin } = reference
  const requested = isAbsolute(reference.path)
    ? resolve(reference.path)
    : resolve(dirname(resolve(origin.source)), reference.path)
  const path = yield* read(
    origin.source,
    origin.field,
    () => realpath(requested),
    `rule file '${requested}' does not exist`
  )
  yield* checkRuleLocation(root, path, origin)
  const text = yield* read(path, "$", () => readFile(path, "utf8"), "rule could not be read")
  const decoded = yield* validate(path, "$", () => decodeRuleText(text, path, origin))
  const previous = loaded.get(decoded.id)
  yield* checkRuleIdentity(decoded, path, origin, previous, seen)
  seen.add(decoded.id)
  loaded.set(decoded.id, mergeLoadedRule(decoded, reference, path, previous))
})
export const loadRules = Effect.fn("Rules.load")(function* (options: LoadRulesOptions) {
  const loaded = new Map<string, LoadedRule>()
  const root = yield* read(options.root, "rules", () => realpath(options.root), "root is unavailable")
  for (const layer of options.layers) {
    const seen = new Set<string>()
    for (const [index, value] of (layer.document.rules ?? []).entries()) {
      const origin: RuleOrigin = { layer: layer.name, source: layer.source, field: `rules[${index}]` }
      const reference: RuleReference = { ...(typeof value === "string" ? { path: value } : value), origin }
      if ("id" in reference) yield* inheritRule(reference, loaded, seen)
      else yield* loadAuthoredRule(root, reference, loaded, seen)
    }
  }
  return [...loaded.values()]
})
