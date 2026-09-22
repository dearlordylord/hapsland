import * as Effect from "effect/Effect";
import { appendFileSync, readFileSync } from "node:fs";
import { Consent } from "../src/runtime/consent.ts";
import { claimDemoBudget } from "../src/onboarding/demo-budget.ts";
import { runFirstReviewDemo } from "../src/onboarding/first-review-demo.ts";

const input = JSON.parse(readFileSync(process.argv[2] ?? "", "utf8"));
const result = await Effect.runPromise(runFirstReviewDemo(input.request, {
  statePath: input.demoStatePath,
  execute: async (options) => {
    for (let call = 0; call < 2; call += 1) {
      claimDemoBudget(options.budgetPath, options.root, 100);
      appendFileSync(input.dispatchMarkerPath, "reserved-provider-call\n", { mode: 0o600 });
    }
    return {
      host: { completed: true, version: "race-fixture", durationMs: 1 },
      review: {
        providerCalls: 2,
        sourceBytes: 200,
        submission: "submitted",
        findings: 1,
        modelReaction: {
          status: "observed",
          source: "correlated-finding-reaction",
          deliveredFindingCorrelation: true,
        },
        followUp: {
          status: "completed",
          source: "post-repair-terminal-review",
          terminalState: "submitted",
          afterValidatedRepair: true,
        },
      },
      repair: { changed: true, rejectsInvalidStates: true },
    };
  },
}).pipe(Effect.provide(Consent.layer({ statePath: input.consentStatePath }))));

process.stdout.write(`${JSON.stringify(result)}\n`);
