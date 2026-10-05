import { withInstallationLock } from "./installation-lock.ts"
import { createHash } from "node:crypto"
import { realpathSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import * as Effect from "effect/Effect"
import { loadConfiguration, DEFAULT_USER_CONFIGURATION_FILE } from "../configuration/load.ts"
import { decodeConfigurationText, decodeConfigurationDocument } from "../configuration/decode.ts"
import { configurationError, ConfigurationError } from "../configuration/errors.ts"
import { SHIPPED_DEFAULT_PACK } from "../rules/shipped.ts"
import { decodeRulePackText } from "../rules/schema.ts"
import { loadRulePacks } from "../rules/loader.ts"
import { compileRules } from "../rules/compiler.ts"
import { atomicInstallationFile } from "./atomic-installation-file.ts"

const readOptional = (path: string): string | undefined => (existsSync(path) ? readFileSync(path, "utf8") : undefined)
const template =
  JSON.stringify(
    {
      schemaVersion: 1,
      id: SHIPPED_DEFAULT_PACK.id,
      contentVersion: SHIPPED_DEFAULT_PACK.contentVersion,
      rules: SHIPPED_DEFAULT_PACK.rules
    },
    null,
    2
  ) + "\n"

/** The digest binds authored bytes as well as proposed writes. Preview never writes. */
export const previewDefaultRules = Effect.fn("Setup.previewDefaultRules")(
  (userConfigPath = DEFAULT_USER_CONFIGURATION_FILE, root = process.cwd()) =>
    Effect.try({
      try: () => {
        const configurationPath = resolve(userConfigPath)
        const path = join(dirname(configurationPath), "rules", "defaults", "hapsland.json")
        const configurationBefore = readOptional(configurationPath)
        const document =
          configurationBefore === undefined
            ? { version: 1 as const }
            : decodeConfigurationText(configurationBefore, configurationPath)
        const references = document.packs ?? []
        const connected = references.some((reference) => {
          const selected = typeof reference === "string" ? reference : "path" in reference ? reference.path : undefined
          if (selected === undefined) return false
          const selectedPath = resolve(dirname(configurationPath), selected)
          return (
            selectedPath === path ||
            (existsSync(selectedPath) && existsSync(path) && realpathSync(selectedPath) === realpathSync(path))
          )
        })
        const packBefore = readOptional(path)
        if (connected && packBefore === undefined)
          throw configurationError(
            path,
            "$",
            "connected default pack is missing; restore your authored file or remove its configuration reference"
          )
        const packAfter = packBefore ?? template
        const pack = decodeRulePackText(packAfter, path)
        if (
          !connected &&
          references.some((reference) => typeof reference !== "string" && "id" in reference && reference.id === pack.id)
        )
          throw configurationError(
            configurationPath,
            "packs",
            "default pack identity already has an inherited reference; connect its source explicitly"
          )
        const configurationAfter = connected
          ? configurationBefore
          : JSON.stringify(
              decodeConfigurationDocument({ ...document, packs: [...references, path] }, configurationPath),
              null,
              2
            ) + "\n"
        const proposal = {
          version: 1 as const,
          configurationPath,
          path,
          configurationBefore,
          configurationAfter,
          packBefore,
          packAfter
        }
        return {
          ...proposal,
          changed: !connected || packBefore === undefined,
          digest: createHash("sha256").update(JSON.stringify(proposal)).digest("hex")
        }
      },
      catch: (cause) =>
        cause instanceof ConfigurationError
          ? cause
          : configurationError(userConfigPath, "packs", "could not preview default rules; check file permissions")
    }).pipe(
      Effect.tap((proposal) =>
        Effect.gen(function* () {
          const capture = yield* loadConfiguration(root, { userConfigPath: proposal.configurationPath })
          const packs = yield* loadRulePacks({ root, layers: capture.policy.layers })
          const pack = decodeRulePackText(proposal.packAfter, proposal.path)
          const path = proposal.packBefore === undefined ? proposal.path : realpathSync(proposal.path)
          const existing = packs.find((candidate) => candidate.id === pack.id)
          if (existing !== undefined && existing.path !== path)
            return yield* configurationError(
              proposal.path,
              "id",
              "default pack identity is already connected to a different file"
            )
          const candidate = {
            ...pack,
            origin: { layer: "user" as const, source: proposal.configurationPath, field: "packs" },
            path,
            enabled: true
          }
          yield* Effect.try({
            try: () =>
              compileRules({
                packs: existing === undefined ? [...packs, candidate] : packs,
                layers: capture.policy.layers,
                includeDisabled: true
              }),
            catch: (cause) =>
              cause instanceof ConfigurationError
                ? cause
                : configurationError(proposal.path, "$", "default rules compilation failed")
          })
        })
      )
    )
)

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
  yield* Effect.try({
    try: () => {
      if (proposal.packBefore === undefined) {
        mkdirSync(dirname(proposal.path), { recursive: true, mode: 0o700 })
        writeFileSync(proposal.path, proposal.packAfter, { encoding: "utf8", mode: 0o600, flag: "wx" })
      }
      if (proposal.configurationAfter !== proposal.configurationBefore)
        atomicInstallationFile(proposal.configurationPath, proposal.configurationAfter)
    },
    catch: () =>
      configurationError(
        proposal.configurationPath,
        "packs",
        "default rules application could not complete; inspect the files and preview again"
      )
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
