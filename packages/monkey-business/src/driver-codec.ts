import { encodeCanonicalEvent } from "../../../src/canonical/canonical-boundary.ts";
import { CanonicalEventSchema } from "../../../src/canonical/models.ts";
import { decodeCanonicalConstructor } from "../../../src/canonical/constructors.ts";
import { freezeCanonicalData } from "../../../src/canonical/immutable.ts";
import { readRecord, readNat, readBool, readBendList, decoder, Word } from "../../../src/canonical/boundary-schema.ts";
import type { CanonicalEvent, JevRequestOutcome } from "../../../src/canonical/adapter.ts";

export type DriverCandidate = { partition: number; advice: number; round: number; token: number; surface: "edit" | "background" | "stop"; selection?: boolean };
export type DriverAction = { event: CanonicalEvent; delay: number; candidate?: DriverCandidate; job: boolean; expiryAdvice?: number };
const outcomeTags: Record<JevRequestOutcome, string> = { neverSent: "NeverSent", finding: "RequestFinding", clear: "RequestClear", backendFailure: "RequestBackendFailure", timeout: "RequestTimeout", interrupted: "RequestInterrupted" };
export const encodeDriverOutcome = (outcome: JevRequestOutcome): unknown => ({ $: `Canonical.${outcomeTags[outcome]}` });
const readEvent = decoder(CanonicalEventSchema);
const names: Record<string, string> = { extra_pending: "extraPending", has_notice: "hasNotice", pass_notices: "passNotices", can_write: "canWrite", binding_valid: "bindingValid", entry_limit: "entryLimit", byte_limit: "byteLimit", live_advice: "liveAdvice", stale_unavailable: "staleUnavailable", has_revision: "hasRevision", has_advice_id: "hasAdviceId", add_member: "addMember", maximum_keys: "maximumKeys", max_count: "maxCount", authority_bound: "authorityBound", lease_expired: "leaseExpired", pending_expired: "pendingExpired", cooldown_expired: "cooldownExpired", current_work: "currentWork", root_valid: "rootValid", configuration_valid: "configurationValid", credential_ready: "credentialReady", credential_valid: "credentialValid", admitted_block: "admittedBlock", current_block: "currentBlock", physical_available: "physicalAvailable", credential_generation: "credentialGeneration", credential_authorized: "credentialAuthorized", work_current: "workCurrent", owner_current: "ownerCurrent", has_findings: "hasFindings", joined_pending: "joinedPending", authorize_now: "authorizeNow", any_expired: "anyExpired", stop_collector: "stopCollector", same_group: "sameGroup" };
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
      const quiet = event.$ === "Canonical.QuietRoundTick";
      if (!quiet && event.$ !== "Canonical.IssuePermit") throw new TypeError("invalid driver facts event");
      const expectedTag = quiet ? "Quiescence.Facts" : "Admission.ProspectiveFacts";
      const fields = quiet ? ["$", "native_work_idle", "advice_empty", "handoff_idle", "stop_absent"]
        : ["$", "clock_valid", "hook_window", "started_upper", "now_lower", "advicee_permit_limit", "resident_permit_limit"];
      const keys = Object.keys(facts);
      if (facts.$ !== expectedTag || keys.length !== fields.length || keys.some(key => !fields.includes(key)))
        throw new TypeError("invalid driver facts shape");
      if (quiet) {
        result[key] = { nativeWorkIdle: readBool(facts.native_work_idle), adviceEmpty: readBool(facts.advice_empty),
          handoffIdle: readBool(facts.handoff_idle), stopAbsent: readBool(facts.stop_absent) };
      } else {
        result[key] = { clockValid: readBool(facts.clock_valid), hookWindow: readNat(facts.hook_window),
          startedUpper: readNat(facts.started_upper), nowLower: readNat(facts.now_lower),
          adviceePermitLimit: readNat(facts.advicee_permit_limit), residentPermitLimit: readNat(facts.resident_permit_limit) };
      }
    } else if (key === "scopes" && ["Canonical.StopGroupPolled", "Canonical.StopGroupEnded"].includes(event.$)) {
      result.scopes = readBendList(item, value => {
        const scope = decodeCanonicalConstructor(value, "Canonical.StopScope");
        return { partition: readNat(scope.partition), round: readNat(scope.round) };
      }, 1024);
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

export const encodeDriverAction = (value: DriverAction): unknown => {
  const action = readRecord(value);
  for (const key of Object.keys(action)) if (!["event","delay","job","candidate","expiryAdvice"].includes(key)) throw new TypeError("unexpected Driver action field");
  const candidate = value.candidate;
  if (candidate) for (const key of Object.keys(candidate)) if (!["partition","advice","round","token","surface","selection"].includes(key)) throw new TypeError("unexpected Driver candidate field");
  const surfaces = { edit: "Edit", background: "Background", stop: "Stop" };
  if (candidate && !Object.hasOwn(surfaces,candidate.surface)) throw new TypeError("invalid Driver candidate surface");
  return { $: "Driver.Action", event: encodeCanonicalEvent(readEvent(value.event)), delay: readNat(value.delay), job: readBool(value.job),
    candidate: candidate ? { $: "Some", value: { $: "Driver.Candidate", partition: readNat(candidate.partition), advice: readNat(candidate.advice), round: readNat(candidate.round), token: readNat(candidate.token), surface: { $: `Handoff.${surfaces[candidate.surface]}` }, selection: readBool(candidate.selection ?? false) } } : { $: "None" },
    expiry_advice: value.expiryAdvice === undefined ? { $: "None" } : { $: "Some", value: readNat(value.expiryAdvice) } };
};

export const decodeDriverOutcome = (value: unknown): JevRequestOutcome => {
  const tag = readRecord(value).$;
  const outcome = Object.entries(outcomeTags).find(([,name]) => tag === `Canonical.${name}`)?.[0];
  if (outcome === undefined) throw new TypeError("invalid Driver outcome");
  decodeCanonicalConstructor(value, String(tag));
  return outcome as JevRequestOutcome;
};

const exactDriverRecord = (value: unknown, tag: string, fields: readonly string[]) => {
  const record = readRecord(value);
  const keys = ["$",...fields];
  if (record.$ !== tag || Object.keys(record).length !== keys.length || keys.some(key => !Object.hasOwn(record,key))) throw new TypeError(`invalid ${tag} fields`);
  return record;
};
const driverMaybe = (value: unknown, validate: (value: unknown) => void): void => {
  const option = readRecord(value);
  if (option.$ === "None") exactDriverRecord(value,"None",[]);
  else { const some = exactDriverRecord(value,"Some",["value"]); validate(some.value); }
};
export const validateDriverSourceJob = (value: unknown): void => {
  const job = exactDriverRecord(value,"Driver.SourceJob",["partition","lifetime","bytes","units","outcome"]);
  readNat(job.partition); readNat(job.lifetime); readNat(job.bytes);
  readBendList(job.units,readNat,1024); driverMaybe(job.outcome,decodeDriverOutcome);
};
export const decodePreparedDriverContext = (contextValue: unknown, receiptValue: unknown) => {
  const context = exactDriverRecord(contextValue,"Driver.Context",["partition","lifetime","round","bytes","job","jev_delay","outcome","current_work","credential_ready","credential_generation","source_readable","advice_lifetime","candidate","automatic_collection","automatic_review","automatic_output","output_certain","output_delay","output_lease","background","automatic_dispatch"]);
  for (const field of ["partition","lifetime","round","bytes","jev_delay","advice_lifetime","output_delay","output_lease"]) readNat(context[field]);
  for (const field of ["job","current_work","credential_ready","credential_generation","source_readable","automatic_collection","automatic_review","automatic_output","output_certain","background","automatic_dispatch"]) readBool(context[field]);
  driverMaybe(context.outcome,decodeDriverOutcome);
  driverMaybe(context.candidate,value => {
    const candidate = exactDriverRecord(value,"Driver.Candidate",["partition","advice","round","token","surface","selection"]);
    for (const field of ["partition","advice","round","token"]) readNat(candidate[field]);
    readBool(candidate.selection); const tag=readRecord(candidate.surface).$;
    if (tag !== "Handoff.Edit" && tag !== "Handoff.Background" && tag !== "Handoff.Stop") throw new TypeError("invalid Driver candidate surface");
    exactDriverRecord(candidate.surface,tag,[]);
  });
  driverMaybe(receiptValue,value => {
    const receipt = exactDriverRecord(value,"Driver.OutcomeReceipt",["partition","lifetime","round","operation","request","outcome","source","job","stream_before","stream_after"]);
    for (const field of ["partition","lifetime","round","operation","request"]) readNat(receipt[field]);
    decodeDriverOutcome(receipt.outcome); driverMaybe(receipt.job,validateDriverSourceJob);
    const source=readRecord(receipt.source).$;
    if (source !== "Driver.EditForced" && source !== "Driver.RunForced" && source !== "Driver.Sampled") throw new TypeError("invalid Driver outcome source");
    exactDriverRecord(receipt.source,source,[]);
    driverMaybe(receipt.stream_before,decoder(Word)); driverMaybe(receipt.stream_after,decoder(Word));
  });
  return freezeCanonicalData({context,receipt:receiptValue});
};
