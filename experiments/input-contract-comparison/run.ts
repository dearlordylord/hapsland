import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Live } from "../../src/jev-decision.ts";
import { ReviewBackend } from "../../src/ports/review-backend.ts";
import { inputComparisonFixtures } from "./fixtures.ts";
import { planRun } from "./plan.ts";
import { runPlanned } from "./runner.ts";

const args = process.argv.slice(2);
const live = args.includes("--live");
const remainingIndex = args.indexOf("--authorized-remaining");
const remainingAuthorizedCalls = remainingIndex >= 0 ? Number(args[remainingIndex + 1]) : 0;

if (!Number.isInteger(remainingAuthorizedCalls) || remainingAuthorizedCalls < 0) {
  console.error("--authorized-remaining must be a non-negative integer");
  process.exitCode = 2;
} else if (live && !process.env.TYPESAFE_API_KEY) {
  // Presence is checked without printing the credential or any provider response.
  console.error("live input-contract evaluation requires TYPESAFE_API_KEY");
  process.exitCode = 2;
} else {
  const preflight = planRun({
    fixtureCount: inputComparisonFixtures.length,
    remainingAuthorizedCalls,
    liveOptIn: live,
  });
  if (!preflight.permitted) {
    console.log(JSON.stringify({ plan: preflight, outcome: "inconclusive", reason: preflight.rejectionReason }));
  } else {
    const backendLayer = ReviewBackend.layer.pipe(Layer.provide(Live));
    Effect.runPromise(
      runPlanned({
        fixtureCount: inputComparisonFixtures.length,
        remainingAuthorizedCalls,
        liveOptIn: live,
      }).pipe(Effect.provide(backendLayer)),
    ).then(({ report }) => {
      console.log(JSON.stringify(report));
    }).catch(() => {
      // Provider failures are already represented as unavailable observations by the
      // runner. Keep command diagnostics source-free and credential-free if setup fails.
      console.error("input-contract evaluation could not complete");
      process.exitCode = 1;
    });
  }
}
