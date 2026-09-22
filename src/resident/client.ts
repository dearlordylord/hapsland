import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { connect } from "node:net";
import { fileURLToPath } from "node:url";
import type { DirectObservation, DirectRecipient } from "../direct-event/model.ts";
import type { CodexDirectEventOutput } from "../direct-event/pipeline.ts";
import { residentPaths, type ResidentPaths } from "./paths.ts";
import {
  CLIENT_REQUEST_DEADLINE_MS,
  MAX_IPC_FRAME_BYTES,
  STARTUP_READINESS_DEADLINE_MS,
  type ResidentRequest,
  type ResidentResponse,
} from "./protocol.ts";

export class ResidentIpcError extends Error {}

const delay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export const residentRequest = (
  paths: ResidentPaths,
  request: ResidentRequest,
  timeoutMs = CLIENT_REQUEST_DEADLINE_MS,
): Promise<ResidentResponse> => new Promise((resolve, reject) => {
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
  socket.once("connect", () => socket.write(`${JSON.stringify(request)}\n`));
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
      finish(undefined, JSON.parse(encoded.slice(0, newline)) as ResidentResponse);
    } catch {
      finish(new ResidentIpcError("resident response was invalid"));
    }
  });
  socket.once("error", () => finish(new ResidentIpcError("resident IPC unavailable")));
  socket.once("close", () => finish(new ResidentIpcError("resident response closed before acknowledgement")));
});

export const ensureResident = async (
  paths = residentPaths(),
  readinessMs = STARTUP_READINESS_DEADLINE_MS,
): Promise<Extract<ResidentResponse, { status: "ready" }>> => {
  await mkdir(paths.directory, { recursive: true, mode: 0o700 });
  try {
    const existing = await residentRequest(paths, { version: 1, operation: "hello" }, 250);
    if (existing.status === "ready") return existing;
  } catch {
    // A failed probe is not a death determination. Contending servers use the
    // kernel lock; only its owner may replace the socket pathname.
  }
  const main = fileURLToPath(new URL("./main.ts", import.meta.url));
  const child = spawn("flock", ["--nonblock", paths.lock, process.execPath, main, paths.directory], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      ...(process.argv.includes("--controlled") ? { REVIEW_RESIDENT_CONTROLLED: "1" } : {}),
    },
  });
  child.unref();
  const deadline = Date.now() + readinessMs;
  while (Date.now() < deadline) {
    try {
      const response = await residentRequest(paths, { version: 1, operation: "hello" }, 250);
      if (response.status === "ready") return response;
    } catch {
      // Bounded readiness polling covers the winner's startup only.
    }
    await delay(50);
  }
  throw new ResidentIpcError("resident did not become ready within 10 seconds");
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
  });
};

export const collectReady = async (
  root: string,
  recipient: DirectRecipient,
  paths = residentPaths(),
): Promise<CollectedAdvice | undefined> => {
  const owner = await ensureResident(paths);
  const response = await residentRequest(paths, {
    version: 1,
    operation: "collect",
    lifetime: owner.lifetime,
    root,
    recipient,
  });
  return response.status === "advice"
    ? { output: response.output, token: response.token, lifetime: owner.lifetime, paths }
    : undefined;
};

export const acknowledgeAdvice = (advice: CollectedAdvice) =>
  residentRequest(advice.paths, {
    version: 1,
    operation: "acknowledge",
    lifetime: advice.lifetime,
    token: advice.token,
  }).catch(() => undefined);
