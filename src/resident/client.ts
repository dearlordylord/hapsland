import { spawn } from "node:child_process";
import * as Effect from "effect/Effect";
import { connect } from "node:net";
import { resolve } from "node:path";
import { closeSync, existsSync, lstatSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { DirectObservation, DirectRecipient } from "../direct-event/model.ts";
import type { CodexDirectEventOutput } from "../direct-event/pipeline.ts";
import { loadReviewSettings } from "../runtime/review-config.ts";
import type { ControlledDecisionModelOptions } from "../test-support/controlled-decision-model.ts";
import { DEFAULT_CREDENTIAL_STATE_PATH, readCredentialState } from "../credentials/secret-service.ts";
import type { CollectionMode } from "./collection.ts";
import {
  prepareResidentDirectory,
  residentPaths,
  verifyResidentSocket,
  type ResidentPaths,
} from "./paths.ts";
import {
  CLIENT_REQUEST_DEADLINE_MS,
  MAX_IPC_FRAME_BYTES,
  STARTUP_READINESS_DEADLINE_MS,
  decodeResidentResponse,
  type ResidentDispatchContext,
  type ResidentRequest,
  type ResidentResponse,
} from "./protocol.ts";

export class ResidentIpcError extends Error {}

const delay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const requestConnected = (
  paths: ResidentPaths,
  request: ResidentRequest,
  timeoutMs: number,
): Promise<ResidentResponse> => {
  const frame = `${JSON.stringify(request)}\n`;
  if (Buffer.byteLength(frame, "utf8") > MAX_IPC_FRAME_BYTES) {
    return Promise.reject(new ResidentIpcError("resident request exceeded frame bound"));
  }
  return new Promise((resolve, reject) => {
    const socket = connect(paths.socket);
    let settled = false;
    let bytes = 0;
    let encoded = "";
    const finish = (error: Error | undefined, response?: ResidentResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error !== undefined) reject(error);
      else if (response !== undefined) resolve(response);
    };
    const timer = setTimeout(
      () => finish(new ResidentIpcError("resident request deadline exceeded; outcome is uncertain")),
      timeoutMs,
    );
    socket.once("connect", () => socket.write(frame));
    socket.on("data", (chunk: Buffer) => {
      bytes += chunk.byteLength;
      if (bytes > MAX_IPC_FRAME_BYTES) {
        finish(new ResidentIpcError("resident response exceeded frame bound"));
        return;
      }
      encoded += chunk.toString("utf8");
      const newline = encoded.indexOf("\n");
      if (newline < 0) return;
      try {
        const unknown: unknown = JSON.parse(encoded.slice(0, newline));
        const decoded = decodeResidentResponse(unknown);
        if (decoded === undefined) throw new Error("response schema mismatch");
        finish(undefined, decoded);
      } catch {
        finish(new ResidentIpcError("resident response was invalid"));
      }
    });
    socket.once("error", () => finish(new ResidentIpcError("resident IPC unavailable")));
    socket.once("close", () => finish(new ResidentIpcError("resident response closed before acknowledgement")));
  });
};

export const residentRequest = async (
  paths: ResidentPaths,
  request: ResidentRequest,
  timeoutMs = CLIENT_REQUEST_DEADLINE_MS,
): Promise<ResidentResponse> => {
  const deadline = performance.now() + timeoutMs;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new ResidentIpcError("resident endpoint verification timed out")),
      timeoutMs,
    );
    void verifyResidentSocket(paths).then(
      () => { clearTimeout(timer); resolve(); },
      (cause: unknown) => { clearTimeout(timer); reject(cause); },
    );
  });
  const remaining = deadline - performance.now();
  if (remaining <= 0) throw new ResidentIpcError("resident request deadline exceeded");
  return requestConnected(paths, request, remaining);
};

export type EnsureResidentDependencies = {
  readonly now: () => number;
  readonly prepare: (paths: ResidentPaths, timeoutMs: number) => Promise<void>;
  readonly probe: (paths: ResidentPaths, timeoutMs: number) => Promise<ResidentResponse>;
  readonly launch: (paths: ResidentPaths, timeoutMs: number) => void;
  readonly wait: (milliseconds: number) => Promise<void>;
};

