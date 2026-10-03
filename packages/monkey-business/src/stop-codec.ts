import SharedEngine from "../../monkey-business-bend/engine.mjs";
import { Schema } from "effect";
import { decoder, Nat, PositiveNat, readBendList } from "../../../src/canonical/boundary-schema.ts";
import { decodeDriverEvent } from "./driver-codec.ts";

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
