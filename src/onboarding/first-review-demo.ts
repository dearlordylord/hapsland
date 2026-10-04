import { HAPSLAND_STATE_DIRECTORY } from "../runtime/user-paths.ts";
import { packageCommand } from "../runtime/package-runtime.ts";
import * as Effect from "effect/Effect";
import { Clock, Config, Exit, Option, Ref, Schedule, Schema } from "effect";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { readActivity } from "../activity/status.ts";
import { inspectResidentEffect as inspectResident } from "../resident/client.ts";
import { inspectCodexInstallation } from "./codex-installation.ts";
import { execFileClosedStdin } from "./host-process.ts";
import { initializeDemoBudget, readDemoBudgetUsage } from "./demo-budget.ts";
import { demoSourceHash, readDemoTrace } from "./demo-trace.ts";

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


const DemoRecord = Schema.Struct({
  version: Schema.Literal(1), id: Schema.String, root: Schema.String, createdAt: Schema.Number,
  cleanupToken: Schema.String, selectionDigest: Schema.String,
});
interface DemoRecord extends Schema.Schema.Type<typeof DemoRecord> {}

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

export type DemoExecutionOptions = {
  readonly root: string;
  readonly codexHome?: string;
  readonly codexExecutable: string;
  readonly deadlineMs: number;
  readonly providerCallBudget: number;
  readonly budgetPath: string;
};
export class DemoExecutionError extends Schema.TaggedError<DemoExecutionError>()("DemoExecutionError", { operation: Schema.NonEmptyString }) {}
export type DemoExecutor = (options: DemoExecutionOptions) => Effect.Effect<DemoExecution, DemoExecutionError>;
const demoIo = Effect.fn("FirstReviewDemo.nativeIo")(<A>(operation: string, execute: () => Promise<A>) =>
  Effect.tryPromise({ try: execute, catch: () => new DemoExecutionError({ operation }) }).pipe(Effect.uninterruptible));
const monotonicMillis = Clock.monotonicTimeNanos.pipe(Effect.map((now) => Number(now / 1_000_000n)));

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
const demoParent = (): string => join(tmpdir(), "hapsland-demos");

const matchesDemoOwner = (marker: unknown, record: Pick<DemoRecord, "id" | "cleanupToken">): boolean => {
  return typeof marker === "object" && marker !== null &&
      "version" in marker && marker.version === 1 && "id" in marker && marker.id === record.id &&
      "cleanupToken" in marker && marker.cleanupToken === record.cleanupToken;
};

const validFixture = Effect.fn("FirstReviewDemo.validFixture")((record: Pick<DemoRecord, "id" | "root" | "cleanupToken">) =>
  Effect.gen(function* () {
    const canonicalParent = yield* demoIo("resolve demo parent", () => realpath(demoParent()));
    const canonicalRoot = yield* demoIo("resolve demo root", () => realpath(record.root));
    if (dirname(canonicalRoot) !== canonicalParent || !basename(canonicalRoot).startsWith("demo-")) return false;
    const encoded = yield* demoIo("read demo owner", () => readFile(join(canonicalRoot, ".review-demo-owner.json"), "utf8"));
    const marker: unknown = yield* Effect.try({ try: () => JSON.parse(encoded),
      catch: () => new DemoExecutionError({ operation: "decode demo owner" }) });
    return matchesDemoOwner(marker, record);
  }).pipe(Effect.catch(() => Effect.succeed(false))));

const readRecord = Effect.fn("FirstReviewDemo.readRecord")((statePath: string, id: string) => Effect.gen(function* () {
  const encoded = yield* demoIo("read preview record", () => readFile(recordPath(statePath, id), "utf8"));
  const unknown: unknown = yield* Effect.try({ try: () => JSON.parse(encoded),
    catch: () => new DemoExecutionError({ operation: "decode preview JSON" }) });
  const candidate = yield* Schema.decodeUnknownEffect(DemoRecord)(unknown);
  if (candidate.id !== id || candidate.selectionDigest !== digestSelection(candidate)) return undefined;
  return (yield* validFixture(candidate)) ? candidate : undefined;
}).pipe(Effect.catch(() => Effect.succeed(undefined))));

