import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

type BudgetState = {
  readonly version: 1;
  readonly root: string;
  readonly expiresAt: number;
  readonly sourceByteBudget: number;
  readonly providerCallBudget: number;
  readonly usedSourceBytes: number;
  readonly usedProviderCalls: number;
};

const decode = (value: unknown): BudgetState | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const item = value as Readonly<Record<string, unknown>>;
  const integers = [item.expiresAt, item.sourceByteBudget, item.providerCallBudget, item.usedSourceBytes, item.usedProviderCalls];
  if (item.version !== 1 || typeof item.root !== "string" || !item.root.startsWith("/") ||
      !integers.every((entry) => typeof entry === "number" && Number.isSafeInteger(entry) && entry >= 0)) return undefined;
  return item as BudgetState;
};

export const writeDemoBudget = (path: string, options: {
  readonly root: string;
  readonly expiresAt: number;
  readonly sourceByteBudget: number;
  readonly providerCallBudget: number;
}): void => {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify({
    version: 1,
    ...options,
    usedSourceBytes: 0,
    usedProviderCalls: 0,
  })}\n`, { mode: 0o600 });
};

/** Atomically reserves one paid call before provider dispatch. Contention fails closed. */
export const claimDemoBudget = (path: string, root: string, sourceBytes: number, now = Date.now()): void => {
  const lock = `${path}.lock`;
  mkdirSync(lock, { mode: 0o700 });
  try {
    const state = decode(JSON.parse(readFileSync(path, "utf8")));
    if (state === undefined || state.root !== root || now > state.expiresAt ||
        !Number.isSafeInteger(sourceBytes) || sourceBytes < 0 ||
        state.usedProviderCalls >= state.providerCallBudget ||
        state.usedSourceBytes + sourceBytes > state.sourceByteBudget) {
      throw new Error("demo provider budget is unavailable or exhausted");
    }
    const next: BudgetState = {
      ...state,
      usedSourceBytes: state.usedSourceBytes + sourceBytes,
      usedProviderCalls: state.usedProviderCalls + 1,
    };
    const temporary = `${path}.${process.pid}.tmp`;
    try {
      writeFileSync(temporary, `${JSON.stringify(next)}\n`, { mode: 0o600 });
      renameSync(temporary, path);
    } finally {
      rmSync(temporary, { force: true });
    }
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
};

export const readDemoBudgetUsage = (path: string): { readonly sourceBytes: number; readonly providerCalls: number } | undefined => {
  try {
    const state = decode(JSON.parse(readFileSync(path, "utf8")));
    return state === undefined ? undefined : { sourceBytes: state.usedSourceBytes, providerCalls: state.usedProviderCalls };
  } catch {
    return undefined;
  }
};

export * as DemoBudget from "./demo-budget.ts";
