import type { DirectObservation, DirectRecipient } from "../direct-event/model.ts";
import type { CodexDirectEventOutput } from "../direct-event/pipeline.ts";

export const MAX_IPC_FRAME_BYTES = 262_144;
export const MAX_IPC_CONNECTIONS = 32;
export const CLIENT_REQUEST_DEADLINE_MS = 1_500;
export const STARTUP_READINESS_DEADLINE_MS = 10_000;

export type ResidentRequest =
  | { readonly version: 1; readonly operation: "hello" }
  | {
      readonly version: 1;
      readonly operation: "admit";
      readonly lifetime: string;
      readonly observation: DirectObservation;
      readonly controlledWriter: true;
    }
  | {
      readonly version: 1;
      readonly operation: "collect";
      readonly lifetime: string;
      readonly root: string;
      readonly recipient: DirectRecipient;
    }
  | {
      readonly version: 1;
      readonly operation: "acknowledge";
      readonly lifetime: string;
      readonly token: string;
    }
  | { readonly version: 1; readonly operation: "stats"; readonly lifetime: string }
  | { readonly version: 1; readonly operation: "shutdown"; readonly lifetime: string };

export type ResidentResponse =
  | { readonly status: "ready"; readonly lifetime: string; readonly pid: number }
  | { readonly status: "accepted" | "rejected-capacity" | "obsolete-lifetime" | "empty" | "acknowledged" | "unsupported" }
  | { readonly status: "advice"; readonly token: string; readonly output: CodexDirectEventOutput }
  | {
      readonly status: "stats";
      readonly queued: number;
      readonly running: number;
      readonly pendingAdvice: number;
      readonly retainedBytes: number;
    };

const record = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;

const string = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 16_384;

const recipient = (value: unknown): value is DirectRecipient => {
  const item = record(value);
  return item?.host === "codex-cli" && item.hostVersion === "0.155.1" &&
    string(item.sessionId) && string(item.turnId) && string(item.toolUseId) &&
    (item.agentId === null || string(item.agentId));
};
const observation = (value: unknown): value is DirectObservation => {
  const item = record(value);
  const identity = record(item?.rootIdentity);
  if (!string(item?.root) || !recipient(item?.recipient) || !Array.isArray(item?.candidates)) return false;
  if (
    !string(identity?.rootDevice) || !string(identity.rootInode) ||
    !string(identity.gitDirectory) || !string(identity.gitDevice) || !string(identity.gitInode)
  ) return false;
  return item.candidates.length > 0 && item.candidates.length <= 16 && item.candidates.every((candidate) => {
    const entry = record(candidate);
    return entry?.operation === "add" && string(entry.path);
  });
};

/** Decode only after the transport has enforced MAX_IPC_FRAME_BYTES. */
export const decodeResidentRequest = (encoded: string): ResidentRequest | undefined => {
  let unknown: unknown;
  try {
    unknown = JSON.parse(encoded);
  } catch {
    return undefined;
  }
  const value = record(unknown);
  if (value?.version !== 1 || typeof value.operation !== "string") return undefined;
  if (value.operation === "hello") return { version: 1, operation: "hello" };
  if (!string(value.lifetime)) return undefined;
  if (value.operation === "admit" && value.controlledWriter === true && observation(value.observation)) {
    return { version: 1, operation: "admit", lifetime: value.lifetime, observation: value.observation, controlledWriter: true };
  }
  if (value.operation === "collect" && string(value.root) && recipient(value.recipient)) {
    return { version: 1, operation: "collect", lifetime: value.lifetime, root: value.root, recipient: value.recipient };
  }
  if (value.operation === "acknowledge" && string(value.token)) {
    return { version: 1, operation: "acknowledge", lifetime: value.lifetime, token: value.token };
  }
  if (value.operation === "stats" || value.operation === "shutdown") {
    return { version: 1, operation: value.operation, lifetime: value.lifetime };
  }
  return undefined;
};
