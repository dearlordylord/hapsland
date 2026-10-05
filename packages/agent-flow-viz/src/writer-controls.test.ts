import { expect, it } from "vitest";
import { writerAction } from "./writer-controls";
it("keeps original writer facts and refuses caller-chosen response IDs", () => {
  const control = { kind: "backgroundWriter", action: "claim", agent: "a", capture: {
    target: { partition: 1, lifetime: 2, round: 3, token: 7 }, claimStarted: 10, claimLifetimeMs: 20, capacity: 2,
    response: { partition: 1, lifetime: 2, round: 3, started: 10, deadline: 30, admittedBlock: false } } };
  expect(writerAction(`writer:${encodeURIComponent(JSON.stringify(control))}`)).toEqual(control);
  expect(writerAction("response:unrelated")).toBeUndefined();
  expect(() => writerAction(`writer:${encodeURIComponent(JSON.stringify({ ...control,
    capture: { ...control.capture, response: { ...control.capture.response, id: 41 } } }))}`)).toThrow();
});
it("retains the exact token/lifetime/round for release and retry", () => {
  const control = { kind: "backgroundWriter", action: "attempt", agent: "a", currentBlock: false,
    target: { partition: 1, lifetime: 2, round: 3, token: 7 } };
  expect(writerAction(`writer:${encodeURIComponent(JSON.stringify(control))}`)).toEqual(control);
  expect(() => writerAction(`writer:${encodeURIComponent(JSON.stringify({ ...control,
    target: { ...control.target, lifetime: 0 } }))}`)).toThrow();
});
