import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { claimDemoBudget, initializeDemoBudget, readDemoBudgetUsage, writeDemoBudget } from "./demo-budget.ts";

const roots: Array<string> = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const fixture = () => {
  const directory = mkdtempSync(join(tmpdir(), "review-demo-budget-"));
  roots.push(directory);
  const path = join(directory, "budget.json");
  writeDemoBudget(path, {
    root: "/synthetic/repository",
    expiresAt: 1_000,
    sourceByteBudget: 100,
    providerCallBudget: 2,
  });
  return path;
};

describe("first-review live budget", () => {
  it("initializes a live authority once without replacing its usage", () => {
    const directory = mkdtempSync(join(tmpdir(), "review-demo-budget-exclusive-"));
    roots.push(directory);
    const path = join(directory, "budget.json");
    const options = {
      root: "/synthetic/repository",
      expiresAt: 1_000,
      sourceByteBudget: 100,
      providerCallBudget: 2,
    };
    initializeDemoBudget(path, options);
    claimDemoBudget(path, options.root, 40, 500);
    expect(() => initializeDemoBudget(path, options)).toThrow();
    expect(readDemoBudgetUsage(path)).toEqual({ sourceBytes: 40, providerCalls: 1 });
  });

  it("claims bounded source and provider calls atomically", () => {
    const path = fixture();
    claimDemoBudget(path, "/synthetic/repository", 40, 500);
    claimDemoBudget(path, "/synthetic/repository", 60, 500);
    expect(readDemoBudgetUsage(path)).toEqual({ sourceBytes: 100, providerCalls: 2 });
    expect(() => claimDemoBudget(path, "/synthetic/repository", 0, 500)).toThrow();
  });

  it("fails closed for another root, expired time, excess source, and contention", () => {
    const wrongRoot = fixture();
    expect(() => claimDemoBudget(wrongRoot, "/current/project", 1, 500)).toThrow();
    const expired = fixture();
    expect(() => claimDemoBudget(expired, "/synthetic/repository", 1, 1_001)).toThrow();
    const source = fixture();
    expect(() => claimDemoBudget(source, "/synthetic/repository", 101, 500)).toThrow();
    const contended = fixture();
    mkdirSync(`${contended}.lock`);
    expect(() => claimDemoBudget(contended, "/synthetic/repository", 1, 500)).toThrow();
  });
});
