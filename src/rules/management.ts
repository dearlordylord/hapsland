import { ruleOperation } from "./operations.ts"
import { withInstallationLock } from "../onboarding/installation-lock.ts"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import * as Effect from "effect/Effect"
import {
  DEFAULT_USER_CONFIGURATION_FILE,
  loadConfiguration,
  type LoadConfigurationOptions
} from "../configuration/load.ts"
import { decodeConfigurationDocument, decodeConfigurationText } from "../configuration/decode.ts"
import { configurationError } from "../configuration/errors.ts"
import { resolveConfiguration } from "../configuration/resolve.ts"
import { atomicInstallationFile } from "../onboarding/atomic-installation-file.ts"
import { compileRules } from "./compiler.ts"
import { loadRulePacks } from "./loader.ts"
import { decodeRulePackDocument, decodeRulePackText } from "./schema.ts"
import { TYPE_INPUT_CONTRACT } from "./targets.ts"

export type RuleScope = "personal" | "project"
export type RuleChange =
  | { readonly action: "create"; readonly scope: RuleScope; readonly id: string }
  | { readonly action: "connect"; readonly scope: RuleScope; readonly path: string }
  | { readonly action: "enable" | "disable"; readonly scope: RuleScope; readonly id: string }

const optionalText = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : undefined)
const canonicalDestination = (path: string): string => {
  if (existsSync(path)) return realpathSync(path)
  const parent = dirname(path)
  if (parent === path) return path
  return join(canonicalDestination(parent), path.slice(parent.length + (parent.endsWith("/") ? 0 : 1)))
}
const contained = (root: string, path: string): boolean => {
  const offset = relative(realpathSync(root), canonicalDestination(path))
  return offset !== ".." && !offset.startsWith("../") && !isAbsolute(offset)
}

const generatedPack = (id: string) => ({
  schemaVersion: 1,
  id,
  contentVersion: "1.0.0",
  rules: [
    {
      id: "concern",
      title: "Authored concern",
      question: "Does the supplied type declaration admit values that violate the intended domain constraint?",
      criteria: {
        false: "The supplied declaration enforces the intended constraint.",
        true: "Visible evidence shows an admitted value that violates the intended constraint."
      },
      message: "Review the authored domain constraint.",
      threshold: 0.7,
      reviewTargets: [
        { artifactKind: "typeShape", inputContract: TYPE_INPUT_CONTRACT, capabilities: ["root-declaration"] }
      ]
    }
  ]
})

