import * as Effect from "effect/Effect";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { readActivity } from "../activity/status.ts";
import { inspectResident } from "../resident/client.ts";
import { inspectCodexInstallation } from "./codex-installation.ts";
import { execFileClosedStdin } from "./codex-host-process.ts";
import { initializeDemoBudget, readDemoBudgetUsage } from "./demo-budget.ts";
import { demoSourceHash, readDemoTrace } from "./demo-trace.ts";

const execFileAsync = promisify(execFile);

export const DEMO_SOURCE_BYTE_BUDGET = 4_096 as const;
export const DEMO_PROVIDER_CALL_BUDGET = 2 as const;
export const DEMO_TIME_BUDGET_MS = 180_000 as const;

const FLAWED_SOURCE = `export interface Session {
  readonly loggedIn: boolean
  readonly userId?: string
}

export const isSession = (value: unknown): value is Session => {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { loggedIn?: unknown; userId?: unknown }
  return typeof candidate.loggedIn === "boolean" &&
    (candidate.userId === undefined || typeof candidate.userId === "string")
}
`;

export const DEMO_DISCLOSURE = {
  artifact: "session.ts",
  deliberatelyFlawed: true,
  intendedInvalidStates: [
    "logged-out session carrying a userId",
    "logged-in session without a userId",
  ],
  source: FLAWED_SOURCE,
  repairPrescribed: false,
} as const;

const VALIDATOR_SOURCE = `import { isSession } from "./session.ts"

const checks = [
  isSession({ loggedIn: false }),
  isSession({ loggedIn: true, userId: "demo-user" }),
  !isSession({ loggedIn: false, userId: "demo-user" }),
  !isSession({ loggedIn: true }),
]
if (checks.some((value) => !value)) process.exit(1)
`;

type DemoRecord = {
  readonly version: 1;
  readonly id: string;
  readonly root: string;
  readonly createdAt: number;
  readonly cleanupToken: string;
  readonly selectionDigest: string;
};

export type FirstReviewDemoRequest = {
  readonly version: 1;
  readonly operation: "demo";
  readonly selection: "preview" | "live" | "cancel";
  readonly codexHome?: string;
  readonly codexExecutable?: string;
  readonly demoId?: string;
  readonly selectionDigest?: string;
};

export type DemoExecution = {
  readonly host: { readonly completed: boolean; readonly version: string; readonly durationMs: number;
    readonly failure?: "authentication" | "trust" | "sandbox" | "timeout" | "host-error";
    readonly eventCounts?: { readonly threads: number; readonly itemsStarted: number;
      readonly itemsCompleted: number; readonly agentMessages: number; readonly errors: number };
    readonly stdoutBytes?: number; readonly stderrBytes?: number };
  readonly review: {
    readonly providerCalls: number;
    readonly sourceBytes?: number;
    readonly submission: "submitted" | "none" | "unavailable";
    readonly findings: number;
    readonly modelReaction:
      | {
          readonly status: "observed";
          readonly source: "correlated-finding-reaction";
          readonly deliveredFindingCorrelation: true;
        }
      | { readonly status: "not-observed"; readonly source: "correlated-finding-reaction" }
      | { readonly status: "unavailable"; readonly reason: "host-model-reaction-not-instrumented" };
    readonly followUp:
      | {
          readonly status: "completed";
          readonly source: "post-repair-terminal-review";
          readonly terminalState: "clear" | "findings" | "submitted";
          readonly afterValidatedRepair: true;
        }
      | { readonly status: "not-observed"; readonly source: "post-repair-terminal-review" }
      | { readonly status: "unavailable"; readonly reason: "post-repair-review-not-instrumented" };
    readonly latencyMs?: number;
  };
  readonly repair: { readonly changed: boolean; readonly rejectsInvalidStates: boolean };
};

export type DemoExecutor = (options: {
  readonly root: string;
  readonly codexHome?: string;
  readonly codexExecutable: string;
  readonly deadlineMs: number;
  readonly providerCallBudget: number;
  readonly budgetPath: string;
}) => Promise<DemoExecution>;

