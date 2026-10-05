import { expect, it } from "vitest";
import { callbackAction } from "./callback-controls";
it("decodes completion delivery actions without changing original identity", () => {
  const control = { kind: "callback", action: "release", target: { owner: { partition: 2, lifetime: 3, round: 4, operation: 5 },
    effect: { kind: "preparationCompleted" }, originalOrder: 6 } };
  expect(callbackAction(`completion:${encodeURIComponent(JSON.stringify(control))}`)).toEqual(control);
  expect(callbackAction("jev-request:unrelated")).toBeUndefined();
  expect(() => callbackAction("completion:%broken")).toThrow();
  expect(() => callbackAction(`completion:${encodeURIComponent(JSON.stringify({ ...control, extra: true }))}`)).toThrow();
});
