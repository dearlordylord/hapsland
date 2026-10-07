import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { decodeConfigurationText } from "@hapsland/runtime-inputs/configuration/decode"
import { SHIPPED_DEFAULT_RULES } from "@hapsland/review-definition/rules/shipped"
import { compileRules } from "@hapsland/review-definition/rules/compiler"
import type { LoadedRule } from "@hapsland/review-definition/rules/loader"
import type { Rule } from "@hapsland/review-execution/policy/rules"
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
