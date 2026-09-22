import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ResidentCleanupLimitation, stopScopedResident } from "../../scripts/first-review-resident-cleanup.mjs";

const roots: Array<string> = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const ownerFixture = () => {
  const stateRoot = mkdtempSync(join(tmpdir(), "first-review-resident-cleanup-"));
  roots.push(stateRoot);
  mkdirSync(join(stateRoot, "resident"), { mode: 0o700 });
  writeFileSync(join(stateRoot, "resident", "owner.json"), JSON.stringify({
    pid: 41_000,
    lifetime: "original-resident-lifetime",
  }), { mode: 0o600 });
  return stateRoot;
};

describe("first-review scoped resident cleanup", () => {
  it("does not signal a recycled pid whose endpoint lifetime differs from the stale owner", async () => {
    const stateRoot = ownerFixture();
    const signals: Array<readonly [number, NodeJS.Signals | 0]> = [];
    await expect(stopScopedResident(stateRoot, {
      probe: async () => ({ pid: 41_000, lifetime: "replacement-process-lifetime" }),
      signal: (pid, signal) => { signals.push([pid, signal]); },
    })).rejects.toBeInstanceOf(ResidentCleanupLimitation);
    expect(signals).toEqual([]);
  });

  it("does not signal when the scoped endpoint cannot verify the owner identity", async () => {
    const stateRoot = ownerFixture();
    let signals = 0;
    await expect(stopScopedResident(stateRoot, {
      probe: async () => { throw new Error("endpoint unavailable"); },
      signal: () => { signals += 1; },
    })).rejects.toThrow("no process was signaled");
    expect(signals).toBe(0);
  });
});
