import document from "./defaults/hapsland.json" with { type: "json" }
import { decodeRulePackDocument } from "./schema.ts"

/** Shipped template; runtime activation requires a local configuration reference. */
export const SHIPPED_DEFAULT_PACK = decodeRulePackDocument(document, "shipped:hapsland")
export const DEFAULT_PACK_ID = SHIPPED_DEFAULT_PACK.id
export const DEFAULT_PACK_VERSION = SHIPPED_DEFAULT_PACK.contentVersion
export const DEFAULT_RULE_MESSAGES: Readonly<Record<string, string>> = Object.fromEntries(
  SHIPPED_DEFAULT_PACK.rules.map((rule) => [rule.id, rule.message])
)
