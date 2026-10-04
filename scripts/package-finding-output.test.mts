import { expect, it } from "vitest";
import { nativeFindingsSubmittedOnce } from "./package-finding-output.mjs";

const address = "profile.ts :: Delivery";
const expected = [`${address}: Use an enum.`, `${address}: Use a branded value.`];
const advisory = (lines: string[]) => ({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: ["Hapsland", ...lines].join("\n") } });

it("accepts the expected findings once through either supported native envelope", () => {
  expect(nativeFindingsSubmittedOnce([{}, advisory(expected), {}], address, expected)).toBe(true);
  expect(nativeFindingsSubmittedOnce([{ decision: "block", reason: expected.join("\n") }], address, expected)).toBe(true);
});

it("rejects a complete submission followed by a partial duplicate on another surface", () => {
  expect(nativeFindingsSubmittedOnce([advisory(expected), { decision: "block", reason: expected[0] }], address, expected)).toBe(false);
});

it("rejects missing or repeated findings within a single native submission", () => {
  expect(nativeFindingsSubmittedOnce([advisory(expected.slice(0, 1))], address, expected)).toBe(false);
  expect(nativeFindingsSubmittedOnce([advisory([...expected, expected[0]!])], address, expected)).toBe(false);
});
