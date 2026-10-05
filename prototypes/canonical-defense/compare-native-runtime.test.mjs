import assert from "node:assert/strict";
import { test } from "node:test";
import { compareCanonicalOwner, compareNativeRuntime } from "./compare-native-runtime.mjs";

const owner = canonical => ({ $: "Types.State", canonical });
test("public contract permits different private scheduler and scenario representation", () => {
  compareCanonicalOwner({ ...owner({ round: 7 }), scheduler: { private: "native" }, scenarios: { capsule: 1 } },
    { ...owner({ round: 7 }), scheduler: { private: "public" }, scenarios: { capsule: 2 } }, "campaign 0 tick 1");
});
test("public contract refuses a changed Canonical owner", () => {
  assert.throws(() => compareCanonicalOwner(owner({ round: 7 }), owner({ round: 8 }), "campaign 0 tick 1"),
    /campaign 0 tick 1 complete Canonical state/);
});
test("public contract still refuses changed observable queue order", () => {
  const runtime = { valid: true, core: { $: "Con", head: owner({ round: 7 }), tail: { $: "Nil" } },
    environment: {}, next: 4 };
  assert.throws(() => compareNativeRuntime(runtime, { engine: owner({ round: 7 }), order: 5 }, "campaign 0 item 4"),
    /campaign 0 item 4 next queue order/);
});
