import Shared from "../../monkey-business-bend/session.mjs";
import type { Settings, Stream, Emission, Changed, BendList } from "../../monkey-business-bend/session.mjs";
import { validateSizeFacts } from "./sizes.ts";
import type { JevRequestOutcome } from "../../../src/canonical/adapter.ts";

export type AdviceResponse = "ignore" | "noAction" | "promptRepair" | "delayedRepair";
export interface SessionConfig {
  readonly seed?: number;
  readonly agent?: string;
  readonly editIntervalMs?: number;
  readonly editDurationMs?: number;
  readonly variationMs?: number;
  readonly editsPerTask?: number;
  readonly taskPauseMs?: number;
  readonly adviceResponse?: AdviceResponse;
  readonly repairDelayMs?: number;
  readonly bytes?: number;
  readonly unitBytes?: readonly number[];
}
export type SessionControl =
  | { readonly kind: "sizes"; readonly reservationBytes: number; readonly reviewUnitBytes: readonly number[] }
  | { readonly kind: "editPace"; readonly intervalMs: number }
  | { readonly kind: "burst"; readonly count: number }
  | { readonly kind: "suspendArrivals"; readonly suspended: boolean };
export type SessionInput = {
  readonly at: number; readonly generation: number; readonly agent: string; readonly recurring: boolean;
} & (
  | { readonly kind: "task"; readonly task: number }
  | { readonly kind: "edit"; readonly bytes: number; readonly unitBytes: readonly number[]; readonly revision: number; readonly editDurationMs?: number; readonly repair?: boolean; readonly outcome?: JevRequestOutcome }
  | { readonly kind: "finish" }
);
const integer = (value: number, name: string, minimum = 0, maximum = 1_000_000_000): number => {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RangeError(`${name} must be an integer in [${minimum}, ${maximum}]`);
  return value;
};
const list = <T>(values: readonly T[]): BendList<T> => values.reduceRight<BendList<T>>((tail, head) => ({ $: "Con", head, tail }), { $: "Nil" });
const array = <T>(values: BendList<T>): T[] => {
  const result: T[] = [];
  for (let cursor = values; cursor.$ === "Con"; cursor = cursor.tail) result.push(cursor.head);
  return result;
};
export const sessionProfile = (config: SessionConfig = {}) => {
    const agent = config.agent ?? "agent-1";
    if (!agent.length) throw new RangeError("agent must be nonempty");
    const seed = integer(config.seed ?? 1, "seed", 0, 0xffffffff);
    if (config.editDurationMs !== undefined) integer(config.editDurationMs, "editDurationMs");
    const interval = integer(config.editIntervalMs ?? 100, "editIntervalMs", 1);
    const variation = integer(config.variationMs ?? 15, "variationMs");
    const edits = integer(config.editsPerTask ?? 5, "editsPerTask", 1, 1024);
    const pause = integer(config.taskPauseMs ?? 500, "taskPauseMs");
    const response = config.adviceResponse ?? "ignore";
    const responseIndex = ["ignore", "noAction", "promptRepair", "delayedRepair"].indexOf(response);
    if (responseIndex < 0) throw new RangeError("invalid adviceResponse");
    const repairDelay = integer(config.repairDelayMs ?? 300, "repairDelayMs");
    const bytes = integer(config.bytes ?? 100, "bytes", 1);
    const units = [...(config.unitBytes ?? [bytes])];
    if (!units.length || units.length > 1024) throw new RangeError("unitBytes requires 1..1024 units");
    units.forEach(value => integer(value, "unitBytes", 1));
  return { $: "Workload.Profile" as const, settings: { $: "Session.Settings" as const, interval, variation, edits, pause, response: responseIndex, repairDelay }, seed,
    codes: list(Array.from(agent, character => character.charCodeAt(0))), bytes, units: list(units),
    duration: config.editDurationMs === undefined ? { $: "None" as const } : { $: "Some" as const, value: config.editDurationMs } };
};
/** Thin host boundary for the shared Bend generator; absolute time stays a JS number. */
export class SessionGenerator {
  private config: Settings;
  private state: Stream;
  private readonly agent: string;
  constructor(config: SessionConfig = {}) {
    const profile = sessionProfile(config);
    this.agent = config.agent ?? "agent-1";
    this.config = profile.settings;
    this.state = Shared.initial(this.config, profile.seed, profile.codes, BigInt(profile.bytes),
      list(array(profile.units).map(BigInt)));
  }

  valid(input: { readonly generation?: number; readonly recurring?: boolean }): boolean {
    return input.recurring !== true || input.generation === Number(Shared.state_generation(this.state));
  }
  private consume(transition: Changed, now: number): SessionInput[] {
    this.state = Shared.transition_state(transition);
    return array(Shared.transition_events(transition)).map((event: Emission): SessionInput => {
      const common = { at: now + event.delay, generation: Number(event.generation), agent: this.agent, recurring: event.recurring };
      if (event.kind === 0) return { ...common, kind: "task", task: Number(event.task) };
      if (event.kind === 2) return { ...common, kind: "finish" };
      return { ...common, kind: "edit", bytes: Number(event.bytes), unitBytes: array(event.units).map(Number), revision: Number(event.revision), ...(event.repair ? { repair: true } : {}) };
    });
  }
  next(now: number): SessionInput[] {
    integer(now, "now", 0, Number.MAX_SAFE_INTEGER);
    return this.consume(Shared.next(this.config, this.state), now);
  }
  apply(control: SessionControl, now: number): SessionInput[] {
    integer(now, "now", 0, Number.MAX_SAFE_INTEGER);
    if (control.kind === "sizes") {
      const facts = validateSizeFacts({ sourceBytes: 0, evidenceTreeBytes: 0, encodedOutputBytes: 0, reservationBytes: control.reservationBytes, reviewUnitBytes: control.reviewUnitBytes });
      this.state = Shared.sizes(this.state, BigInt(facts.reservationBytes), list(facts.reviewUnitBytes.map(BigInt)));
      return [];
    }
    if (control.kind === "burst") {
      return this.consume(Shared.burst(BigInt(integer(control.count, "count", 1, 1024)), this.state), now);
    }
    if (control.kind === "editPace") {
      this.config = Shared.set_interval(this.config, integer(control.intervalMs, "intervalMs", 1));
      return this.consume(Shared.rewind(this.config, this.state), now);
    }
    if (control.kind === "suspendArrivals") {
      if (typeof control.suspended !== "boolean") throw new TypeError("suspended must be boolean");
      return this.consume(Shared.suspend(this.config, this.state, control.suspended), now);
    }
    throw new TypeError("unsupported session control");
  }
  onFinish(now: number, continuation: boolean): SessionInput[] {
    if (typeof continuation !== "boolean") throw new TypeError("continuation must be boolean");
    // Preserve the old boundary: phase change happens before next validates now.
    this.state = Shared.finish_state(this.state, continuation);
    return this.next(now);
  }
  onAdvice(now: number): SessionInput[] {
    integer(now, "now", 0, Number.MAX_SAFE_INTEGER);
    return this.consume(Shared.on_advice(this.config, this.state), now);
  }
}
