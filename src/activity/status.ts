import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DirectAdvicee } from "../direct-event/model.ts";

export const MAX_ACTIVITY_EVENTS_PER_SESSION = 256;
export const MAX_ACTIVITY_MARKERS_PER_EVENT = 72;
const ACTIVITY_VERSION = 1 as const;

export type ActivityStage = "pending" | "skipped" | "clear" | "findings" | "submitted" | "unavailable" | "incomplete";
type EvaluationStage = Exclude<ActivityStage, "submitted">;
type BaseMarker = {
  readonly version: 1;
  readonly sessionKey: string;
  readonly childKey: string;
  readonly repositoryKey: string;
  readonly eventKey: string;
  readonly lifetime: string;
  readonly observedAt: number;
};
type ActivityMarker = BaseMarker & {
  readonly kind: "activity";
  readonly stage: EvaluationStage;
  readonly findings: number;
  readonly unitKey?: string;
  readonly expectedUnitKeys?: ReadonlyArray<string>;
};
type SubmissionMarker = BaseMarker & { readonly kind: "submission"; readonly findings: number };
type Marker = ActivityMarker | SubmissionMarker;

export type ActivityKind = "no-observation" | "skipped" | "pending" | "clear" | "findings" | "submitted" | "unavailable" | "incomplete" | "restarted/lost";
export type ActivityStatus = {
  readonly kind: ActivityKind;
  readonly observed: boolean;
  readonly source: "resident-v1";
  readonly boundedToEvents: number;
  readonly counts: Readonly<Record<ActivityKind, number>>;
  readonly findings: number;
  readonly children: ReadonlyArray<{ readonly identity: "root" | "child"; readonly key: string; readonly events: number }>;
  readonly firstObservedAt?: number;
  readonly lastObservedAt?: number;
  readonly submission: { readonly status: "none" | "submitted"; readonly findings: number };
  readonly modelReaction: { readonly status: "unavailable"; readonly reason: "host-model-reaction-not-instrumented" };
  readonly limitation?: "activity-state-unreadable" | "session-id-required";
};

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const sessionKey = (value: string) => hash(`activity-v1:session\0${value}`);
const childKey = (value: string | null) => hash(`activity-v1:child\0${value ?? "root"}`);
const repositoryKey = (value: string) => hash(`activity-v1:repository\0${value}`);
const eventKey = (value: DirectAdvicee) => hash(`activity-v1:event\0${value.sessionId}\0${value.subagentId ?? "root"}\0${value.turnId}\0${value.toolUseId}`);
const unitKey = (value: string) => hash(`activity-v1:unit\0${value}`);
const digest = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 65_536;

const isMarker = (value: unknown): value is Marker => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Readonly<Record<string, unknown>>;
  const base = item.version === ACTIVITY_VERSION && digest(item.sessionKey) && digest(item.childKey) &&
    digest(item.repositoryKey) && digest(item.eventKey) && typeof item.lifetime === "string" &&
    item.lifetime.length > 0 && item.lifetime.length <= 512 && typeof item.observedAt === "number" &&
    Number.isSafeInteger(item.observedAt) && item.observedAt >= 0 && count(item.findings);
  if (!base) return false;
  if (item.kind === "submission") return true;
  return item.kind === "activity" &&
    ["pending", "skipped", "clear", "findings", "unavailable", "incomplete"].includes(String(item.stage)) &&
    (item.unitKey === undefined || digest(item.unitKey)) &&
    (item.expectedUnitKeys === undefined || (Array.isArray(item.expectedUnitKeys) &&
      item.expectedUnitKeys.length <= 64 && item.expectedUnitKeys.every(digest)));
};

