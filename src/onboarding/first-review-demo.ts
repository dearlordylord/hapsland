import * as Effect from "effect/Effect";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { Consent } from "../runtime/consent.ts";
import { DEFAULT_BACKEND, DEFAULT_DESTINATION } from "../runtime/review-config.ts";
import { readActivity } from "../activity/status.ts";
import { inspectResident } from "../resident/client.ts";
import { inspectCodexInstallation } from "./codex-installation.ts";
import { readDemoBudgetUsage, writeDemoBudget } from "./demo-budget.ts";

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
  readonly consentProposalDigest?: string;
};

export type DemoExecution = {
  readonly host: { readonly completed: boolean; readonly version: string; readonly durationMs: number };
  readonly review: {
    readonly providerCalls: number;
    readonly sourceBytes?: number;
    readonly submission: "submitted" | "none" | "unavailable";
    readonly findings: number;
    readonly modelReaction: "observed" | "not-observed" | "unavailable";
    readonly followUp: "completed" | "not-observed" | "unavailable";
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
  await rm(budgetPath(statePath, record.id), { force: true });
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

/** Production executor. It uses normal Codex trust and never passes either bypass flag. */
export const executeInstalledCodexDemo: DemoExecutor = async (options) => {
  const started = Date.now();
  const deadlineAt = started + options.deadlineMs;
  const before = await readFile(join(options.root, "session.ts"), "utf8");
  const prompt = `This is an explicitly selected disposable review demo. The existing session.ts is deliberately flawed: it permits a logged-out session with a userId and a logged-in session without one. Do not use web search. Use apply_patch to add the optional field "readonly demoStarted?: true" inside Session. Then respond to any realtime review feedback as you normally would, choosing the repair yourself. Use no more than two apply_patch calls total. Finally run "node validate.mjs" and report its result.`;
  const environment = {
    ...process.env,
    ...(options.codexHome === undefined ? {} : { CODEX_HOME: options.codexHome }),
    REVIEW_DEMO_SOURCE_BYTE_BUDGET: String(DEMO_SOURCE_BYTE_BUDGET),
    REVIEW_DEMO_PROVIDER_CALL_BUDGET: String(options.providerCallBudget),
    REVIEW_DEMO_DEADLINE_MS: String(options.deadlineMs),
    REVIEW_DEMO_BUDGET_PATH: options.budgetPath,
  };
  const host = await execFileAsync(options.codexExecutable, [
    "exec", "--ephemeral", "--json", "--approve-for-me", "--sandbox", "workspace-write", "-C", options.root, prompt,
  ], { env: environment, timeout: Math.max(1, options.deadlineMs - 10_000), maxBuffer: 2 * 1024 * 1024 }).then(
    (result) => ({ completed: true, stdout: result.stdout, durationMs: Date.now() - started }),
    (cause: unknown) => ({
      completed: false,
      stdout: typeof cause === "object" && cause !== null && "stdout" in cause && typeof cause.stdout === "string" ? cause.stdout : "",
      durationMs: Date.now() - started,
    }),
  );
  const after = await readFile(join(options.root, "session.ts"), "utf8").catch(() => before);
  const validation = await execFileAsync(process.execPath, ["validate.mjs"], {
    cwd: options.root,
    timeout: Math.max(1, Math.min(5_000, deadlineAt - Date.now())),
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
  }).then(() => true, () => false);
  const events = jsonLines(host.stdout);
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
    (event.item as Readonly<Record<string, unknown>>).type === "agent_message").length;
  const changed = after !== before;
  const terminalReviews = activity === undefined ? 0 :
    activity.counts.clear + activity.counts.findings + activity.counts.unavailable;
  const usage = readDemoBudgetUsage(options.budgetPath);
  const submitted = activity?.submission.status === "submitted";
  return {
    host: { completed: host.completed, version: "codex-cli 0.155.1", durationMs: host.durationMs },
    review: {
      providerCalls: usage?.providerCalls ?? terminalReviews,
      ...(usage === undefined ? {} : { sourceBytes: usage.sourceBytes }),
      submission: activity === undefined ? "unavailable" : submitted ? "submitted" : "none",
      findings: activity?.findings ?? 0,
      modelReaction: activity === undefined
        ? "unavailable"
        : submitted && changed && validation && messages > 0 ? "observed" : "not-observed",
      followUp: activity === undefined ? "unavailable" : terminalReviews >= 2 ? "completed" : "not-observed",
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
  const consent = yield* Consent.Service;
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
    const consentProposal = yield* consent.preview(record.root, DEFAULT_BACKEND, DEFAULT_DESTINATION);
    return {
      version: 1 as const,
      operation: "demo" as const,
      status: "preview" as const,
      liveSelected: false as const,
      paidVerificationPerformed: false as const,
      demo: { id: record.id, disposableRoot: record.root, syntheticOnly: true as const, disclosure: DEMO_DISCLOSURE },
      budget: { sourceBytes: DEMO_SOURCE_BYTE_BUDGET, providerCalls: DEMO_PROVIDER_CALL_BUDGET, timeMs: DEMO_TIME_BUDGET_MS },
      authorization: { selectionDigest: record.selectionDigest, consentProposalDigest: consentProposal.digest },
      setup: { actions: 1, durationMs: Math.max(0, Date.now() - setupStarted) },
      reviewLatencyMs: undefined,
      action: "review the synthetic input, budgets, disposable root, and both digests; then explicitly select live execution",
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
    yield* consent.disable(record.root, DEFAULT_BACKEND, DEFAULT_DESTINATION).pipe(Effect.ignore);
    yield* Effect.promise(() => cleanFixture(options.statePath, record));
    return { version: 1 as const, operation: "demo" as const, status: "cleaned" as const, cleaned: true as const, providerCalls: 0 as const };
  }
  const currentProposal = yield* consent.preview(record.root, DEFAULT_BACKEND, DEFAULT_DESTINATION);
  if (request.selectionDigest !== record.selectionDigest || request.consentProposalDigest !== currentProposal.digest) {
    return {
      version: 1 as const, operation: "demo" as const, status: "proposal-mismatch" as const,
      liveSelected: false as const, paidVerificationPerformed: false as const, providerCalls: 0 as const,
      action: "cancel this preview or submit both exact preview digests",
    };
  }
  yield* consent.enable(currentProposal);
  const reviewStarted = Date.now();
  const selectedBudgetPath = budgetPath(options.statePath, record.id);
  const budgetReady = yield* Effect.try(() => writeDemoBudget(selectedBudgetPath, {
    root: record.root,
    expiresAt: reviewStarted + DEMO_TIME_BUDGET_MS,
    sourceByteBudget: DEMO_SOURCE_BYTE_BUDGET,
    providerCallBudget: DEMO_PROVIDER_CALL_BUDGET,
  })).pipe(Effect.result);
  const execution = budgetReady._tag === "Failure"
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
  const consentRevoked = yield* consent.disable(record.root, DEFAULT_BACKEND, DEFAULT_DESTINATION).pipe(
    Effect.as(true),
    Effect.catch(() => Effect.succeed(false)),
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
    value.review.findings > 0 && value.review.modelReaction === "observed" &&
    value.repair.rejectsInvalidStates && value.review.followUp === "completed" && budgetObserved;
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
      modelReaction: value?.review.modelReaction ?? "unavailable",
      repair: value?.repair.rejectsInvalidStates === true ? "independently-validated" as const : "not-validated" as const,
      followUpReview: value?.review.followUp ?? "unavailable",
      providerCalls: Math.min(DEMO_PROVIDER_CALL_BUDGET + 1, Math.max(0, calls)),
      sourceBytes: Math.min(DEMO_SOURCE_BYTE_BUDGET + 1, Math.max(0, sourceBytes)),
      hostVersion: value?.host.version ?? "unavailable",
      recordedAt: new Date().toISOString(),
      sourceRetained: false as const,
      responsesRetained: false as const,
    },
    cleanup: { disposableRootRemoved, consentRevoked },
  };
});

export * as FirstReviewDemo from "./first-review-demo.ts";
