import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { DirectRecipient } from "../direct-event/model.ts";

export const MAX_ACTIVITY_EVENTS_PER_SESSION = 256;
const ACTIVITY_VERSION = 1 as const;

export type ActivityStage =
  | "pending"
  | "skipped"
  | "clear"
  | "findings"
  | "submitted"
  | "unavailable"
  | "incomplete";

type ActivityRecord = {
  readonly version: 1;
  readonly sessionKey: string;
  readonly childKey: string;
  readonly repositoryKey: string;
  readonly eventKey: string;
  readonly lifetime: string;
  readonly firstObservedAt: number;
  readonly lastObservedAt: number;
  readonly stage: ActivityStage;
  readonly findings: number;
  readonly submitted: boolean;
  readonly submittedFindings: number;
  readonly expectedUnits?: number;
  readonly completedUnits: number;
};

export type ActivityKind =
  | "no-observation"
  | "skipped"
  | "pending"
  | "clear"
  | "findings"
  | "submitted"
  | "unavailable"
  | "incomplete"
  | "restarted/lost";

export type ActivityStatus = {
  readonly kind: ActivityKind;
  readonly observed: boolean;
  readonly source: "resident-v1";
  readonly boundedToEvents: number;
  readonly counts: Readonly<Record<ActivityKind, number>>;
  readonly findings: number;
  readonly children: ReadonlyArray<{
    readonly identity: "root" | "child";
    readonly key: string;
    readonly events: number;
  }>;
  readonly firstObservedAt?: number;
  readonly lastObservedAt?: number;
  readonly modelReaction: {
    readonly status: "unavailable";
    readonly reason: "host-model-reaction-not-instrumented";
  };
  readonly submission: {
    readonly status: "none" | "submitted";
    readonly findings: number;
  };
  readonly limitation?: "activity-state-unreadable" | "session-id-required";
};

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const sessionKey = (sessionId: string) => hash(`activity-v1:session\0${sessionId}`);
const childKey = (agentId: string | null) => hash(`activity-v1:child\0${agentId ?? "root"}`);
const repositoryKey = (root: string) => hash(`activity-v1:repository\0${root}`);
const eventKey = (recipient: DirectRecipient) => hash(
  `activity-v1:event\0${recipient.sessionId}\0${recipient.agentId ?? "root"}\0${recipient.turnId}\0${recipient.toolUseId}`,
);

const recordPath = (statePath: string, recipient: DirectRecipient) =>
  join(statePath, sessionKey(recipient.sessionId), `${eventKey(recipient)}.json`);

const isRecord = (value: unknown): value is ActivityRecord => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Readonly<Record<string, unknown>>;
  return item.version === ACTIVITY_VERSION &&
    typeof item.sessionKey === "string" && /^[a-f0-9]{64}$/.test(item.sessionKey) &&
    typeof item.childKey === "string" && /^[a-f0-9]{64}$/.test(item.childKey) &&
    typeof item.repositoryKey === "string" && /^[a-f0-9]{64}$/.test(item.repositoryKey) &&
    typeof item.eventKey === "string" && /^[a-f0-9]{64}$/.test(item.eventKey) &&
    typeof item.lifetime === "string" && item.lifetime.length > 0 && item.lifetime.length <= 512 &&
    typeof item.firstObservedAt === "number" && Number.isSafeInteger(item.firstObservedAt) &&
    typeof item.lastObservedAt === "number" && Number.isSafeInteger(item.lastObservedAt) &&
    ["pending", "skipped", "clear", "findings", "submitted", "unavailable", "incomplete"].includes(String(item.stage)) &&
    typeof item.findings === "number" && Number.isSafeInteger(item.findings) && item.findings >= 0 && item.findings <= 65_536 &&
    typeof item.submitted === "boolean" &&
    typeof item.submittedFindings === "number" && Number.isSafeInteger(item.submittedFindings) && item.submittedFindings >= 0 && item.submittedFindings <= 65_536 &&
    (item.expectedUnits === undefined || (typeof item.expectedUnits === "number" && Number.isSafeInteger(item.expectedUnits) && item.expectedUnits >= 0 && item.expectedUnits <= 65_536)) &&
    typeof item.completedUnits === "number" && Number.isSafeInteger(item.completedUnits) && item.completedUnits >= 0 && item.completedUnits <= 65_536;
};

