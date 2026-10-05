/**
 * The original E0 question set and the state it judges. Historical classifier
 * rationale and fixture runs are retained in the private Hapsland research archive.
 * Rule content is owned by the shipped JSON pack; this module provides classifier experiment views.
 */
import * as Decision from "effect/ai/Decision"
import { SHIPPED_DEFAULT_PACK } from "./rules/shipped.ts"

export type ClassifierState = {
  artifact: {
    /** The file the text comes from. All a linter knows about what it is holding. */
    domain: string
    /** The text, exactly as it stands. */
    source: string
  }
}

/**
 * What the text can show, read off the characters alone. Three rungs, each showing
 * everything the one below it shows and more:
 *
 *   1 raw     — one value. Which fields this inhabitant carries, and what they hold.
 *   2 typed   — a declaration. Which fields the shape admits, and which are optional.
 *   3 schema  — a declaration plus the refinements it enforces: ranges, non-empty,
 *               literals, the constructors that make a state unreachable.
 *
 * Native code computes the rung from source text; the source-free rung number is
 * sent to Bend for the rule applicability comparison.
 */
export type Level = 1 | 2 | 3

export const LEVEL_NAME: Record<Level, string> = { 1: "raw", 2: "typed", 3: "schema" }

const DECLARES_A_SCHEMA =
  /\bSchema\.(Struct|Union|Literal|Array|optional)\b|\bz\.(object|union|discriminatedUnion|array)\b/

export const levelOf = (source: string): Level => {
  try {
    JSON.parse(source)
    return 1
  } catch {
    return DECLARES_A_SCHEMA.test(source) ? 3 : 2
  }
}

/** Classifier experiment view derived from the shipped JSON, never a second definition. */
export const E0: Record<
  string,
  Decision.Probability & { readonly criteria: { readonly false: string; readonly true: string } }
> = Object.fromEntries(
  SHIPPED_DEFAULT_PACK.rules.map((rule) => [
    rule.id,
    { ...Decision.probability({ instructions: rule.question, criteria: rule.criteria }), criteria: rule.criteria }
  ])
)

// ── Run ────────────────────────────────────────────────────────────────────

export const NOUL_KEYS = SHIPPED_DEFAULT_PACK.rules.map((rule) => rule.id)

/**
 * The rung a rule starts working at. Every rule is asked of every text; the rung
 * decides whether the answer is a finding or a number to discount.
 *
 * A floor, because each rung shows what the ones below it show: a rule that needs
 * declared optionality (r5) keeps working when refinements are added on top, and a
 * rule that reads a lone value (r2) keeps working when the text is a schema instead.
 * Gaps, bad − good: r1 0.33 raw, 0.47 typed, 0.41 schema (E22); r2 0.24 / 0.59 / 0.68
 * and r5 0.06 / 0.43 / 0.29 (E19); r3 0.07 raw and 0.56 typed (E28); r4 0.85 at every
 * rung (E31); r6 0.73 typed (E34); r7 0.74 typed on a TypeScript pair and 0.78 on a SQL one
 * (E36); r8 0.80 and r9 0.88 typed (E36, E37). Rules 6 to 9 cannot work at rung 1: branding,
 * refinement, a signature and a body are all invisible in a value.
 *
 * The ladder does not describe what rules 8 and 9 need, and does not have to. Both sit at
 * rung 2 because that is where a declaration appears, while r8 wants a callable and r9 wants
 * a body — a distinction a rung, which says only raw, typed or schema, does not draw. It
 * costs nothing: on a shape with neither, both read 0.04 across nine data shapes and schemas,
 * so they are inert rather than wrong and the floor carries them as it stands. An axis for
 * what kind of thing an artifact declares is deliberately not built.
 *
 * Nothing here is a ceiling. A rule that works at one rung and stops at the next is
 * possible — rule 1's span form reads a lone value and inverts on declarations — and
 * this table cannot say so. Such a rule needs a range, and the ladder is a floor
 * until one is measured.
 */
export const APPLIES_FROM: Record<string, Level> = Object.fromEntries(
  SHIPPED_DEFAULT_PACK.rules.map((rule) => [rule.id, rule.minimumRung ?? 1])
)

/** Self-consistency cookbook bands. Nothing is calibrated; the middle goes to a person (§4). */
export const band = (p: number) => (p > 0.7 ? "violation" : p < 0.3 ? "clear" : "unclear")
