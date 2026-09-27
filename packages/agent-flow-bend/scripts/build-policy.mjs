import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

const root = resolve(import.meta.dirname, "..");
const productRoot = resolve(root, "../..");
const digest = createHash("sha256");
for (const path of ["Admission.bend", "Work.bend", "Handoff.bend", "Round.bend", "PolicyRuntime.bend", "scripts/build-policy.mjs"]) {
  digest.update(path).update("\0").update(readFileSync(join(root, path))).update("\0");
}
const sourceHash = digest.digest("hex");
const temporary = mkdtempSync(join(tmpdir(), "hapsland-policy-bend-"));
try {
  const compiled = join(temporary, "policy.js");
  execFileSync("bend", [join(root, "PolicyRuntime.bend"), "-o", compiled], { stdio: "pipe" });
  let source = readFileSync(compiled, "utf8");
  const footer = /\ncli\(process\.argv\.slice\(2\)\);\nio_exit\(\$main\$, [\s\S]*\);\s*$/;
  if (!footer.test(source) || !source.includes("function $Handoff$select$(") ||
      !source.includes("function $Handoff$initial$(") ||
      !source.includes("function $Handoff$fits_batch$(") ||
      !source.includes("function $Handoff$lease$reserve$(") ||
      !source.includes("function $Handoff$lease$suppresses$(") ||
      !source.includes("function $Admission$step$(") ||
      !source.includes("function $Admission$close_prospective$(") ||
      !source.includes("function $Work$finish_wait$(") ||
      ["initial", "max_continuations", "active", "budget", "begin_stop",
        "owns_stop", "begin_decision", "consume", "reserve_output", "finish_stop", "reopen"]
        .some((name) => !source.includes(`function $Round$${name}$(`))) {
    throw new Error("Bend policy JavaScript layout changed; inspect generated runtime");
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
export const bendSelectionInitial = (partition, round) =>
  run_loop($Handoff$initial$(nat(partition), nat(round)));
export const bendSelectionStep = (state, advice, prospectiveBytes) =>
  run_loop($Handoff$select$(state, normalize(advice), nat(prospectiveBytes)));
export const bendFitsBatch = (items, bytes) =>
  run_loop($Handoff$fits_batch$(nat(items), nat(bytes)));
export const bendAdmissionInitial = (partition, lifetime) =>
  run_loop($Admission$initial$(nat(partition), nat(lifetime)));
export const bendAdmissionStep = (state, partition, lifetime, event) =>
  run_loop($Admission$step$(state, nat(partition), nat(lifetime), normalize(event)));
export const bendAdmissionCloseProspective = (state, at) =>
  run_loop($Admission$close_prospective$(state, nat(at)));
export const bendWorkFinishWait = (unfinished, deadlineReached, continuationBudget) =>
  run_loop($Work$finish_wait$(nat(unfinished), deadlineReached, continuationBudget));
export const bendLeaseInitial = (item, round) =>
  run_loop($Handoff$lease$initial$(nat(item), nat(round)));
export const bendLeaseReserve = (state, round, token, surface) =>
  run_loop($Handoff$lease$reserve$(state, nat(round), nat(token), normalize(surface)));
export const bendLeaseAuthorize = (state, round, token) =>
  run_loop($Handoff$lease$authorize$(state, nat(round), nat(token)));
export const bendLeaseRelease = (state, round, token) =>
  run_loop($Handoff$lease$release$(state, nat(round), nat(token)));
export const bendLeaseTerminal = (state, round, token, certain) =>
  run_loop($Handoff$lease$terminal$(state, nat(round), nat(token), certain));
export const bendLeaseReoffer = (state, round, token, fresh) =>
  run_loop($Handoff$lease$reoffer$(state, nat(round), nat(token), fresh));
export const bendLeaseClose = (state) => run_loop($Handoff$lease$close$(state));
export const bendLeaseSuppresses = (state, round, requested) =>
  run_loop($Handoff$lease$suppresses$(state, nat(round), normalize(requested)));
export const bendRoundInitial = () => run_loop($Round$initial$());
export const bendRoundMaxContinuations = () => run_loop($Round$max_continuations$());
export const bendRoundActive = (state, generation) =>
  run_loop($Round$active$(state, nat(generation)));
export const bendRoundBudget = (state) => run_loop($Round$budget$(state));
export const bendRoundBeginStop = (state, token) =>
  run_loop($Round$begin_stop$(state, nat(token)));
export const bendRoundOwnsStop = (state, token) =>
  run_loop($Round$owns_stop$(state, nat(token)));
export const bendRoundBeginDecision = (state, token) =>
  run_loop($Round$begin_decision$(state, nat(token)));
export const bendRoundConsume = (state) => run_loop($Round$consume$(state));
export const bendRoundReserveOutput = (state, token) =>
  run_loop($Round$reserve_output$(state, nat(token)));
export const bendRoundFinishStop = (state, token, close, at) =>
  run_loop($Round$finish_stop$(state, nat(token), close, nat(at)));
export const bendRoundReopen = (state, generation) =>
  run_loop($Round$reopen$(state, nat(generation)));
`);
  writeFileSync(join(productRoot, "src/resident/bend-policy.generated.js"),
    `// hapsland-bend-source-sha256:${sourceHash}\n${source}`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
