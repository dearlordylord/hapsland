import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DirectAdvicee } from "../direct-event/model.ts";

type Trace = {
  readonly version: 1;
  readonly sessionId: string;
  readonly at: number;
  readonly kind: "edit" | "delivery" | "terminal";
  readonly sourceHash: string;
  readonly ruleIds?: ReadonlyArray<string>;
  readonly state?: "clear" | "findings";
};

export const demoSourceHash = (root: string): string | undefined => {
  try {
    return createHash("sha256").update(readFileSync(join(root, "session.ts"))).digest("hex");
  } catch { return undefined; }
};

/** Best-effort source-free evidence scoped to the demo budget's owned root. */
export const recordDemoTrace = (budgetPath: string | null | undefined, root: string, advicee: DirectAdvicee, entry: {
  readonly kind: Trace["kind"];
  readonly sourceHash?: string;
  readonly ruleIds?: ReadonlyArray<string>;
  readonly state?: "clear" | "findings";
}): void => {
  if (budgetPath == null) return;
  try {
    const budget: unknown = JSON.parse(readFileSync(budgetPath, "utf8"));
    if (typeof budget !== "object" || budget === null || !("root" in budget) || budget.root !== root) return;
    const sourceHash = entry.kind === "terminal" ? entry.sourceHash : demoSourceHash(root);
    if (sourceHash === undefined || !/^[a-f0-9]{64}$/.test(sourceHash)) return;
    const directory = `${budgetPath}.trace`;
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const trace: Trace = { version: 1, sessionId: advicee.sessionId, at: Date.now(), kind: entry.kind,
      sourceHash, ...(entry.ruleIds === undefined ? {} : { ruleIds: entry.ruleIds.slice(0, 16) }),
      ...(entry.state === undefined ? {} : { state: entry.state }) };
    writeFileSync(join(directory, `${trace.at}.${randomUUID()}.json`), `${JSON.stringify(trace)}\n`, { mode: 0o600, flag: "wx" });
  } catch { /* Evidence may be incomplete; it must not alter a host edit. */ }
};

export const readDemoTrace = (budgetPath: string, sessionId: string): ReadonlyArray<Trace> => {
  try {
    return readdirSync(`${budgetPath}.trace`).flatMap((name) => {
      if (!name.endsWith(".json")) return [];
      try {
        const value: unknown = JSON.parse(readFileSync(join(`${budgetPath}.trace`, name), "utf8"));
        if (typeof value !== "object" || value === null) return [];
        const item = value as Partial<Trace>;
        return item.version === 1 && item.sessionId === sessionId &&
          typeof item.at === "number" && Number.isSafeInteger(item.at) &&
          (item.kind === "edit" || item.kind === "delivery" || item.kind === "terminal") &&
          typeof item.sourceHash === "string" && /^[a-f0-9]{64}$/.test(item.sourceHash) &&
          (item.ruleIds === undefined || (Array.isArray(item.ruleIds) && item.ruleIds.every((id) => typeof id === "string" && /^[a-z0-9_/-]{1,100}$/.test(id)))) &&
          (item.state === undefined || item.state === "clear" || item.state === "findings")
          ? [item as Trace] : [];
      } catch { return []; }
    }).sort((a, b) => a.at - b.at);
  } catch { return []; }
};
