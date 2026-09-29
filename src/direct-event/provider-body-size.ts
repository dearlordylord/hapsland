import * as Schema from "effect/Schema";
import type { Decision } from "effect/unstable/ai";

/** The pinned @effect/ai-typesafe rc.116 System One body for jev-latest Noul rules. */
export const encodedProviderHttpBodyBytes = (
  state: unknown,
  rules: ReadonlyArray<{ readonly id: string; readonly decision: Decision.Probability }>,
): number => {
  if (!Schema.is(Schema.Json)(state) || rules.length === 0) return Number.POSITIVE_INFINITY;
  const questions: Record<string, {
    readonly type: "noul";
    readonly instructions: string;
    readonly criteria: { readonly false: string; readonly true: string };
  }> = Object.create(null);
  for (const { id, decision } of rules) {
    if (typeof id !== "string" || id.length === 0 || id === "__proto__" ||
        Object.hasOwn(questions, id) || decision?._tag !== "Probability" ||
        typeof decision.instructions !== "string" ||
        typeof decision.criteria?.false !== "string" ||
        typeof decision.criteria?.true !== "string" ||
        !Schema.is(Schema.Json)(decision.criteria)) return Number.POSITIVE_INFINITY;
    questions[id] = { type: "noul", instructions: decision.instructions,
      criteria: decision.criteria };
  }
  try {
    return Buffer.byteLength(JSON.stringify({ model: "jev-latest", state, questions }), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};
