// Compare evidence against the unchanged pre-execution declaration.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const [baselinePath, measuredPath, ...flags] = process.argv.slice(2);
if (!baselinePath || !measuredPath || flags.some(flag => flag !== "--physical")) {
  throw new Error("Usage: node compare-benchmarks.mjs baseline.json measured.json [--physical]");
}
const physical = flags.includes("--physical");
const read = async path => JSON.parse(await readFile(path, "utf8"));
const [contract, baseline, measured] = await Promise.all([
  read(new URL("./benchmark-contract.json", import.meta.url)),
  read(resolve(baselinePath)), read(resolve(measuredPath)),
]);
const expectedWorkload = physical
  ? (await read(new URL("./physical-retirement-contract.json", import.meta.url))).workload
  : contract.workload;
if (JSON.stringify(measured.workload) !== JSON.stringify(expectedWorkload)) {
  throw new Error("Measured workload differs from the pre-execution declaration");
}
if (JSON.stringify(baseline.workload) !== JSON.stringify(measured.workload)) {
  throw new Error("Baseline and measured workloads differ");
}
const invariantNames = ["exactSaturation", "saturatedDidNotStart", "roundRetainsPhysicalPermit",
  "reuseFollowsPhysicalSettlement", "shutdownPendingWhileHeld", "shutdownWaitsForPhysicalCompletion",
  "canonicalRequestsSettled", "finalAccountingCleared"];
const baselineShutdownValid = !physical ||
  (baseline.invariants?.shutdownPendingWhileHeld === true && baseline.invariants?.shutdownWaitsForPhysicalCompletion === true);
const checks = Object.entries(contract.budgets).map(([metric, budget]) => {
  const previous = baseline.observations?.[metric], value = measured.observations?.[metric];
  if (![previous, value].every(number => typeof number === "number" && Number.isFinite(number) && number >= 0)) {
    throw new Error("Missing or invalid metric: " + metric);
  }
  const limit = typeof budget === "number" ? budget : previous * budget.maximumRatio +
    (budget.absoluteAllowanceMs ?? budget.absoluteAllowanceBytes ?? 0);
  const formulaPasses = value <= limit;
  const comparable = metric !== "shutdownP95Ms" || baselineShutdownValid;
  return { metric, baseline: previous, measured: value, limit, formulaPasses, comparable,
    verified: comparable && formulaPasses };
});
const currentInvariants = physical ? Object.fromEntries(invariantNames.map(name =>
  [name, measured.invariants?.[name] === true])) : undefined;
const currentPhysicalContractValid = physical ? Object.values(currentInvariants).every(Boolean) : undefined;
const result = {
  purpose: "Migration comparison against unchanged pre-execution budgets",
  authority: "Implementation evidence; no release or platform acceptance",
  baselinePath, measuredPath, workload: measured.workload, checks,
  comparableBudgetsMet: checks.filter(check => check.comparable).every(check => check.verified),
  allComparativeBudgetsVerified: checks.every(check => check.verified),
  ...(physical ? { baselineShutdownValid, currentInvariants, currentPhysicalContractValid,
    shutdownComparison: baselineShutdownValid ? "Comparable" :
      "Unproven under original contract: fixed baseline shutdown finishes before physical completion; no comparative speed pass claimed." } : {}),
  limitations: measured.limitations,
};
process.stdout.write(JSON.stringify(result, null, 2) + "\n");
// The declared physical comparison exception remains visible in the receipt.
// It is not an observed budget failure, and never becomes a verified speed pass.
if (!result.comparableBudgetsMet || currentPhysicalContractValid === false) process.exitCode = 1;