/** Atomically consumes a preview; only this claim creator owns subsequent cleanup. */
const claimRecord = Effect.fn("FirstReviewDemo.claimRecord")((statePath: string, record: DemoRecord) => Effect.gen(function* () {
  const directory = claimDirectory(statePath, record.id);
  yield* demoIo("create preview claim", () => mkdir(directory, { mode: 0o700 }));
  yield* demoIo("consume preview record", () => rename(recordPath(statePath, record.id), claimedRecordPath(statePath, record.id))).pipe(
    Effect.catch((error) => demoIo("discard failed preview claim", () => rm(directory, { recursive: true, force: true })).pipe(
      Effect.catch(() => Effect.void), Effect.andThen(Effect.fail(error)),
    )),
  );
}).pipe(Effect.uninterruptible));

const runFixtureGit = Effect.fn("FirstReviewDemo.fixtureGit")((args: ReadonlyArray<string>) => Effect.gen(function* () {
  const result = yield* execFileClosedStdin("git", args, { env: process.env,
    timeout: DEMO_TIME_BUDGET_MS, maxBuffer: 1024 * 1024 });
  if (!result.succeeded) return yield* Effect.fail(new DemoExecutionError({ operation: "prepare fixture git" }));
}));

const makeFixture = Effect.fn("FirstReviewDemo.makeFixture")((statePath: string) => Effect.gen(function* () {
  yield* demoIo("create demo parent", () => mkdir(demoParent(), { recursive: true, mode: 0o700 }));
  const id = randomUUID();
  const createdAt = yield* Clock.currentTimeMillis;
  const cleanupToken = randomUUID();
  return yield* Effect.acquireUseRelease(
    demoIo("create demo root", () => mkdtemp(join(demoParent(), "demo-"))),
    (root) => Effect.gen(function* () {
      yield* runFixtureGit(["init", "--quiet", "--initial-branch=main", root]);
      yield* demoIo("write demo source", () => writeFile(join(root, "session.ts"), FLAWED_SOURCE, { mode: 0o600 }));
      yield* demoIo("write demo owner", () => writeFile(join(root, ".review-demo-owner.json"),
        `${JSON.stringify({ version: 1, id, cleanupToken })}\n`, { mode: 0o600 }));
      yield* demoIo("write demo configuration", () => writeFile(join(root, ".hapsland.jsonc"), JSON.stringify({
        version: 1, includes: ["session.ts"],
        settings: { deadlineMs: 15_000, concurrency: 1, adviceBudget: 3, transientRetries: 0 },
      }) + "\n", { mode: 0o600 }));
      yield* runFixtureGit(["-C", root, "add", "session.ts", ".hapsland.jsonc", ".review-demo-owner.json"]);
      yield* runFixtureGit(["-C", root, "-c", "user.name=Review Demo", "-c", "user.email=demo@example.invalid",
        "commit", "--quiet", "-m", "synthetic demo fixture"]);
      const canonicalRoot = yield* demoIo("resolve prepared root", () => realpath(root));
      const base = { version: 1 as const, id, root: canonicalRoot, createdAt, cleanupToken };
      const record = { ...base, selectionDigest: digestSelection(base) };
      yield* demoIo("create preview state directory", () => mkdir(statePath, { recursive: true, mode: 0o700 }));
      yield* demoIo("publish preview record", () => writeFile(recordPath(statePath, id), `${JSON.stringify(record)}\n`, { mode: 0o600, flag: "wx" }));
      return record;
    }),
    (root, exit) => Exit.isSuccess(exit) ? Effect.void : Effect.gen(function* () {
      const published = yield* readRecord(statePath, id);
      if (published?.cleanupToken === cleanupToken) {
        yield* demoIo("discard incomplete preview record", () => rm(recordPath(statePath, id), { force: true }));
      }
      yield* demoIo("discard incomplete demo root", () => rm(root, { recursive: true, force: true }));
    }),
  );
}));

