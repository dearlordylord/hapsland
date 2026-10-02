import { expect, it } from "vitest";
import { DEFAULT_PERMIT_LIMITS, decodePermitFacts, encodePermitCapture, validatePermitControl, validatePermitLimits } from "./permit-controls.ts";

it("preserves production defaults and bounds without accepting additional settings", () => {
  expect(DEFAULT_PERMIT_LIMITS).toEqual({ perAdvicee: 32, resident: 4096 });
  expect(validatePermitLimits({})).toEqual(DEFAULT_PERMIT_LIMITS);
  expect(validatePermitLimits({ perAdvicee: 2 })).toEqual({ perAdvicee: 2, resident: 4096 });
  expect(() => validatePermitLimits({ resident: 4 })).toThrow(TypeError);
  expect(validatePermitLimits({ perAdvicee: 1, resident: 65536 })).toEqual({ perAdvicee: 1, resident: 65536 });
  for (const value of [{ perAdvicee: 0, resident: 4096 }, { perAdvicee: 1, resident: 65537 },
    { perAdvicee: 5, resident: 4 }, { perAdvicee: 1.5, resident: 4096 }, { perAdvicee: 1, resident: 2, slots: 8 }])
    expect(() => validatePermitLimits(value)).toThrow(TypeError);
});
it("captures PRE profile and rejects unknown or overflowing fields", () => {
  const limits = { perAdvicee: 16, resident: 64 };
  const input = { partition: 1, lifetime: 2, tool: 3, started: 4, deadline: 14, postDelay: 10, outcome: "success", limits };
  const captured = encodePermitCapture(input);
  limits.perAdvicee = 1;
  expect(captured).toMatchObject({ started: 4, deadline: 14, post_delay: 10, advicee_limit: 16, resident_limit: 64 });
  expect(() => encodePermitCapture({ ...input, started: 2 ** 48 - 1, deadline: 2 ** 48 - 1 })).toThrow(TypeError);
  expect(() => validatePermitControl({ kind: "permitProfile", profile: { outcome: "success", durationMs: 1, lifetimeMs: 2 }, slots: 8 })).toThrow(TypeError);
});
it("rejects cyclic and excessive emitted fact lists before event traversal", () => {
  const fact = { $: "PermitScenario.Fact", event: { $: "Canonical.ReleasePermit", partition: 1, lifetime: 1, token: 1 }, delay: 0, job: false };
  const cyclic: { $: string; head: unknown; tail?: unknown } = { $: "Con", head: fact }; cyclic.tail = cyclic;
  expect(() => decodePermitFacts(cyclic)).toThrow(TypeError);
  expect(() => decodePermitFacts({ $: "Nil", ignored: true })).toThrow(TypeError);
});
