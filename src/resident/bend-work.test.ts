import { describe, expect, it } from "vitest";
import { BendWorkTracker } from "./bend-work.ts";
import { bendRoundBeginStop, bendRoundInitial } from "./bend-policy.generated.js";

describe("generated Bend work authority", () => {
  it("keeps source open during streaming fanout and settles review units independently", () => {
    const work = new BendWorkTracker();
    const source = work.admit();
    const first = work.spawn(source);
    const second = work.spawn(source);
    expect([first, second]).toEqual([1, 2]);
    expect(work.unfinished()).toBe(3);
    expect(work.outcome(first!, { $: "Finding", count: 1, bytes: 20 })).toBe(true);
    expect(work.unfinished()).toBe(2);
    expect(work.pendingFindings()).toBe(1);
    expect(work.pendingFor(first!)).toBe(1);
    expect(work.pendingFor(second!)).toBe(0);
    expect(work.completeSource(source)).toBe(true);
    expect(work.unfinished()).toBe(1);
    expect(work.outcome(second!, { $: "Clear" })).toBe(true);
    expect(work.unfinished()).toBe(0);
    expect(work.retire(first!)).toBe(true);
    expect(work.pendingFindings()).toBe(0);
    expect(work.pendingFor(first!)).toBe(0);
    expect(work.completeSource(source)).toBe(false);
  });

  it("records cached findings without inventing unfinished Jev work", () => {
    const work = new BendWorkTracker();
    const source = work.admit();
    const cached = work.cachedFinding(source, 2, 30);
    expect(cached).toBe(1);
    expect(work.unfinished()).toBe(1);
    expect(work.pendingFindings()).toBe(2);
    expect(work.reviseFinding(cached!, 1, 15)).toBe(true);
    expect(work.pendingFindings()).toBe(1);
    expect(work.reviseFinding(cached!, 0, 0)).toBe(false);
    expect(work.completeSource(source)).toBe(true);
    expect(work.unfinished()).toBe(0);
    expect(work.retire(cached!)).toBe(true);
    expect(work.pendingFindings()).toBe(0);
  });

  it("accepts actual dispatcher starts when its logical capacity projection queued the job", () => {
    const work = new BendWorkTracker();
    const sources = Array.from({ length: 4 }, () => work.admit());
    expect(work.startSource(sources[3]!)).toBe(true);
    const units = Array.from({ length: 4 }, () => work.spawn(sources[3]!));
    expect(units).toEqual([1, 2, 3, 4]);
    expect(work.startUnit(units[3]!)).toBe(true);
    expect(work.outcome(units[3]!, { $: "Finding", count: 1, bytes: 10 })).toBe(true);
    expect(work.pendingFindings()).toBe(1);
    expect(work.unfinished()).toBe(7);
  });

  it("interrupts abandoned work once and reports remaining work at close", () => {
    const work = new BendWorkTracker();
    const source = work.admit();
    const unit = work.spawn(source);
    expect(work.interruptUnit(unit!)).toBe(true);
    expect(work.interruptUnit(unit!)).toBe(false);
    expect(work.unfinished()).toBe(1);
    expect(work.close().cancelledSource).toEqual([source]);
    expect(work.unfinished()).toBe(0);
  });

  it("uses Bend cancellation IDs to cut off unfinished work while retaining findings", () => {
    const work = new BendWorkTracker();
    const source = work.admit();
    const first = work.spawn(source)!;
    const second = work.spawn(source)!;
    expect(work.startUnit(first)).toBe(true);
    expect(work.outcome(first, { $: "Finding", count: 1, bytes: 10 })).toBe(true);
    expect(work.cancelUnfinished()).toEqual({ cancelledSource: [source], cancelledJev: [second] });
    expect(work.unfinished()).toBe(0);
    expect(work.pendingFor(first)).toBe(1);
    expect(work.pendingFor(second)).toBe(0);
  });

  it("publishes the Stop decision fence and work cancellations in one Bend transition", () => {
    const work = new BendWorkTracker();
    const source = work.admit();
    const finding = work.spawn(source)!;
    const pending = work.spawn(source)!;
    expect(work.outcome(finding, { $: "Finding", count: 1, bytes: 10 })).toBe(true);
    const claimed = bendRoundBeginStop(bendRoundInitial(), 7);
    expect(claimed.$).toBe("Granted");
    if (claimed.$ !== "Granted") throw new Error("round claim failed");
    expect(work.cutoff(claimed.state, 8)).toBeUndefined();
    expect(work.unfinished()).toBe(2);
    const cutoff = work.cutoff(claimed.state, 7);
    expect(cutoff).toMatchObject({ cancelledSource: [source], cancelledJev: [pending],
      round: { deciding: true, stop_token: 7n } });
    expect(work.unfinished()).toBe(0);
    expect(work.pendingFor(finding)).toBe(1);
    expect(work.cutoff(cutoff!.round, 7)).toBeUndefined();
  });

  it("reserves final output only for exact pending finding units", () => {
    const work = new BendWorkTracker();
    const source = work.admit();
    const unit = work.spawn(source)!;
    expect(work.outcome(unit, { $: "Finding", count: 2, bytes: 20 })).toBe(true);
    expect(work.completeSource(source)).toBe(true);
    const claimed = bendRoundBeginStop(bendRoundInitial(), 7);
    if (claimed.$ !== "Granted") throw new Error("round claim failed");
    const cutoff = work.cutoff(claimed.state, 7);
    expect(cutoff).toBeDefined();
    expect(work.reserveSelected(cutoff!.round, 7, [])).toBeUndefined();
    expect(work.reserveSelected(cutoff!.round, 7, [unit, unit, unit])).toBeUndefined();
    expect(work.reserveSelected(cutoff!.round, 7, [unit + 1])).toBeUndefined();
    const reserved = work.reserveSelected(cutoff!.round, 7, [unit, unit]);
    expect(reserved).toMatchObject({ continuations: 1n, output_reserved: true });
    expect(work.reserveSelected(reserved!, 7, [unit])).toBeUndefined();
  });

  it("conserves unfinished work across interleaved source and review callbacks", () => {
    const work = new BendWorkTracker();
    const sources = Array.from({ length: 8 }, () => work.admit());
    let unfinished = sources.length;
    const units: number[] = [];
    for (const source of sources.toReversed()) {
      expect(work.startSource(source)).toBe(true);
      for (let index = 0; index < 4; index++) {
        const unit = work.spawn(source);
        expect(unit).toBeDefined();
        units.push(unit!);
        unfinished += 1;
      }
      expect(work.unfinished()).toBe(unfinished);
      expect(work.completeSource(source)).toBe(true);
      unfinished -= 1;
    }
    let findings = 0;
    for (const [index, unit] of units.toReversed().entries()) {
      expect(work.startUnit(unit)).toBe(true);
      if (index % 3 === 0) {
        expect(work.outcome(unit, { $: "Finding", count: 1, bytes: 10 })).toBe(true);
        findings += 1;
      } else if (index % 3 === 1) expect(work.outcome(unit, { $: "Clear" })).toBe(true);
      else expect(work.outcome(unit, { $: "Unavailable" })).toBe(true);
      unfinished -= 1;
      expect(work.unfinished()).toBe(unfinished);
      expect(work.pendingFindings()).toBe(findings);
    }
    expect(work.unfinished()).toBe(0);
  });
});
