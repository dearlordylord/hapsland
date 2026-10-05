import { expect, it } from "vitest";
import { encodeOutputCapture, decodeOutputCapture } from "./output-controls.ts";

it("freezes exact committed batch membership and issuance profile", () => {
  const input = { attempt: { kind: "finish", group: 1, round: 2, attempt: 3, token: 4, selected: [7, 9] },
    started: 5, profile: { outcome: "uncertain", delayMs: 10, leaseMs: 20 } };
  const capture = encodeOutputCapture(input);
  input.attempt.selected.push(11);
  input.profile.outcome = "certain";
  expect(capture).toMatchObject({ started: 5, outcome: { $: "OutputScenario.Uncertain" }, delay: 10,
    attempt: { selected: { $: "Con", head: 7, tail: { $: "Con", head: 9, tail: { $: "Nil" } } }, round: 2, token: 4 } });
  expect(Object.isFrozen(capture)).toBe(true);
  expect(Object.isFrozen(capture.attempt)).toBe(true);
});
it("rejects inexact targets, invalid members and publication overflow", () => {
  const input = { attempt: { kind: "individual", advice: 1, token: 2 }, started: 0,
    profile: { outcome: "certain", delayMs: 0, leaseMs: 1 } };
  expect(() => encodeOutputCapture({ ...input, extra: true })).toThrow();
  expect(() => encodeOutputCapture({ ...input, started: 2 ** 48 - 1 })).toThrow();
  for (const selected of [[], [1, 1], [0]]) expect(() => encodeOutputCapture({ ...input,
    attempt: { kind: "finish", group: 1, round: 1, attempt: 1, token: 1, selected } })).toThrow();
});

it("bounds complete ordered membership without changing the accepted sequence", () => {
 const selected = Array.from({ length: 2048 }, (_, index) => index + 1);
 const profile = { outcome: "certain", delayMs: 1, leaseMs: 2 };
 const attempt = { kind: "finish", group: 1, round: 1, attempt: 1, token: 1, selected };
 const capture = encodeOutputCapture({ attempt, started: 0, profile });
 expect(capture.attempt).toMatchObject({ selected: { $: "Con", head: 1 } });
 expect(() => encodeOutputCapture({ attempt: { ...attempt, selected: [...selected, 2049] }, started: 0, profile })).toThrow();
});


it("decodes exact complete owner captures and rejects foreign outcome payloads", () => {
  const capture = { attempt: { kind: "finish", group: 1, round: 2, attempt: 3, token: 4, selected: [9, 7] },
    started: 5, profile: { outcome: "certain", delayMs: 1, leaseMs: 10 } };
  const encoded = encodeOutputCapture(capture);
  expect(decodeOutputCapture(encoded)).toEqual(capture);
  expect(() => decodeOutputCapture({ ...encoded, extra: true })).toThrow();
  expect(() => decodeOutputCapture({ ...encoded, outcome: { $: "OutputScenario.Certain", extra: true } })).toThrow();
  expect(() => decodeOutputCapture({ ...encoded, attempt: { ...encoded.attempt, selected: { $: "Con", head: 7, tail: { $: "Con", head: 7, tail: { $: "Nil" } } } } })).toThrow();
});
