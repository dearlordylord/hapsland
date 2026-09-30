import { describe, expect, it } from "vitest";
import {
  DEFAULT_OUTCOME_WEIGHTS, JEV_OUTCOME_ORDER, SeededOutcomeSampler,
  normalizeOutcomeWeights, validateOutcomeWeights, type OutcomeWeights,
} from "./outcomes.ts";
import { SessionGenerator } from "./session.ts";
import { createRun, replayRun, restoreReplay, type Run } from "./index.ts";

const weights = (changes: Partial<OutcomeWeights> = {}): OutcomeWeights => ({
  neverSent: 0, finding: 0, clear: 0, backendFailure: 0, timeout: 0, interrupted: 0,
  ...changes,
});

const settled = (run: Run) => run.observations.flatMap(frame =>
  frame.event.kind === "jevRequestSettled" ? [frame.event.outcome] : []);
const inputs = Array.from({ length: 16 }, (_, index) => ({
  kind: "edit" as const, at: index * 50, bytes: 10, unitBytes: [5],
}));

describe("public weighted request profile", () => {
  it("defaults to seeded 50/50 and matches single stepping and endpoint replay", () => {
    const run = createRun({ seed: 7, inputs });
    run.advance({ maxEvents: 1000 });
    expect(settled(run)).toEqual(draws(new SeededOutcomeSampler(7)));
    const stepped = createRun({ seed: 7, inputs });
    while (stepped.step());
    expect(stepped.observations).toEqual(run.observations);
    expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations);
    expect(run.exportReplay().outcomeSampling.order).toEqual(JEV_OUTCOME_ORDER);
  });
  it("changes only future request outcomes and replays weight controls exactly", () => {
    const run = createRun({ seed: 7, inputs: inputs.slice(0, 2), jevDelay: 100,
      outcomeWeights: weights({ clear: 100 }) });
    while (!run.observations.some(frame => frame.commands.some(command => command.kind === "jevRequestIssued"))) run.step();
    run.applyControl({ kind: "jevProfile", delayMs: 100, outcomeWeights: weights({ backendFailure: 100 }) });
    run.advance({ maxEvents: 1000 });
    expect(settled(run)).toEqual(["clear", "backendFailure"]);
    const replay = replayRun(run.exportReplay());
    replay.advance({ maxEvents: run.eventCount });
    expect(replay.observations).toEqual(run.observations);
    expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations);
  });
  it("keeps explicit profiles and per-edit overrides selectable without consuming mixed draws", () => {
    const fixed = createRun({ seed: 7, inputs, outcome: "timeout" });
    fixed.advance({ maxEvents: 1000 });
    expect(settled(fixed)).toEqual(Array(16).fill("timeout"));
    const mixed = createRun({ seed: 7, inputs: [
      { ...inputs[0]!, outcome: "neverSent" }, ...inputs.slice(1),
    ] });
    mixed.advance({ maxEvents: 1000 });
    expect(settled(mixed)).toEqual(["neverSent", ...draws(new SeededOutcomeSampler(7), DEFAULT_OUTCOME_WEIGHTS, 15)]);
  });
  it("rejects invalid config and controls before altering replay or sampling state", () => {
    expect(() => createRun({ outcomeWeights: weights() })).toThrow("At least one");
    expect(() => createRun({ outcome: "clear", outcomeWeights: DEFAULT_OUTCOME_WEIGHTS } as never)).toThrow("choose explicit");
    const run = createRun({ seed: 7, inputs });
    const before = run.exportReplay();
    expect(() => run.applyControl({ kind: "jevProfile", delayMs: 1, outcomeWeights: weights() })).toThrow("At least one");
    expect(run.exportReplay()).toEqual(before);
    run.advance({ maxEvents: 1000 });
    expect(settled(run)).toEqual(draws(new SeededOutcomeSampler(7)));
  });
  it("snapshots supplied weights so caller mutation cannot change outcomes or replay", () => {
    const profile = { ...weights({ clear: 100 }) };
    const run = createRun({ inputs: inputs.slice(0, 2), outcomeWeights: profile });
    profile.clear = 0;
    profile.finding = 100;
    while (!run.observations.some(frame => frame.commands.some(command => command.kind === "jevRequestIssued"))) run.step();
    const live = { ...weights({ interrupted: 100 }) };
    run.applyControl({ kind: "jevProfile", delayMs: 5, outcomeWeights: live });
    live.interrupted = 0;
    live.finding = 100;
    run.advance({ maxEvents: 1000 });
    expect(settled(run)).toEqual(["clear", "interrupted"]);
    expect(run.exportReplay().config.outcomeWeights).toEqual(weights({ clear: 100 }));
    expect(restoreReplay(run.exportReplay()).observations).toEqual(run.observations);
  });
});
const draws = (sampler: SeededOutcomeSampler, profile = DEFAULT_OUTCOME_WEIGHTS, count = 16) =>
  Array.from({ length: count }, () => sampler.sample(profile));

