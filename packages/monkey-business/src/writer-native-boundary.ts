import { isDeepStrictEqual } from "node:util";
import { readBendList, readBool, readNat, readRecord } from "../../../src/canonical/boundary-schema.ts";
import { decodeTrustedCanonicalStep, projectTrustedCanonical } from "../../../src/canonical/canonical-boundary.ts";
import { freezeCanonicalData } from "../../../src/canonical/immutable.ts";
import { validateLiveControl } from "./controls.ts";
import { decodeCollectionResponseIdentity, validateCollectionResponseControl } from "./collection-scenario.ts";
import { decodeWriterPending, encodeWriterCapture, validateWriterControl } from "./writer-controls.ts";
import { decodePrefixCanonicalEvent } from "./callback-native-codec.ts";
import { decodeObservedFrame, decodeObservedState, stateEndpoint } from "./sharing-native-boundary.ts";
import type { CallbackTarget } from "./callback-controls.ts";

const list = (value: unknown) => readBendList(value, value => value, 2048);
function tagged(value: unknown, expected: string) {
  const record = readRecord(value);
  if (record.$ !== expected) throw new TypeError(`expected ${expected}`);
  return record;
}
function single(value: unknown) {
  const values = list(value);
  if (values.length !== 1) throw new TypeError("malformed writer singleton box");
  return values[0];
}
function optional(value: unknown): unknown | undefined {
  const record = readRecord(value);
  if (record.$ === "None") return undefined;
  if (record.$ !== "Some") throw new TypeError("malformed writer Maybe");
  return record.value;
}
function identity(value: unknown) {
  const raw = tagged(value, "CollectionScenario.Identity");
  return decodeCollectionResponseIdentity({ id: raw.id, partition: raw.partition, lifetime: raw.lifetime, round: raw.round });
}
function control(value: unknown) {
  const raw = readRecord(value);
  if (raw.$ === "writer_observed_driver.Claim") {
    const facts = tagged(raw.facts, "WriterScenario.ClaimFacts");
    const target = tagged(facts.target, "WriterScenario.Target"), response = tagged(facts.response, "CollectionScenario.Response");
    const result = validateWriterControl({ kind: "backgroundWriter", action: "claim", agent: raw.agent,
      capture: { target: { partition: target.partition, lifetime: target.lifetime, round: target.round, token: target.token },
        claimStarted: facts.claim_started, claimLifetimeMs: facts.claim_lifetime, capacity: facts.capacity,
        response: { partition: response.partition, lifetime: response.lifetime, round: response.round,
          started: response.started, deadline: response.deadline, admittedBlock: response.admitted_block } } });
    if (result.action !== "claim" || !isDeepStrictEqual(encodeWriterCapture(result.capture), facts))
      throw new TypeError("writer original claim facts differ");
    return result;
  }
  const names = { "writer_observed_driver.Attempt": "attempt", "writer_observed_driver.Release": "release",
    "writer_observed_driver.Expire": "expire" } as const;
  const action = names[raw.$ as keyof typeof names];
  if (!action) throw new TypeError("unknown writer original control");
  const target = tagged(raw.target, "WriterScenario.Target");
  return validateWriterControl({ kind: "backgroundWriter", action, agent: raw.agent,
    target: { partition: target.partition, lifetime: target.lifetime, round: target.round, token: target.token },
    ...(action === "attempt" ? { currentBlock: raw.blocked } : {}) });
}
function ownerReport(value: unknown) {
  const raw = tagged(value, "Engine.ResponseResult");
  const names = { "CollectionScenario.Applied": "applied", "CollectionScenario.Missing": "missing",
    "CollectionScenario.WrongScope": "wrongScope", "CollectionScenario.AlreadyAttempting": "alreadyAttempting",
    "CollectionScenario.IdentityExhausted": "identityExhausted", "CollectionScenario.ContextBound": "contextBound" } as const;
  const name = readRecord(raw.result).$;
  const result = names[name as keyof typeof names];
  if (!result) throw new TypeError("unknown writer owner report");
  const issued = optional(raw.issued);
  return { result, ...(issued === undefined ? {} : { issued: identity(issued) }) };
}
function report(value: unknown) {
  const raw = readRecord(value);
  if (raw.$ === "writer_observed_driver.Queued") return { result: "queued" as const };
  if (raw.$ === "writer_observed_driver.RefusedScope") return { result: "wrongScope" as const };
  if (raw.$ !== "writer_observed_driver.OwnerResult") throw new TypeError("unknown writer transport report");
  const target = optional(raw.target);
  return { ...ownerReport(raw.value), ...(target === undefined ? {} : { target: identity(target) }) };
}
function queued(state: Record<string, unknown>) {
  return list(tagged(state.scheduler, "Scheduler.State").queue).map(value => {
    const entry = tagged(value, "Scheduler.Entry");
    return { at: readNat(entry.at), order: readNat(entry.order) };
  });
}

