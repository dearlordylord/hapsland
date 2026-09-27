import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const temporary = mkdtempSync(join(tmpdir(), "hapsland-import-graph-bend-"));
try {
  const compiled = join(temporary, "import-graph.js");
  execFileSync("bend", [join(root, "ImportGraphRuntime.bend"), "-o", compiled], { stdio: "pipe" });
  let source = readFileSync(compiled, "utf8");
  const footer = /\ncli\(process\.argv\.slice\(\d+\)\);\nio_exit\(\$main\$, [\s\S]*\);\s*$/;
  if (!footer.test(source) || !source.includes("function $ImportGraph$step$(") ||
      !source.includes("function $ImportGraph$initial$(")) {
    throw new Error("Bend import graph JavaScript layout changed; inspect generated runtime");
  }
  const namespacedTags = source.includes('"ImportGraph.Root"');
  const bigintNat = source.includes("262144n");
  source = source.replace(footer, `
const MAX_NAT = (1n << 48n) - 1n;
const NAMESPACED_TAGS = ${namespacedTags};
const BIGINT_NAT = ${bigintNat};
const nat = (value) => {
  const integer = typeof value === "number"
    ? Number.isSafeInteger(value) ? BigInt(value) : null
    : typeof value === "bigint" ? value : null;
  if (integer === null || integer < 0n || integer > MAX_NAT) {
    throw new TypeError("expected Bend Nat within the immediate range");
  }
  return BIGINT_NAT ? integer : Number(integer);
};
const normalize = (value) => {
  if (typeof value === "number" || typeof value === "bigint") return nat(value);
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [key, key === "$" && !NAMESPACED_TAGS && typeof item === "string"
        ? item.replace(/^ImportGraph\\./, "") : normalize(item)]));
  }
  return value;
};
export const bendImportGraphInitial = () => run_loop($ImportGraph$initial$());
export const bendImportGraphStep = (state, event) =>
  run_loop($ImportGraph$step$(state, normalize(event)));
`);
  writeFileSync(join(root, "import-graph.generated.js"), source);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
