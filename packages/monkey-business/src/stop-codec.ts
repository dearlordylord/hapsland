import { decodeOutputCapture, encodeOutputCapture, OutputScenarioProfileSchema, type OutputCapture } from "./output-controls.ts";
import SharedEngine from "../../monkey-business-bend/engine.mjs";
import { Schema } from "effect";
import { decodeSharedValue } from "../../../src/canonical/simulation-codec.ts";
import { decoder, Nat, PositiveNat, readBendList, readNat } from "../../../src/canonical/boundary-schema.ts";
import { validateLiveControl } from "./controls.ts";
import { decodeDriver, type DriverAction, decodeDriverEvent } from "./driver-codec.ts";

/** Original Stop identity and safe hook cutoff; no new deadline policy. */
export const StopCaptureSchema = Schema.Struct({
  partition: PositiveNat, lifetime: PositiveNat, round: PositiveNat,
  attempt: PositiveNat, token: PositiveNat, started: Nat, cutoff: Nat,
}).check(Schema.makeFilter(value => value.started <= value.cutoff));
export type StopCapture = typeof StopCaptureSchema.Type;
const readCapture = decoder(StopCaptureSchema);
export const encodeStopCapture = (value: unknown) => {
  const capture = readCapture(value);
  return Object.freeze({ $: "StopScenario.Capture", ...capture });
};

const WireNat = Schema.Union([Nat,
  Schema.BigInt.check(Schema.makeFilter(value => value >= 0n && value < 2n ** 48n)),
]);
const FactSchema = Schema.Struct({ $: Schema.Literal("StopScenario.Fact"), at: WireNat, event: Schema.Unknown });
const readFact = decoder(FactSchema);
export const decodeStopFacts = (value: unknown) => readBendList(value, item => {
  const fact = readFact(item);
  return { at: Number(fact.at), event: decodeDriverEvent(fact.event) };
}, 2);

export const initialStopFacts = (capture: StopCapture) =>
  decodeStopFacts(SharedEngine.stop_initial(encodeStopCapture(capture)));
export const wakeStopFacts = (capture: StopCapture, now: number) =>
  decodeStopFacts(SharedEngine.stop_wake(encodeStopCapture(capture), decoder(Nat)(now)));

const Selected = Schema.Array(PositiveNat).check(Schema.isMaxLength(2048),
  Schema.makeFilter(values => new Set(values).size === values.length));
const readSelected = decoder(Selected);
// At most three retirement actions per retained member, plus Stop end and partition retirement.
// Decode the whole list before the caller publishes any queued action.
export const decodeStopActions = (value: unknown): DriverAction[] => readBendList(value, action => {
  const decoded = decodeDriver({ handled: true, actions: { $: "Con", head: action, tail: { $: "Nil" } } }).actions[0];
  if (!decoded) throw new TypeError("missing Stop action");
  return decoded;
}, 6146);
/** Checked snapshots of the single Engine-owned original Finish registry. */
const FinishFields = Schema.Struct({
  $: Schema.Literal("StopScenario.Finish"), partition: PositiveNat, lifetime: PositiveNat,
  round: PositiveNat, attempt: PositiveNat, token: PositiveNat, deadline: Nat,
  recurring: Schema.Boolean, selected: Schema.Unknown, waiting: Schema.Boolean,
  validating: Nat, started: Nat, fit_pending: Schema.Boolean, output: Schema.Unknown,
});
export const decodeStopFinish = (value: unknown) => {
  const fact = decoder(FinishFields)(value);
  const selected = readSelected(readBendList(fact.selected, readNat, 2048));
  const outputs = readBendList(fact.output, decodeOutputCapture, 1);
  readCapture({ partition: fact.partition, lifetime: fact.lifetime, round: fact.round,
    attempt: fact.attempt, token: fact.token, started: fact.started, cutoff: fact.deadline });
  return Object.freeze({ partition: fact.partition, lifetime: fact.lifetime, round: fact.round,
    attempt: fact.attempt, token: fact.token, started: fact.started, deadline: fact.deadline,
    recurring: fact.recurring, selected: Object.freeze(selected), waiting: fact.waiting,
    validating: fact.validating, fitPending: fact.fit_pending, output: outputs[0] });
};
export type StopFinish = ReturnType<typeof decodeStopFinish>;
export const decodeStopRegistry = (value: unknown) => readBendList(value, decodeStopFinish, 2048);
export const decodeStopFound = (value: unknown): StopFinish | undefined => {
  const found = decoder(Schema.Union([
    Schema.Struct({ $: Schema.Literal("None") }),
    Schema.Struct({ $: Schema.Literal("Some"), value: Schema.Unknown }),
  ]))(value);
  return found.$ === "Some" ? decodeStopFinish(found.value) : undefined;
};
export const StopInputSchema = Schema.Struct({ partition: PositiveNat, lifetime: PositiveNat,
  round: PositiveNat, started: Nat, cutoff: Nat, recurring: Schema.Boolean
}).check(Schema.makeFilter(value => value.started <= value.cutoff));
export const encodeStopInput = (value: unknown) => ({ $: "StopScenario.Input", ...decoder(StopInputSchema)(value) });
export type StopProgress =
  | { kind: "waiting"; value: boolean }
  | { kind: "ready"; count: number }
  | { kind: "selected"; advice: number; keep: boolean }
  | { kind: "clear" }
  | { kind: "fit"; value: boolean }
  | { kind: "output"; capture: OutputCapture };
