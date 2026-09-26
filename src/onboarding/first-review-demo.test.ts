import * as Effect from "effect/Effect";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { Consent } from "../runtime/consent.ts";
import {
  DEMO_PROVIDER_CALL_BUDGET,
  DEMO_SOURCE_BYTE_BUDGET,
  DEMO_TIME_BUDGET_MS,
  runFirstReviewDemo,
  correlatedHostEvidence,
  uninstrumentedHostEvidence,
  type DemoExecution,
  type DemoExecutor,
} from "./first-review-demo.ts";
import { claimDemoBudget, readDemoBudgetUsage } from "./demo-budget.ts";
import { readDemoTrace, recordDemoTrace } from "./demo-trace.ts";

const roots: Array<string> = [];
const execFileAsync = promisify(execFile);

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "first-review-demo-test-"));
  roots.push(root);
  return {
    root,
    demoStatePath: join(root, "demos"),
    consentStatePath: join(root, "consent"),
  };
};

const run = <A>(
  test: ReturnType<typeof fixture>,
  effect: Effect.Effect<A, unknown, Consent.Service>,
) => Effect.runPromise(effect.pipe(Effect.provide(Consent.layer({ statePath: test.consentStatePath }))));

type Preview = Awaited<ReturnType<typeof preview>>;
const preview = (test: ReturnType<typeof fixture>) => run(test, runFirstReviewDemo({
  version: 1,
  operation: "demo",
  selection: "preview",
}, { statePath: test.demoStatePath, installationReady: () => true }));

const liveRequest = (value: Extract<Preview, { status: "preview" }>) => ({
  version: 1 as const,
  operation: "demo" as const,
  selection: "live" as const,
  demoId: value.demo.id,
  selectionDigest: value.authorization.selectionDigest,
  consentProposalDigest: value.authorization.consentProposalDigest,
});

const completed: DemoExecution = {
  host: { completed: true, version: "codex-cli 0.155.1", durationMs: 700 },
  review: {
    providerCalls: 2,
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
    latencyMs: 420,
  },
  repair: { changed: true, rejectsInvalidStates: true },
};

