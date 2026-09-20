import * as Effect from "effect/Effect";
import {
  emptyReceiptCounts,
  type ReceiptCounts,
  type ReceiptEventObservation,
  type ReceiptLimitationCode,
  type ReceiptObservation,
} from "../domain/receipts.ts";
import { ReceiptStore } from "../ports/receipt-store.ts";

export type ReceiptActivityKind =
  | "no-observation"
  | "all-skipped"
  | "clean-reviewed"
  | "reviewed"
  | "unavailable"
  | "mixed"
  | "incomplete"
  | "limited";

export interface ReceiptActivityStatus {
  readonly kind: ReceiptActivityKind;
  readonly observed: boolean;
  readonly counts: ReceiptCounts;
  readonly categories: Readonly<Record<string, number>>;
  readonly times: {
    readonly firstStartedAt?: number;
    readonly lastStartedAt?: number;
    readonly firstCompletedAt?: number;
    readonly lastCompletedAt?: number;
  };
  readonly limitation?: ReceiptLimitationCode;
}

const add = (left: number, right: number): number => left + right;

const optionalMin = (values: ReadonlyArray<number | undefined>): number | undefined => {
  const present = values.filter((value): value is number => value !== undefined);
  return present.length === 0 ? undefined : Math.min(...present);
};

const optionalMax = (values: ReadonlyArray<number | undefined>): number | undefined => {
  const present = values.filter((value): value is number => value !== undefined);
  return present.length === 0 ? undefined : Math.max(...present);
};

const summarizeCounts = (events: ReadonlyArray<ReceiptEventObservation>): ReceiptCounts => {
  const incomplete = events.filter(
    (event) =>
      !event.hasStart ||
      !event.hasCompletion ||
      (event.expectedResults !== undefined &&
        event.resultCount !== undefined &&
        event.expectedResults !== event.resultCount),
  ).length;
  const counts = {
    ...emptyReceiptCounts(),
    started: events.filter((event) => event.hasStart).length,
    completed: events.filter((event) => event.hasCompletion).length,
    incomplete,
    reviewed: events.reduce((total, event) => add(total, event.reviewed), 0),
    skipped: events.reduce((total, event) => add(total, event.skipped), 0),
    unavailable: events.reduce((total, event) => add(total, event.unavailable), 0),
  };
  return counts;
};

const summarizeCategories = (
  events: ReadonlyArray<ReceiptEventObservation>,
): Readonly<Record<string, number>> => {
  const categories: Record<string, number> = {};
  for (const event of events) {
    for (const [key, value] of Object.entries(event.categories)) {
      categories[key] = (categories[key] ?? 0) + value;
    }
  }
  return categories;
};

const kindFor = (
  counts: ReceiptCounts,
  findings: number,
  limitation: ReceiptLimitationCode | undefined,
): ReceiptActivityKind => {
  if (limitation !== undefined && limitation !== "completion_without_start") return "limited";
  if (counts.incomplete > 0 || limitation === "completion_without_start") return "incomplete";
  if (counts.started === 0 && counts.completed === 0) return "no-observation";
  const active = [counts.reviewed > 0, counts.skipped > 0, counts.unavailable > 0].filter(Boolean).length;
  if (active > 1) return "mixed";
  if (counts.skipped > 0) return "all-skipped";
  if (counts.unavailable > 0) return "unavailable";
  if (counts.reviewed > 0) return findings === 0 ? "clean-reviewed" : "reviewed";
  return "no-observation";
};

/** Reduce source-free per-event markers into an explicit activity status. */
export const summarize = (observation: ReceiptObservation): ReceiptActivityStatus => {
  const counts = summarizeCounts(observation.events);
  const findings = observation.events.reduce((total, event) => total + event.findings, 0);
  const firstStartedAt = optionalMin(observation.events.map((event) => event.startedAt));
  const lastStartedAt = optionalMax(observation.events.map((event) => event.startedAt));
  const firstCompletedAt = optionalMin(observation.events.map((event) => event.completedAt));
  const lastCompletedAt = optionalMax(observation.events.map((event) => event.completedAt));
  const times: {
    firstStartedAt?: number;
    lastStartedAt?: number;
    firstCompletedAt?: number;
    lastCompletedAt?: number;
  } = {};
  if (firstStartedAt !== undefined) times.firstStartedAt = firstStartedAt;
  if (lastStartedAt !== undefined) times.lastStartedAt = lastStartedAt;
  if (firstCompletedAt !== undefined) times.firstCompletedAt = firstCompletedAt;
  if (lastCompletedAt !== undefined) times.lastCompletedAt = lastCompletedAt;
  const kind = kindFor(counts, findings, observation.limitation);
  return {
    kind,
    observed: observation.events.length > 0,
    counts,
    categories: summarizeCategories(observation.events),
    times,
    ...(observation.limitation === undefined ? {} : { limitation: observation.limitation }),
  };
};

export const read = Effect.fn("ReceiptStatus.read")(function* (sessionId: string) {
  const store = yield* ReceiptStore.Service;
  return summarize(yield* store.read(sessionId));
});

export const formatHuman = (
  sessionId: string,
  readiness: string,
  activity: ReceiptActivityStatus,
): string => {
  const lines = [
    `session: ${sessionId}`,
    `readiness: ${readiness}`,
    `activity: ${activity.kind}`,
    `events: started=${activity.counts.started}, completed=${activity.counts.completed}, incomplete=${activity.counts.incomplete}`,
    `outcomes: reviewed=${activity.counts.reviewed}, skipped=${activity.counts.skipped}, unavailable=${activity.counts.unavailable}`,
  ];
  const categories = Object.entries(activity.categories)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
  if (categories.length > 0) lines.push(`categories: ${categories}`);
  if (activity.limitation !== undefined) lines.push(`limitation: ${activity.limitation}`);
  return `${lines.join("\n")}\n`;
};

export * as ReceiptStatus from "./status.ts";
