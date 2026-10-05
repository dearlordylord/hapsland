/**
 * The original E0 question set and the state it judges. Historical classifier
 * rationale and fixture runs are retained in the private Hapsland research archive.
 * Rule content is owned by the shipped JSON rules; this module provides classifier experiment views.
 */
import * as Decision from "effect/ai/Decision"
import { SHIPPED_DEFAULT_RULES } from "./rules/shipped.ts"

export type ClassifierState = {
  artifact: {
    /** The file the text comes from. All a linter knows about what it is holding. */
    domain: string
    /** The text, exactly as it stands. */
    source: string
  }
}

/** Classifier experiment view derived from the shipped JSON, never a second definition. */
export const E0: Record<
  string,
  Decision.Probability & { readonly criteria: { readonly false: string; readonly true: string } }
> = Object.fromEntries(
  SHIPPED_DEFAULT_RULES.map((rule) => [
    rule.id,
    { ...Decision.probability({ instructions: rule.question, criteria: rule.criteria }), criteria: rule.criteria }
  ])
)

// ── Run ────────────────────────────────────────────────────────────────────

export const NOUL_KEYS = SHIPPED_DEFAULT_RULES.map((rule) => rule.id)

/** Self-consistency cookbook bands. Nothing is calibrated; the middle goes to a person (§4). */
export const band = (p: number) => (p > 0.7 ? "violation" : p < 0.3 ? "clear" : "unclear")
