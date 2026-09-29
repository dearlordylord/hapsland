import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

const root = resolve(import.meta.dirname, "..");
const productRoot = resolve(root, "../..");
const digest = createHash("sha256");
for (const path of ["Ledger.bend", "Admission.bend", "Flow.bend", "Work.bend", "Retention.bend", "Dispatch.bend", "Collection.bend", "CollectionState.bend", "DeliveryState.bend", "SubmissionState.bend", "RevisionState.bend", "TicketState.bend", "Ticket.bend", "ReuseState.bend", "Reuse.bend", "Cache.bend", "Notice.bend", "NoticeState.bend", "Configuration.bend", "RulePolicy.bend", "Handoff.bend", "Delivery.bend", "Canonical.bend", "CanonicalRuntime.bend", "scripts/build-canonical.mjs"]) {
  digest.update(path).update("\0").update(readFileSync(join(root, path))).update("\0");
}
const sourceHash = digest.digest("hex");
const temporary = mkdtempSync(join(tmpdir(), "hapsland-canonical-bend-"));
try {
  const compiled = join(temporary, "canonical.js");
  execFileSync("bend", [join(root, "CanonicalRuntime.bend"), "-o", compiled], { stdio: "pipe" });
  let source = readFileSync(compiled, "utf8");
  const footer = /\ncli\(process\.argv\.slice\(\d+\)\);\nio_exit\(\$main\$, [\s\S]*\);\s*$/;
  if (!footer.test(source) || !source.includes("function $Canonical$step$(") ||
      !source.includes("function $Canonical$initial$(") ||
      !source.includes("function $Ledger$total$(") ||
      !source.includes("function $Ledger$partition_usage$(") ||
      !source.includes("function $Ledger$inventory$(")) {
    throw new Error("Bend canonical JavaScript layout changed");
  }
  source = source.replace(footer, `
const nat = (value) => {
  if (!Number.isSafeInteger(value) || value < 0 || value >= 2 ** 48) {
    throw new TypeError("expected immediate Bend Nat");
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
export const bendCanonicalInitial = (limits) =>
  run_loop($Canonical$initial$(normalize(limits)));
export const bendCanonicalStep = (state, event) =>
  run_loop($Canonical$step$(state, normalize(event)));
export const bendCanonicalTotal = (state) =>
  run_loop($Ledger$total$(state.ledger.charges));
export const bendCanonicalPartitionUsage = (state, partition) =>
  run_loop($Ledger$partition_usage$(state.ledger.charges, nat(partition)));
export const bendCanonicalInventory = (state) =>
  run_loop($Ledger$inventory$(state.ledger.limits));
export const bendPreparationLimit = () =>
  run_loop($Dispatch$max_running$());
export const bendJevRequestLimit = () =>
  run_loop($Dispatch$max_requests$());
`);
  writeFileSync(join(productRoot, "src/canonical/canonical.generated.js"),
    `// hapsland-bend-source-sha256:${sourceHash}\n${source}`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
