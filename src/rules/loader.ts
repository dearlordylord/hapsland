import * as Effect from "effect/Effect"
import { readFile, realpath } from "node:fs/promises"
import { dirname, isAbsolute, relative, resolve } from "node:path"
import { configurationError, ConfigurationError } from "../configuration/errors.ts"
import type { ConfigurationLayer } from "../configuration/resolve.ts"
import { BUNDLED_NOUL_PACK } from "./bundled.ts"
import { decodeRulePackText, type DecodedRulePack, type RulePackOrigin } from "./schema.ts"

export type RulePackReference = {
  readonly path?: string
  readonly id?: string
  readonly enabled?: boolean
  readonly origin: RulePackOrigin
}

export type LoadedRulePack = Omit<DecodedRulePack, "origin"> & {
  readonly origin: RulePackOrigin
  readonly path: string
  readonly enabled: boolean
  readonly reference?: RulePackReference
}

export type LoadRulePacksOptions = {
  readonly root: string
  readonly layers: ReadonlyArray<ConfigurationLayer>
  readonly includeBundled?: boolean
}

const referenceObject = (value: unknown, origin: RulePackOrigin, index: number) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw configurationError(origin.source, `${origin.field}[${index}]`, "pack reference must be a path or object")
  }
  const reference = value as Record<string, unknown>
  return reference
}

const referenceIdentity = (reference: Record<string, unknown>, origin: RulePackOrigin, index: number) => {
  const hasPath = Object.prototype.hasOwnProperty.call(reference, "path")
  const hasId = Object.prototype.hasOwnProperty.call(reference, "id")
  if (hasPath === hasId) {
    throw configurationError(
      origin.source,
      `${origin.field}[${index}]`,
      "a pack reference must specify exactly one of path or inherited id"
    )
  }
  return { hasPath, hasId }
}

const validateReferenceName = (
  reference: Record<string, unknown>,
  field: "path" | "id",
  present: boolean,
  origin: RulePackOrigin,
  index: number
) => {
  const value = reference[field]
  if (present && (typeof value !== "string" || value.length === 0)) {
    throw configurationError(
      origin.source,
      `${origin.field}[${index}].${field}`,
      `pack ${field} must be a non-empty string`
    )
  }
}

const validateReferenceEnabled = (reference: Record<string, unknown>, origin: RulePackOrigin, index: number) => {
  if (reference.enabled !== undefined && typeof reference.enabled !== "boolean") {
    throw configurationError(origin.source, `${origin.field}[${index}].enabled`, "pack enabled must be a boolean")
  }
  return reference.enabled
}

const validateReferenceFields = (reference: Record<string, unknown>, origin: RulePackOrigin, index: number) => {
  for (const key of Object.keys(reference)) {
    if (key !== "path" && key !== "id" && key !== "enabled") {
      throw configurationError(origin.source, `${origin.field}[${index}].${key}`, "unknown pack reference field")
    }
  }
}

const asReference = (value: unknown, origin: RulePackOrigin, index: number): RulePackReference => {
  if (typeof value === "string") {
    if (value.length === 0) {
      throw configurationError(origin.source, `${origin.field}[${index}]`, "pack path must be non-empty")
    }
    return { path: value, origin }
  }
  const reference = referenceObject(value, origin, index)
  const { hasPath, hasId } = referenceIdentity(reference, origin, index)
  validateReferenceName(reference, "path", hasPath, origin, index)
  validateReferenceName(reference, "id", hasId, origin, index)
  const enabled = validateReferenceEnabled(reference, origin, index)
  validateReferenceFields(reference, origin, index)
  return {
    ...(hasPath ? { path: reference.path as string } : {}),
    ...(hasId ? { id: reference.id as string } : {}),
    ...(enabled === undefined ? {} : { enabled }),
    origin
  }
}

