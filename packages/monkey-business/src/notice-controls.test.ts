import { expect, it } from "vitest";
import { encodeNoticeScope, validateNoticeControl, validateNoticeExercise } from "./notice-controls.ts";

const target = { partition: 1, group: 7, key: 900000 };
it("captures explicit diagnostics with exact immutable scope", () => {
  const control = validateNoticeControl({ kind: "noticeFailure", target, diagnostic: "capacity" });
  expect(control).toEqual({ kind: "noticeFailure", target, diagnostic: "capacity" });
  expect(Object.isFrozen(control)).toBe(true);
  if (control.kind !== "noticeFailure") throw new Error("wrong decoded control");
  expect(Object.isFrozen(control.target)).toBe(true);
  expect(control.target).not.toBe(target);
});
it("rejects fabricated notice/finding vocabulary, excess fields and invalid ownership", () => {
  for (const value of [
    { kind: "noticeFailure", target, diagnostic: "finding" },
    { kind: "noticeFailure", target, diagnostic: "backend", outcome: "finding" },
    { kind: "noticeLease", target: { ...target, partition: 0 } },
    { kind: "noticeAcknowledge", target: { ...target, lifetime: 1 } },
  ]) expect(() => validateNoticeControl(value)).toThrow(TypeError);
});
it("bounds collection facts before traversing them", () => {
  const collect = { kind: "noticeCollect", partition: 1, group: 7, composed: false, authorityBound: true, allowed: [900000] };
  const decoded = validateNoticeControl(collect);
  collect.allowed.push(900001);
  expect(decoded).toEqual({ ...collect, allowed: [900000] });
  expect(() => validateNoticeControl({ ...collect, allowed: Array(2049).fill(1) })).toThrow(TypeError);
  expect(() => validateNoticeControl({ ...collect, allowed: [2 ** 48] })).toThrow(TypeError);
});
it("keeps fixture maxima synthetic and rejects derived timestamp overflow", () => {
  const exercise = { ...target, maximumKeys: 1, reservationBytes: 128, cooldownMs: 60000, startAt: 0 };
  expect(encodeNoticeScope(exercise)).toEqual({ $: "NoticeScenario.Scope", partition: 1, group: 7,
    key: 900000, maximum_keys: 1, reservation_bytes: 128, cooldown: 60000, maximum_count: 2 ** 48 - 1 });
  expect(() => validateNoticeExercise({ ...exercise, maximumKeys: 65 })).toThrow(TypeError);
  expect(() => validateNoticeExercise({ ...exercise, startAt: 2 ** 48 - 10 })).toThrow(TypeError);
  expect(() => validateNoticeExercise({ ...exercise, key: 2 ** 48 - 1 })).toThrow(TypeError);
});