/** Plan configuration changes against the complete current rule set before any write. */
export const previewRuleChange = Effect.fn("Rules.previewChange")(function* (
  root: string,
  change: RuleChange,
  options: LoadConfigurationOptions = {}
) {
  const configurationPath =
    change.scope === "personal"
      ? resolve(options.userConfigPath ?? DEFAULT_USER_CONFIGURATION_FILE)
      : join(root, ".hapsland.jsonc")
  if (change.scope === "project" && !contained(root, configurationPath))
    return yield* configurationError(
      configurationPath,
      "$",
      "project configuration must stay inside the Git working tree"
    )
  const before = yield* ruleOperation(configurationPath, "$", () => optionalText(configurationPath))
  const document = yield* ruleOperation(configurationPath, "$", () =>
    before === undefined ? { version: 1 as const } : decodeConfigurationText(before, configurationPath)
  )
  const capture = yield* loadConfiguration(root, options)
  const currentPacks = yield* loadRulePacks({ root, layers: capture.policy.layers })
  let proposed = document
  let path: string | undefined
  let packBefore: string | undefined
  let packAfter: string | undefined
  let selectedPacks = currentPacks
  if (change.action === "enable" || change.action === "disable") {
    const inventory = yield* ruleOperation(configurationPath, "$", () =>
      compileRules({ packs: currentPacks, layers: capture.policy.layers, includeDisabled: true })
    )
    if (!inventory.some((rule) => rule.qualifiedId === change.id))
      return yield* configurationError(
        configurationPath,
        "ruleOverrides",
        "select a qualified rule identity shown by hapsland rules list"
      )
    proposed = {
      ...document,
      ruleOverrides: {
        ...document.ruleOverrides,
        [change.id]: { ...document.ruleOverrides?.[change.id], enabled: change.action === "enable" }
      }
    }
  } else {
    // Validate an ID before using it as a filename.
    if (change.action === "create")
      yield* ruleOperation(configurationPath, "$", () =>
        decodeRulePackDocument(generatedPack(change.id), configurationPath)
      )
    path =
      change.action === "connect"
        ? resolve(change.path)
        : join(
            change.scope === "personal" ? dirname(configurationPath) : join(root, ".hapsland"),
            "rules",
            "custom",
            `${change.id}.json`
          )
    if (change.scope === "project" && !contained(root, path))
      return yield* configurationError(path, "$", "project rule packs must stay inside the Git working tree")
    const selectedPath = path
    packBefore = yield* ruleOperation(configurationPath, "$", () => optionalText(selectedPath))
    if (change.action === "connect" && packBefore === undefined)
      return yield* configurationError(path, "$", "rule-pack file does not exist; provide an existing pack with --path")
    packAfter = packBefore ?? JSON.stringify(generatedPack(change.action === "create" ? change.id : ""), null, 2) + "\n"
    const selectedContent = packAfter
    const pack = yield* ruleOperation(configurationPath, "$", () => decodeRulePackText(selectedContent, selectedPath))
    if (change.action === "create" && pack.id !== change.id)
      return yield* configurationError(
        path,
        "id",
        "existing authored pack has a different identity; connect it explicitly instead"
      )
    const canonical = canonicalDestination(path)
    const prior = currentPacks.find((candidate) => candidate.id === pack.id)
    if (prior !== undefined && prior.path !== canonical)
      return yield* configurationError(path, "id", "pack identity is already connected to a different file")
    const references = document.packs ?? []
    const connected = references.some((reference) => {
      const selected = typeof reference === "string" ? reference : "path" in reference ? reference.path : undefined
      return selected !== undefined && canonicalDestination(resolve(dirname(configurationPath), selected)) === canonical
    })
    proposed = connected
      ? document
      : { ...document, packs: [...references, relative(dirname(configurationPath), path)] }
    if (prior === undefined)
      selectedPacks = [
        ...currentPacks,
        {
          ...pack,
          origin: {
            layer: change.scope === "personal" ? "user" : "project",
            source: configurationPath,
            field: "packs"
          },
          path: canonical,
          enabled: true
        }
      ]
  }
  const layers = capture.policy.layers.filter((layer) => layer.source !== configurationPath)
  layers.push({ name: change.scope === "personal" ? "user" : "project", source: configurationPath, document: proposed })
  const policy = yield* ruleOperation(configurationPath, "$", () => resolveConfiguration(layers, root))
  yield* ruleOperation(configurationPath, "$", () =>
    compileRules({ packs: selectedPacks, layers: policy.layers, includeDisabled: true })
  )
  const after = JSON.stringify(decodeConfigurationDocument(proposed, configurationPath), null, 2) + "\n"
  const plan = { version: 1 as const, root, change, configurationPath, before, after, path, packBefore, packAfter }
  return { ...plan, digest: createHash("sha256").update(JSON.stringify(plan)).digest("hex") }
})

const applyRuleChangeUnlocked = Effect.fn("Rules.applyChangeUnlocked")(function* (
  root: string,
  change: RuleChange,
  digest: string,
  options: LoadConfigurationOptions = {}
) {
  const plan = yield* previewRuleChange(root, change, options)
  if (plan.digest !== digest)
    return yield* configurationError(
      plan.configurationPath,
      "digest",
      "rules plan is stale; preview again before applying"
    )
  yield* ruleOperation(plan.configurationPath, "$", () => {
    if (plan.path !== undefined && plan.packBefore === undefined && plan.packAfter !== undefined) {
      mkdirSync(dirname(plan.path), { recursive: true, mode: 0o700 })
      writeFileSync(plan.path, plan.packAfter, { encoding: "utf8", flag: "wx", mode: 0o600 })
    }
    if (plan.after !== plan.before) atomicInstallationFile(plan.configurationPath, plan.after)
  })
  return {
    version: 1 as const,
    status: "completed" as const,
    action: change.action,
    scope: change.scope,
    configurationPath: plan.configurationPath,
    ...(plan.path === undefined ? {} : { path: plan.path }),
    providerCalls: 0,
    classifierQualityValidated: false
  }
})

export const applyRuleChange = Effect.fn("Rules.applyChange")((
  root: string,
  change: RuleChange,
  digest: string,
  options: LoadConfigurationOptions = {}
) => {
  const configurationPath =
    change.scope === "personal"
      ? resolve(options.userConfigPath ?? DEFAULT_USER_CONFIGURATION_FILE)
      : join(root, ".hapsland.jsonc")
  return withInstallationLock(`${configurationPath}.rules-lock`, applyRuleChangeUnlocked(root, change, digest, options))
})
