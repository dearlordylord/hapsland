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
import { loadRules } from "./loader.ts"
import { decodeRuleDocument, decodeRuleText } from "./schema.ts"

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

const generatedRule = (id: string) => ({
  version: 1,
  id,
  title: "Authored concern",
  question: "Does the supplied type declaration admit values that violate the intended domain constraint?",
  criteria: {
    false: "The supplied declaration enforces the intended constraint.",
    true: "Visible evidence shows an admitted value that violates the intended constraint."
  },
  message: "Review the authored domain constraint.",
  threshold: 0.7,
  inputs: [{ languages: ["typescript", "rust", "bend"], kind: "type", requires: ["root-declaration"] }]
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
  const currentRules = yield* loadRules({ root, layers: capture.policy.layers })
  let proposed = document
  let path: string | undefined
  let ruleBefore: string | undefined
  let ruleAfter: string | undefined
  let selectedRules = currentRules
  if (change.action === "enable" || change.action === "disable") {
    const inventory = yield* ruleOperation(configurationPath, "$", () =>
      compileRules({ rules: currentRules, includeDisabled: true })
    )
    if (!inventory.some((rule) => rule.ruleId === change.id))
      return yield* configurationError(
        configurationPath,
        "rules",
        "select a rule identity shown by hapsland rules list"
      )
    const references = document.rules ?? []
    const selected = currentRules.find((rule) => rule.id === change.id)
    const index = references.findIndex((reference) =>
      typeof reference !== "string" && "id" in reference
        ? reference.id === change.id
        : selected !== undefined &&
          canonicalDestination(
            resolve(dirname(configurationPath), typeof reference === "string" ? reference : reference.path)
          ) === selected.path
    )
    selectedRules = currentRules.map((rule) =>
      rule.id === change.id
        ? {
            ...rule,
            enabled: change.action === "enable",
            reference: { ...rule.reference, enabled: change.action === "enable" }
          }
        : rule
    )
    proposed = {
      ...document,
      rules:
        index < 0
          ? [...references, { id: change.id, enabled: change.action === "enable" }]
          : references.map((reference, offset) =>
              offset !== index
                ? reference
                : {
                    ...(typeof reference === "string" ? { path: reference } : reference),
                    enabled: change.action === "enable"
                  }
            )
    }
  } else {
    // Validate an ID before using it as a filename.
    if (change.action === "create")
      yield* ruleOperation(configurationPath, "$", () =>
        decodeRuleDocument(generatedRule(change.id), configurationPath)
      )
    path =
      change.action === "connect"
        ? resolve(change.path)
        : join(
            change.scope === "personal" ? dirname(configurationPath) : join(root, ".hapsland"),
            "rules",
            "custom",
            `${encodeURIComponent(change.id)}.json`
          )
    if (change.scope === "project" && !contained(root, path))
      return yield* configurationError(path, "$", "project rule files must stay inside the Git working tree")
    const selectedPath = path
    ruleBefore = yield* ruleOperation(configurationPath, "$", () => optionalText(selectedPath))
    if (change.action === "connect" && ruleBefore === undefined)
      return yield* configurationError(path, "$", "rule file does not exist; provide an existing rule with --path")
    ruleAfter = ruleBefore ?? JSON.stringify(generatedRule(change.action === "create" ? change.id : ""), null, 2) + "\n"
    const selectedContent = ruleAfter
    const authored = yield* ruleOperation(configurationPath, "$", () => decodeRuleText(selectedContent, selectedPath))
    if (change.action === "create" && authored.id !== change.id)
      return yield* configurationError(
        path,
        "id",
        "existing authored rule has a different identity; connect it explicitly instead"
      )
    const canonical = canonicalDestination(path)
    const prior = currentRules.find((candidate) => candidate.id === authored.id)
    if (prior !== undefined && prior.path !== canonical)
      return yield* configurationError(
        path,
        "id",
        `rule identity is already connected to a different file: '${prior.path}' and '${canonical}'`
      )
    const references = document.rules ?? []
    const connected = references.some((reference) => {
      const selected = typeof reference === "string" ? reference : "path" in reference ? reference.path : undefined
      return selected !== undefined && canonicalDestination(resolve(dirname(configurationPath), selected)) === canonical
    })
    proposed = connected
      ? document
      : { ...document, rules: [...references, relative(dirname(configurationPath), path)] }
    if (prior === undefined)
      selectedRules = [
        ...currentRules,
        {
          ...authored,
          origin: {
            layer: change.scope === "personal" ? "user" : "project",
            source: configurationPath,
            field: "rules"
          },
          path: canonical,
          enabled: true,
          reference: {
            path: canonical,
            origin: {
              layer: change.scope === "personal" ? "user" : "project",
              source: configurationPath,
              field: "rules"
            }
          }
        }
      ]
  }
  const replacement = {
    name: change.scope === "personal" ? ("user" as const) : ("project" as const),
    source: configurationPath,
    document: proposed
  }
  const layers = capture.policy.layers.some((layer) => layer.source === configurationPath)
    ? capture.policy.layers.map((layer) => (layer.source === configurationPath ? replacement : layer))
    : change.scope === "personal"
      ? [
          ...capture.policy.layers.filter((layer) => layer.name === "built-in"),
          replacement,
          ...capture.policy.layers.filter((layer) => layer.name === "project")
        ]
      : [...capture.policy.layers, replacement]
  if (change.action === "enable" || change.action === "disable" || ruleBefore !== undefined)
    selectedRules = yield* loadRules({ root, layers })
  yield* ruleOperation(configurationPath, "$", () => resolveConfiguration(layers, root))
  yield* ruleOperation(configurationPath, "$", () => compileRules({ rules: selectedRules, includeDisabled: true }))
  const selectedId =
    change.action === "connect"
      ? selectedRules.find((rule) => rule.path === (path === undefined ? undefined : canonicalDestination(path)))?.id
      : change.id
  const enabled = selectedRules.find((rule) => rule.id === selectedId)?.enabled
  const after = JSON.stringify(decodeConfigurationDocument(proposed, configurationPath), null, 2) + "\n"
  const authoredSources = yield* ruleOperation(configurationPath, "rules", () =>
    currentRules.map((rule) => ({ path: rule.path, text: readFileSync(rule.path, "utf8") }))
  )
  const plan = {
    enabled,
    authoredSources,
    layers: capture.policy.layers,
    version: 1 as const,
    root,
    change,
    configurationPath,
    before,
    after,
    path,
    ruleBefore,
    ruleAfter
  }
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
    if (plan.path !== undefined && plan.ruleBefore === undefined && plan.ruleAfter !== undefined) {
      mkdirSync(dirname(plan.path), { recursive: true, mode: 0o700 })
      writeFileSync(plan.path, plan.ruleAfter, { encoding: "utf8", flag: "wx", mode: 0o600 })
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
    enabled: plan.enabled,
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
