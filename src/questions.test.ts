import { expect, it } from "vitest";
import { band } from "./questions.ts";

it.each([
  [0, "clear"],
  [0.299999, "clear"],
  [0.3, "unclear"],
  [0.5, "unclear"],
  [0.7, "unclear"],
  [0.700001, "violation"],
  [1, "violation"],
] as const)("keeps the human-review boundary for probability %s", (probability, expected) => {
  expect(band(probability)).toBe(expected);
});
