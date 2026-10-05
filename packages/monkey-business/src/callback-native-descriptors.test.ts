import { expect, it } from "vitest";
import { decodeNativePrefixWithDescriptors } from "./callback-native-prefix.ts";

const registry = {
  samples: { kind: "list", element: "sample", representation: "plain" },
  sample: { kind: "record", fields: [["id", "nat"], ["label", "string"], ["status", "status"]] },
  status: { kind: "adt", constructors: [
    { tag: "Idle", fields: [] },
    { tag: "Ready", fields: [["accepted", "bool"]] },
  ] },
};

it("decodes an independent custom record vector without losing Unicode or constructor fields", () => {
  // Two records: maximum u48 ID with NUL+emoji, then ID 7 with an empty label.
  const words = [2, 281474976710655, 2, 0, 0x1f600, 1, 1, 7, 0, 0];
  const expected = [
    { id: 281474976710655, label: "\0😀", status: { $: "Ready", accepted: true } },
    { id: 7, label: "", status: { $: "Idle" } },
  ];
  const decoded = decodeNativePrefixWithDescriptors(words, "samples", registry);
  expect(decoded).toEqual(expected);
  expect(JSON.parse(JSON.stringify(decoded))).toEqual(expected);
});

it("rejects malformed descriptor authority before decoding a payload", () => {
  expect(() => decodeNativePrefixWithDescriptors([], "root", {
    root: { kind: "record", fields: [["value", "missing"]] },
  })).toThrow("reference");
  expect(() => decodeNativePrefixWithDescriptors([1, 2], "root", {
    root: { kind: "record", fields: [["value", "nat"], ["value", "nat"]] },
  })).toThrow("field");
  expect(() => decodeNativePrefixWithDescriptors([], "root", {
    root: { kind: "record", fields: [["next", "child"]] },
    child: { kind: "record", fields: [["parent", "root"]] },
  })).toThrow("non-consuming");
  expect(() => decodeNativePrefixWithDescriptors([0], "absent", registry)).toThrow("root");
});

it("keeps custom roots subject to exact payload and scalar bounds", () => {
  expect(() => decodeNativePrefixWithDescriptors([1, 7], "samples", registry)).toThrow("truncated");
  expect(() => decodeNativePrefixWithDescriptors([0, 7], "samples", registry)).toThrow("trailing");
  expect(() => decodeNativePrefixWithDescriptors([1, 7, 0, 2], "samples", registry)).toThrow("constructor");
  expect(() => decodeNativePrefixWithDescriptors([1, 7, 0, 1, 2], "samples", registry)).toThrow("boolean");
  expect(() => decodeNativePrefixWithDescriptors([2049], "samples", registry)).toThrow("2048");
  expect(() => decodeNativePrefixWithDescriptors([1, 281474976710656], "samples", registry)).toThrow();
});

it("accepts consuming recursive lists while rejecting a truncated recursive child", () => {
  const tree = {
    node: { kind: "record", fields: [["value", "nat"], ["children", "nodes"]] },
    nodes: { kind: "list", element: "node", representation: "plain" },
  };
  expect(decodeNativePrefixWithDescriptors([9, 2, 10, 0, 11, 1, 12, 0], "node", tree)).toEqual({
    value: 9, children: [{ value: 10, children: [] }, { value: 11, children: [{ value: 12, children: [] }] }],
  });
  expect(() => decodeNativePrefixWithDescriptors([9, 1, 10], "node", tree)).toThrow("truncated");
});
