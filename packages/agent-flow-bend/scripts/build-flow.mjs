import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const temporary = mkdtempSync(join(tmpdir(), "hapsland-bend-"));
try {
  const compiled = join(temporary, "flow.js");
  execFileSync("bend", [join(root, "FlowRuntime.bend"), "-o", compiled], { stdio: "pipe" });
  let source = readFileSync(compiled, "utf8");
  const footer = /\ncli\(process\.argv\.slice\(2\)\);\nio_exit\(\$main\$, [\s\S]*\);\s*$/;
  if (!footer.test(source) || !source.includes("function $Flow$step$(") || !source.includes("function $Flow$initial$(") || !source.includes("function $Flow$changes$(")) {
    throw new Error("Bend JavaScript layout changed; inspect the generated runtime before adapting it");
  }
  source = source.replace(footer, `
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const LOW_MASK = (1n << 48n) - 1n;
const normalizeEvent = (event) => {
  if (event.$ !== "SourceCapacitySet" && event.$ !== "ReviewCapacitySet") return event;
  const raw = event.capacity;
  if (typeof raw !== "number" || !Number.isSafeInteger(raw)) return null;
  const value = BigInt(raw);
  if (value < 1n || value > MAX_SAFE) return null;
  return { ...event, capacity: { $: "Capacity", low: value & LOW_MASK, high: value >> 48n } };
};
export const bendInitial = () => run_loop($Flow$initial$());
export const bendStep = (state, event, itemId = {$: "None"}) => {
  const normalized = normalizeEvent(event);
  return normalized === null
    ? { $: "Rejected", state, reason: { $: "InvalidCapacity" } }
    : run_loop($Flow$step$(state, normalized, itemId));
};
export const bendChanges = (before, event, itemId, result) => {
  const normalized = normalizeEvent(event);
  return normalized === null ? { $: "Nil" }
    : run_loop($Flow$changes$(before, normalized, itemId, result));
};
`);
  writeFileSync(join(root, "flow.generated.js"), source);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