const digestSelection = (record: Omit<DemoRecord, "selectionDigest">): string =>
  createHash("sha256").update([
    "first-review-demo-v1", record.id, record.root, String(record.createdAt),
    record.cleanupToken,
    String(DEMO_SOURCE_BYTE_BUDGET), String(DEMO_PROVIDER_CALL_BUDGET), String(DEMO_TIME_BUDGET_MS),
    createHash("sha256").update(FLAWED_SOURCE).digest("hex"),
  ].join("\0")).digest("hex");

const recordPath = (statePath: string, id: string): string => join(statePath, `${id}.json`);
const claimDirectory = (statePath: string, id: string): string => join(statePath, `${id}.claimed`);
const claimedRecordPath = (statePath: string, id: string): string => join(claimDirectory(statePath, id), "record.json");
const budgetPath = (statePath: string, id: string): string => join(statePath, `${id}.budget.json`);
const demoParent = (): string => join(tmpdir(), "realtime-review-tool-demos");

const validFixture = async (record: Pick<DemoRecord, "id" | "root" | "cleanupToken">): Promise<boolean> => {
  try {
    const canonicalParent = await realpath(demoParent());
    const canonicalRoot = await realpath(record.root);
    if (dirname(canonicalRoot) !== canonicalParent || !basename(canonicalRoot).startsWith("demo-")) return false;
    const marker: unknown = JSON.parse(await readFile(join(canonicalRoot, ".review-demo-owner.json"), "utf8"));
    return typeof marker === "object" && marker !== null &&
      "version" in marker && marker.version === 1 &&
      "id" in marker && marker.id === record.id &&
      "cleanupToken" in marker && marker.cleanupToken === record.cleanupToken;
  } catch {
    return false;
  }
};

const readRecord = async (statePath: string, id: string): Promise<DemoRecord | undefined> => {
  try {
    const value: unknown = JSON.parse(await readFile(recordPath(statePath, id), "utf8"));
    if (typeof value !== "object" || value === null) return undefined;
    const candidate = value as Partial<DemoRecord>;
    if (candidate.version !== 1 || candidate.id !== id || typeof candidate.root !== "string" ||
        typeof candidate.createdAt !== "number" || typeof candidate.cleanupToken !== "string" ||
        typeof candidate.selectionDigest !== "string") return undefined;
    const expected = digestSelection({
      version: 1, id, root: candidate.root, createdAt: candidate.createdAt,
      cleanupToken: candidate.cleanupToken,
    });
    if (candidate.selectionDigest !== expected) return undefined;
    const decoded: DemoRecord = {
      version: 1,
      id,
      root: candidate.root,
      createdAt: candidate.createdAt,
      cleanupToken: candidate.cleanupToken,
      selectionDigest: candidate.selectionDigest,
    };
    return await validFixture(decoded) ? decoded : undefined;
  } catch {
    return undefined;
  }
};

/** Atomically consumes a pending preview. Only the process that creates the claim directory owns cleanup. */
const claimRecord = async (statePath: string, record: DemoRecord): Promise<void> => {
  const directory = claimDirectory(statePath, record.id);
  await mkdir(directory, { mode: 0o700 });
  try {
    await rename(recordPath(statePath, record.id), claimedRecordPath(statePath, record.id));
  } catch (cause) {
    await rm(directory, { recursive: true, force: true });
    throw cause;
  }
};

