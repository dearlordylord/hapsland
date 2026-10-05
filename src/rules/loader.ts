import * as Effect from "effect/Effect"
import { readFile, realpath } from "node:fs/promises"
import { dirname, isAbsolute, relative, resolve } from "node:path"
import { configurationError, ConfigurationError } from "../configuration/errors.ts"
import type { ConfigurationLayer } from "../configuration/resolve.ts"
import type { RuleReference as ConfigurationRuleReference, RuleSettings } from "../configuration/types.ts"
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
export const loadRules = Effect.fn("Rules.load")(function* (options: LoadRulesOptions) {
  const loaded = new Map<string, LoadedRule>()
  const root = yield* read(options.root, "rules", () => realpath(options.root), "root is unavailable")
  for (const layer of options.layers) {
    const seen = new Set<string>()
    for (const [index, value] of (layer.document.rules ?? []).entries()) {
      const origin: RuleOrigin = { layer: layer.name, source: layer.source, field: `rules[${index}]` }
      const reference: RuleReference = { ...(typeof value === "string" ? { path: value } : value), origin }
      if ("id" in reference) {
        const previous = loaded.get(reference.id)
        if (previous === undefined)
          return yield* configurationError(
            layer.source,
            origin.field,
            `inherited rule '${reference.id}' needs an earlier path declaration`
          )
        if (seen.has(reference.id))
          return yield* configurationError(
            layer.source,
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
        continue
      }
      const requested = isAbsolute(reference.path)
        ? resolve(reference.path)
        : resolve(dirname(resolve(layer.source)), reference.path)
      const path = yield* read(
        layer.source,
        origin.field,
        () => realpath(requested),
        `rule file '${requested}' does not exist`
      )
      const inside = relative(root, path)
      if (
        layer.name === "project" &&
        (inside === ".." || inside.startsWith(`..\\`) || inside.startsWith("../") || isAbsolute(inside))
      )
        return yield* configurationError(
          layer.source,
          origin.field,
          "project rule references must stay inside the Git working tree"
        )
      const text = yield* read(path, "$", () => readFile(path, "utf8"), "rule could not be read")
      const decoded = yield* validate(path, "$", () => decodeRuleText(text, path, origin))
      const previous = loaded.get(decoded.id)
      if (previous !== undefined && (previous.path !== path || seen.has(decoded.id)))
        return yield* configurationError(
          layer.source,
          origin.field,
          `duplicate or rebound rule ID '${decoded.id}': '${previous.path}' and '${path}'`
        )
      seen.add(decoded.id)
      const merged =
        previous === undefined ? reference : { ...mergeSettings(previous.reference, reference), path, origin }
      loaded.set(decoded.id, {
        ...decoded,
        path,
        origin,
        reference: merged,
        enabled: reference.enabled ?? previous?.enabled ?? true
      })
    }
  }
  return [...loaded.values()]
})
