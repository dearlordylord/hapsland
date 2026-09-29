import { describe, expect, it } from "vitest";
import { BendWorkTracker } from "./bend-work.ts";
import { CapacityLedger } from "./capacity.ts";

const limits = { globalItems: 8, globalBytes: 1000, partitionItems: 8, partitionBytes: 1000 };

describe("canonical work projection", () => {
  it("reads source stages from the shared ledger without advancing another state", () => {
    const ledger = new CapacityLedger(limits);
    const partitions = new Set(["agent"]);
    const view = new BendWorkTracker(ledger, partitions);
    const source = ledger.admitObservation("agent");
    expect(view.admit(source)).toBe(source);
    expect(view.startSource(source)).toBe(true);
    expect(view.unfinished()).toBe(1);
    expect(ledger.observation("agent", source, "startObservation")).toBe(true);
    expect(view.completeSource(source)).toBe(true);
    expect(ledger.observation("agent", source, "completeObservation")).toBe(true);
    expect(view.unfinished()).toBe(0);
    expect(view.pendingFindings()).toBe(0);
  });

  it("uses canonical review identities and pending finding counts", () => {
    const ledger = new CapacityLedger(limits);
    const view = new BendWorkTracker(ledger, new Set(["agent"]));
    const source = ledger.admitObservation("agent");
    ledger.observation("agent", source, "startObservation");
    const preparation = ledger.beginObservedPreparation("agent", source, 100)!;
    const unit = ledger.completePreparation("agent", preparation.operation, preparation.reservation, [20])[0]!;
    expect(view.spawn(source, unit.operation)).toBe(unit.operation);
    expect(view.startUnit(unit.operation)).toBe(true);
    expect(ledger.startReview("agent", unit.operation)).toBe(true);
    const ready = ledger.readyJevRequest("agent", unit.operation, unit.reservation, {
      rootValid: true, configurationValid: true, credentialReady: true,
      selected: true, currentWork: true, physicalAvailable: true,
    });
    expect(ready.status).toBe("issued");
    if (ready.status !== "issued") return;
    expect(ledger.startJevRequest("agent", unit.operation, ready.request)).toBe(true);
    expect(view.outcome(unit.operation, { $: "Finding" })).toBe(true);
    expect(ledger.settleJevRequest("agent", unit.operation, ready.request,
      unit.reservation, "finding", true)).toBe("retainFinding");
    expect(view.reviseFinding(unit.operation, 2, 20)).toBe(true);
    ledger.transition({ kind: "findingCountUpdated", partition: ledger.partitionId("agent"), lifetime: 1,
      round: ledger.roundId("agent"), operation: unit.operation, count: 2 });
    expect(view.pendingFor(unit.operation)).toBe(2);
    expect(view.pendingFindings()).toBe(2);
    expect(view.unfinished()).toBe(1);
  });
});
