import SharedEngine from "../../monkey-business-bend/engine.mjs";
import { encodeSharedValue, decodeSharedValue } from "../../../src/canonical/simulation-codec.ts";
import { decodeDriver } from "./driver-codec.ts";
import { Schema } from "effect";
import { decoder, Nat, PositiveNat, readBendList } from "../../../src/canonical/boundary-schema.ts";

const Duration = Nat.check(Schema.isLessThanOrEqualTo(1_000_000_000));
export const OutputScenarioProfileSchema = Schema.Struct({
  outcome: Schema.Literals(["certain", "uncertain", "failed"]),
  delayMs: Duration,
  leaseMs: PositiveNat.check(Schema.isLessThanOrEqualTo(1_000_000_000)),
});
const Individual = Schema.Struct({ kind: Schema.Literal("individual"), advice: PositiveNat, token: PositiveNat });
const Finish = Schema.Struct({ kind: Schema.Literal("finish"), group: PositiveNat, round: PositiveNat,
  attempt: PositiveNat, token: PositiveNat, selected: Schema.Array(PositiveNat).check(Schema.isMaxLength(2048))
    .check(Schema.makeFilter(values => values.length > 0 && new Set(values).size === values.length)) });
export const OutputAttemptSchema = Schema.Union([Individual, Finish]);
export const OutputCaptureSchema = Schema.Struct({ attempt: OutputAttemptSchema, started: Nat,
  profile: OutputScenarioProfileSchema }).check(Schema.makeFilter(value => value.started + value.profile.delayMs < 2 ** 48
    && value.started + value.profile.leaseMs < 2 ** 48));
export type OutputCapture = typeof OutputCaptureSchema.Type;
const readCapture = decoder(OutputCaptureSchema);
export function validateOutputCapture(value: unknown): OutputCapture {
  const capture = readCapture(value);
  return Object.freeze({ ...capture, profile: Object.freeze({ ...capture.profile }),
    attempt: Object.freeze({ ...capture.attempt, ...(capture.attempt.kind === "finish"
      ? { selected: Object.freeze([...capture.attempt.selected]) } : {}) }) });
}
export type OutputAttemptReport = { readonly at: number; readonly controlSequence: number;
  readonly control: OutputAttemptControl; readonly result: "applied" | "missing" | "notQueued" };
const outcomes = { certain: "Certain", uncertain: "Uncertain", failed: "Failed" } as const;
export function encodeOutputCapture(value: unknown) {
  const capture = readCapture(value);
  const target = capture.attempt;
  const attempt = target.kind === "individual"
    ? Object.freeze({ $: "OutputScenario.Individual", advice: target.advice, token: target.token })
    : Object.freeze({ $: "OutputScenario.Finish", group: target.group, round: target.round,
      attempt: target.attempt, token: target.token, selected: target.selected.reduceRight<unknown>((tail, head) => Object.freeze({ $: "Con", head, tail }), Object.freeze({ $: "Nil" })) });
  return Object.freeze({ $: "OutputScenario.Capture", attempt, started: capture.started,
    outcome: Object.freeze({ $: `OutputScenario.${outcomes[capture.profile.outcome]}` }),
    delay: capture.profile.delayMs, lease: capture.profile.leaseMs });
}

// Explicit #182 dependency: its exact target schema/receipt owner is reused.
// Integrator extends that effect union for a single atomic Finish terminal.
import { CallbackTargetSchema } from "./callback-controls.ts";
// The central #182 exact target schema owns every stage, including expiry and
// one atomic finish completion. No parallel Finish target shape is maintained.
const IssuedOutputTarget=CallbackTargetSchema.check(Schema.makeFilter(target=>
 ["outputTerminal","outputExpiry","finishTerminal"].includes(target.effect.kind)));
// These are observed environment fault labels, not write-boundary proofs.
// A failed completion of an already-authorized MAY-have-reached attempt records
// Canonical uncertainty. Known pre-output failure remains a separate trusted
// release fact (advicing-target-contract.md:260–263,278–288), not this control.
export const OutputAttemptControlSchema = Schema.Struct({ kind: Schema.Literal("outputAttempt"),
  target: IssuedOutputTarget, outcome: OutputScenarioProfileSchema.fields.outcome });
export type OutputAttemptControl = typeof OutputAttemptControlSchema.Type;
const readAttemptControl = decoder(OutputAttemptControlSchema);
export function validateOutputAttemptControl(value: unknown): OutputAttemptControl {
  const control = readAttemptControl(value);
  return Object.freeze({ ...control, target: Object.freeze({ ...control.target,
    owner: Object.freeze(control.target.owner), effect: Object.freeze({ ...control.target.effect, ...(control.target.effect.kind === "finishTerminal"
      ? { selected: Object.freeze([...control.target.effect.selected]) } : {}) }) }) });
}


const RawOutcome = Schema.Union([
  Schema.Struct({ $: Schema.Literal("OutputScenario.Certain") }),
  Schema.Struct({ $: Schema.Literal("OutputScenario.Uncertain") }),
  Schema.Struct({ $: Schema.Literal("OutputScenario.Failed") }),
]);
const RawAttempt = Schema.Union([
  Schema.Struct({ $: Schema.Literal("OutputScenario.Individual"), advice: PositiveNat, token: PositiveNat }),
  Schema.Struct({ $: Schema.Literal("OutputScenario.Finish"), group: PositiveNat, round: PositiveNat,
    attempt: PositiveNat, token: PositiveNat, selected: Schema.Unknown }),
]);
const readRawCapture = decoder(Schema.Struct({ $: Schema.Literal("OutputScenario.Capture"), attempt: RawAttempt,
  started: Nat, outcome: RawOutcome, delay: Duration, lease: PositiveNat.check(Schema.isLessThanOrEqualTo(1_000_000_000)) }));
const readPositive = decoder(PositiveNat);
export function decodeOutputCapture(value: unknown): OutputCapture {
  const capture = readRawCapture(value);
  const target = capture.attempt;
  const attempt: OutputCapture["attempt"] = target.$ === "OutputScenario.Individual"
    ? { kind: "individual", advice: target.advice, token: target.token }
    : { kind: "finish", group: target.group, round: target.round, attempt: target.attempt, token: target.token,
      selected: readBendList(target.selected, readPositive, 2048) };
  return validateOutputCapture({ attempt, started: capture.started,
    profile: { outcome: capture.outcome.$ === "OutputScenario.Certain" ? "certain" : capture.outcome.$ === "OutputScenario.Uncertain" ? "uncertain" : "failed",
      delayMs: capture.delay, leaseMs: capture.lease } });
}
export type OutputAttemptObservation = { readonly target: typeof CallbackTargetSchema.Type; readonly capture: OutputCapture;
  readonly issuedAt: number; readonly dueAt: number; readonly scheduledOrder: number; readonly delivery: "scheduled" | "held" | "dropped" };

// Validate the complete returned action list before any host queue publication.
export function initialOutputActions(value: unknown, terminalOnly = false) {
  const capture = validateOutputCapture(value);
  const actions = SharedEngine.output_initial(encodeSharedValue(encodeOutputCapture(capture)), terminalOnly);
  return decodeDriver({ handled: true, actions: decodeSharedValue(actions) }).actions;
}
