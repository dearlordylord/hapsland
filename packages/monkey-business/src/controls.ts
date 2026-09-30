import { validateSizeFacts } from "./sizes.ts";
import type { JevRequestOutcome } from "../../../src/canonical/adapter.ts";
import type { SessionControl } from "./session.ts";
export type LiveControl = SessionControl | { readonly kind: "jevProfile"; readonly delayMs: number; readonly outcome?: JevRequestOutcome };
/** Bounds protect finite synthetic workload; they are not empirical Jev limits. */
export const validateLiveControl = (control: LiveControl): LiveControl => {
  if (!control || typeof control !== "object") throw new TypeError("invalid live control");
  const bounded = (value: number, name: string, minimum: number, maximum: number): void => {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RangeError(`${name} must be an integer in [${minimum}, ${maximum}]`);
  };
  switch (control.kind) {
    case "sizes":
      validateSizeFacts({ sourceBytes: 0, evidenceTreeBytes: 0, encodedOutputBytes: 0,
        reservationBytes: control.reservationBytes, reviewUnitBytes: control.reviewUnitBytes });
      break;
    case "editPace": bounded(control.intervalMs, "intervalMs", 1, 1_000_000_000); break;
    case "burst": bounded(control.count, "count", 1, 1024); break;
    case "suspendArrivals": if (typeof control.suspended !== "boolean") throw new TypeError("suspended must be boolean"); break;
    case "jevProfile":
      bounded(control.delayMs, "delayMs", 0, 1_000_000_000);
      if (control.outcome !== undefined && !["neverSent", "finding", "clear", "backendFailure", "timeout", "interrupted"].includes(control.outcome)) throw new RangeError("invalid Jev outcome");
      break;
    default: throw new TypeError("unsupported live control");
  }
  return structuredClone(control);
};