const makeFixture = async (statePath: string): Promise<DemoRecord> => {
  await mkdir(demoParent(), { recursive: true, mode: 0o700 });
  const root = await mkdtemp(join(demoParent(), "demo-"));
  const id = randomUUID();
  const createdAt = Date.now();
  const cleanupToken = randomUUID();
  try {
    await execFileAsync("git", ["init", "--quiet", "--initial-branch=main", root]);
    await writeFile(join(root, "session.ts"), FLAWED_SOURCE, { mode: 0o600 });
    await writeFile(join(root, "validate.mjs"), VALIDATOR_SOURCE, { mode: 0o600 });
    await writeFile(join(root, ".review-demo-owner.json"), `${JSON.stringify({
      version: 1, id, cleanupToken,
    })}\n`, { mode: 0o600 });
    await writeFile(join(root, ".review.jsonc"), JSON.stringify({
      version: 1,
      includes: ["session.ts"],
      settings: { deadlineMs: 15_000, concurrency: 1, adviceBudget: 3, transientRetries: 0 },
    }) + "\n", { mode: 0o600 });
    await execFileAsync("git", ["-C", root, "add", "session.ts", "validate.mjs", ".review.jsonc", ".review-demo-owner.json"]);
    await execFileAsync("git", ["-C", root, "-c", "user.name=Review Demo", "-c", "user.email=demo@example.invalid", "commit", "--quiet", "-m", "synthetic demo fixture"]);
    const canonicalRoot = await realpath(root);
    const base = { version: 1 as const, id, root: canonicalRoot, createdAt, cleanupToken };
    const record = { ...base, selectionDigest: digestSelection(base) };
    await mkdir(statePath, { recursive: true, mode: 0o700 });
    await writeFile(recordPath(statePath, id), `${JSON.stringify(record)}\n`, { mode: 0o600 });
    return record;
  } catch (cause) {
    await rm(root, { recursive: true, force: true });
    throw cause;
  }
};

const cleanFixture = async (statePath: string, record: DemoRecord): Promise<void> => {
  if (!(await validFixture(record))) throw new Error("refusing to remove an unowned demo root");
  await rm(record.root, { recursive: true, force: true });
  await rm(recordPath(statePath, record.id), { force: true });
  await rm(claimDirectory(statePath, record.id), { recursive: true, force: true });
  await rm(budgetPath(statePath, record.id), { force: true });
  await rm(`${budgetPath(statePath, record.id)}.trace`, { recursive: true, force: true });
};

const jsonLines = (encoded: string): ReadonlyArray<Readonly<Record<string, unknown>>> =>
  encoded.split("\n").flatMap((line) => {
    try {
      const value: unknown = JSON.parse(line);
      return typeof value === "object" && value !== null ? [value as Readonly<Record<string, unknown>>] : [];
    } catch {
      return [];
    }
  });

const hostFailure = (message: string): NonNullable<DemoExecution["host"]["failure"]> =>
  /timed out|timeout|etimedout/i.test(message) ? "timeout" :
  /auth|login|unauthorized|401|credential/i.test(message) ? "authentication" :
  /trust|untrusted/i.test(message) ? "trust" :
  /sandbox|operation not permitted|permission denied/i.test(message) ? "sandbox" : "host-error";

/**
 * Generic host messages, file changes, validation success and review event counts do
 * not correlate a model action to a handed-off finding or a terminal review to the
 * validated repair. This is the fallback when the demo trace is absent.
 */
export const uninstrumentedHostEvidence = (_observations: {
  readonly messages: number;
  readonly changed: boolean;
  readonly repairValidated: boolean;
  readonly terminalReviews: number;
  readonly findingSubmitted: boolean;
}) => ({
  modelReaction: {
    status: "unavailable" as const,
    reason: "host-model-reaction-not-instrumented" as const,
  },
  followUp: {
    status: "unavailable" as const,
    reason: "post-repair-review-not-instrumented" as const,
  },
});

export const correlatedHostEvidence = (observations: {
  readonly trace: ReturnType<typeof readDemoTrace>;
  readonly finalSourceHash: string | undefined;
  readonly finalMessages: ReadonlyArray<string>;
  readonly repairValidated: boolean;
}): Pick<DemoExecution["review"], "modelReaction" | "followUp"> => {
  const delivery = observations.trace.find((entry) => entry.kind === "delivery" && (entry.ruleIds?.length ?? 0) > 0);
  const reactionEdit = delivery === undefined ? undefined : observations.trace.find((entry) =>
    entry.kind === "edit" && entry.at >= delivery.at && entry.sourceHash !== delivery.sourceHash);
  const mentionsFinding = delivery?.ruleIds?.some((id) =>
    observations.finalMessages.some((message) => new RegExp(`(^|[^a-z0-9_/-])${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9_/-]|$)`, "i").test(message))) ?? false;
  const modelReaction: DemoExecution["review"]["modelReaction"] = reactionEdit !== undefined && mentionsFinding
    ? { status: "observed", source: "correlated-finding-reaction", deliveredFindingCorrelation: true }
    : delivery === undefined ? { status: "unavailable", reason: "host-model-reaction-not-instrumented" }
      : { status: "not-observed", source: "correlated-finding-reaction" };
  const terminal = reactionEdit === undefined || !observations.repairValidated || observations.finalSourceHash === undefined
    ? undefined : observations.trace.find((entry) => entry.kind === "terminal" && entry.at >= reactionEdit.at &&
      entry.sourceHash === observations.finalSourceHash && (entry.state === "clear" || entry.state === "findings"));
  const followUp: DemoExecution["review"]["followUp"] = terminal !== undefined
    ? { status: "completed", source: "post-repair-terminal-review", terminalState: terminal.state ?? "findings", afterValidatedRepair: true }
    : observations.trace.length === 0 ? { status: "unavailable", reason: "post-repair-review-not-instrumented" }
      : { status: "not-observed", source: "post-repair-terminal-review" };
  return { modelReaction, followUp };
};

