import { expect, it } from "vitest";
import { decodeDriverEvent } from "./driver-codec.ts";
const member = (state: unknown) => ({ $: "Canonical.ReuseMemberCheck", joined_state: state,
 stale_unavailable: false, has_revision: true, has_advice_id: true });
it.each(["Pending","Clear","Finding","Unavailable"])("decodes exact joined %s facts immutably", state => {
 const event = decodeDriverEvent(member({ $: `Reuse.Joined${state}` }));
 expect(event).toEqual({ kind: "reuseMemberCheck", state: state.toLowerCase(), staleUnavailable:false,hasRevision:true,hasAdviceId:true });
 expect(Object.isFrozen(event)).toBe(true);
 expect(()=>decodeDriverEvent(member({ $: `Reuse.Joined${state}`, extra: 1 }))).toThrow();
});
it("rejects unknown joined tags and malformed whole events",()=>{
 expect(()=>decodeDriverEvent(member({ $: "Reuse.toString" }))).toThrow();
 expect(()=>decodeDriverEvent({ ...member({ $: "Reuse.JoinedFinding" }), has_revision: 1 })).toThrow();
 expect(()=>decodeDriverEvent({ $: "Canonical.StartReview", partition:1,lifetime:1,round:1,operation:0 })).toThrow();
});

const quietFacts = { $: "Quiescence.Facts", native_work_idle: true, advice_empty: false, handoff_idle: true, stop_absent: false };
const quietTick = (facts: unknown) => ({ $: "Canonical.QuietRoundTick", partition: 1, lifetime: 2, round: 3, now: 10, window: 5, facts });
it("decodes complete quiet ownership facts without changing scope or clock", () => {
 const event = decodeDriverEvent(quietTick(quietFacts));
 expect(event).toEqual({ kind: "quietRoundTick", partition: 1, lifetime: 2, round: 3, now: 10, window: 5,
  facts: { nativeWorkIdle: true, adviceEmpty: false, handoffIdle: true, stopAbsent: false } });
 expect(Object.isFrozen(event)).toBe(true);
 if (event.kind !== "quietRoundTick") throw new Error("wrong event");
 expect(Object.isFrozen(event.facts)).toBe(true);
 for (const field of ["native_work_idle", "advice_empty", "handoff_idle", "stop_absent"]) {
  const missing: Record<string,unknown> = { ...quietFacts }; delete missing[field];
  expect(() => decodeDriverEvent(quietTick(missing))).toThrow();
  expect(() => decodeDriverEvent(quietTick({ ...quietFacts, [field]: 1 }))).toThrow();
 }
 expect(() => decodeDriverEvent(quietTick({ ...quietFacts, extra: 1 }))).toThrow();
 expect(() => decodeDriverEvent(quietTick({ ...quietFacts, $: "Admission.ProspectiveFacts" }))).toThrow();
});
it("keeps permit facts distinct from quiet facts and validates the complete permit shape", () => {
 const facts = { $: "Admission.ProspectiveFacts", clock_valid: true, hook_window: 10, started_upper: 0, now_lower: 0,
  advicee_permit_limit: 2, resident_permit_limit: 4 };
 const permit = (facts: unknown) => ({ $: "Canonical.IssuePermit", partition: 1, lifetime: 1, tool: 7, started: 0,
  deadline: 10, now: 0, minimum_started: 0, facts });
 expect(decodeDriverEvent(permit(facts))).toEqual({ kind: "issuePermit", partition: 1, lifetime: 1, tool: 7, started: 0,
  deadline: 10, now: 0, minimumStarted: 0, facts: { clockValid: true, hookWindow: 10, startedUpper: 0, nowLower: 0,
   adviceePermitLimit: 2, residentPermitLimit: 4 } });
 expect(() => decodeDriverEvent(permit(quietFacts))).toThrow();
 expect(() => decodeDriverEvent(permit({ ...facts, extra: 1 }))).toThrow();
 expect(() => decodeDriverEvent(quietTick(facts))).toThrow();
 for (const field of ["clock_valid", "hook_window", "started_upper", "now_lower", "advicee_permit_limit", "resident_permit_limit"]) {
  const missing: Record<string,unknown> = { ...facts }; delete missing[field];
  expect(() => decodeDriverEvent(permit(missing))).toThrow();
 }
 expect(() => decodeDriverEvent(permit({ ...facts, clock_valid: 1 }))).toThrow();
 expect(() => decodeDriverEvent(permit({ ...facts, hook_window: -1 }))).toThrow();
 expect(() => decodeDriverEvent({ ...quietTick(quietFacts), $: "Canonical.CompleteObservation" })).toThrow();
});

it("decodes complete original Finish reservation facts and rejects malformed boundaries", () => {
 const wire = { $: "Canonical.FinishReserve", group: 7, lifetime: 2, round: 3, attempt: 4, token: 5,
  selected: { $: "Con", head: 11, tail: { $: "Con", head: 13, tail: { $: "Nil" } } },
  has_notice: true, pass_notices: false, can_write: true, binding_valid: false, deadline_reached: true };
 const event = decodeDriverEvent(wire);
 expect(event).toEqual({ kind: "finishReserve", group: 7, lifetime: 2, round: 3, attempt: 4, token: 5,
  selected: [11,13], hasNotice: true, passNotices: false, canWrite: true, bindingValid: false, deadlineReached: true });
 expect(Object.isFrozen(event)).toBe(true);
 if (event.kind !== "finishReserve") throw new Error("wrong event");
 expect(Object.isFrozen(event.selected)).toBe(true);
 for (const field of ["has_notice", "pass_notices", "can_write", "binding_valid", "deadline_reached"]) {
  const missing: Record<string,unknown> = { ...wire }; delete missing[field];
  expect(() => decodeDriverEvent(missing)).toThrow();
  expect(() => decodeDriverEvent({ ...wire, [field]: 1 })).toThrow();
 }
 expect(() => decodeDriverEvent({ ...wire, extra: 1 })).toThrow();
 expect(() => decodeDriverEvent({ ...wire, group: 0 })).toThrow();
});
