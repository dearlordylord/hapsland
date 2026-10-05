import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { decodeConfigurationText } from "../configuration/decode.ts"
import { SHIPPED_DEFAULT_PACK } from "../rules/shipped.ts"
import { compileRules } from "../rules/compiler.ts"
import type { LoadedRulePack } from "../rules/loader.ts"
import type { Rule } from "../policy/rules.ts"

const bundledLoadedPack: LoadedRulePack = {
  ...SHIPPED_DEFAULT_PACK,
  origin: { layer: "built-in", source: "built-in:noul", field: "bundled.noul" },
  path: "built-in:noul",
  enabled: true
}

/** Explicit shipped-rule fixture for tests; never a runtime fallback. */
export const configuredRules: ReadonlyArray<Rule> = compileRules({ packs: [bundledLoadedPack] })

/** Explicit selection for fixtures exercising review, separate from empty configuration tests. */
export const connectDefaultRuleFixture = (root: string, configurationPath = join(root, ".hapsland.jsonc")): string => {
  const path = join(root, ".hapsland", "rules", "defaults", "hapsland.json")
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(
    path,
    JSON.stringify({
      schemaVersion: 1,
      id: SHIPPED_DEFAULT_PACK.id,
      contentVersion: SHIPPED_DEFAULT_PACK.contentVersion,
      rules: SHIPPED_DEFAULT_PACK.rules
    })
  )
  const document = existsSync(configurationPath)
    ? decodeConfigurationText(readFileSync(configurationPath, "utf8"), configurationPath)
    : { version: 1 as const }
  writeFileSync(configurationPath, JSON.stringify({ ...document, packs: [...(document.packs ?? []), path] }))
  return path
}