const cleanFixture = Effect.fn("FirstReviewDemo.cleanFixture")((statePath: string, record: DemoRecord) => Effect.gen(function* () {
  if (!(yield* validFixture(record))) return yield* Effect.fail(new DemoExecutionError({ operation: "refuse unowned demo root" }));
  yield* demoIo("remove owned demo root", () => rm(record.root, { recursive: true, force: true }));
  yield* demoIo("remove preview record", () => rm(recordPath(statePath, record.id), { force: true }));
  yield* demoIo("remove preview claim", () => rm(claimDirectory(statePath, record.id), { recursive: true, force: true }));
  yield* demoIo("remove demo budget", () => rm(budgetPath(statePath, record.id), { force: true }));
  yield* demoIo("remove demo trace", () => rm(`${budgetPath(statePath, record.id)}.trace`, { recursive: true, force: true }));
}).pipe(Effect.uninterruptible));

const claimOwnedRecord = Effect.fn("FirstReviewDemo.claimOwnedRecord")((statePath: string, record: DemoRecord) => Effect.gen(function* () {
  const released = yield* Ref.make(false);
  const close = cleanFixture(statePath, record).pipe(Effect.tap(() => Ref.set(released, true)));
  yield* Effect.acquireRelease(claimRecord(statePath, record), () => Ref.get(released).pipe(
    Effect.flatMap((done) => done ? Effect.void : close), Effect.catch(() => Effect.void),
  ));
  return close;
}));

const jsonLines = (encoded: string): ReadonlyArray<Readonly<Record<string, unknown>>> =>
  encoded.split("\n").flatMap((line) => {
    try {
      const value: unknown = JSON.parse(line);
      return typeof value === "object" && value !== null ? [value as Readonly<Record<string, unknown>>] : [];
    } catch {
      return [];
    }
  });

const hostFailurePatterns: ReadonlyArray<readonly [RegExp, NonNullable<DemoExecution["host"]["failure"]>]> = [
  [/timed out|timeout|etimedout/i, "timeout"],
  [/auth|login|unauthorized|401|credential/i, "authentication"],
  [/trust|untrusted/i, "trust"],
  [/sandbox|operation not permitted|permission denied/i, "sandbox"],
];
const hostFailure = (message: string): NonNullable<DemoExecution["host"]["failure"]> =>
  hostFailurePatterns.find(([pattern]) => pattern.test(message))?.[1] ?? "host-error";

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

type DemoCorrelationObservations = {
  readonly trace: ReturnType<typeof readDemoTrace>;
  readonly finalSourceHash: string | undefined;
  readonly finalMessages: ReadonlyArray<string>;
  readonly repairValidated: boolean;
};
const findingReaction = (delivery: ReturnType<typeof readDemoTrace>[number] | undefined, reactionEdit: ReturnType<typeof readDemoTrace>[number] | undefined, mentionsFinding: boolean): DemoExecution["review"]["modelReaction"] => {
  return reactionEdit !== undefined && mentionsFinding
    ? { status: "observed", source: "correlated-finding-reaction", deliveredFindingCorrelation: true }
    : delivery === undefined ? { status: "unavailable", reason: "host-model-reaction-not-instrumented" }
      : { status: "not-observed", source: "correlated-finding-reaction" };
};
const postRepairReview = (observations: DemoCorrelationObservations, reactionEdit: ReturnType<typeof readDemoTrace>[number] | undefined): DemoExecution["review"]["followUp"] => {
  const terminal = reactionEdit === undefined || !observations.repairValidated || observations.finalSourceHash === undefined
    ? undefined : observations.trace.find((entry) => entry.kind === "terminal" && entry.at >= reactionEdit.at &&
      entry.sourceHash === observations.finalSourceHash && (entry.state === "clear" || entry.state === "findings"));
  return terminal !== undefined
    ? { status: "completed", source: "post-repair-terminal-review", terminalState: terminal.state ?? "findings", afterValidatedRepair: true }
    : observations.trace.length === 0 ? { status: "unavailable", reason: "post-repair-review-not-instrumented" }
      : { status: "not-observed", source: "post-repair-terminal-review" };
};
export const correlatedHostEvidence = (observations: DemoCorrelationObservations): Pick<DemoExecution["review"], "modelReaction" | "followUp"> => {
  const delivery = observations.trace.find((entry) => entry.kind === "delivery" && (entry.ruleIds?.length ?? 0) > 0);
  const reactionEdit = delivery === undefined ? undefined : observations.trace.find((entry) =>
    entry.kind === "edit" && entry.at >= delivery.at && entry.sourceHash !== delivery.sourceHash);
  const mentionsFinding = delivery?.ruleIds?.some((id) =>
    observations.finalMessages.some((message) => new RegExp(`(^|[^a-z0-9_/-])${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9_/-]|$)`, "i").test(message))) ?? false;
  return { modelReaction: findingReaction(delivery, reactionEdit, mentionsFinding), followUp: postRepairReview(observations, reactionEdit) };
};

