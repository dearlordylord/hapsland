import { expect, it } from "vitest";
import Engine from "../../monkey-business-bend/engine.mjs";
import { readRecord } from "../../../src/canonical/boundary-schema.ts";

it("a refused external retirement cannot clear an internally issued owner's effect", () => {
  const initial = Engine.initial({ $: "Ledger.Limits", global_items: 32, global_bytes: 10000, partition_items: 16, partition_bytes: 5000 });
  const action = { $: "Con", head: { $: "Driver.Action", event: { $: "Canonical.RetireReview", partition: 1, lifetime: 1, round: 1, operation: 7 }, delay: 0, candidate: { $: "None" }, job: false, expiry_advice: { $: "None" } }, tail: { $: "Nil" } };
  const issued = Engine.issue_actions(initial, action);
  expect(readRecord(issued.actions).$).toBe("Con");
  const refused = Engine.step(issued.state, { $: "Canonical.RetireReview", partition: 2, lifetime: 99, round: 99, operation: 7 });
  expect(readRecord(refused.result).$).toBe("Canonical.Rejected");
  const repeated = Engine.issue_actions(refused.state, action);
  expect(readRecord(repeated.actions).$).toBe("Nil");
  expect(Engine.canonical(refused.state)).toEqual(Engine.canonical(issued.state));
});