const readRecord = (path: string): ActivityRecord | undefined => {
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

const atomicWrite = (path: string, value: ActivityRecord): void => {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
};

const prune = (directory: string): void => {
  let files: Array<{ readonly path: string; readonly at: number }>;
  try {
    files = readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      if (!entry.isFile() || !entry.name.endsWith(".json")) return [];
      const path = join(directory, entry.name);
      return [{ path, at: readRecord(path)?.lastObservedAt ?? 0 }];
    });
  } catch {
    return;
  }
  files.sort((left, right) => right.at - left.at || left.path.localeCompare(right.path));
  for (const file of files.slice(MAX_ACTIVITY_EVENTS_PER_SESSION)) rmSync(file.path, { force: true });
};

/** Source-free best-effort observation. It must never change review behavior. */
export const recordActivity = (options: {
  readonly statePath: string | undefined;
  readonly root: string;
  readonly recipient: DirectRecipient;
  readonly lifetime: string;
  readonly stage: ActivityStage;
  readonly findings?: number;
  readonly expectedUnits?: number;
  readonly completedUnits?: number;
  readonly submittedFindings?: number;
  readonly now?: number;
}): void => {
  if (options.statePath === undefined) return;
  try {
    const path = recordPath(options.statePath, options.recipient);
    const previous = readRecord(path);
    const now = options.now ?? Date.now();
    const submitted = options.stage === "submitted" || previous?.submitted === true;
    const priority: Readonly<Record<Exclude<ActivityStage, "submitted">, number>> = {
      pending: 0,
      skipped: 1,
      clear: 2,
      findings: 3,
      incomplete: 4,
      unavailable: 5,
    };
    const proposed = options.stage === "submitted" ? undefined : options.stage;
    const prior = previous?.stage === "submitted" ? undefined : previous?.stage;
    const stage = proposed === undefined
      ? prior ?? "pending"
      : prior === undefined || priority[proposed] >= priority[prior]
        ? proposed
        : prior;
    atomicWrite(path, {
      version: ACTIVITY_VERSION,
      sessionKey: sessionKey(options.recipient.sessionId),
      childKey: childKey(options.recipient.agentId),
      repositoryKey: repositoryKey(options.root),
      eventKey: eventKey(options.recipient),
      lifetime: options.lifetime,
      firstObservedAt: previous?.firstObservedAt ?? now,
      lastObservedAt: now,
      stage,
      findings: Math.min(65_536, Math.max(previous?.findings ?? 0, options.findings ?? 0)),
      submitted,
      submittedFindings: Math.min(65_536, Math.max(previous?.submittedFindings ?? 0, options.submittedFindings ?? 0)),
      ...(options.expectedUnits === undefined && previous?.expectedUnits === undefined
        ? {}
        : { expectedUnits: Math.max(previous?.expectedUnits ?? 0, options.expectedUnits ?? 0) }),
      completedUnits: Math.min(65_536, (previous?.completedUnits ?? 0) + (options.completedUnits ?? 0)),
    });
    prune(dirname(path));
  } catch {
    // Observability is advisory and cannot fail an already-completed host edit.
  }
};

const emptyCounts = (): Record<ActivityKind, number> => ({
  "no-observation": 0,
  skipped: 0,
  pending: 0,
  clear: 0,
  findings: 0,
  submitted: 0,
  unavailable: 0,
  incomplete: 0,
  "restarted/lost": 0,
});

const effectiveKind = (
  record: ActivityRecord,
  resident: { readonly available: boolean; readonly lifetime?: string },
): ActivityKind => {
  if (record.submitted) return "submitted";
  if (record.stage === "pending" && (!resident.available || resident.lifetime !== record.lifetime)) {
    return "restarted/lost";
  }
  if (record.expectedUnits !== undefined && record.completedUnits < record.expectedUnits) {
    return !resident.available || resident.lifetime !== record.lifetime ? "restarted/lost" : "pending";
  }
  return record.stage;
};