/** The installed demo keeps native hook trust. A test-only environment switch can disable the host sandbox. */
export const executeInstalledCodexDemo: DemoExecutor = async (options) => {
  const started = Date.now();
  const deadlineAt = started + options.deadlineMs;
  const before = await readFile(join(options.root, "session.ts"), "utf8");
  const hostVersion = await execFileAsync(options.codexExecutable, ["--version"], {
    env: process.env,
    timeout: 10_000,
  }).then((result) => result.stdout.trim() || "unavailable", () => "unavailable");
  const prompt = `This is an explicitly selected disposable review demo. The existing session.ts is deliberately flawed: it permits a logged-out session with a userId and a logged-in session without one. Do not use web search. Use apply_patch to add the optional field "readonly demoStarted?: true" inside Session. Then respond to any realtime review feedback as you normally would, choosing the repair yourself. If review feedback affects your change, cite its exact rule ID in your final report. Use no more than two apply_patch calls total. Finally run "node validate.mjs" and report its result.`;
  const environment = {
    ...process.env,
    ...(options.codexHome === undefined ? {} : { CODEX_HOME: options.codexHome }),
    REVIEW_DEMO_SOURCE_BYTE_BUDGET: String(DEMO_SOURCE_BYTE_BUDGET),
    REVIEW_DEMO_PROVIDER_CALL_BUDGET: String(options.providerCallBudget),
    REVIEW_DEMO_DEADLINE_MS: String(options.deadlineMs),
    REVIEW_DEMO_BUDGET_PATH: options.budgetPath,
  };
  const testSandboxBypass = process.env.REVIEW_DEMO_TEST_SANDBOX_BYPASS === "1";
  const testModel = process.env.REVIEW_DEMO_TEST_CODEX_MODEL;
  const hostTimeoutMs = Math.max(1, options.deadlineMs - 10_000);
  const host = await execFileClosedStdin(options.codexExecutable, [
    "exec", "--ephemeral", "--json",
    ...(testSandboxBypass
      ? ["--dangerously-bypass-approvals-and-sandbox"]
      : ["--approve-for-me"]),
    ...(testModel === undefined ? [] : ["--model", testModel]),
    "-C", options.root, prompt,
  ], { env: environment, timeout: hostTimeoutMs, maxBuffer: 2 * 1024 * 1024 }).then(
    (result) => ({ completed: Date.now() - started < hostTimeoutMs - 500,
      stdout: result.stdout, stderrBytes: result.stderr.length, durationMs: Date.now() - started,
      failure: Date.now() - started >= hostTimeoutMs - 500 ? "timeout" as const : undefined }),
    (cause: unknown) => ({
      completed: false,
      stdout: typeof cause === "object" && cause !== null && "stdout" in cause && typeof cause.stdout === "string" ? cause.stdout : "",
      stderrBytes: typeof cause === "object" && cause !== null && "stderr" in cause && typeof cause.stderr === "string" ? cause.stderr.length : 0,
      durationMs: Date.now() - started,
      failure: hostFailure(typeof cause === "object" && cause !== null
        ? `${"stderr" in cause && typeof cause.stderr === "string" ? cause.stderr : ""}\n${"stdout" in cause && typeof cause.stdout === "string" ? cause.stdout : ""}`
        : String(cause)),
    }),
  );
  const after = await readFile(join(options.root, "session.ts"), "utf8").catch(() => before);
  const validation = await execFileAsync(process.execPath, ["validate.mjs"], {
    cwd: options.root,
    timeout: Math.max(1, Math.min(5_000, deadlineAt - Date.now())),
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
  }).then(() => true, () => false);
  const events = jsonLines(host.stdout);
  const eventCounts = {
    threads: events.filter((event) => event.type === "thread.started").length,
    itemsStarted: events.filter((event) => event.type === "item.started").length,
    itemsCompleted: events.filter((event) => event.type === "item.completed").length,
    agentMessages: events.filter((event) => event.type === "item.completed" &&
      typeof event.item === "object" && event.item !== null &&
      (event.item as Readonly<Record<string, unknown>>).type === "agent_message").length,
    errors: events.filter((event) => event.type === "error" || event.type === "turn.failed").length,
  };
  const thread = events.find((event) => event.type === "thread.started");
  const sessionId = typeof thread?.thread_id === "string" ? thread.thread_id : undefined;
  const observedSessionId = sessionId ?? "";
  const activityPath = process.env.REVIEW_ACTIVITY_PATH ??
    join(homedir(), ".local", "state", "realtime-review-tool", "activity");
  let activity = sessionId === undefined ? undefined : readActivity({
    statePath: activityPath,
    root: options.root,
    sessionId,
    resident: await inspectResident(),
  });
  for (let attempt = 0; activity !== undefined && attempt < 20 && Date.now() + 250 <= deadlineAt; attempt += 1) {
    const terminals = activity.counts.clear + activity.counts.findings +
      activity.counts.unavailable + activity.counts.incomplete + activity.counts.skipped;
    if (terminals >= 2 && activity.submission.status === "submitted") break;
    await new Promise<void>((resolve) => setTimeout(resolve, 250));
    activity = readActivity({
      statePath: activityPath,
      root: options.root,
      sessionId: observedSessionId,
      resident: await inspectResident(),
    });
  }
  const messages = events.filter((event) => event.type === "item.completed" &&
    typeof event.item === "object" && event.item !== null &&
    (event.item as Readonly<Record<string, unknown>>).type === "agent_message")
    .map((event) => (event.item as Readonly<Record<string, unknown>>).text)
    .filter((value): value is string => typeof value === "string");
  const changed = after !== before;
  const terminalReviews = activity === undefined ? 0 :
    activity.counts.clear + activity.counts.findings + activity.counts.unavailable;
  const usage = readDemoBudgetUsage(options.budgetPath);
  const submitted = activity?.submission.status === "submitted";
  const correlation = correlatedHostEvidence({
    trace: sessionId === undefined ? [] : readDemoTrace(options.budgetPath, sessionId),
    finalSourceHash: demoSourceHash(options.root),
    finalMessages: messages,
    repairValidated: validation,
  });
  return {
    host: { completed: host.completed, version: hostVersion, durationMs: host.durationMs, eventCounts,
      stdoutBytes: host.stdout.length, stderrBytes: host.stderrBytes,
      ...(host.failure === undefined ? {} : { failure: host.failure }) },
    review: {
      providerCalls: usage?.providerCalls ?? terminalReviews,
      ...(usage === undefined ? {} : { sourceBytes: usage.sourceBytes }),
      submission: activity === undefined ? "unavailable" : submitted ? "submitted" : "none",
      findings: activity?.findings ?? 0,
      modelReaction: correlation.modelReaction,
      followUp: correlation.followUp,
      ...(activity?.firstObservedAt === undefined || activity.lastObservedAt === undefined
        ? {}
        : { latencyMs: Math.max(0, activity.lastObservedAt - activity.firstObservedAt) }),
    },
    repair: { changed, rejectsInvalidStates: validation },
  };
};

