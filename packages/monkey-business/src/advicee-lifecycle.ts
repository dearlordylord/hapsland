export type AdviceeLifecycleAction = "disconnect" | "remove" | "resume";
export type AdviceeLifecycleControl = {
  readonly kind: "adviceeLifecycle";
  readonly agent: string;
  readonly action: AdviceeLifecycleAction;
};
export type AdviceeLifecycleEntry = {
  readonly partition: number;
  readonly lifetime: number;
  readonly status: "active" | "departed" | "removed";
};

/** Syntax validation only. The shared owner decides target and applicability. */
export function validateAdviceeLifecycle(control: AdviceeLifecycleControl): AdviceeLifecycleControl {
  if (control?.kind !== "adviceeLifecycle" || typeof control.agent !== "string" || !control.agent.length
    || !["disconnect", "remove", "resume"].includes(control.action)) throw new TypeError("invalid advicee lifecycle action");
  return Object.freeze({ kind: "adviceeLifecycle", agent: control.agent, action: control.action });
}

export function encodeAdviceeLifecycle(action: AdviceeLifecycleAction): { readonly $: string } {
  switch (action) {
    case "disconnect": return { $: "AdviceeLifecycle.Disconnect" };
    case "remove": return { $: "AdviceeLifecycle.Remove" };
    case "resume": return { $: "AdviceeLifecycle.Resume" };
  }
}

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("invalid lifecycle constructor");
  return value as Record<string, unknown>;
};
const identity = (value: unknown): number => {
  if (typeof value === "bigint") {
    if (value < 1n || value >= 2n ** 48n) throw new RangeError("lifecycle identity outside u48");
    return Number(value);
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value >= 2 ** 48)
    throw new RangeError("lifecycle identity outside u48");
  return value;
};
export function decodeAdviceeLifecycleEntry(value: unknown): AdviceeLifecycleEntry {
  const entry = record(value);
  if (entry.$ !== "AdviceeLifecycle.Entry") throw new TypeError("invalid lifecycle entry");
  const tag = record(entry.status).$;
  const status = tag === "AdviceeLifecycle.Active" ? "active" : tag === "AdviceeLifecycle.Disconnected" ? "departed"
    : tag === "AdviceeLifecycle.Removed" ? "removed" : undefined;
  if (status === undefined) throw new TypeError("invalid lifecycle status");
  return Object.freeze({ partition: identity(entry.partition), lifetime: identity(entry.lifetime), status });
}

/** Exact constructor projection; there is no lifecycle transition policy here. */
export function decodeAdviceeLifecycles(value: unknown): readonly AdviceeLifecycleEntry[] {
  const entries: AdviceeLifecycleEntry[] = [];
  let cursor = record(value);
  while (cursor.$ === "Con") {
    entries.push(decodeAdviceeLifecycleEntry(cursor.head));
    cursor = record(cursor.tail);
  }
  if (cursor.$ !== "Nil") throw new TypeError("invalid lifecycle list");
  return Object.freeze(entries);
}
