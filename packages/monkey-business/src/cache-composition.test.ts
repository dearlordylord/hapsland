import { afterEach, expect, it, vi } from "vitest";
import SharedEngine from "../../monkey-business-bend/engine.mjs";
import * as boundary from "../../../src/canonical/simulation-adapter.ts";
import { createRun, restoreReplay } from "./index.ts";

afterEach(() => vi.restoreAllMocks());

it("issues an authentic cache result once across retained states and retries a failed output decode atomically", () => {
  const begin = boundary.beginSharedCache;
  const apply = boundary.stepSharedCache;
  let issuanceChecked = false;
  let retryChecked = false;
  vi.spyOn(boundary, "beginSharedCache").mockImplementation((state, event) => {
    if (issuanceChecked || event.kind !== "jevRequestSettled") return begin(state, event);
    const retained = boundary.enqueueShared(state, 100, 999);
    const original = boundary.projectSharedCanonical(state);
    expect(() => begin(state, structuredClone(event))).toThrow(/cache result provenance/);
    expect(boundary.projectSharedCanonical(state)).toBe(original);
    const published = begin(state, event);
    expect(published.facts).toHaveLength(1);
    expect(() => begin(retained, event)).toThrow(/consumed actual cache result provenance/);
    issuanceChecked = true;
    return published;
  });
  vi.spyOn(boundary, "stepSharedCache").mockImplementation((state, capsule) => {
    if (retryChecked) return apply(state, capsule);
    const original = boundary.projectSharedCanonical(state);
    const queued = boundary.queuedShared(state);
    // Fail after the pure transition, before the bridge publishes decoded outputs.
    const failure = vi.spyOn(SharedEngine, "after").mockImplementationOnce(() => {
      throw new Error("injected cache output decode failure");
    });
    try {
      expect(() => apply(state, capsule)).toThrow("injected cache output decode failure");
      expect(boundary.projectSharedCanonical(state)).toBe(original);
      expect(boundary.queuedShared(state)).toEqual(queued);
    } finally {
      failure.mockRestore();
    }
    const published = apply(state, capsule);
    expect(published.cacheFacts).toHaveLength(1);
    expect(() => apply(state, capsule)).toThrow("foreign or consumed cache metadata fact");
    retryChecked = true;
    return published;
  });
  const run = createRun({
    seed: 7, inputs: [0, 10].map(at => ({ at, kind: "edit", bytes: 10, unitBytes: [5], evaluationInputs: ["same"] })),
    outcome: "clear", jevDelay: 2, lifecycles: { reuse: { entryLimit: 2, byteLimit: 100 } },
  });
  run.advance({ untilTime: 20, maxEvents: 1000 });
  expect(issuanceChecked).toBe(true);
  expect(retryChecked).toBe(true);
  expect(run.projection.global).toEqual({ items: 1, bytes: 5 });
  expect(run.projection.reuse.cache).toHaveLength(1);
  expect(run.observations.filter(frame => frame.commands.some(command => command.kind === "jevRequestIssued"))).toHaveLength(1);
  expect(run.observations.filter(frame => frame.commands.some(command => command.kind === "reuseCached"))).toHaveLength(1);
  vi.restoreAllMocks();
  expect(restoreReplay(JSON.parse(JSON.stringify(run.exportReplay()))).observe()).toEqual(run.observe());
});