type DemoHostEvent = Readonly<Record<string, unknown>>;
const isAgentMessage = (event: DemoHostEvent): event is DemoHostEvent & { readonly item: { readonly type: "agent_message"; readonly text?: unknown } } =>
  event.type === "item.completed" && typeof event.item === "object" && event.item !== null &&
  "type" in event.item && event.item.type === "agent_message";
const hostMessages = (events: ReadonlyArray<DemoHostEvent>): ReadonlyArray<string> =>
  events.filter(isAgentMessage).map((event) => event.item.text).filter((value): value is string => typeof value === "string");
const hostEventCounts = (events: ReadonlyArray<DemoHostEvent>) => {
  return {
    threads: events.filter((event) => event.type === "thread.started").length,
    itemsStarted: events.filter((event) => event.type === "item.started").length,
    itemsCompleted: events.filter((event) => event.type === "item.completed").length,
    agentMessages: events.filter((event) => isAgentMessage(event)).length,
    errors: events.filter((event) => event.type === "error" || event.type === "turn.failed").length,
  };

};
const demoHostOutcome = (hostResult: Effect.Success<ReturnType<typeof execFileClosedStdin>>, durationMs: number, hostTimeoutMs: number) => {
  const timedOut = hostResult.timedOut || (hostResult.succeeded && durationMs >= hostTimeoutMs - 500);
  return { completed: hostResult.succeeded && !timedOut, stdout: hostResult.stdout,
    stderrBytes: Buffer.byteLength(hostResult.stderr, "utf8"), durationMs,
    failure: timedOut ? "timeout" as const : hostResult.succeeded ? undefined : hostFailure(`${hostResult.stderr}\n${hostResult.stdout}`),
  };
};
const demoHostEnvironment = (options: DemoExecutionOptions): NodeJS.ProcessEnv => {
  return {
    ...process.env,
    ...(options.codexHome === undefined ? {} : { CODEX_HOME: options.codexHome }),
    REVIEW_DEMO_SOURCE_BYTE_BUDGET: String(DEMO_SOURCE_BYTE_BUDGET),
    REVIEW_DEMO_PROVIDER_CALL_BUDGET: String(options.providerCallBudget),
    REVIEW_DEMO_DEADLINE_MS: String(options.deadlineMs),
    REVIEW_DEMO_BUDGET_PATH: options.budgetPath,
  };
};
const demoHostArguments = (root: string, prompt: string, testSandboxBypass: boolean, testModel: string | undefined): string[] => [
    "exec", "--ephemeral", "--json",
    ...(testSandboxBypass
      ? ["--dangerously-bypass-approvals-and-sandbox"]
      : ["--approve-for-me"]),
    ...(testModel === undefined ? [] : ["--model", testModel]),
    "-C", root, prompt,
];
const demoReviewEvidence = (activity: ReturnType<typeof readActivity> | undefined, usage: ReturnType<typeof readDemoBudgetUsage>, terminalReviews: number, correlation: Pick<DemoExecution["review"], "modelReaction" | "followUp">): DemoExecution["review"] => {
  return {
      providerCalls: usage?.providerCalls ?? terminalReviews,
      ...(usage === undefined ? {} : { sourceBytes: usage.sourceBytes }),
      submission: activity === undefined ? "unavailable" : activity.submission.status === "submitted" ? "submitted" : "none",
      findings: activity?.findings ?? 0,
      modelReaction: correlation.modelReaction,
      followUp: correlation.followUp,
      ...demoReviewLatency(activity),
  };
};
const demoReviewLatency = (activity: ReturnType<typeof readActivity> | undefined) => ({
      ...(activity?.firstObservedAt === undefined || activity.lastObservedAt === undefined
        ? {}
        : { latencyMs: Math.max(0, activity.lastObservedAt - activity.firstObservedAt) }),
});

