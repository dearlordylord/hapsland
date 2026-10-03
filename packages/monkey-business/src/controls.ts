import { validateGraphLimits, type GraphLimits } from "../../../src/canonical/graph-adapter.ts";
import { validateJevIntervention, type JevInterventionControl } from "./jev-interventions.ts";
import { validateFileTreeProfile, type FileTreeProfile } from "./file-trees.ts";
import { validateOutcomeWeights, type OutcomeWeights } from "./outcomes.ts";
import { validateSizeFacts } from "./sizes.ts";
import type { JevRequestOutcome } from "../../../src/canonical/adapter.ts";
import type { SessionControl } from "./session.ts";
import { validateAdviceeLifecycle, type AdviceeLifecycleControl } from "./advicee-lifecycle.ts";
import { validatePermitControl, type PermitControl } from "./permit-controls.ts";
export type EnvironmentProfile = { readonly currentWork: boolean; readonly credentialReady: boolean; readonly credentialGeneration?: number; readonly sourceReadable?: boolean };
export type OutputProfile = { readonly outcome: "certain" | "uncertain" | "failed"; readonly delayMs: number; readonly leaseMs: number };
export type OutcomeChoice =
  | { readonly outcome: JevRequestOutcome; readonly outcomeWeights?: never }
  | { readonly outcome?: never; readonly outcomeWeights?: OutcomeWeights };
export type LiveControl = AdviceeLifecycleControl | PermitControl | { readonly kind: "graphLimits"; readonly limits: GraphLimits } | JevInterventionControl | { readonly kind: "editDuration"; readonly durationMs: number } | { readonly kind: "fileTrees"; readonly profile: FileTreeProfile } | SessionControl | ({ readonly kind: "environment" } & EnvironmentProfile) | ({ readonly kind: "outputProfile" } & OutputProfile) | ({ readonly kind: "jevProfile"; readonly delayMs: number } & OutcomeChoice);
/** Bounds protect finite synthetic workload; they are not empirical Jev limits. */
export const validateLiveControl = (control: LiveControl): LiveControl => {
  if (!control || typeof control !== "object") throw new TypeError("invalid live control");
  const bounded = (value: number, name: string, minimum: number, maximum: number): void => {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RangeError(`${name} must be an integer in [${minimum}, ${maximum}]`);
  };
  switch (control.kind) {
    case "adviceeLifecycle": return validateAdviceeLifecycle(control);
    case "editPermitLimits":
    case "permitProfile": return validatePermitControl(control);
    case "graphLimits": validateGraphLimits(control.limits); break;
    case "jevRequest":
    case "credentials": return validateJevIntervention(control);
    case "fileTrees": validateFileTreeProfile(control.profile); break;
    case "environment":
      if (typeof control.currentWork !== "boolean" || typeof control.credentialReady !== "boolean") throw new TypeError("environment facts must be boolean");
      if (control.credentialGeneration !== undefined) bounded(control.credentialGeneration, "credentialGeneration", 1, 1_000_000_000);
      if (control.sourceReadable !== undefined && typeof control.sourceReadable !== "boolean") throw new TypeError("sourceReadable must be boolean");
      break;
    case "outputProfile":
      if (!["certain", "uncertain", "failed"].includes(control.outcome)) throw new RangeError("invalid output outcome");
      bounded(control.delayMs, "output delayMs", 0, 1_000_000_000);
      bounded(control.leaseMs, "output leaseMs", 1, 1_000_000_000);
      break;
    case "sizes":
      validateSizeFacts({ sourceBytes: 0, evidenceTreeBytes: 0, encodedOutputBytes: 0,
        reservationBytes: control.reservationBytes, reviewUnitBytes: control.reviewUnitBytes });
      break;
    case "editDuration": bounded(control.durationMs, "durationMs", 0, 1_000_000_000); break;
    case "editPace": bounded(control.intervalMs, "intervalMs", 1, 1_000_000_000); break;
    case "burst": bounded(control.count, "count", 1, 1024); break;
    case "suspendArrivals": if (typeof control.suspended !== "boolean") throw new TypeError("suspended must be boolean"); break;
    case "jevProfile":
      bounded(control.delayMs, "delayMs", 0, 1_000_000_000);
      if (control.outcome !== undefined && control.outcomeWeights !== undefined) throw new TypeError("choose explicit outcome or outcome weights");
      if (control.outcomeWeights !== undefined) validateOutcomeWeights(control.outcomeWeights);
      if (control.outcome !== undefined && !["neverSent", "finding", "clear", "backendFailure", "timeout", "interrupted"].includes(control.outcome)) throw new RangeError("invalid Jev outcome");
      break;
    default: throw new TypeError("unsupported live control");
  }
  return structuredClone(control);
};
