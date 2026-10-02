import * as Schema from "effect/Schema";
import type { Decision } from "effect/ai";
import { PROVIDER_LIMITS, type ReviewModel } from "./catalog.ts";

export type ProbabilityRule = Readonly<{ id: string; decision: Decision.Probability }>;
export type RequestLimitViolation = "invalid-input" | "questions" | "http-body-bytes";

/** One exact serializer for transport and accounting. Cloudflare IDs are opaque and reversible. */
export const probabilityRequest = (
  model: ReviewModel,
  state: unknown,
  rules: ReadonlyArray<ProbabilityRule>,
) => {
  if (!Schema.is(Schema.Json)(state) || rules.length === 0) return undefined;
  const keys = new Set<string>();
  const questions: Record<string, {
    type: "noul"; instructions: string; criteria?: Decision.Probability["criteria"];
  }> = Object.create(null);
  const ids: Record<string, string> = Object.create(null);
  for (const [index, rule] of rules.entries()) {
    const { id, decision } = rule;
    if (typeof id !== "string" || id.length === 0 || id === "__proto__" || keys.has(id) || decision?._tag !== "Probability" ||
        typeof decision.instructions !== "string" ||
        (decision.criteria !== undefined && !Schema.is(Schema.Json)(decision.criteria))) return undefined;
    keys.add(id);
    const wireId = model === "jev-latest" ? id : `q${index}`;
    ids[wireId] = id;
    questions[wireId] = { type: "noul", instructions: decision.instructions,
      ...(decision.criteria === undefined ? {} : { criteria: decision.criteria }) };
  }
  const payload = { model, state, questions };
  const body = JSON.stringify(payload);
  return { payload, body, bytes: Buffer.byteLength(body, "utf8"), ids };
};

/** Protocol validation only; scheduling and source admission stay with their existing owners. */
export const requestLimitViolation = (
  model: ReviewModel,
  request: ReturnType<typeof probabilityRequest>,
): RequestLimitViolation | undefined => {
  if (request === undefined) return "invalid-input";
  const limits = PROVIDER_LIMITS[model];
  if (limits.questions !== undefined && Object.keys(request.ids).length > limits.questions) return "questions";
  if (limits.httpBodyBytes !== undefined && request.bytes > limits.httpBodyBytes) return "http-body-bytes";
  return undefined;
};
