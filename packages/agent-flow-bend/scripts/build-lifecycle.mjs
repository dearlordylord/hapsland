import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const temporary = mkdtempSync(join(tmpdir(), "hapsland-lifecycle-bend-"));
try {
  const compiled = join(temporary, "lifecycle.js");
  execFileSync("bend", [join(root, "LifecycleRuntime.bend"), "-o", compiled], { stdio: "pipe" });
  let source = readFileSync(compiled, "utf8");
  const footer = /\ncli\(process\.argv\.slice\(2\)\);\nio_exit\(\$main\$, [\s\S]*\);\s*$/;
  if (!footer.test(source) || !source.includes("function $Lifecycle$apply$(") ||
      !source.includes("function $Lifecycle$initial$(")) {
    throw new Error("Bend lifecycle JavaScript layout changed; inspect generated runtime");
  }
  source = source.replace(footer, `
const MAX_NAT = (1n << 48n) - 1n;
const nat = (value) => {
  const integer = typeof value === "number"
    ? Number.isSafeInteger(value) ? BigInt(value) : null
    : typeof value === "bigint" ? value : null;
  if (integer === null || integer < 0n || integer > MAX_NAT) {
    throw new TypeError("expected Bend Nat within the immediate range");
  }
  return integer;
};
const normalize = (value) => {
  if (typeof value === "number" || typeof value === "bigint") return nat(value);
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
  }
  return value;
};
export const bendLifecycleInitial = (partition, lifetime) =>
  run_loop($Lifecycle$initial$(nat(partition), nat(lifetime)));
export const bendLifecycleApply = (state, partition, lifetime, round, event) =>
  run_loop($Lifecycle$apply$(state, nat(partition), nat(lifetime), nat(round), normalize(event)));
`);
  writeFileSync(join(root, "lifecycle.generated.js"), source);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