const observeDemoActivity = Effect.fn("FirstReviewDemo.observeDemoActivity")(function* (root: string, sessionId: string | undefined, deadlineAt: number) {
  const observedSessionId = sessionId ?? "";
  const activityPath = yield* Config.NonEmptyString("REVIEW_ACTIVITY_PATH").pipe(
    Config.withDefault(join(HAPSLAND_STATE_DIRECTORY, "activity")),
  );
  const observeActivity = Effect.fn("FirstReviewDemo.observeActivity")(function* () {
    if (sessionId === undefined) return undefined;
    const resident = yield* inspectResident();
    return readActivity({ statePath: activityPath, root, sessionId: observedSessionId, resident });
  });
  const initial = yield* observeActivity();
  const needsObservation = (activity: typeof initial) => activity !== undefined &&
    !(activity.counts.clear + activity.counts.findings + activity.counts.unavailable + activity.counts.incomplete +
      activity.counts.skipped >= 2 && activity.submission.status === "submitted");
  let activity = initial;
  if (needsObservation(initial) && (yield* monotonicMillis) + 250 <= deadlineAt) {
    yield* Effect.sleep(250);
    activity = yield* observeActivity().pipe(Effect.repeat({
      schedule: Schedule.spaced("250 millis").pipe(Schedule.upTo({ times: 19 })),
      while: (observed) => Effect.gen(function* () {
        return needsObservation(observed) && (yield* monotonicMillis) + 250 <= deadlineAt;
      }),
    }));
  }
  return activity;
});

/** The installed demo keeps native hook trust. A test-only environment switch can disable the host sandbox. */
export const executeInstalledCodexDemo = Effect.fn("FirstReviewDemo.executeInstalled")((options: DemoExecutionOptions) => Effect.gen(function* () {
  const started = yield* monotonicMillis;
  const deadlineAt = started + options.deadlineMs;
  const before = yield* demoIo("read initial demo source", () => readFile(join(options.root, "session.ts"), "utf8"));
  const version = yield* execFileClosedStdin(options.codexExecutable, ["--version"], {
    env: process.env, timeout: 10_000, maxBuffer: 1024 * 1024,
  });
  const hostVersion = version.succeeded ? version.stdout.trim() || "unavailable" : "unavailable";
  const validator = packageCommand("parser");
  const validationCommand = [validator.executable, ...validator.args, "--demo-validate"].map(value => `'${value.replaceAll("'", "'\\''")}'`).join(" ");
  const prompt = `This is an explicitly selected disposable review demo. The existing session.ts is deliberately flawed: it permits a logged-out session with a userId and a logged-in session without one. Do not use web search. Use apply_patch to add the optional field "readonly demoStarted?: true" inside Session. Then respond to any realtime review feedback as you normally would, choosing the repair yourself. If review feedback affects your change, cite its exact rule ID in your final report. Use no more than two apply_patch calls total. Finally run ${validationCommand} and report its result.`;
  const environment = demoHostEnvironment(options);
  const testSandboxBypass = (yield* Config.String("REVIEW_DEMO_TEST_SANDBOX_BYPASS").pipe(Config.withDefault("0"))) === "1";
  const testModel = Option.getOrUndefined(yield* Config.option(Config.NonEmptyString("REVIEW_DEMO_TEST_CODEX_MODEL")));
  const hostTimeoutMs = Math.max(1, options.deadlineMs - 10_000);
  const hostResult = yield* execFileClosedStdin(options.codexExecutable, [
    ...demoHostArguments(options.root, prompt, testSandboxBypass, testModel),
  ], { env: environment, timeout: hostTimeoutMs, maxBuffer: 2 * 1024 * 1024 });
  const hostEnded = yield* monotonicMillis;
  const durationMs = hostEnded - started;
  const host = demoHostOutcome(hostResult, durationMs, hostTimeoutMs);
  const after = yield* demoIo("read final demo source", () => readFile(join(options.root, "session.ts"), "utf8")).pipe(
    Effect.catch(() => Effect.succeed(before)),
  );
  const now = yield* monotonicMillis;
  const validation = (yield* execFileClosedStdin(validator.executable, [...validator.args, "--demo-validate"], {
    cwd: options.root, timeout: Math.max(1, Math.min(5_000, deadlineAt - now)),
    maxBuffer: 1024 * 1024, env: { ...process.env, NODE_NO_WARNINGS: "1" },
  })).succeeded;
  const events = jsonLines(host.stdout);
  const eventCounts = hostEventCounts(events);
  const thread = events.find((event) => event.type === "thread.started");
  const sessionId = typeof thread?.thread_id === "string" ? thread.thread_id : undefined;
  const activity = yield* observeDemoActivity(options.root, sessionId, deadlineAt);
  const messages = hostMessages(events);
  const changed = after !== before;
  const terminalReviews = activity === undefined ? 0 :
    activity.counts.clear + activity.counts.findings + activity.counts.unavailable;
  const usage = readDemoBudgetUsage(options.budgetPath);
  const correlation = correlatedHostEvidence({
    trace: sessionId === undefined ? [] : readDemoTrace(options.budgetPath, sessionId),
    finalSourceHash: demoSourceHash(options.root),
    finalMessages: messages,
    repairValidated: validation,
  });
  return {
    host: { completed: host.completed, version: hostVersion, durationMs: host.durationMs, eventCounts,
      stdoutBytes: Buffer.byteLength(host.stdout, "utf8"), stderrBytes: host.stderrBytes,
      ...(host.failure === undefined ? {} : { failure: host.failure }) },
    review: demoReviewEvidence(activity, usage, terminalReviews, correlation),
    repair: { changed, rejectsInvalidStates: validation },
  } satisfies DemoExecution;
}).pipe(Effect.mapError(() => new DemoExecutionError({ operation: "execute installed demo" }))));