describe("installed-product first-review demo", () => {
  it("records only source-free demo events for the budget-owned root", () => {
    const test = fixture();
    const budget = join(test.root, "budget.json");
    writeFileSync(join(test.root, "session.ts"), "private synthetic source");
    writeFileSync(budget, JSON.stringify({ root: test.root }));
    const advicee = { host: "codex-cli" as const, hostVersion: "0.155.1" as const,
      sessionId: "session", turnId: "turn", toolUseId: "tool", agentId: null };
    recordDemoTrace(budget, join(test.root, "other"), advicee, { kind: "delivery", ruleIds: ["r1_inferred_case"] });
    expect(readDemoTrace(budget, "session")).toHaveLength(0);
    recordDemoTrace(budget, test.root, advicee, { kind: "delivery", ruleIds: ["r1_inferred_case"] });
    expect(readDemoTrace(budget, "session")).toMatchObject([{ kind: "delivery", ruleIds: ["r1_inferred_case"] }]);
    expect(readFileSync(join(`${budget}.trace`, readdirSync(`${budget}.trace`)[0] ?? ""), "utf8")).not.toContain("private synthetic source");
  });
  it("correlates delivered rule, later repair edit, final report, and terminal review of the validated source", () => {
    const first = "a".repeat(64);
    const repaired = "b".repeat(64);
    const trace = [
      { version: 1 as const, sessionId: "session", at: 1, kind: "edit" as const, sourceHash: first },
      { version: 1 as const, sessionId: "session", at: 2, kind: "terminal" as const, sourceHash: first, state: "findings" as const },
      { version: 1 as const, sessionId: "session", at: 3, kind: "delivery" as const, sourceHash: first, ruleIds: ["r1_inferred_case"] },
      { version: 1 as const, sessionId: "session", at: 4, kind: "edit" as const, sourceHash: repaired },
      { version: 1 as const, sessionId: "session", at: 5, kind: "terminal" as const, sourceHash: repaired, state: "clear" as const },
    ];
    expect(correlatedHostEvidence({ trace, finalSourceHash: repaired, finalMessages: ["Addressed r1_inferred_case; validation passed."], repairValidated: true })).toMatchObject({
      modelReaction: { status: "observed", deliveredFindingCorrelation: true },
      followUp: { status: "completed", terminalState: "clear", afterValidatedRepair: true },
    });
    expect(correlatedHostEvidence({ trace: trace.slice(0, 4), finalSourceHash: repaired, finalMessages: ["Addressed r1_inferred_case"], repairValidated: true }).followUp.status).toBe("not-observed");
    expect(correlatedHostEvidence({ trace, finalSourceHash: repaired, finalMessages: ["Validation passed"], repairValidated: true }).modelReaction.status).toBe("not-observed");
    expect(correlatedHostEvidence({ trace, finalSourceHash: repaired, finalMessages: ["Addressed r1_inferred_case"], repairValidated: false }).followUp.status).toBe("not-observed");
    expect(correlatedHostEvidence({ trace: trace.map((entry) => entry.kind === "terminal" && entry.sourceHash === repaired ? { ...entry, sourceHash: first } : entry), finalSourceHash: repaired, finalMessages: ["Addressed r1_inferred_case"], repairValidated: true }).followUp.status).toBe("not-observed");
  });
  it("does not infer reaction or follow-up from generic positive-looking host observations", () => {
    expect(uninstrumentedHostEvidence({
      messages: 3,
      changed: true,
      repairValidated: true,
      terminalReviews: 2,
      findingSubmitted: true,
    })).toEqual({
      modelReaction: { status: "unavailable", reason: "host-model-reaction-not-instrumented" },
      followUp: { status: "unavailable", reason: "post-repair-review-not-instrumented" },
    });
  });

  it("does not create a demo before installation setup is complete", async () => {
    const test = fixture();
    const result = await run(test, runFirstReviewDemo({
      version: 1, operation: "demo", selection: "preview",
    }, { statePath: test.demoStatePath, installationReady: () => false }));
    expect(result).toMatchObject({
      status: "conflict",
      paidVerificationPerformed: false,
      providerCalls: 0,
    });
    expect(existsSync(test.demoStatePath)).toBe(false);
  });

  it("keeps preview offline and discloses the synthetic input and exact budgets", async () => {
    const test = fixture();
    const result = await preview(test);
    expect(result.status).toBe("preview");
    if (result.status !== "preview") throw new Error("expected preview");
    expect(result.liveSelected).toBe(false);
    expect(result.paidVerificationPerformed).toBe(false);
    expect(result.demo.syntheticOnly).toBe(true);
    expect(result.demo.disclosure.deliberatelyFlawed).toBe(true);
    expect(result.demo.disclosure.repairPrescribed).toBe(false);
    expect(result.demo.disclosure.intendedInvalidStates).toHaveLength(2);
    expect(result.demo.disclosure.source).toContain("export interface Session");
    expect(result.budget).toEqual({
      sourceBytes: DEMO_SOURCE_BYTE_BUDGET,
      providerCalls: DEMO_PROVIDER_CALL_BUDGET,
      timeMs: DEMO_TIME_BUDGET_MS,
    });
    expect(existsSync(result.demo.disposableRoot)).toBe(true);
    await run(test, runFirstReviewDemo({
      version: 1, operation: "demo", selection: "cancel", demoId: result.demo.id,
    }, { statePath: test.demoStatePath }));
    expect(existsSync(result.demo.disposableRoot)).toBe(false);
  });

  it("requires both the live-selection digest and separate disposable-root consent digest", async () => {
    const test = fixture();
    const proposal = await preview(test);
    if (proposal.status !== "preview") throw new Error("expected preview");
    let executions = 0;
    const execute: DemoExecutor = async () => {
      executions += 1;
      return completed;
    };
    const result = await run(test, runFirstReviewDemo({
      ...liveRequest(proposal),
      consentProposalDigest: "0".repeat(64),
    }, { statePath: test.demoStatePath, execute }));
    expect(result.status).toBe("proposal-mismatch");
    expect(executions).toBe(0);
    expect(existsSync(proposal.demo.disposableRoot)).toBe(true);
    await run(test, runFirstReviewDemo({
      version: 1, operation: "demo", selection: "cancel", demoId: proposal.demo.id,
    }, { statePath: test.demoStatePath }));
  });

  it("atomically consumes one confirmation across processes and admits at most two calls", async () => {
    const test = fixture();
    const proposal = await preview(test);
    if (proposal.status !== "preview") throw new Error("expected preview");
    const dispatchMarkerPath = join(test.root, "dispatches.log");
    const workerInputPath = join(test.root, "race-input.json");
    writeFileSync(workerInputPath, JSON.stringify({
      request: liveRequest(proposal),
      demoStatePath: test.demoStatePath,
      consentStatePath: test.consentStatePath,
      dispatchMarkerPath,
    }));
    const worker = new URL("../../scripts/first-review-race-worker.mjs", import.meta.url).pathname;
    const runs = await Promise.all([
      execFileAsync(process.execPath, ["--experimental-strip-types", worker, workerInputPath]),
      execFileAsync(process.execPath, ["--experimental-strip-types", worker, workerInputPath]),
    ]);
    const results = runs.map(({ stdout }) => JSON.parse(stdout) as { readonly status: string });
    expect(results.filter(({ status }) => status === "passed")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "conflict")).toHaveLength(1);
    const possibleCalls = readFileSync(dispatchMarkerPath, "utf8").trim().split("\n").filter(Boolean);
    expect(possibleCalls).toHaveLength(2);

    let replayExecutions = 0;
    const replay = await run(test, runFirstReviewDemo(liveRequest(proposal), {
      statePath: test.demoStatePath,
      execute: async () => {
        replayExecutions += 1;
        return completed;
      },
    }));
    expect(replay.status).toBe("conflict");
    expect(replayExecutions).toBe(0);
  });

  it("retains distinct sanitized stages, validates repair independently, and cleans up", async () => {
    const test = fixture();
    const proposal = await preview(test);
    if (proposal.status !== "preview") throw new Error("expected preview");
    const result = await run(test, runFirstReviewDemo(liveRequest(proposal), {
      statePath: test.demoStatePath,
      execute: async (options) => {
        expect(readDemoBudgetUsage(options.budgetPath)).toEqual({ sourceBytes: 0, providerCalls: 0 });
        claimDemoBudget(options.budgetPath, options.root, 100);
        claimDemoBudget(options.budgetPath, options.root, 100);
        return completed;
      },
    }));
    expect(result.status).toBe("passed");
    if (!("evidence" in result)) throw new Error("expected evidence");
    expect(result.evidence).toMatchObject({
      completion: "completed",
      submission: "submitted",
      findings: 1,
      modelReaction: "observed",
      modelReactionSource: "correlated-finding-reaction",
      deliveredFindingCorrelation: true,
      repair: "independently-validated",
      followUpReview: "completed",
      providerCalls: 2,
      sourceRetained: false,
      responsesRetained: false,
    });
    expect(result.setup).toEqual({ actions: 0, durationMs: 0 });
    expect(result.reviewLatencyMs).toBe(420);
    expect(result.cleanup).toEqual({ disposableRootRemoved: true, consentRevoked: true });
    expect(existsSync(proposal.demo.disposableRoot)).toBe(false);
    const grants = await run(test, Effect.gen(function* () {
      return yield* (yield* Consent.Service).list();
    }));
    expect(grants).toEqual([]);
  });

  it("does not pass when either independent reaction or post-repair terminal evidence is unavailable", async () => {
    const missingReaction = fixture();
    const reactionProposal = await preview(missingReaction);
    if (reactionProposal.status !== "preview") throw new Error("expected preview");
    const reactionResult = await run(missingReaction, runFirstReviewDemo(liveRequest(reactionProposal), {
      statePath: missingReaction.demoStatePath,
      execute: async () => ({
        ...completed,
        review: {
          ...completed.review,
          modelReaction: {
            status: "unavailable",
            reason: "host-model-reaction-not-instrumented",
          },
        },
      }),
    }));
    expect(reactionResult.status).toBe("inconclusive");
    if (!("evidence" in reactionResult)) throw new Error("expected reaction evidence");
    expect(reactionResult.evidence).toMatchObject({
      modelReaction: "unavailable",
      modelReactionSource: "unavailable",
      deliveredFindingCorrelation: false,
    });

    const missingFollowUp = fixture();
    const followUpProposal = await preview(missingFollowUp);
    if (followUpProposal.status !== "preview") throw new Error("expected preview");
    const followUpResult = await run(missingFollowUp, runFirstReviewDemo(liveRequest(followUpProposal), {
      statePath: missingFollowUp.demoStatePath,
      execute: async () => ({
        ...completed,
        review: {
          ...completed.review,
          followUp: {
            status: "unavailable",
            reason: "post-repair-review-not-instrumented",
          },
        },
      }),
    }));
    expect(followUpResult.status).toBe("inconclusive");
  });

  it("reports stochastic misses and budget overruns as inconclusive", async () => {
    const test = fixture();
    const proposal = await preview(test);
    if (proposal.status !== "preview") throw new Error("expected preview");
    const result = await run(test, runFirstReviewDemo(liveRequest(proposal), {
      statePath: test.demoStatePath,
      execute: async () => ({
        host: { completed: true, version: "codex-cli 0.155.1", durationMs: 900 },
        review: {
          providerCalls: 3,
          submission: "none",
          findings: 0,
          modelReaction: { status: "not-observed", source: "correlated-finding-reaction" },
          followUp: { status: "not-observed", source: "post-repair-terminal-review" },
        },
        repair: { changed: false, rejectsInvalidStates: false },
      }),
    }));
    expect(result.status).toBe("inconclusive");
    if (result.status !== "inconclusive" || !("evidence" in result)) throw new Error("expected evidence");
    expect(result.budget.observedWithinBudget).toBe(false);
    expect(result.evidence).toMatchObject({
      submission: "none",
      findings: 0,
      modelReaction: "not-observed",
      modelReactionSource: "correlated-finding-reaction",
      deliveredFindingCorrelation: false,
      repair: "not-validated",
      followUpReview: "not-observed",
      providerCalls: 3,
    });
  });
});
