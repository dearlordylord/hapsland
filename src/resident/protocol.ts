import { isCodexHostVersion, type DirectObservation, type DirectAdvicee } from "../direct-event/model.ts";
import type { CodexDirectEventOutput } from "../direct-event/pipeline.ts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import type { ClaudeHostOutput, CollectionMode } from "./collection.ts";

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
  readonly outcomePath?: string;
  readonly requireCredential?: boolean;
  readonly syntheticR6BrandedRepair?: "control" | "finding";
};

export type ResidentDispatchContext = {
  readonly statePath: string;
  readonly activityPath?: string;
  readonly userConfigPath: string | null;
  readonly demoBudgetPath?: string | null;
  readonly credential: {
    readonly name: string;
    readonly environmentValue: string | null;
    readonly environmentOnly: boolean;
    readonly generation: number;
    readonly statePath: string;
  } | null;
  readonly controlled: ResidentControlledOptions | null;
};

export type ResidentCollectionTicket = { readonly nonce: string; readonly lifetime: string };
export type ResidentUnavailableReason = "backend" | "credential" | "capacity" | "stale" | "lost" | "expired";

export type ResidentRequest =
  | {
      readonly version: 2; readonly operation: "admit"; readonly lifetime: string;
      readonly observation: DirectObservation; readonly controlledWriter: true;
      readonly dispatch: ResidentDispatchContext;
    }
  | {
      readonly version: 2; readonly operation: "collect"; readonly lifetime: string;
      readonly ticket: ResidentCollectionTicket; readonly root: string;
      readonly advicee: DirectAdvicee; readonly dispatch: ResidentDispatchContext;
      readonly mode?: CollectionMode;
    }
  | { readonly version: 1; readonly operation: "hello" }
  | { readonly version: 1; readonly operation: "prompt-marker"; readonly lifetime: string;
      readonly root: string; readonly advicee: DirectAdvicee; readonly marker: string;
      readonly promptDigest?: string; readonly onlyIfMissing?: true }
  | { readonly version: 1; readonly operation: "consume-stop"; readonly lifetime: string;
      readonly root: string; readonly advicee: DirectAdvicee; readonly continuationDigest?: string }
  | { readonly version: 1; readonly operation: "claim-background" | "release-background";
      readonly lifetime: string; readonly root: string; readonly advicee: DirectAdvicee;
      readonly token: string }
  | { readonly version: 1; readonly operation: "begin-submission"; readonly lifetime: string;
      readonly token: string; readonly surface: "edit" | "background" | "stop" }
  | { readonly version: 1; readonly operation: "release"; readonly lifetime: string;
      readonly token: string }
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
      readonly advicee: DirectAdvicee;
      readonly dispatch: ResidentDispatchContext;
      readonly mode?: CollectionMode;
      readonly reportWorkState?: true;
      readonly composed?: true;
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
  | { readonly version: 1; readonly operation: "cleanup"; readonly lifetime: string };

export type ResidentResponse =
  | { readonly version: 2; readonly status: "accepted"; readonly ticket: ResidentCollectionTicket }
  | { readonly version: 2; readonly status: "rejected-capacity" | "obsolete-lifetime" | "unsupported" }
  | { readonly version: 2; readonly status: "pending" | "clear" | "delivered" | "no-work" }
  | { readonly version: 2; readonly status: "unavailable"; readonly reason: ResidentUnavailableReason }
  | { readonly version: 2; readonly status: "advice"; readonly token: string;
      readonly findingCount: number; readonly output: ClaudeHostOutput }
  | { readonly status: "ready"; readonly lifetime: string; readonly pid: number }
  | {
      readonly status:
        | "accepted"
        | "rejected-capacity"
        | "obsolete-lifetime"
        | "empty"
        | "pending"
        | "advanced"
        | "continuation-allowed"
        | "continuation-denied"
        | "background-claimed"
        | "submitting"
        | "released"
        | "acknowledged"
        | "finalized"
        | "unsupported"
        | "busy"
        | "cleaned";
    }
  | {
      readonly status: "advice";
      readonly token: string;
      readonly findingCount: number;
      readonly output: CodexDirectEventOutput;
    }
  | {
      readonly status: "stats";
      readonly queued: number;
      readonly running: number;
      readonly pendingAdvice: number;
      readonly pendingFindingBatches: number;
      readonly pendingOperationalNotices: number;
      readonly retainedBytes: number;
      readonly rejectedCapacity: number;
      readonly successfulCacheEntries: number;
      readonly pendingEvaluations: number;
      readonly noticeCooldowns: number;
      readonly currentWork: number;
    };

const record = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;

const string = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 16_384;