type FirstReviewDemoOptions = {
  readonly statePath: string;
  readonly execute?: DemoExecutor;
  readonly installationReady?: (request: FirstReviewDemoRequest) => boolean;
};

const selectedInstallationReady = Effect.fn("FirstReviewDemo.selectedInstallationReady")(function* (request: FirstReviewDemoRequest, options: FirstReviewDemoOptions) {
    if (options.installationReady !== undefined) return options.installationReady(request);
    else {
      const inspection = yield* inspectCodexInstallation({
        ...(request.codexHome === undefined ? {} : { codexHome: request.codexHome }),
        ...(request.codexExecutable === undefined ? {} : { codexExecutable: request.codexExecutable }),
      });
      return "installed" in inspection && inspection.installed === true;
    }
});

const previewSelectedDemo = Effect.fn("FirstReviewDemo.previewSelectedDemo")(function* (request: FirstReviewDemoRequest, options: FirstReviewDemoOptions) {
  const installationReady = yield* selectedInstallationReady(request, options);
    if (!installationReady) {
      return {
        version: 1 as const, operation: "demo" as const, status: "conflict" as const,
        reason: "complete installation setup for the selected Codex home before previewing the live demo",
        paidVerificationPerformed: false as const, providerCalls: 0 as const,
      };
    }
    const setupStarted = yield* monotonicMillis;
    const record = yield* makeFixture(options.statePath);
    return {
      version: 1 as const,
      operation: "demo" as const,
      status: "preview" as const,
      liveSelected: false as const,
      paidVerificationPerformed: false as const,
      demo: { id: record.id, disposableRoot: record.root, syntheticOnly: true as const, disclosure: DEMO_DISCLOSURE },
      budget: { sourceBytes: DEMO_SOURCE_BYTE_BUDGET, providerCalls: DEMO_PROVIDER_CALL_BUDGET, timeMs: DEMO_TIME_BUDGET_MS },
      authorization: { selectionDigest: record.selectionDigest },
      setup: { actions: 1, durationMs: Math.max(0, (yield* monotonicMillis) - setupStarted) },
      reviewLatencyMs: undefined,
      action: "review the synthetic input, budgets, disposable root, and selection digest; then explicitly select live execution",
    };
});

