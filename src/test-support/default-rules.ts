import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { decodeConfigurationText } from "../configuration/decode.ts"
import { SHIPPED_DEFAULT_RULES } from "../rules/shipped.ts"
import { compileRules } from "../rules/compiler.ts"
import type { LoadedRule } from "../rules/loader.ts"
import type { Rule } from "../policy/rules.ts"
const bundledRules: ReadonlyArray<LoadedRule> = SHIPPED_DEFAULT_RULES.map((rule) => ({
  ...rule,
  origin: { layer: "built-in", source: "built-in:noul", field: "bundled.noul" },
  path: `built-in:${rule.id}`,
  enabled: true,
  reference: {
    path: `built-in:${rule.id}`,
    origin: { layer: "built-in", source: "built-in:noul", field: "bundled.noul" }
  }
}))
/** Explicit shipped-rule fixture; never a runtime fallback. */
export const configuredRules: ReadonlyArray<Rule> = compileRules({ rules: bundledRules })
/** Materialize and explicitly select every shipped rule for review fixtures. */
export const connectDefaultRuleFixture = (
  root: string,
  configurationPath = join(root, ".hapsland.jsonc")
): ReadonlyArray<string> => {
  const paths = SHIPPED_DEFAULT_RULES.map((rule) => {
    const path = join(root, ".hapsland", "rules", "defaults", `${encodeURIComponent(rule.id)}.json`)
    mkdirSync(dirname(path), { recursive: true })
    const { source: _source, origin: _origin, definitionDigest: _digest, ...definition } = rule
    writeFileSync(path, JSON.stringify(definition))
    return path
  })
  const document = existsSync(configurationPath)
    ? decodeConfigurationText(readFileSync(configurationPath, "utf8"), configurationPath)
    : { version: 1 as const }
  writeFileSync(configurationPath, JSON.stringify({ ...document, rules: [...(document.rules ?? []), ...paths] }))
  return paths
}