const within = async <A>(effect: Promise<A>, timeoutMs: number, message: string): Promise<A> =>
  new Promise<A>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ResidentIpcError(message)), timeoutMs);
    void effect.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (cause: unknown) => { clearTimeout(timer); reject(cause); },
    );
  });

const launches = new Map<string, number>();
const launchResident = (paths: ResidentPaths, _timeoutMs: number) => {
  // Pre-portability versions used this file as a launch gate. It carries no
  // ownership authority and is safe to discard inside the private runtime.
  rmSync(`${paths.lock}.startup`, { force: true });
  const now = Date.now();
  if ((launches.get(paths.lock) ?? 0) > now) return;
  const expires = now + 2_000;
  launches.set(paths.lock, expires);
  const expiry = setTimeout(() => {
    if (launches.get(paths.lock) === expires) launches.delete(paths.lock);
  }, 2_000);
  expiry.unref();
  const compiled = fileURLToPath(new URL("./main.js", import.meta.url));
  const source = fileURLToPath(new URL("./main.ts", import.meta.url));
  const main = import.meta.url.endsWith(".js") && existsSync(compiled) ? compiled : source;
  const diagnostic = `${paths.lock}.startup-error`;
  const diagnosticDescriptor = openSync(diagnostic, "a", 0o600);
  const legacy = process.platform === "linux" && (() => {
    try { return lstatSync(paths.lock).isFile(); } catch { return false; }
  })();
  const command = legacy ? "flock" : process.execPath;
  const args = legacy
    ? ["--nonblock", paths.lock, process.execPath, main, paths.directory, "--legacy-flock"]
    : [main, paths.directory];
  const child = spawn(command, args, {
    detached: true,
    stdio: ["ignore", "ignore", diagnosticDescriptor],
    env: process.env,
  });
  closeSync(diagnosticDescriptor);
  child.once("error", (cause) => {
    writeFileSync(diagnostic, `${String(cause)}\n`, { flag: "a", mode: 0o600 });
    launches.delete(paths.lock);
  });
  child.unref();
};

const liveEnsureDependencies: EnsureResidentDependencies = {
  now: () => performance.now(),
  prepare: (paths, timeoutMs) => within(
    prepareResidentDirectory(paths),
    timeoutMs,
    "resident endpoint preparation timed out",
  ),
  probe: (paths, timeoutMs) => residentRequest(paths, { version: 1, operation: "hello" }, timeoutMs),
  launch: launchResident,
  wait: delay,
};

export const ensureResident = async (
  paths = residentPaths(),
  readinessMs = STARTUP_READINESS_DEADLINE_MS,
  dependencies: EnsureResidentDependencies = liveEnsureDependencies,
): Promise<Extract<ResidentResponse, { status: "ready" }>> => {
  const ready = (response: Extract<ResidentResponse, { status: "ready" }>) => {
    rmSync(`${paths.lock}.startup-error`, { force: true });
    return response;
  };
  const deadline = dependencies.now() + readinessMs;
  const remaining = () => Math.max(0, deadline - dependencies.now());
  await dependencies.prepare(paths, remaining());
  if (remaining() <= 0) throw new ResidentIpcError("resident readiness deadline exceeded");
  try {
    const existing = await dependencies.probe(paths, Math.min(250, remaining()));
    if (existing.status === "ready") return ready(existing);
  } catch {
    // A failed probe is not a death determination. Contending servers use the
    // atomic owner directory; only its live owner may replace the socket.
  }
  let lastLaunch = Number.NEGATIVE_INFINITY;
  while (remaining() > 0) {
    if (dependencies.now() - lastLaunch >= 500) {
      dependencies.launch(paths, remaining());
      lastLaunch = dependencies.now();
    }
    if (remaining() <= 0) break;
    try {
      const response = await dependencies.probe(paths, Math.min(250, remaining()));
      if (response.status === "ready") return ready(response);
    } catch {
      // Another contender may still own the lock, or its owner may have exited
      // without publishing an endpoint. Acquisition is non-blocking and stale
      // recovery checks process liveness, so retries cannot displace an owner.
    }
    const backoff = Math.min(50, remaining());
    if (backoff > 0) await dependencies.wait(backoff);
  }
  let detail = "";
  try {
    const diagnostic = readFileSync(`${paths.lock}.startup-error`, "utf8").trim();
    if (diagnostic.length > 0) detail = `; resident launch failed: ${diagnostic.slice(-1_024)}`;
  } catch { /* no launcher diagnostic was produced */ }
  throw new ResidentIpcError(`resident did not become ready within 10 seconds${detail}`);
};

