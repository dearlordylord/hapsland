import { Schema } from "effect";
import Shared from "../../monkey-business-bend/engine.mjs";
import { decoder, Word } from "../../../src/canonical/boundary-schema.ts";

const Words = Schema.Struct({ $: Schema.Literal("Numeric.Words"), high: Word, low: Word });
const readWords = decoder(Words);
/** Numeric representation only: original raw IEEE64 bits enter the core. */
export const doubleWords = (value: number): typeof Words.Type => {
  if (!Number.isFinite(value) || value < 0 || value > 600) throw new RangeError("expected finite nonnegative simulator value <=600");
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, Object.is(value, -0) ? 0 : value, false);
  return { $: "Numeric.Words", high: view.getUint32(0, false), low: view.getUint32(4, false) };
};
const wordsDouble = (value: unknown): number => {
  const words = readWords(value);
  const view = new DataView(new ArrayBuffer(8));
  view.setUint32(0, words.high, false); view.setUint32(4, words.low, false);
  return view.getFloat64(0, false);
};
/** Private numeric codec seam for independent IEEE64 conformance. Production
 * operands are positive weights <=100, their totals <=600 and ratios <=1. */
export const numericAdd = (a: number, b: number): number => {
  if (a + b > 600) throw new RangeError("sum exceeds sampler numeric domain");
  return wordsDouble(Shared.numeric_add(doubleWords(a), doubleWords(b)));
};
export const numericDivide = (a: number, b: number): number => {
  if (b <= 0 || a > b) throw new RangeError("expected a positive total and ratio <=1");
  return wordsDouble(Shared.numeric_divide(doubleWords(a), doubleWords(b)));
};
