import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { decide, Live } from "./jev-decision.ts";
import { E0, NOUL_KEYS } from "./questions.ts";

const live = process.env.RUN_LIVE_JEV === "1";

describe.runIf(live)("credential-gated live Jev contract", () => {
  it.effect("validates one representative Noul", () =>
    Effect.gen(function* () {
      const answer = yield* decide({
        state: {
          artifact: {
            domain: "library-loan.ts",
            source: `export type Loan = {
  loanId: string;
  memberId: string;
  isbn: string;
  branchCode: string;
  dueIn: number;
  renewals: number;
};`,
          },
        },
        decisions: { r6_bare_domain_value: E0.r6_bare_domain_value },
      }).pipe(Effect.provide(Live));
      // The pre-migration E35 run recorded 0.853 for this exact synthetic cell.
      // The migration gate preserves the qualitative violation-band behavior.
      expect(answer.answers.r6_bare_domain_value.probability).toBeGreaterThan(0.7);
      expect(answer.answers.r6_bare_domain_value.probability).toBeLessThanOrEqual(1);
    }),
  );

  it.effect("returns the full configured Noul key set in one decide operation", () =>
    Effect.gen(function* () {
      const answer = yield* decide({
        state: {
          artifact: {
            domain: "representative.ts",
            source: "export type Count = { value: number; unit: string }",
          },
        },
        decisions: E0,
      }).pipe(Effect.provide(Live));
      expect(Object.keys(answer.answers).sort()).toEqual([...NOUL_KEYS].sort());
    }),
  );
});
