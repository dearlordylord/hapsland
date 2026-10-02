import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { workView } from "./bend-work.ts";
import { makeCapacityLedger } from "./capacity.ts";

const limits = { globalItems: 8, globalBytes: 1000, partitionItems: 8, partitionBytes: 1000 };

describe("canonical work projection", () => {
  it("reads source stages from the shared ledger without advancing another state", () => {
    const ledger = makeCapacityLedger(limits);
    const round = Effect.runSync(ledger.roundId("agent"));
    const view = () => workView(Effect.runSync(ledger.canonicalProjection()), Effect.runSync(ledger.partitionId("agent")), round);
    const source = Effect.runSync(ledger.admitObservation("agent"));
    expect(view().admit(source)).toBe(source);
    expect(view().startSource(source)).toBe(true);
    expect(view().unfinished()).toBe(1);
    expect(Effect.runSync(ledger.observation("agent", source, "startObservation", round))).toBe(true);
    expect(view().completeSource(source)).toBe(true);
    expect(Effect.runSync(ledger.observation("agent", source, "completeObservation", round))).toBe(true);
    expect(view().unfinished()).toBe(0);
    expect(view().pendingFindings()).toBe(0);
  });

  it("keeps a retired round view separate from successor work on the same advicee", () => {
    const ledger = makeCapacityLedger(limits);
    const oldRound = Effect.runSync(ledger.roundId("agent"));
    const oldView = () => workView(Effect.runSync(ledger.canonicalProjection()), Effect.runSync(ledger.partitionId("agent")), oldRound);
    Effect.runSync(ledger.admitObservation("agent", oldRound));
    Effect.runSync(ledger.retireRound("agent", oldRound));
    const nextRound = Effect.runSync(ledger.roundId("agent"));
    const nextView = () => workView(Effect.runSync(ledger.canonicalProjection()), Effect.runSync(ledger.partitionId("agent")), nextRound);
    const source = Effect.runSync(ledger.admitObservation("agent", nextRound));
    expect(oldView().unfinished()).toBe(0);
    expect(oldView().startSource(source)).toBe(false);
    expect(nextView().unfinished()).toBe(1);
    Effect.runSync(ledger.observation("agent", source, "startObservation", nextRound));
    const preparation = Effect.runSync(ledger.beginObservedPreparation("agent", source, 100, nextRound))!;
    const unit = Effect.runSync(ledger.completePreparation("agent", preparation.operation,
      preparation.reservation, [20], nextRound))[0]!;
    Effect.runSync(ledger.completeReview("agent", unit.operation, unit.reservation, "finding", nextRound));
    expect(oldView().pendingFor(unit.operation)).toBe(0);
    expect(oldView().pendingFindings()).toBe(0);
    expect(nextView().pendingFindings()).toBe(1);
  });

  it("uses canonical review identities and pending finding counts", () => {
    const ledger = makeCapacityLedger(limits);
    const round = Effect.runSync(ledger.roundId("agent"));
    const view = () => workView(Effect.runSync(ledger.canonicalProjection()), Effect.runSync(ledger.partitionId("agent")), round);
    const source = Effect.runSync(ledger.admitObservation("agent"));
    Effect.runSync(ledger.observation("agent", source, "startObservation", round));
    const preparation = Effect.runSync(ledger.beginObservedPreparation("agent", source, 100, round))!;
    const unit = Effect.runSync(ledger.completePreparation("agent", preparation.operation, preparation.reservation, [20], round))[0]!;
    expect(view().spawn(source, unit.operation)).toBe(unit.operation);
    expect(view().startUnit(unit.operation)).toBe(true);
    expect(Effect.runSync(ledger.startReview("agent", unit.operation, round))).toBe(true);
    const ready = Effect.runSync(ledger.readyJevRequest("agent", unit.operation, unit.reservation, {
      rootValid: true, configurationValid: true, credentialReady: true,
      selected: true, currentWork: true, physicalAvailable: true,
    }, round));
    expect(ready.status).toBe("issued");
    if (ready.status !== "issued") return;
    expect(Effect.runSync(ledger.startJevRequest("agent", unit.operation, ready.request))).toBe(true);
    expect(view().outcome(unit.operation, { $: "Finding" })).toBe(true);
    expect(Effect.runSync(ledger.settleJevRequest("agent", unit.operation, ready.request,
      unit.reservation, "finding", true))).toBe("retainFinding");
    expect(view().reviseFinding(unit.operation, 2, 20)).toBe(true);
    ledger.transition({ kind: "findingCountUpdated", partition: Effect.runSync(ledger.partitionId("agent")), lifetime: 1,
      round: Effect.runSync(ledger.roundId("agent")), operation: unit.operation, count: 2 });
    expect(view().pendingFor(unit.operation)).toBe(2);
    expect(view().pendingFindings()).toBe(2);
    expect(view().unfinished()).toBe(1);
  });
});
