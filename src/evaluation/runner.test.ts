import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ConfigProvider } from "effect";
import { spawnSync } from "node:child_process";
import { controlledDecisionModelLayer } from "../test-support/controlled-decision-model.ts";
import { ReviewBackend } from "../ports/review-backend.ts";
import {
  makeDefaultEvaluationSuite,
  runEvaluationCommand,
} from "./command.ts";
import {
  BUNDLED_EVALUATION_EXPECTATIONS,
  BUNDLED_EVALUATION_FIXTURES,
  BUNDLED_EVALUATION_RULES,
} from "./fixtures.ts";
import { executeEvaluation } from "./runner.ts";

const controlledBackend = ReviewBackend.layerWithOptions({
  transientRetries: 2,
}).pipe(Layer.provide(controlledDecisionModelLayer({})));

describe("evaluation execution and commands", () => {
  it.effect("uses the production backend path for isolated/full/named scenarios", () =>
    Effect.gen(function* () {
      const suite = makeDefaultEvaluationSuite({
        repetitions: 2,
        maximumRequests: 1_000,
        maximumRetriesPerRequest: 2,
      });
      const result = yield* executeEvaluation(
        {
          run: suite.run,
          plan: suite.plan,
          scenarios: suite.scenarios,
          fixtures: BUNDLED_EVALUATION_FIXTURES,
          ruleDefinitions: BUNDLED_EVALUATION_RULES,
          expectations: BUNDLED_EVALUATION_EXPECTATIONS,
          compiledRules: suite.compiledRules,
        },
        controlledBackend,
      );
      expect(result.observations).toHaveLength(88);
      expect(result.report.coverage.isolatedScenarios).toBe(9);
      expect(result.report.coverage.fullBatchScenarios).toBe(1);
      expect(result.report.coverage.namedInteractionScenarios).toBe(1);
      expect(result.report.crossBatch.total).toBeGreaterThan(0);
      expect(result.report.deterministic.total).toBeGreaterThan(0);
      expect(result.report.transport.failed).toBe(0);
      expect(result.report.conformance.failed).toBe(0);
      expect(result.report.timing.sampleCount).toBe(88);
      expect(result.report.timing.totalDurationMs).toBe(0);
    }),
  );

  it.effect("includes every configured repetition in comparisons and timing evidence", () =>
    Effect.gen(function* () {
      const suite = makeDefaultEvaluationSuite({
        repetitions: 3,
        maximumRequests: 1_000,
        maximumRetriesPerRequest: 2,
      });
      const result = yield* executeEvaluation(
        {
          run: suite.run,
          plan: suite.plan,
          scenarios: suite.scenarios,
          fixtures: BUNDLED_EVALUATION_FIXTURES,
          ruleDefinitions: BUNDLED_EVALUATION_RULES,
          expectations: BUNDLED_EVALUATION_EXPECTATIONS,
          compiledRules: suite.compiledRules,
        },
        controlledBackend,
      );
      expect(result.observations).toHaveLength(132);
      expect(result.report.timing.sampleCount).toBe(132);
      expect(result.report.semantic.total).toBe(108);
      expect(result.report.crossBatch.total).toBe(216);
      expect(result.report.deterministic.total).toBe(72);
      expect(result.report.coverage.observedComparisons).toBe(396);
      expect(result.report.coverage.plannedFixtures).toBe(132);
    }),
  );

  it.effect("keeps command planning deterministic and rejects a live run before dispatch", () =>
    Effect.gen(function* () {
      const plan = yield* runEvaluationCommand({
        version: 1,
        operation: "plan",
        repetitions: 2,
        maximumRequests: 10,
        maximumRetriesPerRequest: 2,
      });
      expect(plan.operation).toBe("plan");
      if (plan.operation !== "plan") return;
      expect(plan.plan.plannedRequests).toBe(88);
      expect(plan.plan.worstCaseRequests).toBe(264);
      expect(plan.plan.permitted).toBe(false);

      const live = yield* runEvaluationCommand({
        version: 1,
        operation: "run",
        liveOptIn: true,
      }).pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))));
      expect(live.operation).toBe("run");
      if (live.operation !== "run") return;
      expect(live.status).toBe("rejected");
      expect(live.reason).toBe("live-credential-required");
    }),
  );

  it("accepts plan/run/report through the real JSON process boundary", () => {
    const planned = spawnSync(process.execPath, ["src/cli.ts", "--evaluation-plan"], {
      cwd: process.cwd(),
      input: JSON.stringify({ version: 1, operation: "plan" }),
      encoding: "utf8",
    });
    expect(planned.status).toBe(0);
    expect(planned.stderr).toBe("");
    const plan = JSON.parse(planned.stdout) as {
      operation: string;
      plan: { plannedRequests: number; worstCaseRequests: number };
    };
    expect(plan).toMatchObject({
      operation: "plan",
      plan: { plannedRequests: 44, worstCaseRequests: 132 },
    });

    const run = spawnSync(process.execPath, ["src/cli.ts", "--evaluation-run"], {
      cwd: process.cwd(),
      input: JSON.stringify({ version: 1, operation: "run" }),
      encoding: "utf8",
    });
    expect(run.status).toBe(0);
    expect(run.stderr).toBe("");
    const report = JSON.parse(run.stdout) as {
      status: string;
      report: {
        transport: { failed: number };
        semantic: { unchecked: number };
        [key: string]: unknown;
      };
    };
    expect(report.status).toBe("complete");
    expect(report.report.transport.failed).toBe(0);
    expect(report.report.semantic.unchecked).toBeGreaterThan(0);
    expect(run.stdout).not.toContain("flat delivery alternatives");
    expect(run.stdout).not.toContain("SOURCE");

    const verified = spawnSync(process.execPath, ["src/cli.ts", "--evaluation-report"], {
      cwd: process.cwd(),
      input: JSON.stringify({ version: 1, operation: "report", report: report.report }),
      encoding: "utf8",
    });
    expect(verified.status).toBe(0);
    expect(verified.stderr).toBe("");
    expect(JSON.parse(verified.stdout)).toMatchObject({
      operation: "report",
      status: "verified",
    });
  });

  it.effect("verifies sanitized reports by digest without provider access", () =>
    Effect.gen(function* () {
      const result = yield* runEvaluationCommand({
        version: 1,
        operation: "run",
      });
      if (result.operation !== "run" || result.report === undefined) {
        throw new Error("expected a controlled report");
      }
      const verified = yield* runEvaluationCommand({
        version: 1,
        operation: "report",
        report: result.report,
      });
      expect(verified).toMatchObject({
        operation: "report",
        status: "verified",
      });
    }),
  );
});