export const encodeStopProgress = (progress: StopProgress): unknown => {
  switch (progress.kind) {
    case "waiting": return { $: "StopScenario.Waiting", value: decoder(Schema.Boolean)(progress.value) };
    case "ready": return { $: "StopScenario.Ready", count: decoder(Nat)(progress.count) };
    case "selected": return { $: "StopScenario.Selected", advice: decoder(PositiveNat)(progress.advice), keep: decoder(Schema.Boolean)(progress.keep) };
    case "clear": return { $: "StopScenario.Clear" };
    case "fit": return { $: "StopScenario.Fit", value: decoder(Schema.Boolean)(progress.value) };
    case "output": return { $: "StopScenario.Output", capture: encodeOutputCapture(progress.capture) };
  }
};

const CommandFactsSchema = Schema.Struct({ now: Nat, profile: OutputScenarioProfileSchema, bytes: Schema.optional(Nat), fitAttempt: Schema.optional(PositiveNat) });
export type StopCommandFacts = typeof CommandFactsSchema.Type;
export const encodeStopCommandFacts = (value: StopCommandFacts): unknown => {
  const facts = decoder(CommandFactsSchema)(value);
  const control = validateLiveControl({ kind: "outputProfile", ...facts.profile });
  if (control.kind !== "outputProfile") throw new TypeError("invalid original Stop output profile");
  return { $: "StopScenario.CommandFacts", now: facts.now,
    outcome: { $: `OutputScenario.${control.outcome[0]!.toUpperCase()}${control.outcome.slice(1)}` },
    delay: control.delayMs, lease: control.leaseMs,
    bytes: facts.bytes === undefined ? { $: "None" } : { $: "Some", value: facts.bytes },
    fit_attempt: facts.fitAttempt === undefined ? { $: "None" } : { $: "Some", value: facts.fitAttempt } };
};
const maybeWire = decoder(Schema.Union([
  Schema.Struct({ $: Schema.Literal("None") }),
  Schema.Struct({ $: Schema.Literal("Some"), value: Schema.Unknown }),
]));
const optionalWire = <T>(value: unknown, decode: (value: unknown) => T): T | undefined => {
  const item = maybeWire(value);
  return item.$ === "Some" ? decode(item.value) : undefined;
};
export const decodeStopCommand = (value: unknown) => {
  const report = decoder(Schema.Struct({ $: Schema.Literal("StopHandled"), state: Schema.Unknown,
    handled: Schema.Unknown,
    ended: Schema.Unknown, fit_attempt: Schema.Unknown, output: Schema.Unknown }))(value);
  const handled = decodeDriver(decodeSharedValue(report.handled));
  const ended = optionalWire(decodeSharedValue(report.ended), value => {
    const fact = decoder(Schema.Struct({ $: Schema.Literal("StopScenario.Ended"), finish: Schema.Unknown, continuation: Schema.Boolean }))(value);
    return { finish: decodeStopFinish(fact.finish), continuation: fact.continuation };
  });
  return { handled: handled.handled, actions: handled.actions, ended,
    fitAttempt: optionalWire(decodeSharedValue(report.fit_attempt), readNat), output: optionalWire(decodeSharedValue(report.output), decodeOutputCapture) };
};
