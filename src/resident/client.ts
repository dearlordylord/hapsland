import { effectiveSessionAnalytics } from "../configuration/resolve.ts";
import type { RoundCloseReason } from "../activity/status.ts";
import { spawn } from "node:child_process";
import * as Effect from "effect/Effect";
import { Config, Context, Layer, Option, Redacted, Ref, Schema } from "effect";
import { connect } from "node:net";
import { resolve } from "node:path";
import { closeSync, existsSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { DirectObservation, DirectAdvicee } from "../direct-event/model.ts";
import type { CodexDirectEventOutput } from "../direct-event/pipeline.ts";
import { loadReviewSettings, type ReviewConfigError } from "../runtime/review-config.ts";
import type { ControlledDecisionModelOptions } from "../test-support/controlled-decision-model.ts";
import { DEFAULT_CREDENTIAL_STATE_PATH, readCredentialState } from "../credentials/secret-service.ts";
import type { ClaudeHostOutput, CollectionMode } from "./collection.ts";
import {
  prepareResidentDirectory,
  resolveResidentPaths,
  verifyResidentSocket,
  type ResidentPaths,
  type ResidentEndpointError,
} from "./paths.ts";
import {
  CLIENT_REQUEST_DEADLINE_MS,
  EDIT_REQUEST_DEADLINE_MS,
  MAX_IPC_FRAME_BYTES,
  STARTUP_READINESS_DEADLINE_MS,
  decodeCurrentResidentResponse,
  encodeCurrentResidentRequest,
  type ResidentDispatchContext,
  type ResidentRequest,
  type ResidentResponse,
} from "./protocol.ts";

export class ResidentIpcError extends Schema.TaggedError<ResidentIpcError>()("ResidentIpcError", { message: Schema.String }) {}

const requestConnected = Effect.fn("ResidentClient.requestConnected")(function* (
  paths: ResidentPaths, request: ResidentRequest, timeoutMs: number,
) {
  const frame = `${encodeCurrentResidentRequest(request)}\n`;
  if (Buffer.byteLength(frame, "utf8") > MAX_IPC_FRAME_BYTES) {
    return yield* Effect.fail(new ResidentIpcError({ message: "resident request exceeded frame bound" }));
  }
  return yield* Effect.acquireUseRelease(
    Effect.try({ try: () => connect(paths.socket), catch: () => new ResidentIpcError({ message: "resident IPC unavailable" }) }),
    (socket) => Effect.callback<ResidentResponse, ResidentIpcError>((resume) => {
      let settled = false;
      let bytes = 0;
      let encoded = "";
      const finish = (result: Effect.Effect<ResidentResponse, ResidentIpcError>) => {
        if (settled) return;
        settled = true;
        resume(result);
      };
      socket.once("connect", () => socket.write(frame));
      socket.on("data", (chunk: Buffer) => {
        bytes += chunk.byteLength;
        if (bytes > MAX_IPC_FRAME_BYTES) {
          finish(Effect.fail(new ResidentIpcError({ message: "resident response exceeded frame bound" })));
          return;
        }
        encoded += chunk.toString("utf8");
        const newline = encoded.indexOf("\n");
        if (newline < 0) return;
        try {
          const unknown: unknown = JSON.parse(encoded.slice(0, newline));
          const decoded = decodeCurrentResidentResponse(unknown, request);
          if (decoded === undefined) throw new Error("response schema mismatch");
          finish(Effect.succeed(decoded));
        } catch {
          finish(Effect.fail(new ResidentIpcError({ message: "resident response was invalid" })));
        }
      });
      socket.once("error", () => finish(Effect.fail(new ResidentIpcError({ message: "resident IPC unavailable" }))));
      socket.once("close", () => finish(Effect.fail(new ResidentIpcError({ message: "resident response closed before acknowledgement" }))));
      return Effect.sync(() => { settled = true; });
    }).pipe(Effect.timeoutOrElse({
      duration: timeoutMs,
      orElse: () => Effect.fail(new ResidentIpcError({ message: "resident request deadline exceeded; outcome is uncertain" })),
    })),
    (socket) => Effect.sync(() => { socket.destroy(); }),
  );
});

export const residentRequestEffect = Effect.fn("ResidentClient.request")(function* (
  paths: ResidentPaths, request: ResidentRequest, timeoutMs = CLIENT_REQUEST_DEADLINE_MS,
) {
  const deadline = performance.now() + timeoutMs;
  yield* verifyResidentSocket(paths).pipe(Effect.timeoutOrElse({
    duration: timeoutMs,
    orElse: () => Effect.fail(new ResidentIpcError({ message: "resident endpoint verification timed out" })),
  }));
  const remaining = deadline - performance.now();
  if (remaining <= 0) return yield* Effect.fail(new ResidentIpcError({ message: "resident request deadline exceeded" }));
  return yield* requestConnected(paths, request, remaining);
});

export interface ResidentStartupOperations {
  readonly now: () => number;
  readonly prepare: (paths: ResidentPaths, timeoutMs: number) => Effect.Effect<void, ResidentEndpointError>;
  readonly probe: (paths: ResidentPaths, timeoutMs: number) => Effect.Effect<ResidentResponse, ResidentIpcError | ResidentEndpointError>;
  readonly launch: (paths: ResidentPaths, timeoutMs: number) => Effect.Effect<void, ResidentIpcError>;
  readonly wait: (milliseconds: number) => Effect.Effect<void>;
  readonly clearDiagnostic: (paths: ResidentPaths) => Effect.Effect<void, ResidentIpcError>;
  readonly diagnostic: (paths: ResidentPaths) => Effect.Effect<string>;
}
export class ResidentStartup extends Context.Service<ResidentStartup, ResidentStartupOperations>()("hapsland/ResidentStartup") {}

export class ResidentLauncher extends Context.Service<ResidentLauncher, {
  readonly now: () => number;
  readonly spawn: (paths: ResidentPaths) => Effect.Effect<void, ResidentIpcError>;
}>()("hapsland/ResidentLauncher") {}

const residentLauncherLayer = Layer.succeed(ResidentLauncher, ResidentLauncher.of({
  now: () => performance.now(),
  spawn: Effect.fn("ResidentLauncher.spawn")(function* (paths: ResidentPaths) {
    const compiled = fileURLToPath(new URL("./main.js", import.meta.url));
    const source = fileURLToPath(new URL("./main.ts", import.meta.url));
    const main = import.meta.url.endsWith(".js") && existsSync(compiled) ? compiled : source;
    const diagnostic = `${paths.lock}.startup-error`;
    return yield* Effect.acquireUseRelease(
      Effect.try({ try: () => openSync(diagnostic, "a", 0o600), catch: () => new ResidentIpcError({ message: "resident launch failed" }) }),
      (descriptor) => Effect.callback<void, ResidentIpcError>((resume) => {
        let child: ReturnType<typeof spawn>;
        try {
          child = spawn(process.execPath, [main, paths.directory], {
            detached: true, stdio: ["ignore", "ignore", descriptor], env: process.env,
          });
        } catch { resume(Effect.fail(new ResidentIpcError({ message: "resident launch failed" }))); return; }
        const started = () => { child.unref(); resume(Effect.void); };
        const failed = (cause: Error) => {
          try { writeFileSync(diagnostic, `${String(cause)}\n`, { flag: "a", mode: 0o600 }); } catch { /* launch failure remains visible */ }
          resume(Effect.fail(new ResidentIpcError({ message: "resident launch failed" })));
        };
        child.once("spawn", started);
        child.once("error", failed);
        return Effect.sync(() => { child.removeListener("spawn", started); child.removeListener("error", failed); });
      }),
      (descriptor) => Effect.sync(() => closeSync(descriptor)),
    );
  }, Effect.uninterruptible),
}));

export const makeResidentStartup = Effect.gen(function* () {
  const launcher = yield* ResidentLauncher;
  const launches = yield* Ref.make<ReadonlyMap<string, { readonly expiry: number }>>(new Map());
  const launch = Effect.fn("ResidentStartup.launch")(function* (paths: ResidentPaths, _timeoutMs: number) {
    const now = launcher.now();
    const claim = yield* Ref.modify(launches, (current) => {
      const next = new Map([...current].filter(([, value]) => value.expiry > now));
      if (next.has(paths.lock)) return [undefined, next] as const;
      const claim = Object.freeze({ expiry: now + 2_000 });
      next.set(paths.lock, claim);
      return [claim, next] as const;
    });
    if (claim === undefined) return;
    yield* launcher.spawn(paths).pipe(Effect.onError(() => Ref.update(launches, (current) => {
      if (current.get(paths.lock) !== claim) return current;
      const next = new Map(current); next.delete(paths.lock); return next;
    })));
  }, Effect.uninterruptible);
  return ResidentStartup.of({
    now: launcher.now,
    prepare: Effect.fn("ResidentStartup.prepare")((paths: ResidentPaths) => prepareResidentDirectory(paths)),
    probe: Effect.fn("ResidentStartup.probe")((paths: ResidentPaths, timeoutMs: number) => residentRequestEffect(paths, { requestRoute: "shared", operation: "hello" }, timeoutMs)),
    launch,
    wait: Effect.fn("ResidentStartup.wait")((milliseconds: number) => Effect.sleep(milliseconds)),
    clearDiagnostic: Effect.fn("ResidentStartup.clearDiagnostic")((paths: ResidentPaths) => Effect.try({
      try: () => rmSync(`${paths.lock}.startup-error`, { force: true }), catch: () => new ResidentIpcError({ message: "resident startup diagnostic cleanup failed" }),
    })),
    diagnostic: Effect.fn("ResidentStartup.diagnostic")((paths: ResidentPaths) => Effect.sync(() => {
      try { return readFileSync(`${paths.lock}.startup-error`, "utf8").trim().slice(-1_024); } catch { return ""; }
    })),
  });
}).pipe(Effect.withSpan("ResidentStartup.make"));

export const residentStartupLayer = Layer.effect(ResidentStartup, makeResidentStartup).pipe(Layer.provide(residentLauncherLayer));

export const ensureResidentEffect = Effect.fn("ResidentClient.ensureResident")(function* (
  paths: ResidentPaths | undefined = undefined,
  readinessMs = STARTUP_READINESS_DEADLINE_MS,
) {
  paths ??= yield* resolveResidentPaths();
  const dependencies = yield* ResidentStartup;
  const ready = (response: Extract<ResidentResponse, { status: "ready" }>) =>
    dependencies.clearDiagnostic(paths).pipe(Effect.as(response));
  const deadline = dependencies.now() + readinessMs;
  const remaining = () => Math.max(0, deadline - dependencies.now());
  yield* dependencies.prepare(paths, remaining()).pipe(Effect.timeoutOrElse({
    duration: remaining(),
    orElse: () => Effect.fail(new ResidentIpcError({ message: "resident endpoint preparation timed out" })),
  }));
  if (remaining() <= 0) return yield* Effect.fail(new ResidentIpcError({ message: "resident readiness deadline exceeded" }));
  const probe = (timeoutMs: number) => dependencies.probe(paths, timeoutMs).pipe(Effect.catch(() => Effect.succeed(undefined)));
  // Failed probes do not determine death; atomic owner acquisition protects
  // contending servers and stale recovery checks process liveness.
  const existing = yield* probe(Math.min(250, remaining()));
  if (existing?.status === "ready") return yield* ready(existing);
  let lastLaunch = Number.NEGATIVE_INFINITY;
  while (remaining() > 0) {
    if (dependencies.now() - lastLaunch >= 500) {
      yield* dependencies.launch(paths, remaining());
      lastLaunch = dependencies.now();
    }
    if (remaining() <= 0) break;
    const response = yield* probe(Math.min(250, remaining()));
    if (response?.status === "ready") return yield* ready(response);
    const backoff = Math.min(50, remaining());
    if (backoff > 0) yield* dependencies.wait(backoff);
  }
  const diagnostic = yield* dependencies.diagnostic(paths);
  const detail = diagnostic.length > 0 ? `; resident launch failed: ${diagnostic}` : "";
  return yield* Effect.fail(new ResidentIpcError({ message: `resident did not become ready within 10 seconds${detail}` }));
});

/** Read-only bounded probe. Unlike ensureResident, this never launches or repairs a resident. */
export const inspectResidentEffect = Effect.fn("ResidentClient.inspectResident")(function* (
  paths: ResidentPaths | undefined = undefined,
): Effect.fn.Return<{ readonly available: boolean; readonly lifetime?: string; readonly pid?: number }, ResidentIpcError | ResidentEndpointError> {
  paths ??= yield* resolveResidentPaths();
  const response = yield* residentRequestEffect(
    paths,
    { requestRoute: "shared", operation: "hello" },
    Math.min(250, CLIENT_REQUEST_DEADLINE_MS),
  ).pipe(Effect.catch(() => Effect.succeed(undefined)));
  return response?.status === "ready"
    ? { available: true, lifetime: response.lifetime, pid: response.pid }
    : { available: false };
});

export const makeResidentDispatchContextEffect = Effect.fn("ResidentClient.makeResidentDispatchContext")(function* (
  root: string,
  statePath: string,
  activityPath: string,
  userConfigPath: string | undefined,
  controlledOptions: ControlledDecisionModelOptions | undefined,
): Effect.fn.Return<ResidentDispatchContext, ResidentIpcError | ReviewConfigError> {
  const settings = yield* loadReviewSettings(
    root,
    userConfigPath === undefined ? {} : { userConfigPath },
  );
  const controlled = controlledOptions === undefined ? null : {
    ...(controlledOptions.answers === undefined ? {} : { answers: controlledOptions.answers }),
    ...(controlledOptions.delayMs === undefined ? {} : { delayMs: controlledOptions.delayMs }),
    ...(controlledOptions.failure === undefined ? {} : { failure: controlledOptions.failure }),
    ...(controlledOptions.failureOnSourceIncludes === undefined ? {} : {
      failureOnSourceIncludes: controlledOptions.failureOnSourceIncludes,
    }),
    ...(controlledOptions.findingOnSourceIncludes === undefined ? {} : {
      findingOnSourceIncludes: controlledOptions.findingOnSourceIncludes,
    }),
    ...(controlledOptions.capturePath === undefined ? {} : { capturePath: controlledOptions.capturePath }),
    ...(controlledOptions.requestSummaryPath === undefined ? {} : { requestSummaryPath: controlledOptions.requestSummaryPath }),
    ...(controlledOptions.outcomePath === undefined ? {} : { outcomePath: controlledOptions.outcomePath }),
    ...(controlledOptions.requireCredential === undefined ? {} : { requireCredential: controlledOptions.requireCredential }),
    ...(controlledOptions.syntheticR6BrandedRepair === undefined ? {} : {
      syntheticR6BrandedRepair: controlledOptions.syntheticR6BrandedRepair,
    }),
  };
  const configuration = yield* Config.all({
    credential: Config.option(Config.Redacted(settings.credentialEnvVar)),
    credentialStatePath: Config.String("REVIEW_CREDENTIAL_STATE_PATH").pipe(Config.withDefault(DEFAULT_CREDENTIAL_STATE_PATH)),
    demoBudgetPath: Config.option(Config.String("REVIEW_DEMO_BUDGET_PATH")),
  }).pipe(Effect.mapError(() => new ResidentIpcError({ message: "resident dispatch configuration unavailable" })));
  const credentialStatePath = resolve(configuration.credentialStatePath);
  const credentialState = yield* Effect.try({
    try: () => readCredentialState(credentialStatePath),
    catch: () => new ResidentIpcError({ message: "resident credential metadata unavailable" }),
  });
  const environmentOnly = settings.configuration.policy.credentialEnvVar.origin.layer !== "built-in";
  return {
    statePath: resolve(statePath),
    activityPath: resolve(activityPath),
    sessionAnalytics: effectiveSessionAnalytics(settings.configuration.policy),
    userConfigPath: userConfigPath === undefined ? null : resolve(userConfigPath),
    demoBudgetPath: Option.isNone(configuration.demoBudgetPath)
      ? null
      : resolve(configuration.demoBudgetPath.value),
    credential: controlled !== null && controlled.requireCredential !== true ? null : {
      name: settings.credentialEnvVar,
      environmentValue: Option.isNone(configuration.credential) ? null : Redacted.value(configuration.credential.value),
      environmentOnly,
      generation: credentialState.generation,
      statePath: credentialStatePath,
    },
    controlled,
  };
});

export type CollectedAdvice = {
  readonly output: ClaudeHostOutput;
  readonly token: string;
  readonly lifetime: string;
  readonly paths: ResidentPaths;
  readonly root: string;
  readonly advicee: DirectAdvicee;
  readonly activityPath: string | undefined;
  readonly findingCount: number;
};

export const admitObservationEffect = Effect.fn("ResidentClient.admitObservation")(function* (
  observation: DirectObservation,
  controlledWriter: boolean,
  dispatch: ResidentDispatchContext,
  paths: ResidentPaths | undefined = undefined,
  composed = true,
) {
  paths ??= yield* resolveResidentPaths();
  if (!composed) return { status: "unsupported" } as const;
  const owner = yield* ensureResidentEffect(paths);
  if (!controlledWriter) return { status: "empty" } as const;
  return yield* residentRequestEffect(paths, {
    requestRoute: "shared",
    operation: "admit",
    lifetime: owner.lifetime,
    observation,
    controlledWriter: true,
    composed: true,
    dispatch,
  });
});

export type CollectionOutcome =
  | { readonly status: "advice"; readonly advice: CollectedAdvice }
  | { readonly status: "pending" | "empty" }
  | { readonly status: "unavailable"; readonly reason: "backend" | "credential" | "capacity" | "stale" | "lost" | "expired" };

/** One bounded response attempt, tied to its originating resident lifetime. */
export const admitAndCollectEffect = Effect.fn("ResidentClient.admitAndCollect")(function* (
  observation: DirectObservation,
  dispatch: ResidentDispatchContext,
  deadlineAt: number,
  paths: ResidentPaths | undefined = undefined,
): Effect.fn.Return<CollectionOutcome, ResidentIpcError | ResidentEndpointError, ResidentStartup> {
  if (observation.advicee.host !== "claude-code") return { status: "unavailable", reason: "lost" };
  paths ??= yield* resolveResidentPaths();
  const owner = yield* ensureResidentEffect(paths, Math.min(STARTUP_READINESS_DEADLINE_MS,
    Math.max(1, deadlineAt - performance.now())));
  const timeoutMs = Math.min(EDIT_REQUEST_DEADLINE_MS, deadlineAt - performance.now());
  if (timeoutMs <= 150) return { status: "unavailable", reason: "expired" };
  const response = yield* residentRequestEffect(paths, {
    requestRoute: "edit", operation: "admit-and-collect", lifetime: owner.lifetime,
    observation, controlledWriter: true, composed: true, dispatch,
    waitMs: Math.max(0, Math.floor(timeoutMs - 150)),
  }, timeoutMs).pipe(Effect.catch(() => Effect.succeed(undefined)));
  if (response === undefined || !("requestRoute" in response) || response.requestRoute !== "edit") {
    return { status: "unavailable", reason: "lost" };
  }
  if (response.status === "advice") return { status: "advice", advice: {
    output: response.output, token: response.token, lifetime: owner.lifetime, paths,
    root: observation.root, advicee: observation.advicee, activityPath: dispatch.activityPath,
    findingCount: response.findingCount,
  } };
  if (response.status === "unavailable") return response;
  if (response.status === "pending" || response.status === "empty") return { status: response.status };
  return { status: "unavailable", reason: "lost" };
});

export const collectReadyEffect = Effect.fn("ResidentClient.collectReady")(function* (
  root: string,
  advicee: DirectAdvicee,
  dispatch: ResidentDispatchContext,
  paths: ResidentPaths | undefined = undefined,
  mode: CollectionMode = "ordinary",
): Effect.fn.Return<(CollectedAdvice & { readonly output: CodexDirectEventOutput }) | undefined, ResidentIpcError | ResidentEndpointError, ResidentStartup> {
  paths ??= yield* resolveResidentPaths();
  const owner = yield* ensureResidentEffect(paths);
  const response = yield* residentRequestEffect(paths, {
    requestRoute: "shared",
    operation: "collect",
    lifetime: owner.lifetime,
    root,
    advicee,
    dispatch,
    mode,
    composed: true,
  });
  return response.status === "advice" && !("requestRoute" in response)
    ? {
        output: response.output,
        token: response.token,
        lifetime: owner.lifetime,
        paths,
        root,
        advicee,
        activityPath: dispatch.activityPath,
        findingCount: response.findingCount,
      }
    : undefined;
});

export type AdviceeCollectionOutcome =
  | { readonly status: "advice"; readonly advice: CollectedAdvice & { readonly output: CodexDirectEventOutput } }
  | { readonly status: "pending" | "empty" };

/** Shared background/Stop collection probe for any supported host advicee. */
export const collectAdviceeOutcomeEffect = Effect.fn("ResidentClient.collectAdviceeOutcome")(function* (
  root: string,
  advicee: DirectAdvicee,
  dispatch: ResidentDispatchContext,
  paths: ResidentPaths | undefined = undefined,
  mode: CollectionMode = "ordinary",
  deadlineAt = Number.POSITIVE_INFINITY,
  finish?: { readonly token: string; readonly deadlineReached: boolean },
): Effect.fn.Return<AdviceeCollectionOutcome, ResidentIpcError | ResidentEndpointError> {
  paths ??= yield* resolveResidentPaths();
  const owner = yield* inspectResidentEffect(paths);
  if (!owner.available || owner.lifetime === undefined) return { status: "empty" };
  const remaining = deadlineAt - performance.now() - 100;
  if (remaining <= 0) return { status: "empty" };
  const response = yield* residentRequestEffect(paths, {
    requestRoute: "shared",
    operation: "collect",
    lifetime: owner.lifetime,
    root,
    advicee,
    dispatch,
    mode,
    reportWorkState: true,
    composed: true,
    ...(finish === undefined ? {} : { finish }),
  }, Math.min(CLIENT_REQUEST_DEADLINE_MS, remaining));
  if (response.status === "advice" && !("requestRoute" in response)) {
    return { status: "advice", advice: {
      output: response.output,
      token: response.token,
      lifetime: owner.lifetime,
      paths,
      root,
      advicee,
      activityPath: dispatch.activityPath,
      findingCount: response.findingCount,
    } };
  }
  return { status: response.status === "pending" ? "pending" : "empty" };
});

export const markComposedUserPromptEffect = Effect.fn("ResidentClient.markComposedUserPrompt")(function* (
  root: string,
  advicee: DirectAdvicee,
  marker: string,
  paths: ResidentPaths | undefined = undefined,
  promptDigest?: string,
  onlyIfMissing?: true,
): Effect.fn.Return<boolean, ResidentIpcError | ResidentEndpointError, ResidentStartup> {
  paths ??= yield* resolveResidentPaths();
  const owner = yield* ensureResidentEffect(paths, 1_500);
  const response = yield* residentRequestEffect(paths, {
    requestRoute: "shared", operation: "prompt-marker", lifetime: owner.lifetime,
    root, advicee, marker,
    ...(promptDigest === undefined ? {} : { promptDigest }),
    ...(onlyIfMissing === true ? { onlyIfMissing: true as const } : {}),
  });
  return response.status === "advanced";
});

export const claimComposedBackgroundEffect = Effect.fn("ResidentClient.claimComposedBackground")(function* (
  root: string, advicee: DirectAdvicee, token: string,
  paths: ResidentPaths | undefined = undefined,
): Effect.fn.Return<boolean, ResidentIpcError | ResidentEndpointError, ResidentStartup> {
  paths ??= yield* resolveResidentPaths();
  const owner = yield* ensureResidentEffect(paths, 1_500);
  const response = yield* residentRequestEffect(paths, {
    requestRoute: "shared", operation: "claim-background", lifetime: owner.lifetime,
    root, advicee, token,
  });
  return response.status === "background-claimed";
});

export const releaseComposedBackgroundEffect = Effect.fn("ResidentClient.releaseComposedBackground")(function* (
  root: string, advicee: DirectAdvicee, token: string,
  paths: ResidentPaths | undefined = undefined,
): Effect.fn.Return<boolean, ResidentIpcError | ResidentEndpointError> {
  paths ??= yield* resolveResidentPaths();
  const owner = yield* inspectResidentEffect(paths);
  if (!owner.available || owner.lifetime === undefined) return false;
  const response = yield* residentRequestEffect(paths, {
    requestRoute: "shared", operation: "release-background", lifetime: owner.lifetime,
    root, advicee, token,
  });
  return response.status === "released";
});

export const beginComposedSubmissionEffect = Effect.fn("ResidentClient.beginComposedSubmission")(function* (
  advice: CollectedAdvice,
  surface: "edit" | "background" | "stop",
): Effect.fn.Return<boolean, ResidentIpcError | ResidentEndpointError> {
  const response = yield* residentRequestEffect(advice.paths, {
    requestRoute: "shared", operation: "begin-submission", lifetime: advice.lifetime,
    token: advice.token, surface,
  });
  return response.status === "submitting";
});

export const releaseComposedSubmissionEffect = Effect.fn("ResidentClient.releaseComposedSubmission")(function* (advice: CollectedAdvice): Effect.fn.Return<boolean, ResidentIpcError | ResidentEndpointError> {
  const response = yield* residentRequestEffect(advice.paths, {
    requestRoute: "shared", operation: "release", lifetime: advice.lifetime,
    token: advice.token,
  });
  return response.status === "released";
});

export const acknowledgeAdviceEffect = Effect.fn("ResidentClient.acknowledgeAdvice")(function* (advice: CollectedAdvice) {
  const deadline = performance.now() + CLIENT_REQUEST_DEADLINE_MS;
  const acknowledged = yield* residentRequestEffect(advice.paths, {
    requestRoute: "shared", operation: "acknowledge", lifetime: advice.lifetime, token: advice.token,
  }).pipe(Effect.catch(() => Effect.succeed(undefined)));
  if (acknowledged?.status !== "acknowledged") return false;
  const remaining = deadline - performance.now();
  if (remaining <= 0) return false;
  const finalized = yield* residentRequestEffect(advice.paths, {
    requestRoute: "shared", operation: "finalize", lifetime: advice.lifetime, token: advice.token,
  }, remaining).pipe(Effect.catch(() => Effect.succeed(undefined)));
  return finalized?.status === "finalized";
});

export const composedStopBoundaryEffect = Effect.fn("ResidentClient.composedStopBoundary")(function* (
  operation: "begin-stop" | "finish-stop", root: string, advicee: DirectAdvicee,
  token: string, close = false, paths: ResidentPaths | undefined = undefined, reason: RoundCloseReason = "no-advice",
): Effect.fn.Return<boolean, ResidentIpcError | ResidentEndpointError> {
  paths ??= yield* resolveResidentPaths();
  const owner = yield* inspectResidentEffect(paths);
  if (!owner.available || owner.lifetime === undefined) return false;
  const response = yield* residentRequestEffect(paths, { requestRoute: "shared", operation,
    lifetime: owner.lifetime, root, advicee, token, close, reason }, 250);
  return response.status === "advanced";
});

export const registerComposedEditEffect = Effect.fn("ResidentClient.registerComposedEdit")(function* (
  root: string, advicee: DirectAdvicee, startedAt: number, paths: ResidentPaths | undefined = undefined, activityPath?: string,
  userConfigPath?: string,
): Effect.fn.Return<boolean, ResidentIpcError | ResidentEndpointError, ResidentStartup> {
  paths ??= yield* resolveResidentPaths();
  const owner = yield* ensureResidentEffect(paths, 1_500);
  const response = yield* residentRequestEffect(paths, { requestRoute: "shared", operation: "register-edit",
    lifetime: owner.lifetime, root, advicee, startedAt,
    ...(activityPath === undefined ? {} : { activityPath }),
    ...(userConfigPath === undefined ? {} : { userConfigPath }) });
  return response.status === "advanced";
});