const advicee = (value: unknown): value is DirectAdvicee => {
  const item = record(value);
  if (item?.host === "claude-code" || item?.host === "opencode") return item.hostVersion ===
    (item.host === "claude-code" ? "2.1.218" : "1.14.44") &&
    string(item.sessionId) && item.turnId === null && string(item.toolUseId) &&
    (item.agentId === null || (item.host === "claude-code" && string(item.agentId)));
  return item?.host === "codex-cli" && isCodexHostVersion(item.hostVersion) &&
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
  if (item.outcomePath !== undefined && typeof item.outcomePath !== "string") return false;
  if (item.requireCredential !== undefined && typeof item.requireCredential !== "boolean") return false;
  if (item.syntheticR6BrandedRepair !== undefined &&
    item.syntheticR6BrandedRepair !== "control" && item.syntheticR6BrandedRepair !== "finding") return false;
  return true;
};

const dispatch = (value: unknown): value is ResidentDispatchContext => {
  const item = record(value);
  const credential = item?.credential === null ? null : record(item?.credential);
  return item !== undefined && string(item.statePath) && item.statePath.startsWith("/") &&
    (item.activityPath === undefined || (string(item.activityPath) && item.activityPath.startsWith("/"))) &&
    (item.userConfigPath === null || (string(item.userConfigPath) && item.userConfigPath.startsWith("/"))) &&
    (item.demoBudgetPath === undefined || item.demoBudgetPath === null ||
      (string(item.demoBudgetPath) && item.demoBudgetPath.startsWith("/"))) &&
    (credential === null || (
      typeof credential === "object" &&
      typeof credential.name === "string" && /^[A-Z_][A-Z0-9_]*$/.test(credential.name) &&
      (credential.environmentValue === null || (
        typeof credential.environmentValue === "string" &&
        Buffer.byteLength(credential.environmentValue, "utf8") <= 32_768
      )) &&
      typeof credential.environmentOnly === "boolean" &&
      typeof credential.generation === "number" && Number.isSafeInteger(credential.generation) && credential.generation >= 0 &&
      typeof credential.statePath === "string" && credential.statePath.startsWith("/")
    )) &&
    (item.controlled === null || controlled(item.controlled));
};
const observation = (value: unknown): value is DirectObservation => {
  const item = record(value);
  const identity = record(item?.rootIdentity);
  if (!string(item?.root) || !advicee(item?.advicee) || !Array.isArray(item?.candidates)) return false;
  if (
    !string(identity?.rootDevice) || !string(identity.rootInode) ||
    !string(identity.gitDirectory) || !string(identity.gitDevice) || !string(identity.gitInode)
  ) return false;
  return item.candidates.length > 0 && item.candidates.length <= 16 && item.candidates.every((candidate) => {
    const entry = record(candidate);
    if (entry === undefined || !string(entry.path)) return false;
    if (entry.operation === "add" && entry.addedLines === undefined) return true;
    if (!Array.isArray(entry.addedLines)) return false;
    if (entry.addedLines.length > 65_536 || !entry.addedLines.every((line) => typeof line === "string")) return false;
    if (entry.operation === "add" || entry.operation === "update") return true;
    return (entry.operation === "delete" || entry.operation === "move") && entry.addedLines.length === 0;
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
  if ((value?.version !== 1 && value?.version !== 2) || typeof value.operation !== "string") return undefined;
  if (value.version === 2) {
    if (!string(value.lifetime)) return undefined;
    if (value.operation === "admit" && value.controlledWriter === true && observation(value.observation) &&
        value.observation.advicee.host === "claude-code" && dispatch(value.dispatch)) {
      return { version: 2, operation: "admit", lifetime: value.lifetime,
        observation: value.observation, controlledWriter: true, dispatch: value.dispatch };
    }
    const ticket = record(value.ticket);
    if (value.operation === "collect" && string(ticket?.nonce) && string(ticket.lifetime) &&
        string(value.root) && advicee(value.advicee) && value.advicee.host === "claude-code" &&
        dispatch(value.dispatch) && (value.mode === undefined || value.mode === "ordinary" || value.mode === "turn-end")) {
      return { version: 2, operation: "collect", lifetime: value.lifetime,
        ticket: { nonce: ticket.nonce, lifetime: ticket.lifetime }, root: value.root,
        advicee: value.advicee, dispatch: value.dispatch,
        ...(value.mode === undefined ? {} : { mode: value.mode }) };
    }
    return undefined;
  }
  if (value.operation === "hello") return { version: 1, operation: "hello" };
  if (!string(value.lifetime)) return undefined;
  if (value.operation === "prompt-marker" && string(value.root) && advicee(value.advicee) &&
      typeof value.marker === "string" && /^[a-f0-9]{64}$/.test(value.marker) &&
      (value.promptDigest === undefined || (typeof value.promptDigest === "string" && /^[a-f0-9]{64}$/.test(value.promptDigest))) &&
      (value.onlyIfMissing === undefined || value.onlyIfMissing === true)) {
    return { version: 1, operation: "prompt-marker", lifetime: value.lifetime,
      root: value.root, advicee: value.advicee, marker: value.marker,
      ...(typeof value.promptDigest === "string" ? { promptDigest: value.promptDigest } : {}),
      ...(value.onlyIfMissing === true ? { onlyIfMissing: true as const } : {}) };
  }
  if (value.operation === "consume-stop" && string(value.root) && advicee(value.advicee) &&
      (value.continuationDigest === undefined ||
        (typeof value.continuationDigest === "string" && /^[a-f0-9]{64}$/.test(value.continuationDigest)))) {
    return { version: 1, operation: "consume-stop", lifetime: value.lifetime,
      root: value.root, advicee: value.advicee,
      ...(typeof value.continuationDigest === "string" ? { continuationDigest: value.continuationDigest } : {}) };
  }
  if ((value.operation === "claim-background" || value.operation === "release-background") &&
      string(value.root) && advicee(value.advicee) &&
      typeof value.token === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value.token)) {
    return { version: 1, operation: value.operation, lifetime: value.lifetime,
      root: value.root, advicee: value.advicee, token: value.token };
  }
  if (value.operation === "begin-submission" && string(value.token) &&
      (value.surface === "edit" || value.surface === "background" || value.surface === "stop")) {
    return { version: 1, operation: "begin-submission", lifetime: value.lifetime,
      token: value.token, surface: value.surface };
  }
  if (value.operation === "release" && string(value.token)) {
    return { version: 1, operation: "release", lifetime: value.lifetime, token: value.token };
  }
  if (value.operation === "admit" && value.controlledWriter === true && observation(value.observation) && dispatch(value.dispatch)) {
    return { version: 1, operation: "admit", lifetime: value.lifetime, observation: value.observation, controlledWriter: true, dispatch: value.dispatch };
  }
  if (
    value.operation === "collect" && string(value.root) && advicee(value.advicee) && dispatch(value.dispatch) &&
    (value.mode === undefined || value.mode === "ordinary" || value.mode === "turn-end") &&
    (value.reportWorkState === undefined || value.reportWorkState === true) &&
    (value.composed === undefined || value.composed === true)
  ) {
    return {
      version: 1,
      operation: "collect",
      lifetime: value.lifetime,
      root: value.root,
      advicee: value.advicee,
      dispatch: value.dispatch,
      ...(value.mode === undefined ? {} : { mode: value.mode }),
      ...(value.reportWorkState === true ? { reportWorkState: true } : {}),
      ...(value.composed === true ? { composed: true } : {}),
    };
  }
  if ((value.operation === "acknowledge" || value.operation === "finalize") && string(value.token)) {
    return { version: 1, operation: value.operation, lifetime: value.lifetime, token: value.token };
  }
  if (value.operation === "stats" || value.operation === "cleanup") {
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

const ClaudeBlockHostOutput = Schema.Struct({
  decision: Schema.Literal("block"),
  reason: Schema.NonEmptyString.check(Schema.isMaxLength(MAX_IPC_FRAME_BYTES)),
});

const ResidentResponseSchema = Schema.Union([
  Schema.Struct({ version: Schema.Literal(2), status: Schema.Literal("accepted"),
    ticket: Schema.Struct({ nonce: Schema.NonEmptyString, lifetime: Schema.NonEmptyString }) }),
  Schema.Struct({ version: Schema.Literal(2), status: Schema.Literals(["rejected-capacity", "obsolete-lifetime", "unsupported"])}),
  Schema.Struct({ version: Schema.Literal(2), status: Schema.Literals(["pending", "clear", "delivered", "no-work"]) }),
  Schema.Struct({ version: Schema.Literal(2), status: Schema.Literal("unavailable"),
    reason: Schema.Literals(["backend", "credential", "capacity", "stale", "lost", "expired"]) }),
  Schema.Struct({ version: Schema.Literal(2), status: Schema.Literal("advice"),
    token: Schema.NonEmptyString, findingCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    output: HostOutput }),
  Schema.Struct({ version: Schema.Literal(2), status: Schema.Literal("advice"),
    token: Schema.NonEmptyString, findingCount: Schema.Int.check(Schema.isGreaterThan(0)),
    output: ClaudeBlockHostOutput }),
  Schema.Struct({ status: Schema.Literal("ready"), lifetime: Schema.NonEmptyString, pid: Schema.Int }),
  Schema.Struct({ status: Schema.Literals([
    "accepted", "rejected-capacity", "obsolete-lifetime", "empty", "pending", "advanced",
    "continuation-allowed", "continuation-denied", "background-claimed", "submitting", "released",
    "acknowledged", "finalized", "unsupported",
    "busy", "cleaned",
  ]) }),
  Schema.Struct({
    status: Schema.Literal("advice"),
    token: Schema.NonEmptyString,
    findingCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    output: HostOutput,
  }),
  Schema.Struct({
    status: Schema.Literal("stats"),
    queued: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    running: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    pendingAdvice: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    pendingFindingBatches: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    pendingOperationalNotices: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    retainedBytes: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    rejectedCapacity: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    successfulCacheEntries: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    pendingEvaluations: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    noticeCooldowns: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    currentWork: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  }),
]);

export const decodeResidentResponse = (value: unknown): ResidentResponse | undefined => {
  const decoded = Schema.decodeUnknownOption(ResidentResponseSchema, { onExcessProperty: "error" })(value);
  return Option.isSome(decoded) ? decoded.value : undefined;
};