const cancelSelectedDemo = Effect.fn("FirstReviewDemo.cancelSelectedDemo")(function* (statePath: string, record: DemoRecord) {
    const claimed = yield* claimOwnedRecord(statePath, record).pipe(Effect.result);
    if (claimed._tag === "Failure") {
      return { version: 1 as const, operation: "demo" as const, status: "conflict" as const, reason: "demo preview was already claimed" };
    }
    yield* claimed.success;
    return { version: 1 as const, operation: "demo" as const, status: "cleaned" as const, cleaned: true as const, providerCalls: 0 as const };
});

const executeSelectedDemo = Effect.fn("FirstReviewDemo.executeSelectedDemo")(function* (request: FirstReviewDemoRequest, options: FirstReviewDemoOptions, record: DemoRecord, selectedBudgetPath: string, budgetReady: boolean) {
  return !budgetReady
    ? { status: "incomplete" as const, value: undefined }
    : yield* (options.execute ?? executeInstalledCodexDemo)({
        root: record.root,
        ...(request.codexHome === undefined ? {} : { codexHome: request.codexHome }),
        codexExecutable: request.codexExecutable ?? "codex",
        deadlineMs: DEMO_TIME_BUDGET_MS,
        providerCallBudget: DEMO_PROVIDER_CALL_BUDGET,
        budgetPath: selectedBudgetPath,
      }).pipe(
        Effect.map((value) => ({ status: "completed" as const, value })),
        Effect.catch(() => Effect.succeed({ status: "incomplete" as const, value: undefined })),
      );
});

const reactionEvidence = (value: DemoExecution | undefined) => ({
      modelReaction: value?.review.modelReaction.status ?? "unavailable",
      modelReactionSource: value?.review.modelReaction.status === "observed" || value?.review.modelReaction.status === "not-observed"
        ? value.review.modelReaction.source
        : "unavailable" as const,
      deliveredFindingCorrelation: value?.review.modelReaction.status === "observed"
        ? value.review.modelReaction.deliveredFindingCorrelation
        : false as const,
});
const hostProcessEvidence = (value: DemoExecution | undefined) => ({
  hostEventCounts: value?.host.eventCounts ?? null,
  hostStdoutBytes: value?.host.stdoutBytes ?? null,
  hostStderrBytes: value?.host.stderrBytes ?? null,
});
const hostEvidence = (value: DemoExecution | undefined) => ({
  hostVersion: value?.host.version ?? "unavailable",
  hostFailure: value?.host.failure ?? null,
  hostDurationMs: value?.host.durationMs ?? null,
  editChanged: value?.repair.changed ?? false,
  ...hostProcessEvidence(value),
});
const reviewEvidence = (value: DemoExecution | undefined) => ({
  submission: value?.review.submission ?? "unavailable",
  findings: Math.min(100, Math.max(0, value?.review.findings ?? 0)),
  followUpReview: value?.review.followUp.status ?? "unavailable",
});
const demoEvidence = (value: DemoExecution | undefined, calls: number, sourceBytes: number, recordedAt: string) => {
  return {
      completion: value === undefined ? "incomplete" as const : value.host.completed ? "completed" as const : "incomplete" as const,
      ...reviewEvidence(value),
      ...reactionEvidence(value),
      repair: value?.repair.rejectsInvalidStates === true ? "independently-validated" as const : "not-validated" as const,
      providerCalls: Math.min(DEMO_PROVIDER_CALL_BUDGET + 1, Math.max(0, calls)),
      sourceBytes: Math.min(DEMO_SOURCE_BYTE_BUDGET + 1, Math.max(0, sourceBytes)),
      ...hostEvidence(value),
      recordedAt: recordedAt,
      sourceRetained: false as const,
      responsesRetained: false as const,
  };
};
const correlatedReaction = (reaction: DemoExecution["review"]["modelReaction"]): boolean =>
  reaction.status === "observed" && reaction.source === "correlated-finding-reaction" && reaction.deliveredFindingCorrelation === true;
const validatedFollowUp = (value: DemoExecution): boolean =>
  value.repair.rejectsInvalidStates && value.review.followUp.status === "completed" &&
  value.review.followUp.source === "post-repair-terminal-review" && value.review.followUp.afterValidatedRepair === true;
