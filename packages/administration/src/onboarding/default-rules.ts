import type { ConfigurationLayer } from "@hapsland/runtime-inputs/configuration/resolve"
import type { DecodedRule } from "@hapsland/review-definition/rules/schema"
import { withInstallationLock } from "./installation-lock.ts"
import { createHash } from "node:crypto"
import { realpathSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import * as Effect from "effect/Effect"
import { loadConfiguration, DEFAULT_USER_CONFIGURATION_FILE } from "@hapsland/runtime-inputs/configuration/load"
import { decodeConfigurationText, decodeConfigurationDocument } from "@hapsland/runtime-inputs/configuration/decode"
import { configurationError } from "@hapsland/runtime-inputs/configuration/errors"
import { SHIPPED_DEFAULT_RULES } from "@hapsland/review-definition/rules/shipped"
import { decodeRuleText } from "@hapsland/review-definition/rules/schema"
import { loadRules, type LoadedRule } from "@hapsland/review-definition/rules/loader"
import { compileRules } from "@hapsland/review-definition/rules/compiler"
import { ruleOperation } from "@hapsland/review-definition/rules/operations"
import { atomicInstallationFile } from "./atomic-installation-file.ts"

const readOptional = (path: string): string | undefined => (existsSync(path) ? readFileSync(path, "utf8") : undefined)
const samePath = (left: string, right: string) =>
  left === right || (existsSync(left) && existsSync(right) && realpathSync(left) === realpathSync(right))

type DefaultRuleReference = NonNullable<ConfigurationLayer["document"]["rules"]>[number]
const defaultReferencePath = (reference: DefaultRuleReference): string | undefined =>
  typeof reference === "string" ? reference : "path" in reference ? reference.path : undefined
const validateDefaultRuleIdentity = (
  authored: DecodedRule,
  path: string,
  current: ReadonlyArray<LoadedRule>,
  connected: boolean,
  references: ReadonlyArray<DefaultRuleReference>,
  configurationPath: string
): void => {
  const existing = current.find((rule) => rule.id === authored.id)
  if (existing !== undefined && !samePath(existing.path, path))
    throw configurationError(
      path,
      "id",
      `default rule identity already uses a different file: '${existing.path}' and '${path}'`
    )
  if (
    !connected &&
    references.some((reference) => typeof reference !== "string" && "id" in reference && reference.id === authored.id)
  )
    throw configurationError(
      configurationPath,
      "rules",
      "default rule identity already has an inherited reference; add its source explicitly"
    )
}
const defaultRulesChanged = (
  files: ReadonlyArray<{ readonly before: string | undefined }>,
  references: ReadonlyArray<DefaultRuleReference>,
  document: ConfigurationLayer["document"]
): boolean => files.some((file) => file.before === undefined) || references.length !== (document.rules ?? []).length

/** Bind every authored source and every configuration layer; preview never writes. */
export const previewDefaultRules = Effect.fn("Setup.previewDefaultRules")(function* (
  userConfigPath = DEFAULT_USER_CONFIGURATION_FILE,
  root = process.cwd()
) {
  const configurationPath = resolve(userConfigPath)
  const capture = yield* loadConfiguration(root, { userConfigPath: configurationPath })
  const current = yield* loadRules({ root, layers: capture.policy.layers })
  const proposal = yield* ruleOperation(configurationPath, "rules", () => {
    const configurationBefore = readOptional(configurationPath)
    const document =
      configurationBefore === undefined
        ? { version: 1 as const }
        : decodeConfigurationText(configurationBefore, configurationPath)
    const explicitSelection = capture.policy.layers.some((layer) => layer.document.rules !== undefined)
    const references = [...(document.rules ?? [])]
    const files = (explicitSelection ? [] : SHIPPED_DEFAULT_RULES).map((shipped) => {
      const path = join(dirname(configurationPath), "rules", "defaults", `${encodeURIComponent(shipped.id)}.json`)
      const connected = references.some((reference) => {
        const selected = defaultReferencePath(reference)
        return selected !== undefined && samePath(resolve(dirname(configurationPath), selected), path)
      })
      const before = readOptional(path)
      if (connected && before === undefined)
        throw configurationError(
          path,
          "$",
          "default rule file is missing; restore your authored file or remove its configuration reference"
        )
      const { source: _source, origin: _origin, definitionDigest: _digest, ...definition } = shipped
      const after = before ?? JSON.stringify(definition, null, 2) + "\n"
      const authored = decodeRuleText(after, path)
      validateDefaultRuleIdentity(authored, path, current, connected, references, configurationPath)
      if (!connected) references.push(path)
      return { path, before, after, authored }
    })
    const configurationAfter = explicitSelection
      ? configurationBefore
      : JSON.stringify(decodeConfigurationDocument({ ...document, rules: references }, configurationPath), null, 2) +
        "\n"
    const authoredSources = current.map((rule) => ({ path: rule.path, text: readFileSync(rule.path, "utf8") }))
    const layers = capture.policy.layers.map((layer) =>
      layer.source === configurationPath
        ? {
            ...layer,
            document:
              configurationAfter === undefined
                ? document
                : decodeConfigurationText(configurationAfter, configurationPath)
          }
        : layer
    )
    const proposedRules = [...current]
    for (const file of files)
      if (!proposedRules.some((rule) => rule.id === file.authored.id))
        proposedRules.push({
          ...file.authored,
          path: file.path,
          enabled: true,
          origin: { layer: "user", source: configurationPath, field: "rules" },
          reference: { path: file.path, origin: { layer: "user", source: configurationPath, field: "rules" } }
        })
    compileRules({ rules: proposedRules, includeDisabled: true })
    const plan = {
      version: 1 as const,
      configurationPath,
      configurationBefore,
      configurationAfter,
      files,
      paths: files.map((file) => file.path),
      authoredSources,
      layers
    }
    return {
      ...plan,
      changed: defaultRulesChanged(files, references, document),
      digest: createHash("sha256").update(JSON.stringify(plan)).digest("hex")
    }
  })
  return proposal
})
const applyDefaultRulesUnlocked = Effect.fn("Setup.applyDefaultRulesUnlocked")(function* (
  userConfigPath: string | undefined,
  digest: string,
  root = process.cwd()
) {
  const proposal = yield* previewDefaultRules(userConfigPath, root)
  if (proposal.digest !== digest)
    return yield* configurationError(
      proposal.configurationPath,
      "proposalDigest",
      "default rules plan is stale; preview again before applying"
    )
  yield* ruleOperation(proposal.configurationPath, "rules", () => {
    for (const file of proposal.files)
      if (file.before === undefined) {
        mkdirSync(dirname(file.path), { recursive: true, mode: 0o700 })
        writeFileSync(file.path, file.after, { encoding: "utf8", mode: 0o600, flag: "wx" })
      }
    if (proposal.configurationAfter !== undefined && proposal.configurationAfter !== proposal.configurationBefore)
      atomicInstallationFile(proposal.configurationPath, proposal.configurationAfter)
  })
  return proposal
})
export const applyDefaultRules = Effect.fn("Setup.applyDefaultRules")(
  (userConfigPath: string | undefined, digest: string, root = process.cwd()) =>
    withInstallationLock(
      `${resolve(userConfigPath ?? DEFAULT_USER_CONFIGURATION_FILE)}.rules-lock`,
      applyDefaultRulesUnlocked(userConfigPath, digest, root)
    )
)