describe("synthetic outcome weights", () => {
  it("normalizes default and scaled profiles into the same bounded probabilities", () => {
    expect(normalizeOutcomeWeights(DEFAULT_OUTCOME_WEIGHTS)).toEqual(weights({ finding: .5, clear: .5 }));
    const a = normalizeOutcomeWeights(weights({ finding: 10, clear: 20, timeout: 30 }));
    const b = normalizeOutcomeWeights(weights({ finding: 30, clear: 60, timeout: 90 }));
    expect(a).toEqual(b);
    expect(JEV_OUTCOME_ORDER.reduce((sum, outcome) => sum + a[outcome], 0)).toBeCloseTo(1, 15);
    expect(Object.values(a).every(value => value >= 0 && value <= 1)).toBe(true);
  });
  it("accepts fractional weights and preserves exact zeros", () => {
    expect(normalizeOutcomeWeights(weights({ interrupted: .125 }))).toEqual(weights({ interrupted: 1 }));
    expect(normalizeOutcomeWeights(weights({ finding: Number.MIN_VALUE }))).toEqual(weights({ finding: 1 }));
  });
  it("rejects all-zero, missing, nonfinite, negative, and out-of-range weights", () => {
    expect(() => validateOutcomeWeights(weights())).toThrow("At least one");
    for (const value of [-1, 100.01, NaN, Infinity, -Infinity])
      expect(() => validateOutcomeWeights(weights({ clear: value }))).toThrow("clear weight");
    expect(() => validateOutcomeWeights({ finding: 50 } as OutcomeWeights)).toThrow("neverSent weight");
    expect(() => validateOutcomeWeights(null as unknown as OutcomeWeights)).toThrow("must be an object");
    expect(() => validateOutcomeWeights([] as unknown as OutcomeWeights)).toThrow("must be an object");
    expect(() => validateOutcomeWeights({ ...DEFAULT_OUTCOME_WEIGHTS, unknown: 1 } as OutcomeWeights)).toThrow("Unknown Jev outcome");
  });
  it("returns an independent validated snapshot", () => {
    const profile = { ...DEFAULT_OUTCOME_WEIGHTS };
    const validated = validateOutcomeWeights(profile);
    profile.finding = 0;
    expect(validated.finding).toBe(50);
  });
});

describe("dedicated seeded outcome stream", () => {
  it("pins seed derivation, sampling order, and random algorithm with a known sequence", () => {
    expect(draws(new SeededOutcomeSampler(7))).toEqual([
      "clear", "finding", "finding", "finding", "clear", "finding", "finding", "finding",
      "finding", "finding", "clear", "finding", "finding", "finding", "clear", "clear",
    ]);
    expect(draws(new SeededOutcomeSampler(7))).toEqual(draws(new SeededOutcomeSampler(7)));
    expect(draws(new SeededOutcomeSampler(8))).not.toEqual(draws(new SeededOutcomeSampler(7)));
  });
  it("never samples zero-weight outcomes and supports every fixed outcome", () => {
    for (const outcome of JEV_OUTCOME_ORDER)
      expect(draws(new SeededOutcomeSampler(7), weights({ [outcome]: 100 }), 100)).toEqual(Array(100).fill(outcome));
    expect(new Set(draws(new SeededOutcomeSampler(7), DEFAULT_OUTCOME_WEIGHTS, 1000))).toEqual(new Set(["finding", "clear"]));
  });
  it("does not advance its random stream on a rejected profile", () => {
    const sampler = new SeededOutcomeSampler(7);
    expect(() => sampler.sample(weights())).toThrow("At least one");
    expect(draws(sampler)).toEqual(draws(new SeededOutcomeSampler(7)));
  });
  it("keeps outcome and edit-timing randomness independent", () => {
    const session = new SessionGenerator({ seed: 7 });
    const baseline = new SessionGenerator({ seed: 7 });
    const sampler = new SeededOutcomeSampler(7);
    for (let step = 0; step < 20; step++) {
      draws(sampler);
      expect(session.next(step * 100)).toEqual(baseline.next(step * 100));
    }
    expect(draws(new SeededOutcomeSampler(7))).toEqual(draws(new SeededOutcomeSampler(7)));
  });
  it("validates seeds and retains high bits of supported run seeds", () => {
    for (const seed of [-1, .5, NaN, Infinity, 2 ** 48])
      expect(() => new SeededOutcomeSampler(seed)).toThrow("outcome seed");
    expect(draws(new SeededOutcomeSampler(7 + 2 ** 32))).not.toEqual(draws(new SeededOutcomeSampler(7)));
    expect(draws(new SeededOutcomeSampler(0))).toHaveLength(16);
  });
});
