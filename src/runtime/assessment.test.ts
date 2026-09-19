import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { configuredRules } from "../policy/rules.ts";
import { validateAssessment } from "./assessment.ts";

describe("assessment boundary", () => {
  it.effect("rejects answer keys beyond the exact requested set", () =>
    Effect.gen(function* () {
      const rule = configuredRules[0];
      if (rule === undefined) throw new Error("expected a configured rule");
      const result = yield* Effect.result(
        validateAssessment([rule], {
          [rule.id]: { probability: 0.2 },
          unexpected_rule: { probability: 0.2 },
        }),
      );
      expect(result._tag).toBe("Failure");
    }),
  );
});