const referencesFromLayers = (layers: ReadonlyArray<ConfigurationLayer>): ReadonlyArray<RulePackReference> => {
  const result: Array<RulePackReference> = []
  for (const layer of layers) {
    const packs = layer.document.packs
    if (packs === undefined) continue
    packs.forEach((value, index) => {
      result.push(asReference(value, { layer: layer.name, source: layer.source, field: "packs" }, index))
    })
  }
  return result
}

const pathInside = (root: string, candidate: string): boolean => {
  const value = relative(root, candidate)
  return value === "" || (value !== ".." && !value.startsWith("../") && !value.startsWith("..\\") && !isAbsolute(value))
}

const validate = Effect.fn("RulePacks.validate")(<A>(source: string, field: string, read: () => A) =>
  Effect.try({
    try: read,
    catch: (cause) =>
      cause instanceof ConfigurationError ? cause : configurationError(source, field, "rule-pack loading failed")
  })
)
const nativeRead = Effect.fn("RulePacks.nativeRead")(
  <A>(source: string, field: string, read: () => Promise<A>, reason: string) =>
    Effect.tryPromise({ try: read, catch: () => configurationError(source, field, reason) }).pipe(
      Effect.uninterruptible
    )
)

const canonicalPath = Effect.fn("RulePacks.canonicalPath")(function* (
  candidate: string,
  root: string,
  origin: RulePackOrigin
) {
  const canonicalRoot = yield* nativeRead(
    origin.source,
    origin.field,
    () => realpath(root),
    "root is unavailable"
  ).pipe(Effect.catch(() => Effect.succeed(resolve(root))))
  const canonicalCandidate = yield* nativeRead(
    origin.source,
    origin.field,
    () => realpath(candidate),
    "rule-pack file does not exist"
  )
  if (origin.layer === "project" && !pathInside(canonicalRoot, canonicalCandidate)) {
    return yield* configurationError(
      origin.source,
      origin.field,
      "project rule-pack references must stay inside the Git working tree"
    )
  }
  return { path: canonicalCandidate, root: canonicalRoot }
})

const baseDirectory = (source: string): string => {
  if (source === "built-in" || source.startsWith("built-in:")) return process.cwd()
  return dirname(resolve(source))
}

const readPack = Effect.fn("RulePacks.readPack")(function* (reference: RulePackReference, root: string) {
  if (reference.path === undefined) {
    return yield* configurationError(
      reference.origin.source,
      reference.origin.field,
      "inherited pack reference needs an earlier pack declaration"
    )
  }
  const requested = isAbsolute(reference.path)
    ? resolve(reference.path)
    : resolve(baseDirectory(reference.origin.source), reference.path)
  const resolved = yield* canonicalPath(requested, root, reference.origin)
  const sourceText = yield* nativeRead(
    resolved.path,
    "$",
    () => readFile(resolved.path, "utf8"),
    "rule pack could not be read"
  )
  const decoded = yield* validate(resolved.path, "$", () =>
    decodeRulePackText(sourceText, resolved.path, reference.origin)
  )
  if (reference.id !== undefined && reference.id !== decoded.id) {
    return yield* configurationError(
      reference.origin.source,
      `${reference.origin.field}.id`,
      `pack reference id '${reference.id}' does not match declared id '${decoded.id}'`
    )
  }
  return { ...decoded, origin: reference.origin, path: resolved.path, enabled: reference.enabled ?? true, reference }
})

const packReferenceOrigin = (pack: LoadedRulePack) => ({
  source: pack.reference?.origin.source ?? pack.source,
  field: pack.reference?.origin.field ?? "packs"
})

const mergedReference = (existing: LoadedRulePack, incoming: LoadedRulePack) => {
  const reference = incoming.reference ?? existing.reference
  return reference === undefined ? {} : { reference }
}