export const runFirstReviewDemo = Effect.fn("FirstReviewDemo.run")(function* (
  request: FirstReviewDemoRequest,
  options: {
    readonly statePath: string;
    readonly execute?: DemoExecutor;
    readonly installationReady?: (request: FirstReviewDemoRequest) => boolean;
  },
) {
  if (request.selection === "preview") {
    const installationReady = options.installationReady?.(request) ?? (() => {
      const inspection = inspectCodexInstallation({
        ...(request.codexHome === undefined ? {} : { codexHome: request.codexHome }),
        ...(request.codexExecutable === undefined ? {} : { codexExecutable: request.codexExecutable }),
      });
      return "installed" in inspection && inspection.installed === true;
    })();
    if (!installationReady) {
      return {
        version: 1 as const, operation: "demo" as const, status: "conflict" as const,
        reason: "complete installation setup for the selected Codex home before previewing the live demo",
        paidVerificationPerformed: false as const, providerCalls: 0 as const,
      };
    }
    const setupStarted = Date.now();
    const record = yield* Effect.promise(() => makeFixture(options.statePath));
    return {
      version: 1 as const,
      operation: "demo" as const,
      status: "preview" as const,
      liveSelected: false as const,
      paidVerificationPerformed: false as const,
      demo: { id: record.id, disposableRoot: record.root, syntheticOnly: true as const, disclosure: DEMO_DISCLOSURE },
      budget: { sourceBytes: DEMO_SOURCE_BYTE_BUDGET, providerCalls: DEMO_PROVIDER_CALL_BUDGET, timeMs: DEMO_TIME_BUDGET_MS },
      authorization: { selectionDigest: record.selectionDigest },
      setup: { actions: 1, durationMs: Math.max(0, Date.now() - setupStarted) },
      reviewLatencyMs: undefined,
      action: "review the synthetic input, budgets, disposable root, and selection digest; then explicitly select live execution",
    };
  }
  if (request.demoId === undefined) {
    return { version: 1 as const, operation: "demo" as const, status: "conflict" as const, reason: "demoId is required" };
  }
  const demoId = request.demoId;
  const record = yield* Effect.promise(() => readRecord(options.statePath, demoId));
  if (record === undefined) {
    return { version: 1 as const, operation: "demo" as const, status: "conflict" as const, reason: "demo preview is missing or invalid" };
  }
  if (request.selection === "cancel") {
    const claimed = yield* Effect.tryPromise(() => claimRecord(options.statePath, record)).pipe(
      Effect.as(true),
      Effect.catch(() => Effect.succeed(false)),
    );
    if (!claimed) {
      return { version: 1 as const, operation: "demo" as const, status: "conflict" as const, reason: "demo preview was already claimed" };
    }
    yield* Effect.promise(() => cleanFixture(options.statePath, record));
    return { version: 1 as const, operation: "demo" as const, status: "cleaned" as const, cleaned: true as const, providerCalls: 0 as const };
  }
  if (request.selectionDigest !== record.selectionDigest) {
    return {
      version: 1 as const, operation: "demo" as const, status: "proposal-mismatch" as const,
      liveSelected: false as const, paidVerificationPerformed: false as const, providerCalls: 0 as const,
      action: "cancel this preview or submit the exact selection digest",
    };
  }
  const claimed = yield* Effect.tryPromise(() => claimRecord(options.statePath, record)).pipe(
    Effect.as(true),
    Effect.catch(() => Effect.succeed(false)),
  );
  if (!claimed) {
    return {
      version: 1 as const, operation: "demo" as const, status: "conflict" as const,
      reason: "demo preview was already claimed", liveSelected: false as const,
      paidVerificationPerformed: false as const, providerCalls: 0 as const,
    };
  }
  const reviewStarted = Date.now();
  const selectedBudgetPath = budgetPath(options.statePath, record.id);
  const budgetReady = yield* Effect.try(() => initializeDemoBudget(selectedBudgetPath, {
      root: record.root,
      expiresAt: reviewStarted + DEMO_TIME_BUDGET_MS,
      sourceByteBudget: DEMO_SOURCE_BYTE_BUDGET,
      providerCallBudget: DEMO_PROVIDER_CALL_BUDGET,
    })).pipe(
      Effect.as(true),
      Effect.catch(() => Effect.succeed(false)),
    );
  const execution = !budgetReady
    ? { status: "incomplete" as const, value: undefined }
    : yield* Effect.tryPromise(() => (options.execute ?? executeInstalledCodexDemo)({
        root: record.root,
        ...(request.codexHome === undefined ? {} : { codexHome: request.codexHome }),
        codexExecutable: request.codexExecutable ?? "codex",
        deadlineMs: DEMO_TIME_BUDGET_MS,
        providerCallBudget: DEMO_PROVIDER_CALL_BUDGET,
        budgetPath: selectedBudgetPath,
      })).pipe(
        Effect.map((value) => ({ status: "completed" as const, value })),
        Effect.catch(() => Effect.succeed({ status: "incomplete" as const, value: undefined })),
      );
  const disposableRootRemoved = yield* Effect.promise(() => cleanFixture(options.statePath, record)).pipe(
    Effect.as(true),
    Effect.catch(() => Effect.succeed(false)),
  );
  const value = execution.value;
  const calls = value?.review.providerCalls ?? 0;
  const sourceBytes = value?.review.sourceBytes ?? 0;
  const budgetObserved = calls <= DEMO_PROVIDER_CALL_BUDGET && sourceBytes <= DEMO_SOURCE_BYTE_BUDGET &&
    (Date.now() - reviewStarted) <= DEMO_TIME_BUDGET_MS;
  const passed = value !== undefined && value.host.completed && value.review.submission === "submitted" &&
    value.review.findings > 0 && value.review.modelReaction.status === "observed" &&
    value.review.modelReaction.source === "correlated-finding-reaction" &&
    value.review.modelReaction.deliveredFindingCorrelation === true &&
    value.repair.rejectsInvalidStates && value.review.followUp.status === "completed" &&
    value.review.followUp.source === "post-repair-terminal-review" &&
    value.review.followUp.afterValidatedRepair === true && budgetObserved;
  return {
    version: 1 as const,
    operation: "demo" as const,
    status: passed ? "passed" as const : execution.status === "incomplete" ? "incomplete" as const : "inconclusive" as const,
    liveSelected: true as const,
    paidVerificationPerformed: calls > 0,
    budget: { sourceBytes: DEMO_SOURCE_BYTE_BUDGET, providerCalls: DEMO_PROVIDER_CALL_BUDGET, timeMs: DEMO_TIME_BUDGET_MS, observedWithinBudget: budgetObserved },
    setup: { actions: 0, durationMs: 0 },
    reviewLatencyMs: value?.review.latencyMs,
    evidence: {
      completion: value === undefined ? "incomplete" as const : value.host.completed ? "completed" as const : "incomplete" as const,
      submission: value?.review.submission ?? "unavailable",
      findings: Math.min(100, Math.max(0, value?.review.findings ?? 0)),
      modelReaction: value?.review.modelReaction.status ?? "unavailable",
      modelReactionSource: value?.review.modelReaction.status === "observed" || value?.review.modelReaction.status === "not-observed"
        ? value.review.modelReaction.source
        : "unavailable" as const,
      deliveredFindingCorrelation: value?.review.modelReaction.status === "observed"
        ? value.review.modelReaction.deliveredFindingCorrelation
        : false as const,
      repair: value?.repair.rejectsInvalidStates === true ? "independently-validated" as const : "not-validated" as const,
      followUpReview: value?.review.followUp.status ?? "unavailable",
      providerCalls: Math.min(DEMO_PROVIDER_CALL_BUDGET + 1, Math.max(0, calls)),
      sourceBytes: Math.min(DEMO_SOURCE_BYTE_BUDGET + 1, Math.max(0, sourceBytes)),
      hostVersion: value?.host.version ?? "unavailable",
      hostFailure: value?.host.failure ?? null,
      hostDurationMs: value?.host.durationMs ?? null,
      hostEventCounts: value?.host.eventCounts ?? null,
      hostStdoutBytes: value?.host.stdoutBytes ?? null,
      hostStderrBytes: value?.host.stderrBytes ?? null,
      editChanged: value?.repair.changed ?? false,
      recordedAt: new Date().toISOString(),
      sourceRetained: false as const,
      responsesRetained: false as const,
    },
    cleanup: { disposableRootRemoved },
  };
});

export * as FirstReviewDemo from "./first-review-demo.ts";
