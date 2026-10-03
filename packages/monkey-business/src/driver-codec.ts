import { CanonicalEventSchema } from "../../../src/canonical/models.ts";
import { decodeCanonicalConstructor } from "../../../src/canonical/constructors.ts";
import { freezeCanonicalData } from "../../../src/canonical/immutable.ts";
import { readRecord, readNat, readBool, readBendList, decoder } from "../../../src/canonical/boundary-schema.ts";
import type { CanonicalEvent, JevRequestOutcome } from "../../../src/canonical/adapter.ts";

export type DriverCandidate = { partition: number; advice: number; round: number; token: number; surface: "edit" | "background" | "stop"; selection?: boolean };
export type DriverAction = { event: CanonicalEvent; delay: number; candidate?: DriverCandidate; job: boolean; expiryAdvice?: number };
const outcomeTags: Record<JevRequestOutcome, string> = { neverSent: "NeverSent", finding: "RequestFinding", clear: "RequestClear", backendFailure: "RequestBackendFailure", timeout: "RequestTimeout", interrupted: "RequestInterrupted" };
export const encodeDriverOutcome = (outcome: JevRequestOutcome): unknown => ({ $: `Canonical.${outcomeTags[outcome]}` });
const readEvent = decoder(CanonicalEventSchema);
const names: Record<string, string> = { entry_limit: "entryLimit", byte_limit: "byteLimit", live_advice: "liveAdvice", stale_unavailable: "staleUnavailable", has_revision: "hasRevision", has_advice_id: "hasAdviceId", add_member: "addMember", maximum_keys: "maximumKeys", max_count: "maxCount", authority_bound: "authorityBound", lease_expired: "leaseExpired", pending_expired: "pendingExpired", cooldown_expired: "cooldownExpired", current_work: "currentWork", root_valid: "rootValid", configuration_valid: "configurationValid", credential_ready: "credentialReady", credential_valid: "credentialValid", admitted_block: "admittedBlock", current_block: "currentBlock", physical_available: "physicalAvailable", credential_generation: "credentialGeneration", credential_authorized: "credentialAuthorized", work_current: "workCurrent", owner_current: "ownerCurrent", has_findings: "hasFindings", joined_pending: "joinedPending", authorize_now: "authorizeNow", any_expired: "anyExpired", stop_collector: "stopCollector", same_group: "sameGroup" };
export const decodeDriverEvent = (value: unknown): CanonicalEvent => {
  const event = readRecord(value);
  if (typeof event.$ !== "string" || !event.$.startsWith("Canonical.")) throw new TypeError("invalid driver event");
  const result: Record<string, unknown> = { kind: event.$.slice(10).replace(/^./, c => c.toLowerCase()) };
  for (const [key, item] of Object.entries(event)) {
    if (key === "$") continue;
    if (key === "joined_state") {
      const tag = readRecord(item).$;
      const states: Record<string, string> = { "Reuse.JoinedPending": "pending", "Reuse.JoinedClear": "clear", "Reuse.JoinedFinding": "finding", "Reuse.JoinedUnavailable": "unavailable" };
      if (typeof tag !== "string" || !Object.hasOwn(states, tag)) throw new TypeError("invalid joined member state");
      decodeCanonicalConstructor(item, tag);
      result.state = states[tag];
    } else if (key === "outcome") {
      const tag = readRecord(item).$;
      if (event.$ === "Canonical.ReviewObserved") {
        if (tag !== "Canonical.Finding" && tag !== "Canonical.Clear") throw new TypeError("invalid logical review outcome");
        decodeCanonicalConstructor(item,tag);
        result[key] = tag === "Canonical.Finding" ? "finding" : "clear";
      } else {
        const entry = event.$ === "Canonical.FinishTerminal"
          ? Object.entries({ acknowledged: "Acknowledged", failed: "Failed", unknown: "Unknown" }).find(([, name]) => tag === `Canonical.${name}`)
          : Object.entries(outcomeTags).find(([, name]) => tag === `Canonical.${name}`);
        if (!entry) throw new TypeError("invalid driver outcome");
        result[key] = entry[0];
      }
    } else if (key === "remaining") {
      const remaining = readRecord(item);
      if (remaining.$ === "Some") result.remaining = readNat(remaining.value);
      else if (remaining.$ !== "None") throw new TypeError("invalid notice remaining clock");
    } else if (key === "purpose") {
      const purpose = readRecord(item).$;
      const purposes: Record<string,string> = { "Ledger.OperationalNotice": "operationalNotice", "Ledger.StoredResult": "storedResult", "Ledger.ObservationDispatch": "observationDispatch", "Ledger.Preparation": "preparation", "Ledger.ReviewUnit": "reviewUnit" };
      if (typeof purpose !== "string" || !Object.hasOwn(purposes,purpose)) throw new TypeError("invalid reservation purpose");
      decodeCanonicalConstructor(item,purpose);
      result.purpose = purposes[purpose];
    } else if (key === "facts") {
      const facts = readRecord(item);
      if (facts.$ !== "Admission.ProspectiveFacts") throw new TypeError("invalid driver permit facts");
      result[key] = { clockValid: readBool(facts.clock_valid), hookWindow: readNat(facts.hook_window),
        startedUpper: readNat(facts.started_upper), nowLower: readNat(facts.now_lower),
        adviceePermitLimit: readNat(facts.advicee_permit_limit), residentPermitLimit: readNat(facts.resident_permit_limit) };
    } else if (key === "minimum_started") result.minimumStarted = readNat(item);
    else if (key === "deadline_reached") result.deadlineReached = readBool(item);
    else if (key === "surface") result[key] = surface(item);
    else if ((["fingerprints", "units", "unit_bytes", "operations", "allowed"].includes(key) || (key === "selected" && ["Canonical.FinishReserve", "Canonical.FinishAuthorize", "Canonical.FinishTerminal"].includes(event.$)))) result[key === "unit_bytes" ? "unitBytes" : key] = readBendList(item, readNat, key === "selected" ? 2048 : 1024);
    else result[names[key] ?? key] = typeof item === "boolean" ? readBool(item) : readNat(item);
  }
  return freezeCanonicalData(readEvent(result));
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
