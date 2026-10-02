import { readRecord, readNat, readBool, readBendList } from "../../../src/canonical/boundary-schema.ts";
import type { CanonicalEvent, JevRequestOutcome } from "../../../src/canonical/adapter.ts";

export type DriverCandidate = { partition: number; advice: number; round: number; token: number; surface: "edit" | "background" | "stop"; selection?: boolean };
export type DriverAction = { event: CanonicalEvent; delay: number; candidate?: DriverCandidate; job: boolean; expiryAdvice?: number };
const outcomeTags: Record<JevRequestOutcome, string> = { neverSent: "NeverSent", finding: "RequestFinding", clear: "RequestClear", backendFailure: "RequestBackendFailure", timeout: "RequestTimeout", interrupted: "RequestInterrupted" };
export const encodeDriverOutcome = (outcome: JevRequestOutcome): unknown => ({ $: `Canonical.${outcomeTags[outcome]}` });
const names: Record<string, string> = { current_work: "currentWork", root_valid: "rootValid", configuration_valid: "configurationValid", credential_ready: "credentialReady", physical_available: "physicalAvailable", credential_generation: "credentialGeneration", credential_authorized: "credentialAuthorized", work_current: "workCurrent", owner_current: "ownerCurrent", has_findings: "hasFindings", joined_pending: "joinedPending", authorize_now: "authorizeNow", any_expired: "anyExpired", stop_collector: "stopCollector", same_group: "sameGroup" };
export const decodeDriverEvent = (value: unknown): CanonicalEvent => {
  const event = readRecord(value);
  if (typeof event.$ !== "string" || !event.$.startsWith("Canonical.")) throw new TypeError("invalid driver event");
  const result: Record<string, unknown> = { kind: event.$.slice(10).replace(/^./, c => c.toLowerCase()) };
  for (const [key, item] of Object.entries(event)) {
    if (key === "$") continue;
    if (key === "outcome") {
      const tag = readRecord(item).$;
      const entry = Object.entries(outcomeTags).find(([, name]) => tag === `Canonical.${name}`);
      if (!entry) throw new TypeError("invalid driver outcome");
      result[key] = entry[0];
    } else if (key === "surface") result[key] = surface(item);
    else if (["fingerprints", "units", "unit_bytes"].includes(key)) result[key === "unit_bytes" ? "unitBytes" : key] = readBendList(item, readNat, 1024);
    else result[names[key] ?? key] = typeof item === "boolean" ? readBool(item) : readNat(item);
  }
  return result as CanonicalEvent;
};
const surface = (value: unknown): DriverCandidate["surface"] => {
  switch (readRecord(value).$) {
    case "Handoff.Edit": return "edit";
    case "Handoff.Background": return "background";
    case "Handoff.Stop": return "stop";
    default: throw new TypeError("invalid driver surface");
  }
};
export const decodeDriver = (value: unknown): { handled: boolean; actions: DriverAction[] } => {
  const result = readRecord(value);
  const actions = readBendList(result.actions, value => {
    const action = readRecord(value);
    const option = readRecord(action.candidate);
    const candidate = option.$ === "Some" ? readRecord(option.value) : undefined;
    const expiry = readRecord(action.expiry_advice);
    return { event: decodeDriverEvent(action.event), delay: readNat(action.delay), job: readBool(action.job),
      ...(expiry.$ === "Some" ? { expiryAdvice: readNat(expiry.value) } : {}),
      ...(candidate ? { candidate: { partition: readNat(candidate.partition), advice: readNat(candidate.advice), round: readNat(candidate.round), token: readNat(candidate.token), surface: surface(candidate.surface), selection: readBool(candidate.selection) } } : {}) };
  }, 1024);
  return { handled: readBool(result.handled), actions };
};