const demoPassed = (value: DemoExecution | undefined): boolean =>
  value !== undefined && value.host.completed && value.review.submission === "submitted" &&
  value.review.findings > 0 && correlatedReaction(value.review.modelReaction) && validatedFollowUp(value);

const observedDemoBudget = (value: DemoExecution | undefined, observedUsage: ReturnType<typeof readDemoBudgetUsage>) => ({
  calls: value?.review.providerCalls ?? observedUsage?.providerCalls ?? 0,
  sourceBytes: value?.review.sourceBytes ?? observedUsage?.sourceBytes ?? 0,
});

const runSelectedDemo = Effect.fn("FirstReviewDemo.runSelectedDemo")(function* (request: FirstReviewDemoRequest, options: FirstReviewDemoOptions, record: DemoRecord, cleanup: Effect.Effect<void, DemoExecutionError>) {
  const reviewStarted = yield* Clock.currentTimeMillis;
  const reviewMonotonicStarted = yield* monotonicMillis;
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
  const execution = yield* executeSelectedDemo(request, options, record, selectedBudgetPath, budgetReady);
  const observedUsage = readDemoBudgetUsage(selectedBudgetPath);
  const disposableRootRemoved = yield* cleanup.pipe(
    Effect.as(true),
    Effect.catch(() => Effect.succeed(false)),
  );
  const value = execution.value;
  const { calls, sourceBytes } = observedDemoBudget(value, observedUsage);
  const budgetObserved = calls <= DEMO_PROVIDER_CALL_BUDGET && sourceBytes <= DEMO_SOURCE_BYTE_BUDGET &&
    ((yield* monotonicMillis) - reviewMonotonicStarted) <= DEMO_TIME_BUDGET_MS;
  const passed = demoPassed(value) && budgetObserved;
  return {
    version: 1 as const,
    operation: "demo" as const,
    status: passed ? "passed" as const : execution.status === "incomplete" ? "incomplete" as const : "inconclusive" as const,
    liveSelected: true as const,
    paidVerificationPerformed: calls > 0,
    budget: { sourceBytes: DEMO_SOURCE_BYTE_BUDGET, providerCalls: DEMO_PROVIDER_CALL_BUDGET, timeMs: DEMO_TIME_BUDGET_MS, observedWithinBudget: budgetObserved },
    setup: { actions: 0, durationMs: 0 },
    reviewLatencyMs: value?.review.latencyMs,
    evidence: demoEvidence(value, calls, sourceBytes, new Date(yield* Clock.currentTimeMillis).toISOString()),
    cleanup: { disposableRootRemoved },
  };
});

export const runFirstReviewDemo = Effect.fn("FirstReviewDemo.run")(function* (
  request: FirstReviewDemoRequest,
  options: FirstReviewDemoOptions,
) {
  if (request.selection === "preview") return yield* previewSelectedDemo(request, options);
  if (request.demoId === undefined) {
    return { version: 1 as const, operation: "demo" as const, status: "conflict" as const, reason: "demoId is required" };
  }
  const demoId = request.demoId;
  const record = yield* readRecord(options.statePath, demoId);
  if (record === undefined) {
    return { version: 1 as const, operation: "demo" as const, status: "conflict" as const, reason: "demo preview is missing or invalid" };
  }
  if (request.selection === "cancel") return yield* cancelSelectedDemo(options.statePath, record);
  if (request.selectionDigest !== record.selectionDigest) {
    return {
      version: 1 as const, operation: "demo" as const, status: "proposal-mismatch" as const,
      liveSelected: false as const, paidVerificationPerformed: false as const, providerCalls: 0 as const,
      action: "cancel this preview or submit the exact selection digest",
    };
  }
  const claimed = yield* claimOwnedRecord(options.statePath, record).pipe(Effect.result);
  if (claimed._tag === "Failure") {
    return {
      version: 1 as const, operation: "demo" as const, status: "conflict" as const,
      reason: "demo preview was already claimed", liveSelected: false as const,
      paidVerificationPerformed: false as const, providerCalls: 0 as const,
    };
  }
  return yield* runSelectedDemo(request, options, record, claimed.success);
}, Effect.scoped);

export * as FirstReviewDemo from "./first-review-demo.ts";