/** The ONE prefix codec reconstructs the entire native owner DTO before this
 * public projection. Every Edge observation is retained through the shared
 * factual decoder; there is no event-kind filter or writer eligibility here. */
export function decodeWriterNativeBoundary(value: unknown) {
  const envelope = tagged(value, "writer_observed_wire.Envelope");
  const program = tagged(envelope.trace, "writer_observed_program.Trace");
  const trace = tagged(program.writer, "writer_observed_driver.Runtime");
  if (!readBool(trace.valid)) throw new TypeError("invalid writer factual transport");
  const frames: unknown[] = [], controls: unknown[] = [], reports: unknown[] = [], responseReports: unknown[] = [], boundaries: unknown[] = [];
  const receipts: CallbackTarget[] = [];
  const claims = new Map<number, { control: ReturnType<typeof control>; sequence: number; pending: unknown }>();
  let sequence = 0;
  for (const value of list(trace.frames)) {
    const frame = readRecord(value);
    if (frame.$ === "writer_observed_driver.Observed") frames.push(decodeObservedFrame(frame, receipts));
    else if (frame.$ === "writer_observed_driver.ControlFrame") {
      const original = control(frame.input), before = decodeObservedState(frame.before), after = decodeObservedState(frame.after);
      controls.push({ time: readNat(frame.time), control: original,
        before: projectTrustedCanonical(before.canonical), after: projectTrustedCanonical(after.canonical) });
      const pending = optional(frame.pending), order = optional(frame.order);
      if (pending !== undefined) {
        decodeWriterPending(pending);
        if (order === undefined || original.action !== "claim") throw new TypeError("missing original writer claim order");
        claims.set(readNat(order), { control: original, sequence, pending });
      }
      reports.push({ at: readNat(frame.time), controlSequence: sequence++, control: original, ...report(frame.report) });
    } else if (frame.$ === "writer_observed_driver.IntersectionFrame") {
      const before = decodeObservedState(frame.before), after = decodeObservedState(frame.after);
      const raw = readRecord(frame.input), response = optional(frame.response), member = optional(frame.member);
      let original;
      if (raw.$ === "writer_intersection_controls.OpenResponse") {
        const facts = tagged(raw.response, "CollectionScenario.Response");
        original = validateCollectionResponseControl({ kind: "collectionResponse", action: "open", agent: raw.agent,
          response: { partition: facts.partition, lifetime: facts.lifetime, round: facts.round,
            started: facts.started, deadline: facts.deadline, admittedBlock: facts.admitted_block } });
      } else if (["writer_intersection_controls.AttemptIssuedResponse", "writer_intersection_controls.AttemptIssuedResponseScope", "writer_intersection_controls.CloseIssuedResponse"].includes(String(raw.$))) {
        if (response === undefined) throw new TypeError("missing original issued response");
        readNat(raw.open_index);
        original = validateCollectionResponseControl({ kind: "collectionResponse", action: raw.$ === "writer_intersection_controls.CloseIssuedResponse" ? "close" : "attempt", agent: raw.agent,
          target: identity(response), ...(raw.$ === "writer_intersection_controls.CloseIssuedResponse" ? {} : { currentBlock: raw.blocked }) });
      } else if (raw.$ === "writer_intersection_controls.LeaveMember") {
        if (member === undefined) throw new TypeError("missing original member scope");
        readNat(raw.admission_index);
        const scope = tagged(member, "FreshnessScenario.Scope");
        if (typeof raw.agent !== "string") throw new TypeError("missing original member advicee");
        original = validateLiveControl({ kind: "sharingMember", action: "leave", agent: raw.agent,
          target: { partition: readNat(scope.partition), lifetime: readNat(scope.lifetime), round: readNat(scope.round), operation: readNat(scope.operation) } });
      } else if (raw.$ === "writer_intersection_controls.OutputProfile") {
        original = validateLiveControl({ kind: "outputProfile", outcome: "certain", delayMs: readNat(raw.delay), leaseMs: readNat(raw.lease) });
      } else throw new TypeError("unknown original writer intersection control");
      controls.push({ time: readNat(frame.time), control: original,
        before: projectTrustedCanonical(before.canonical), after: projectTrustedCanonical(after.canonical) });
      const result = optional(frame.result);
      if (original.kind === "collectionResponse") {
        if (result === undefined) throw new TypeError("missing original response control result");
        responseReports.push({ at: readNat(frame.time), controlSequence: sequence, control: original, ...ownerReport(result) });
      } else if (result !== undefined) throw new TypeError("unexpected response result for intersection control");
      for (const event of list(frame.events)) decodePrefixCanonicalEvent(event);
      readBool(frame.applied); sequence++;
    } else if (frame.$ === "writer_observed_driver.GrantFrame") {
      // Full originating event/result and original Pending are retained in the
      // raw DTO comparison; the public report retains the actual issued ID.
      const before = decodeObservedState(frame.before), after = decodeObservedState(frame.after);
      decodeWriterPending(frame.original); decodePrefixCanonicalEvent(frame.event);
      const result = decodeTrustedCanonicalStep(frame.result);
      if (!isDeepStrictEqual(projectTrustedCanonical(result.state), projectTrustedCanonical(after.canonical)))
        throw new TypeError("writer grant Canonical after differs");
      projectTrustedCanonical(before.canonical);
      const claim = claims.get(readNat(frame.order));
      if (!claim || !isDeepStrictEqual(claim.pending, frame.original)) throw new TypeError("writer grant lost original claim custody");
      claims.delete(readNat(frame.order));
      reports.push({ at: readNat(frame.time), controlSequence: claim.sequence, control: claim.control, ...ownerReport(frame.report) });
    } else if (frame.$ === "writer_observed_driver.LifecycleFrame") {
      const before = decodeObservedState(frame.before), after = decodeObservedState(frame.after);
      const actions = { "AdviceeLifecycle.Disconnect": "disconnect", "AdviceeLifecycle.Remove": "remove",
        "AdviceeLifecycle.Resume": "resume" } as const;
      const action = actions[readRecord(frame.action).$ as keyof typeof actions];
      if (!action || typeof frame.agent !== "string") throw new TypeError("invalid original writer lifecycle");
      controls.push({ time: readNat(frame.time), control: { kind: "adviceeLifecycle", agent: frame.agent, action },
        before: projectTrustedCanonical(before.canonical), after: projectTrustedCanonical(after.canonical) });
      sequence++;
    } else if (frame.$ === "writer_observed_driver.Boundary") {
      const state = decodeObservedState(frame.state);
      boundaries.push({ endpoint: readNat(frame.endpoint), budget: readNat(frame.budget), consumed: readNat(frame.consumed),
        state: stateEndpoint(state, receipts), queued: queued(state) });
    } else throw new TypeError("invalid writer trace frame");
  }
  const runtime = tagged(single(trace.runtime), "advicee_lifecycle_driver.Runtime");
  const finalState = decodeObservedState({ $: "Con", head: runtime.state, tail: { $: "Nil" } });
  if (readNat(trace.consumed) !== frames.length) throw new TypeError("writer observation budget accounting differs");
  return freezeCanonicalData({ frames, controls, reports, responseReports, sources: [], boundaries,
    endpoint: stateEndpoint(finalState, receipts), queued: queued(finalState), eventCount: readNat(trace.consumed) });
}
