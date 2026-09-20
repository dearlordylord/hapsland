import * as Effect from "effect/Effect";
import { access, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { configurationError, ConfigurationError } from "../configuration/errors.ts";
import type { ConfigurationLayer } from "../configuration/resolve.ts";
import { BUNDLED_NOUL_PACK } from "./bundled.ts";
import {
  decodeRulePackText,
  type DecodedRulePack,
  type RulePackOrigin,
} from "./schema.ts";

export type RulePackReference = {
  readonly path?: string;
  readonly id?: string;
  readonly enabled?: boolean;
  readonly origin: RulePackOrigin;
};

export type LoadedRulePack = Omit<DecodedRulePack, "origin"> & {
  readonly origin: RulePackOrigin;
  readonly path: string;
  readonly enabled: boolean;
  readonly reference?: RulePackReference;
};

export type LoadRulePacksOptions = {
  readonly root: string;
  readonly layers: ReadonlyArray<ConfigurationLayer>;
  readonly includeBundled?: boolean;
};

const asReference = (
  value: unknown,
  origin: RulePackOrigin,
  index: number,
): RulePackReference => {
  if (typeof value === "string") {
    if (value.length === 0) {
      throw configurationError(origin.source, `${origin.field}[${index}]`, "pack path must be non-empty");
    }
    return { path: value, origin };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw configurationError(origin.source, `${origin.field}[${index}]`, "pack reference must be a path or object");
  }
  const reference = value as Record<string, unknown>;
  const hasPath = Object.prototype.hasOwnProperty.call(reference, "path");
  const hasId = Object.prototype.hasOwnProperty.call(reference, "id");
  if (hasPath === hasId) {
    throw configurationError(origin.source, `${origin.field}[${index}]`, "a pack reference must specify exactly one of path or inherited id");
  }
  if (hasPath && (typeof reference.path !== "string" || reference.path.length === 0)) {
    throw configurationError(origin.source, `${origin.field}[${index}].path`, "pack path must be a non-empty string");
  }
  if (hasId && (typeof reference.id !== "string" || reference.id.length === 0)) {
    throw configurationError(origin.source, `${origin.field}[${index}].id`, "pack id must be a non-empty string");
  }
  if (reference.enabled !== undefined && typeof reference.enabled !== "boolean") {
    throw configurationError(origin.source, `${origin.field}[${index}].enabled`, "pack enabled must be a boolean");
  }
  for (const key of Object.keys(reference)) {
    if (key !== "path" && key !== "id" && key !== "enabled") {
      throw configurationError(origin.source, `${origin.field}[${index}].${key}`, "unknown pack reference field");
    }
  }
  return {
    ...(hasPath ? { path: reference.path as string } : {}),
    ...(hasId ? { id: reference.id as string } : {}),
    ...(reference.enabled === undefined ? {} : { enabled: reference.enabled }),
    origin,
  };
};

const referencesFromLayers = (
  layers: ReadonlyArray<ConfigurationLayer>,
): ReadonlyArray<RulePackReference> => {
  const result: Array<RulePackReference> = [];
  for (const layer of layers) {
    const packs = layer.document.packs;
    if (packs === undefined) continue;
    packs.forEach((value, index) => {
      result.push(asReference(value, {
        layer: layer.name,
        source: layer.source,
        field: "packs",
      }, index));
    });
  }
  return result;
};

const pathInside = (root: string, candidate: string): boolean => {
  const value = relative(root, candidate);
  return value === "" || (value !== ".." && !value.startsWith("../") && !value.startsWith("..\\") && !isAbsolute(value));
};

const canonicalPath = async (
  candidate: string,
  root: string,
  origin: RulePackOrigin,
): Promise<{ readonly path: string; readonly root: string }> => {
  let canonicalRoot: string;
  let canonicalCandidate: string;
  try {
    canonicalRoot = await realpath(root);
  } catch {
    canonicalRoot = resolve(root);
  }
  try {
    canonicalCandidate = await realpath(candidate);
  } catch {
    throw configurationError(origin.source, origin.field, "rule-pack file does not exist");
  }
  if (origin.layer === "project" && !pathInside(canonicalRoot, canonicalCandidate)) {
    throw configurationError(
      origin.source,
      origin.field,
      "project rule-pack references must stay inside the Git working tree",
    );
  }
  return { path: canonicalCandidate, root: canonicalRoot };
};

const baseDirectory = (source: string): string => {
  if (source === "built-in" || source.startsWith("built-in:")) return process.cwd();
  return dirname(resolve(source));
};

const readPack = async (
  reference: RulePackReference,
  root: string,
): Promise<LoadedRulePack> => {
  if (reference.path === undefined) {
    throw configurationError(reference.origin.source, reference.origin.field, "inherited pack reference needs an earlier pack declaration");
  }
  const requested = isAbsolute(reference.path)
    ? resolve(reference.path)
    : resolve(baseDirectory(reference.origin.source), reference.path);
  const resolved = await canonicalPath(requested, root, reference.origin);
  try {
    await access(resolved.path);
    const decoded = decodeRulePackText(
      await readFile(resolved.path, "utf8"),
      resolved.path,
      reference.origin,
    );
    if (reference.id !== undefined && reference.id !== decoded.id) {
      throw configurationError(
        reference.origin.source,
        `${reference.origin.field}.id`,
        `pack reference id '${reference.id}' does not match declared id '${decoded.id}'`,
      );
    }
    return {
      ...decoded,
      origin: reference.origin,
      path: resolved.path,
      enabled: reference.enabled ?? true,
      reference,
    };
  } catch (cause) {
    if (cause instanceof ConfigurationError) throw cause;
    throw configurationError(resolved.path, "$", "rule pack could not be read");
  }
};

const mergeLayeredReference = (
  existing: LoadedRulePack,
  incoming: LoadedRulePack,
): LoadedRulePack => {
  if (existing.path !== incoming.path) {
    throw configurationError(
      incoming.reference?.origin.source ?? incoming.source,
      incoming.reference?.origin.field ?? "packs",
      `pack id '${incoming.id}' is rebound to a different local file`,
    );
  }
  if (existing.contentVersion !== incoming.contentVersion || existing.contentDigest !== incoming.contentDigest) {
    throw configurationError(
      incoming.reference?.origin.source ?? incoming.source,
      incoming.reference?.origin.field ?? "packs",
      `pack id '${incoming.id}' has multiple content versions`,
    );
  }
  return {
    ...existing,
    // A higher layer may explicitly disable/enable an inherited pack. Omission
    // was normalized to true by the loader, so preserve the inherited state when
    // the incoming reference omitted enabled.
    enabled: incoming.reference?.enabled === undefined ? existing.enabled : incoming.enabled,
    ...(incoming.reference === undefined && existing.reference === undefined
      ? {}
      : { reference: incoming.reference ?? existing.reference! }),
    origin: incoming.origin,
  };
};

/**
 * Load bundled plus explicitly referenced local packs. All validation happens
 * before the compiler can expose a partial rule set to the review runtime.
 */
export const loadRulePacks = async (
  options: LoadRulePacksOptions,
): Promise<ReadonlyArray<LoadedRulePack>> => {
  const root = resolve(options.root);
  const loaded = new Map<string, LoadedRulePack>();
  const seenWithinLayer = new Set<string>();
  const seenPackIdsWithinLayer = new Set<string>();
  if (options.includeBundled !== false) {
    loaded.set(BUNDLED_NOUL_PACK.id, {
      ...BUNDLED_NOUL_PACK,
      origin: {
        layer: "built-in",
        source: "built-in:noul",
        field: "bundled.noul",
      },
      path: "built-in:noul",
      enabled: true,
    });
  }
  for (const reference of referencesFromLayers(options.layers)) {
    const layerKey = `${reference.origin.layer}:${reference.origin.source}`;
    const declarationKey = `${layerKey}:${reference.id ?? reference.path ?? ""}`;
    if (seenWithinLayer.has(declarationKey)) {
      throw configurationError(reference.origin.source, reference.origin.field, "duplicate pack declaration");
    }
    seenWithinLayer.add(declarationKey);
    const inherited = reference.path === undefined && reference.id === undefined
      ? undefined
      : reference.path === undefined && reference.id !== undefined
        ? loaded.get(reference.id)
        : undefined;
    if (reference.path === undefined) {
      if (reference.id === undefined || inherited === undefined) {
        throw configurationError(reference.origin.source, reference.origin.field, "inherited pack reference needs an earlier pack declaration");
      }
      loaded.set(reference.id, {
        ...inherited,
        enabled: reference.enabled === undefined ? inherited.enabled : reference.enabled,
        reference,
        origin: reference.origin,
      });
      const inheritedKey = `${reference.origin.layer}:${reference.origin.source}:${reference.id}`;
      if (seenPackIdsWithinLayer.has(inheritedKey)) {
        throw configurationError(reference.origin.source, reference.origin.field, "duplicate pack declaration");
      }
      seenPackIdsWithinLayer.add(inheritedKey);
      continue;
    }
    const pack = await readPack(reference, root);
    const packKey = `${reference.origin.layer}:${reference.origin.source}:${pack.id}`;
    if (seenPackIdsWithinLayer.has(packKey)) {
      throw configurationError(reference.origin.source, reference.origin.field, "duplicate pack declaration");
    }
    seenPackIdsWithinLayer.add(packKey);
    const previous = loaded.get(pack.id);
    loaded.set(pack.id, previous === undefined ? pack : mergeLayeredReference(previous, pack));
  }
  return [...loaded.values()];
};

export const loadRulePacksEffect = Effect.fn("RulePacks.load")(function* (
  options: LoadRulePacksOptions,
) {
  return yield* Effect.tryPromise({
    try: () => loadRulePacks(options),
    catch: (cause) =>
      cause instanceof ConfigurationError
        ? cause
        : configurationError(options.root, "packs", "rule-pack loading failed"),
  });
});