it.effect("uses the parent ConfigProvider for live planning without exposing credentials", () => Effect.gen(function* () {
  const task = runEvaluationCommand({ version: 1, operation: "plan", liveOptIn: true },
    { credentialEnvVar: "FIXTURE_EVALUATION_KEY" });
  const missing = yield* task.pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))));
  const credential = "synthetic-private-evaluation-key";
  const present = yield* task.pipe(Effect.provide(ConfigProvider.layer(
    ConfigProvider.fromUnknown({ FIXTURE_EVALUATION_KEY: credential }),
  )));
  expect(missing.operation).toBe("plan");
  expect(present.operation).toBe("plan");
  if (missing.operation !== "plan" || present.operation !== "plan") throw new Error("fixture plan missing");
  expect(missing.plan.permitted).toBe(false);
  expect(missing.plan.rejectionReason).toBe("live-credential-required");
  expect(present.plan.permitted).toBe(false);
  expect(present.plan.rejectionReason).toBe("live-authorization-required");
  expect(JSON.stringify(present)).not.toContain(credential);
}));

it.effect("contains ConfigProvider failures while controlled planning does not read credentials", () => Effect.gen(function* () {
  const privateMessage = "synthetic-private-config-source";
  const failedProvider = ConfigProvider.layer(ConfigProvider.make(() =>
    Effect.fail(new ConfigProvider.SourceError({ message: privateMessage })),
  ));
  const live = yield* runEvaluationCommand({ version: 1, operation: "plan", liveOptIn: true })
    .pipe(Effect.provide(failedProvider), Effect.result);
  expect(live._tag).toBe("Failure");
  if (live._tag === "Failure") {
    expect(live.failure._tag).toBe("EvaluationCommandError");
    expect(live.failure.reason).toBe("evaluation credential configuration unavailable");
    expect(JSON.stringify(live.failure)).not.toContain(privateMessage);
  }
  const controlled = yield* runEvaluationCommand({ version: 1, operation: "plan" })
    .pipe(Effect.provide(failedProvider));
  expect(controlled).toMatchObject({ operation: "plan", status: "planned", plan: { permitted: true } });
}));

it.effect("returns a typed source-free failure for malformed command input", () => Effect.gen(function* () {
  const result = yield* runEvaluationCommand({ version: 1, operation: "unknown", payload: "private fixture" }).pipe(Effect.result);
  expect(result._tag).toBe("Failure");
  if (result._tag === "Failure") {
    expect(result.failure._tag).toBe("EvaluationCommandError");
    expect(result.failure.reason).toBe("invalid evaluation command");
    expect(result.failure.message).toBe("invalid evaluation command");
    expect(JSON.stringify(result.failure)).not.toContain("private fixture");
  }
}));