const mergeLayeredReference = (existing: LoadedRulePack, incoming: LoadedRulePack): LoadedRulePack => {
  const errorOrigin = packReferenceOrigin(incoming)
  if (existing.path !== incoming.path) {
    throw configurationError(
      errorOrigin.source,
      errorOrigin.field,
      `pack id '${incoming.id}' is rebound to a different local file`
    )
  }
  if (existing.contentVersion !== incoming.contentVersion || existing.contentDigest !== incoming.contentDigest) {
    throw configurationError(
      errorOrigin.source,
      errorOrigin.field,
      `pack id '${incoming.id}' has multiple content versions`
    )
  }
  return {
    ...existing,
    // A higher layer may explicitly disable/enable an inherited pack. Omission
    // was normalized to true by the loader, so preserve the inherited state when
    // the incoming reference omitted enabled.
    enabled: incoming.reference?.enabled === undefined ? existing.enabled : incoming.enabled,
    ...mergedReference(existing, incoming),
    origin: incoming.origin
  }
}

const declarePack = (key: string, reference: RulePackReference, seen: Set<string>) => {
  if (seen.has(key))
    throw configurationError(reference.origin.source, reference.origin.field, "duplicate pack declaration")
  seen.add(key)
}

const inheritPack = Effect.fn("RulePacks.inherit")(
  (reference: RulePackReference, loaded: Map<string, LoadedRulePack>, seen: Set<string>) =>
    Effect.gen(function* () {
      if (reference.id === undefined)
        return yield* configurationError(
          reference.origin.source,
          reference.origin.field,
          "inherited pack reference needs an earlier pack declaration"
        )
      const inherited = loaded.get(reference.id)
      if (inherited === undefined)
        return yield* configurationError(
          reference.origin.source,
          reference.origin.field,
          "inherited pack reference needs an earlier pack declaration"
        )
      loaded.set(reference.id, {
        ...inherited,
        enabled: reference.enabled === undefined ? inherited.enabled : reference.enabled,
        reference,
        origin: reference.origin
      })
      yield* validate(reference.origin.source, reference.origin.field, () =>
        declarePack(`${reference.origin.layer}:${reference.origin.source}:${reference.id}`, reference, seen)
      )
    })
)

/**
 * Load bundled plus explicitly referenced local packs. All validation happens
 * before the compiler can expose a partial rule set to the review runtime.
 */
export const loadRulePacks = Effect.fn("RulePacks.load")(function* (options: LoadRulePacksOptions) {
  const root = resolve(options.root)
  const loaded = new Map<string, LoadedRulePack>()
  const seenWithinLayer = new Set<string>()
  const seenPackIdsWithinLayer = new Set<string>()
  if (options.includeBundled !== false) {
    loaded.set(BUNDLED_NOUL_PACK.id, {
      ...BUNDLED_NOUL_PACK,
      origin: { layer: "built-in", source: "built-in:noul", field: "bundled.noul" },
      path: "built-in:noul",
      enabled: true
    })
  }
  for (const reference of yield* validate(options.root, "packs", () => referencesFromLayers(options.layers))) {
    const layerKey = `${reference.origin.layer}:${reference.origin.source}`
    const declarationKey = `${layerKey}:${reference.id ?? reference.path ?? ""}`
    yield* validate(reference.origin.source, reference.origin.field, () =>
      declarePack(declarationKey, reference, seenWithinLayer)
    )
    if (reference.path === undefined) {
      yield* inheritPack(reference, loaded, seenPackIdsWithinLayer)
      continue
    }
    const pack = yield* readPack(reference, root)
    const packKey = `${reference.origin.layer}:${reference.origin.source}:${pack.id}`
    yield* validate(reference.origin.source, reference.origin.field, () =>
      declarePack(packKey, reference, seenPackIdsWithinLayer)
    )
    const previous = loaded.get(pack.id)
    loaded.set(
      pack.id,
      previous === undefined
        ? pack
        : yield* validate(reference.origin.source, reference.origin.field, () => mergeLayeredReference(previous, pack))
    )
  }
  return [...loaded.values()]
})