const readMarker = (path: string): Marker | undefined => {
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    return isMarker(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

const atomicCreate = (directory: string, marker: Marker): void => {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const target = join(directory, `${marker.eventKey}.${marker.observedAt}.${process.pid}.${randomUUID()}.json`);
  const temporary = `${target}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(marker)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    renameSync(temporary, target);
  } finally {
    rmSync(temporary, { force: true });
  }
};

const prune = (directory: string): void => {
  let groups: Map<string, { readonly at: number; readonly entries: Array<{ readonly path: string; readonly marker: Marker }> }>;
  try {
    groups = new Map();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const path = join(directory, entry.name);
      const marker = readMarker(path);
      if (marker === undefined) continue;
      const previous = groups.get(marker.eventKey);
      groups.set(marker.eventKey, {
        at: Math.max(previous?.at ?? 0, marker.observedAt),
        entries: [...(previous?.entries ?? []), { path, marker }],
      });
    }
  } catch {
    return;
  }
  const orderedGroups = [...groups.values()].sort((left, right) => right.at - left.at);
  for (const group of orderedGroups.slice(MAX_ACTIVITY_EVENTS_PER_SESSION)) {
    for (const { path } of group.entries) rmSync(path, { force: true });
  }
  for (const group of orderedGroups.slice(0, MAX_ACTIVITY_EVENTS_PER_SESSION)) {
    const newest = [...group.entries].sort((left, right) =>
      right.marker.observedAt - left.marker.observedAt || right.path.localeCompare(left.path));
    const bySemanticMarker = new Map<string, typeof newest[number]>();
    for (const entry of newest) {
      const marker = entry.marker;
      const key = marker.kind === "submission"
        ? "submission"
        : marker.expectedUnitKeys !== undefined
          ? "plan"
          : marker.unitKey === undefined
            ? `stage:${marker.stage}`
            : `unit:${marker.unitKey}`;
      if (!bySemanticMarker.has(key)) bySemanticMarker.set(key, entry);
    }
    const deduplicated = [...bySemanticMarker.entries()];
    const essential = deduplicated.filter(([key]) => !key.startsWith("unit:"));
    const units = deduplicated.filter(([key]) => key.startsWith("unit:"))
      .slice(0, Math.max(0, MAX_ACTIVITY_MARKERS_PER_EVENT - essential.length));
    const retained = new Set([...essential, ...units].map(([, entry]) => entry.path));
    for (const { path } of group.entries) {
      if (!retained.has(path)) rmSync(path, { force: true });
    }
  }
};

/** Immutable, source-free, best-effort marker creation. */
export const recordActivity = (options: {
  readonly statePath: string | undefined;
  readonly root: string;
  readonly advicee: DirectAdvicee;
  readonly lifetime: string;
  readonly stage: ActivityStage;
  readonly findings?: number;
  readonly submittedFindings?: number;
  readonly unitIdentity?: string;
  readonly expectedUnitIdentities?: ReadonlyArray<string>;
  readonly now?: number;
}): void => {
  if (options.statePath === undefined) return;
  try {
    const directory = join(options.statePath, sessionKey(options.advicee.sessionId));
    const base: BaseMarker = {
      version: ACTIVITY_VERSION,
      sessionKey: sessionKey(options.advicee.sessionId),
      childKey: childKey(options.advicee.subagentId),
      repositoryKey: repositoryKey(options.root),
      eventKey: eventKey(options.advicee),
      lifetime: options.lifetime,
      observedAt: options.now ?? Date.now(),
    };
    const marker: Marker = options.stage === "submitted"
      ? { ...base, kind: "submission", findings: Math.min(65_536, Math.max(0, options.submittedFindings ?? 0)) }
      : {
          ...base,
          kind: "activity",
          stage: options.stage,
          findings: Math.min(65_536, Math.max(0, options.findings ?? 0)),
          ...(options.unitIdentity === undefined ? {} : { unitKey: unitKey(options.unitIdentity) }),
          ...(options.expectedUnitIdentities === undefined ? {} : {
            expectedUnitKeys: [...new Set(options.expectedUnitIdentities.map(unitKey))].slice(0, 64),
          }),
        };
    atomicCreate(directory, marker);
    prune(directory);
  } catch {
    // Activity is advisory and cannot fail an already-completed host edit.
  }
};

const emptyCounts = (): Record<ActivityKind, number> => ({
  "no-observation": 0, skipped: 0, pending: 0, clear: 0, findings: 0,
  submitted: 0, unavailable: 0, incomplete: 0, "restarted/lost": 0,
});
const priority: Readonly<Record<EvaluationStage, number>> = {
  pending: 0, skipped: 1, clear: 2, findings: 3, incomplete: 4, unavailable: 5,
};

const reduceEvent = (
  markers: ReadonlyArray<ActivityMarker>,
  resident: { readonly available: boolean; readonly lifetime?: string },
): { readonly kind: Exclude<ActivityKind, "no-observation" | "submitted">; readonly findings: number } => {
  const ordered = [...markers].sort((left, right) => left.observedAt - right.observedAt);
  const expected = new Set(ordered.filter((marker) => marker.expectedUnitKeys !== undefined)
    .at(-1)?.expectedUnitKeys ?? []);
  const terminals = new Map<string, ActivityMarker>();
  let eventStage: ActivityMarker | undefined;
  for (const marker of ordered) {
    if (marker.unitKey !== undefined) {
      const current = terminals.get(marker.unitKey);
      if (current === undefined || priority[marker.stage] >= priority[current.stage]) terminals.set(marker.unitKey, marker);
    } else if (marker.expectedUnitKeys === undefined) {
      if (eventStage === undefined || priority[marker.stage] >= priority[eventStage.stage]) eventStage = marker;
    }
  }
  const residentLost = !resident.available || resident.lifetime !== ordered.at(-1)?.lifetime;
  if (expected.size > 0
    ? [...expected].some((key) => !terminals.has(key))
    : eventStage?.stage === "pending") {
    return { kind: residentLost ? "restarted/lost" : "pending", findings: 0 };
  }
  const terminalMarkers = [...terminals.values()];
  const findings = (eventStage?.findings ?? 0) +
    terminalMarkers.reduce((total, marker) => total + marker.findings, 0);
  const terminalStage = terminalMarkers.reduce<ActivityMarker | undefined>(
    (selected, marker) => selected === undefined || priority[marker.stage] >= priority[selected.stage] ? marker : selected,
    undefined,
  );
  const selected = eventStage === undefined || (terminalStage !== undefined && priority[terminalStage.stage] > priority[eventStage.stage])
    ? terminalStage
    : eventStage;
  return { kind: selected?.stage ?? "skipped", findings };
};

const overallKind = (counts: Readonly<Record<ActivityKind, number>>): ActivityKind => {
  for (const kind of ["restarted/lost", "incomplete", "unavailable", "pending", "submitted", "findings", "clear", "skipped"] as const) {
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
  const empty = (limitation?: ActivityStatus["limitation"]): ActivityStatus => ({
    kind: "no-observation", observed: false, source: "resident-v1",
    boundedToEvents: MAX_ACTIVITY_EVENTS_PER_SESSION, counts, findings: 0, children: [],
    submission: { status: "none", findings: 0 },
    modelReaction: { status: "unavailable", reason: "host-model-reaction-not-instrumented" },
    ...(limitation === undefined ? {} : { limitation }),
  });
  if (options.sessionId.length === 0) return empty("session-id-required");
  const directory = join(options.statePath, sessionKey(options.sessionId));
  let markers: ReadonlyArray<Marker>;
  let limitation: ActivityStatus["limitation"];
  try {
    markers = readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      if (!entry.isFile() || !entry.name.endsWith(".json")) return [];
      const marker = readMarker(join(directory, entry.name));
      if (marker === undefined) {
        limitation = "activity-state-unreadable";
        return [];
      }
      return marker.repositoryKey === repositoryKey(options.root) ? [marker] : [];
    });
  } catch (cause) {
    if (typeof cause === "object" && cause !== null && "code" in cause && cause.code === "ENOENT") return empty();
    return empty("activity-state-unreadable");
  }
  const events = new Map<string, Array<ActivityMarker>>();
  const submissions = new Map<string, SubmissionMarker>();
  const children = new Map<string, Set<string>>();
  let firstObservedAt: number | undefined;
  let lastObservedAt: number | undefined;
  for (const marker of markers) {
    firstObservedAt = Math.min(firstObservedAt ?? marker.observedAt, marker.observedAt);
    lastObservedAt = Math.max(lastObservedAt ?? marker.observedAt, marker.observedAt);
    const childEvents = children.get(marker.childKey) ?? new Set<string>();
    childEvents.add(marker.eventKey);
    children.set(marker.childKey, childEvents);
    if (marker.kind === "submission") {
      const previous = submissions.get(marker.eventKey);
      if (previous === undefined || marker.observedAt >= previous.observedAt) submissions.set(marker.eventKey, marker);
    } else {
      const group = events.get(marker.eventKey) ?? [];
      group.push(marker);
      events.set(marker.eventKey, group);
    }
  }
  let findings = 0;
  for (const group of events.values()) {
    const event = reduceEvent(group, options.resident);
    counts[event.kind] += 1;
    findings += event.findings;
  }
  const submittedFindings = [...submissions.values()].reduce((total, marker) => total + marker.findings, 0);
  counts.submitted = submissions.size;
  return {
    kind: overallKind(counts), observed: markers.length > 0, source: "resident-v1",
    boundedToEvents: MAX_ACTIVITY_EVENTS_PER_SESSION, counts, findings,
    children: [...children.entries()].map(([key, eventKeys]) => ({
      identity: key === childKey(null) ? "root" as const : "child" as const,
      key,
      events: eventKeys.size,
    })).sort((left, right) => left.key.localeCompare(right.key)),
    ...(firstObservedAt === undefined ? {} : { firstObservedAt }),
    ...(lastObservedAt === undefined ? {} : { lastObservedAt }),
    submission: { status: submissions.size > 0 ? "submitted" : "none", findings: submittedFindings },
    modelReaction: { status: "unavailable", reason: "host-model-reaction-not-instrumented" },
    ...(limitation === undefined ? {} : { limitation }),
  };
};

export const formatActivityHuman = (sessionId: string, activity: ActivityStatus): string => {
  const lines = [
    `session: ${sessionId}`,
    `activity: ${activity.kind}`,
    `events: ${Object.entries(activity.counts).filter(([, value]) => value > 0).map(([kind, value]) => `${kind}=${value}`).join(", ") || "none"}`,
    `findings: ${activity.findings}`,
    `submission: ${activity.submission.status} (findings=${activity.submission.findings})`,
    "model-reaction: unavailable (host model reaction is not instrumented)",
  ];
  if (activity.limitation !== undefined) lines.push(`limitation: ${activity.limitation}`);
  return `${lines.join("\n")}\n`;
};
