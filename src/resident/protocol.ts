import type { DirectObservation, DirectRecipient } from "../direct-event/model.ts";
import type { CodexDirectEventOutput } from "../direct-event/pipeline.ts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

export const MAX_IPC_FRAME_BYTES = 262_144;
export const MAX_IPC_CONNECTIONS = 32;
export const CLIENT_REQUEST_DEADLINE_MS = 1_500;
export const STARTUP_READINESS_DEADLINE_MS = 10_000;
export const DELIVERY_LEASE_MS = 5_000;

export type ResidentControlledOptions = {
  readonly answers?: Readonly<Record<string, unknown>>;
  readonly delayMs?: number;
  readonly failure?: string;
  readonly capturePath?: string;
};

export type ResidentDispatchContext = {
  readonly statePath: string;
  readonly userConfigPath: string | null;
  readonly credential: { readonly name: string; readonly value: string } | null;
  readonly controlled: ResidentControlledOptions | null;
};

export type ResidentRequest =
  | { readonly version: 1; readonly operation: "hello" }
  | {
      readonly version: 1;
      readonly operation: "admit";
      readonly lifetime: string;
      readonly observation: DirectObservation;
      readonly controlledWriter: true;
      readonly dispatch: ResidentDispatchContext;
    }
  | {
      readonly version: 1;
      readonly operation: "collect";
      readonly lifetime: string;
      readonly root: string;
      readonly recipient: DirectRecipient;
      readonly dispatch: ResidentDispatchContext;
    }
  | {
      readonly version: 1;
      readonly operation: "acknowledge";
      readonly lifetime: string;
      readonly token: string;
    }
  | {
      readonly version: 1;
      readonly operation: "finalize";
      readonly lifetime: string;
      readonly token: string;
    }
  | { readonly version: 1; readonly operation: "stats"; readonly lifetime: string }
  | { readonly version: 1; readonly operation: "shutdown"; readonly lifetime: string };

export type ResidentResponse =
  | { readonly status: "ready"; readonly lifetime: string; readonly pid: number }
  | { readonly status: "accepted" | "rejected-capacity" | "obsolete-lifetime" | "empty" | "acknowledged" | "finalized" | "unsupported" }
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

const controlled = (value: unknown): value is ResidentControlledOptions => {
  const item = record(value);
  if (item === undefined) return false;
  if (item.answers !== undefined && record(item.answers) === undefined) return false;
  if (item.delayMs !== undefined && (typeof item.delayMs !== "number" || !Number.isFinite(item.delayMs) || item.delayMs < 0)) return false;
  if (item.failure !== undefined && typeof item.failure !== "string") return false;
  if (item.capturePath !== undefined && typeof item.capturePath !== "string") return false;
  return true;
};

const dispatch = (value: unknown): value is ResidentDispatchContext => {
  const item = record(value);
  const credential = item?.credential === null ? null : record(item?.credential);
  return item !== undefined && string(item.statePath) && item.statePath.startsWith("/") &&
    (item.userConfigPath === null || (string(item.userConfigPath) && item.userConfigPath.startsWith("/"))) &&
    (credential === null || (
      typeof credential === "object" &&
      typeof credential.name === "string" && /^[A-Z_][A-Z0-9_]*$/.test(credential.name) &&
      typeof credential.value === "string" && Buffer.byteLength(credential.value, "utf8") <= 32_768
    )) &&
    (item.controlled === null || controlled(item.controlled));
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
  if (value.operation === "admit" && value.controlledWriter === true && observation(value.observation) && dispatch(value.dispatch)) {
    return { version: 1, operation: "admit", lifetime: value.lifetime, observation: value.observation, controlledWriter: true, dispatch: value.dispatch };
  }
  if (value.operation === "collect" && string(value.root) && recipient(value.recipient) && dispatch(value.dispatch)) {
    return { version: 1, operation: "collect", lifetime: value.lifetime, root: value.root, recipient: value.recipient, dispatch: value.dispatch };
  }
  if ((value.operation === "acknowledge" || value.operation === "finalize") && string(value.token)) {
    return { version: 1, operation: value.operation, lifetime: value.lifetime, token: value.token };
  }
  if (value.operation === "stats" || value.operation === "shutdown") {
    return { version: 1, operation: value.operation, lifetime: value.lifetime };
  }
  return undefined;
};

const HostOutput = Schema.Struct({
  hookSpecificOutput: Schema.Struct({
    hookEventName: Schema.Literal("PostToolUse"),
    additionalContext: Schema.String.check(Schema.isMaxLength(MAX_IPC_FRAME_BYTES)),
  }),
});

const ResidentResponseSchema = Schema.Union([
  Schema.Struct({ status: Schema.Literal("ready"), lifetime: Schema.NonEmptyString, pid: Schema.Int }),
  Schema.Struct({ status: Schema.Literals([
    "accepted", "rejected-capacity", "obsolete-lifetime", "empty", "acknowledged", "finalized", "unsupported",
  ]) }),
  Schema.Struct({ status: Schema.Literal("advice"), token: Schema.NonEmptyString, output: HostOutput }),
  Schema.Struct({
    status: Schema.Literal("stats"),
    queued: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    running: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    pendingAdvice: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    retainedBytes: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  }),
]);

export const decodeResidentResponse = (value: unknown): ResidentResponse | undefined => {
  const decoded = Schema.decodeUnknownOption(ResidentResponseSchema, { onExcessProperty: "error" })(value);
  return Option.isSome(decoded) ? decoded.value : undefined;
};