export const makeResidentDispatchContext = async (
  root: string,
  statePath: string,
  userConfigPath: string | undefined,
  controlledOptions: ControlledDecisionModelOptions | undefined,
): Promise<ResidentDispatchContext> => {
  const settings = await Effect.runPromise(loadReviewSettings(
    root,
    userConfigPath === undefined ? {} : { userConfigPath },
  ));
  const controlled = controlledOptions === undefined ? null : {
    ...(controlledOptions.answers === undefined ? {} : { answers: controlledOptions.answers }),
    ...(controlledOptions.delayMs === undefined ? {} : { delayMs: controlledOptions.delayMs }),
    ...(controlledOptions.failure === undefined ? {} : { failure: controlledOptions.failure }),
    ...(controlledOptions.capturePath === undefined ? {} : { capturePath: controlledOptions.capturePath }),
    ...(controlledOptions.outcomePath === undefined ? {} : { outcomePath: controlledOptions.outcomePath }),
  };
  const credentialValue = process.env[settings.credentialEnvVar];
  const credentialStatePath = resolve(process.env.REVIEW_CREDENTIAL_STATE_PATH ?? DEFAULT_CREDENTIAL_STATE_PATH);
  const credentialState = readCredentialState(credentialStatePath);
  const environmentOnly = settings.configuration.policy.credentialEnvVar.origin.layer !== "built-in";
  return {
    statePath: resolve(statePath),
    userConfigPath: userConfigPath === undefined ? null : resolve(userConfigPath),
    credential: controlled !== null ? null : {
      name: settings.credentialEnvVar,
      environmentValue: credentialValue === undefined ? null : credentialValue,
      environmentOnly,
      generation: credentialState.generation,
      statePath: credentialStatePath,
    },
    controlled,
  };
};

export type CollectedAdvice = {
  readonly output: CodexDirectEventOutput;
  readonly token: string;
  readonly lifetime: string;
  readonly paths: ResidentPaths;
};

export const admitObservation = async (
  observation: DirectObservation,
  controlledWriter: boolean,
  dispatch: ResidentDispatchContext,
  paths = residentPaths(),
) => {
  const owner = await ensureResident(paths);
  if (!controlledWriter) return { status: "empty" } as const;
  return residentRequest(paths, {
    version: 1,
    operation: "admit",
    lifetime: owner.lifetime,
    observation,
    controlledWriter: true,
    dispatch,
  });
};

export const collectReady = async (
  root: string,
  recipient: DirectRecipient,
  dispatch: ResidentDispatchContext,
  paths = residentPaths(),
  mode: CollectionMode = "ordinary",
): Promise<CollectedAdvice | undefined> => {
  const owner = await ensureResident(paths);
  const response = await residentRequest(paths, {
    version: 1,
    operation: "collect",
    lifetime: owner.lifetime,
    root,
    recipient,
    dispatch,
    mode,
  });
  return response.status === "advice"
    ? { output: response.output, token: response.token, lifetime: owner.lifetime, paths }
    : undefined;
};

export const acknowledgeAdvice = async (advice: CollectedAdvice): Promise<boolean> => {
  const deadline = performance.now() + CLIENT_REQUEST_DEADLINE_MS;
  const acknowledged = await residentRequest(advice.paths, {
    version: 1,
    operation: "acknowledge",
    lifetime: advice.lifetime,
    token: advice.token,
  }).catch(() => undefined);
  if (acknowledged?.status !== "acknowledged") return false;
  const remaining = deadline - performance.now();
  if (remaining <= 0) return false;
  const finalized = await residentRequest(advice.paths, {
    version: 1,
    operation: "finalize",
    lifetime: advice.lifetime,
    token: advice.token,
  }, remaining).catch(() => undefined);
  return finalized?.status === "finalized";
};
