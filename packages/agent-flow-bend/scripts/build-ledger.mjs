import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

const root = resolve(import.meta.dirname, "..");
const productRoot = resolve(root, "../..");
const digest = createHash("sha256");
for (const path of ["Ledger.bend", "LedgerRuntime.bend", "scripts/build-ledger.mjs"]) {
  digest.update(path).update("\0").update(readFileSync(join(root, path))).update("\0");
}
const sourceHash = digest.digest("hex");
const temporary = mkdtempSync(join(tmpdir(), "hapsland-ledger-bend-"));
try {
  const compiled = join(temporary, "ledger.js");
  execFileSync("bend", [join(root, "LedgerRuntime.bend"), "-o", compiled], { stdio: "pipe" });
  let source = readFileSync(compiled, "utf8");
  const footer = /\ncli\(process\.argv\.slice\(\d+\)\);\nio_exit\(\$main\$, [\s\S]*\);\s*$/;
  for (const symbol of ["initial", "reserve", "release", "resize", "clear", "total", "partition_usage"]) {
    if (!source.includes(`function $Ledger$${symbol}$(`)) throw new Error(`missing generated Ledger.${symbol}`);
  }
  if (!footer.test(source)) throw new Error("Bend ledger JavaScript footer changed");
  source = source.replace(footer, `
const MAX_NAT = 2 ** 48 - 1;
const nat = (value) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_NAT) {
    throw new TypeError("expected Bend Nat within the immediate range");
  }
  return value;
};
const normalize = (value) => {
  if (typeof value === "number") return nat(value);
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [key, key === "$" ? item : normalize(item)]));
  }
  return value;
};
export const bendLedgerInitial = (limits) => run_loop($Ledger$initial$(normalize(limits)));
export const bendLedgerReserve = (state, partition, bytes) =>
  run_loop($Ledger$reserve$(state, nat(partition), nat(bytes)));
export const bendLedgerRelease = (state, id) =>
  run_loop($Ledger$release$(state, nat(id)));
export const bendLedgerResize = (state, id, bytes) =>
  run_loop($Ledger$resize$(state, nat(id), nat(bytes)));
export const bendLedgerClear = (state) => run_loop($Ledger$clear$(state));
export const bendLedgerTotal = (state) => run_loop($Ledger$total$(state.charges));
export const bendLedgerPartitionUsage = (state, partition) =>
  run_loop($Ledger$partition_usage$(state.charges, nat(partition)));
`);
  writeFileSync(join(productRoot, "src/resident/bend-ledger.generated.js"),
    `// hapsland-bend-source-sha256:${sourceHash}\n${source}`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
