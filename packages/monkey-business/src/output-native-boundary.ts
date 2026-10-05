import { isDeepStrictEqual } from "node:util";
import { readBendList, readNat, readRecord } from "../../../src/canonical/boundary-schema.ts";
import { projectTrustedCanonical } from "../../../src/canonical/canonical-boundary.ts";
import { freezeCanonicalData } from "../../../src/canonical/immutable.ts";
import { decodeCallbackTarget, encodeCallbackTarget } from "./callback-controls.ts";
import { callbackPublicBoundary, decodeCallbackNativeBoundary } from "./callback-native-codec.ts";
import { decodeNativePrefix } from "./callback-native-prefix.ts";
import { decodeOutputCapture, validateOutputAttemptControl } from "./output-controls.ts";
import type { CallbackReceipt, RunObservation } from "./index.ts";

function singleton(input: unknown): Record<string, unknown> {
  const values = readBendList(input, readRecord, 2);
  const value = values[0];
  if (values.length !== 1 || value === undefined) throw new TypeError("output native singleton transport invalid");
  return value;
}
function option(value: unknown): Record<string, unknown> | undefined {
  const record = readRecord(value);
  if (record.$ === "None" && Object.keys(record).length === 1) return undefined;
  if (record.$ === "Some" && Object.keys(record).length === 2) return readRecord(record.value);
  throw new TypeError("output native optional receipt invalid");
}
function originalReceipt(value: unknown): CallbackReceipt | null {
  const fact = option(value);
  if (!fact) return null;
  const capture = option(fact.completion);
  const action = readRecord(fact.action), dueAt = readNat(fact.at), delay = readNat(action.delay);
  if (delay > dueAt) throw new TypeError("output native issuance clock invalid");
  const outputCapture = capture ? decodeOutputCapture(capture) : undefined;
  return { target: decodeCallbackTarget(fact.target), dueAt,
    issuedAt: outputCapture?.started ?? dueAt - delay,
    ...(outputCapture ? { outputCapture } : {}) };
}
const outcomes: Readonly<Record<string, "certain" | "uncertain" | "failed">> = {
  "OutputScenario.Certain": "certain", "OutputScenario.Uncertain": "uncertain", "OutputScenario.Failed": "failed",
};
const results: Readonly<Record<string, "applied" | "missing" | "notQueued">> = {
  "Callbacks.Applied": "applied", "Callbacks.Missing": "missing", "Callbacks.NotQueued": "notQueued",
};
export function outputPublicBoundary(observation: RunObservation, controls: readonly unknown[]) {
  return freezeCanonicalData({ boundary: callbackPublicBoundary(observation, [], []), controls,
    receipts: observation.observations.map(frame => frame.callbackReceipt ?? null), attempts: observation.outputAttempts });
}

/** The one #188 descriptor reconstructs complete actual-owner DTOs. Production
 * Canonical/graph/control decoders then validate the comparison representation;
 * this projection neither registers native states nor decides applicability. */
export function decodeOutputNativeBoundary(words: unknown) {
  const envelope = singleton(decodeNativePrefix(words, "output_scenarios"));
  return readBendList(envelope.traces, value => {
    const trace = readRecord(value);
    if (trace.valid !== true) throw new TypeError("output native transport failed");
    const state = singleton(trace.endpoint), rawFrames: unknown[] = [], controls: unknown[] = [], receipts: Array<CallbackReceipt | null> = [];
    for (const input of readBendList(trace.frames, readRecord, 2048)) {
      if (input.$ === "output_scenario_driver.OutcomeControl") {
        const outcomeTag = readRecord(input.outcome).$, resultTag = readRecord(input.result).$;
        if (typeof outcomeTag !== "string" || !Object.hasOwn(outcomes, outcomeTag) || typeof resultTag !== "string" || !Object.hasOwn(results, resultTag)) throw new TypeError("output native control variant invalid");
        controls.push({ time: readNat(input.time), before: projectTrustedCanonical(singleton(input.before).canonical),
          after: projectTrustedCanonical(singleton(input.after).canonical),
          control: validateOutputAttemptControl({ kind: "outputAttempt", target: decodeCallbackTarget(input.target), outcome: outcomes[outcomeTag] }), result: results[resultTag] });
        continue;
      }
      if (input.$ !== "output_scenario_driver.Observed") throw new TypeError("output native unexpected frame");
      const frame = readRecord(input.frame), before = singleton(frame.before).canonical, after = singleton(frame.after).canonical;
      const receipt = originalReceipt(input.receipt);
      if (frame.$ === "advicee_lifecycle_driver.CanonicalFrame") {
        rawFrames.push({ kind: "canonical", time: readNat(frame.time), before, after, event: frame.event,
          result: singleton(frame.result), commandScopes: readBendList(input.command_scopes, value => {
            const scope = readRecord(value);
            if (scope.$ === "None") return null;
            if (scope.$ === "Some") return readNat(scope.value);
            throw new TypeError("output native command scope invalid");
          }, 2048), receipt: receipt ? encodeCallbackTarget(receipt.target) : null });
      } else if (frame.$ === "advicee_lifecycle_driver.GraphFrame") {
        const result = singleton(frame.result), step = readRecord(result.result);
        rawFrames.push({ kind: "graph", time: readNat(frame.time), before, after, key: frame.key,
          position: readNat(frame.position), event: frame.event,
          graph: { before: result.before, after: step.state, command: step.command } });
      } else throw new TypeError("output native unexpected shared frame");
      receipts.push(receipt);
    }
    const callbacks = readRecord(readRecord(state.scenarios).callbacks);
    const originals = readBendList(callbacks.originals, readRecord, 2048);
    const targets = originals.map(value => readRecord(value.fact).target);
    const attempts = originals.flatMap(original => {
      const fact = readRecord(original.fact), capture = option(fact.completion);
      if (!capture) return [];
      const decoded = decodeOutputCapture(capture), status = readRecord(original.status).$;
      const delivery = status === "Callbacks.Queued" ? "scheduled" : status === "Callbacks.Held" ? "held" : status === "Callbacks.Dropped" ? "dropped" : undefined;
      if (!delivery) throw new TypeError("output native original status invalid");
      return [{ target: decodeCallbackTarget(fact.target), issuedAt: decoded.started, dueAt: readNat(fact.at),
        capture: decoded, scheduledOrder: readNat(original.scheduled_order), delivery }];
    });
    for (const receipt of receipts) if (receipt && !targets.some(target => isDeepStrictEqual(decodeCallbackTarget(target), receipt.target))) {
      const original = rawFrames.find(value => {
        const frame = readRecord(value);
        return frame.kind === "canonical" && frame.receipt !== null && isDeepStrictEqual(decodeCallbackTarget(frame.receipt), receipt.target);
      });
      if (!original) throw new TypeError("output native receipt frame unavailable");
      targets.push(readRecord(original).receipt);
    }
    const boundary = decodeCallbackNativeBoundary([{ frames: rawFrames, endpoint: {
      time: readNat(readRecord(state.scheduler).now), projection: state.canonical, targets, lifecycles: state.lifecycles } }])[0];
    return freezeCanonicalData({ boundary, controls, receipts, attempts });
  }, 2048);
}
