import { expect, it } from "vitest";
import {
  canonicalize,
  digestComparison,
  digestValue,
  isComparisonDigestValid,
  makeComparison,
  stableStringify,
} from "./digest.ts";

it("canonicalizes nested values without losing array order or special scalar identities", () => {
  expect(stableStringify({ z: [2, 1], a: { y: undefined, x: NaN } })).toBe(
    '{"a":{"x":"NaN","y":{"$undefined":true}},"z":[2,1]}',
  );
  expect(canonicalize(null)).toBe(null);
  expect(canonicalize(true)).toBe(true);
  expect(canonicalize(7n)).toBe("7n");
  expect(canonicalize(Infinity)).toBe("Infinity");
  expect(canonicalize(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01-01T00:00:00.000Z");
  expect(canonicalize(Symbol.for("digest"))).toBe("Symbol(digest)");
  expect(digestValue({ a: 1, b: 2 })).toBe(digestValue({ b: 2, a: 1 }));
  expect(digestValue([1, 2])).not.toBe(digestValue([2, 1]));
});

it("keeps comparison digests independent of their digest field and absent optional keys", () => {
  const comparison = makeComparison({
    id: "exact",
    name: "same",
    relation: "exact",
    leftObservationId: "left",
    rightObservationId: "right",
    tolerance: 0,
  });
  expect(isComparisonDigestValid(comparison)).toBe(true);
  expect(digestComparison({ ...comparison, comparisonDigest: digestValue("other") })).toBe(comparison.comparisonDigest);
  expect(isComparisonDigestValid({ ...comparison, name: "changed" })).toBe(false);
  expect(isComparisonDigestValid({ ...comparison, tolerance: 0.1 })).toBe(false);
  const measured = makeComparison({
    id: "measured",
    name: "change",
    relation: "measured-change",
    leftObservationId: "left",
    rightObservationId: "right",
    ruleId: "noul/rule",
    direction: "increase",
    minimumDelta: 0.1,
    tolerance: 0,
  });
  expect(isComparisonDigestValid(measured)).toBe(true);
  expect(isComparisonDigestValid({ ...measured, minimumDelta: 0.2 })).toBe(false);
});