const overallKind = (counts: Readonly<Record<ActivityKind, number>>): ActivityKind => {
  for (const kind of [
    "restarted/lost", "incomplete", "unavailable", "pending", "submitted", "findings", "clear", "skipped",
  ] as const) {
    if (counts[kind] > 0) return kind;
  }
  return "no-observation";
};

export const readActivity = (options: {
  readonly statePath: string;
  readonly root: string;
  readonly sessionId: string;
  readonly resident: { readonly available: boolean; readonly lifetime?: string };
}): ActivityStatus => {
  const counts = emptyCounts();
  if (options.sessionId.length === 0) {
    return {
      kind: "no-observation",
      observed: false,
      source: "resident-v1",
      boundedToEvents: MAX_ACTIVITY_EVENTS_PER_SESSION,
      counts,
      findings: 0,
      children: [],
      modelReaction: { status: "unavailable", reason: "host-model-reaction-not-instrumented" },
      submission: { status: "none", findings: 0 },
      limitation: "session-id-required",
    };
  }
  const directory = join(options.statePath, sessionKey(options.sessionId));
  let records: ReadonlyArray<ActivityRecord> = [];
  let limitation: ActivityStatus["limitation"];
  try {
    records = readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      if (!entry.isFile() || !entry.name.endsWith(".json")) return [];
      const record = readRecord(join(directory, entry.name));
      if (record === undefined) {
        limitation = "activity-state-unreadable";
        return [];
      }
      return record.repositoryKey === repositoryKey(options.root) ? [record] : [];
    }).sort((left, right) => left.lastObservedAt - right.lastObservedAt);
  } catch (cause) {
    if (!(typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT")) {
      limitation = "activity-state-unreadable";
    }
  }
  const children = new Map<string, { identity: "root" | "child"; key: string; events: number }>();
  let findings = 0;
  let submittedFindings = 0;
  for (const record of records) {
    const kind = effectiveKind(record, options.resident);
    counts[kind] += 1;
    findings += record.findings;
    submittedFindings += record.submittedFindings;
    const existing = children.get(record.childKey);
    children.set(record.childKey, {
      identity: record.childKey === childKey(null) ? "root" : "child",
      key: record.childKey,
      events: (existing?.events ?? 0) + 1,
    });
  }
  const first = records[0];
  const last = records.at(-1);
  return {
    kind: overallKind(counts),
    observed: records.length > 0,
    source: "resident-v1",
    boundedToEvents: MAX_ACTIVITY_EVENTS_PER_SESSION,
    counts,
    findings,
    children: [...children.values()].sort((left, right) => left.key.localeCompare(right.key)),
    ...(first === undefined ? {} : { firstObservedAt: first.firstObservedAt }),
    ...(last === undefined ? {} : { lastObservedAt: last.lastObservedAt }),
    modelReaction: {
      status: "unavailable",
      reason: "host-model-reaction-not-instrumented",
    },
    submission: {
      status: counts.submitted > 0 ? "submitted" : "none",
      findings: submittedFindings,
    },
    ...(limitation === undefined ? {} : { limitation }),
  };
};

export const formatActivityHuman = (sessionId: string, activity: ActivityStatus): string => {
  const lines = [
    `session: ${sessionId}`,
    `activity: ${activity.kind}`,
    `events: ${Object.entries(activity.counts).filter(([, count]) => count > 0).map(([kind, count]) => `${kind}=${count}`).join(", ") || "none"}`,
    `findings: ${activity.findings}`,
    `submission: ${activity.submission.status} (findings=${activity.submission.findings})`,
    "model-reaction: unavailable (host model reaction is not instrumented)",
  ];
  if (activity.limitation !== undefined) lines.push(`limitation: ${activity.limitation}`);
  return `${lines.join("\n")}\n`;
};
