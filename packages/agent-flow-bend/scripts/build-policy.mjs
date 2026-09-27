import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

const root = resolve(import.meta.dirname, "..");
const productRoot = resolve(root, "../..");
const digest = createHash("sha256");
for (const path of ["Admission.bend", "Work.bend", "Handoff.bend", "Round.bend", "Background.bend", "Notice.bend", "Collection.bend", "Delivery.bend", "Cache.bend", "Ticket.bend", "Revision.bend", "Lifecycle.bend", "PolicyRuntime.bend", "scripts/build-policy.mjs"]) {
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
      !source.includes("function $Handoff$notice_offer$(") ||
      !source.includes("function $Handoff$lease$reserve$(") ||
      !source.includes("function $Handoff$lease$offer$(") ||
      !source.includes("function $Handoff$lease$suppresses$(") ||
      !source.includes("function $Admission$step$(") ||
      !source.includes("function $Admission$prospective_gate$(") ||
      !source.includes("function $Admission$expire$(") ||
      !source.includes("function $Admission$close_prospective$(") ||
      !source.includes("function $Work$finish_wait$(") ||
      ["initial", "admit", "start_source", "start_unit", "spawn", "complete_source", "cached_finding", "outcome",
        "interrupt_observation", "interrupt_unit", "retire", "revise_finding", "unfinished", "pending_findings", "pending_for", "cancel_unfinished", "close"]
        .some((name) => !source.includes(`function $Work$${name}$(`)) ||
      ["initial", "max_continuations", "active", "budget", "begin_stop",
        "owns_stop", "begin_decision", "consume", "reserve_output", "release_output", "finish_stop", "reopen"]
        .some((name) => !source.includes(`function $Round$${name}$(`)) ||
      ["initial", "claim", "release", "expire"]
        .some((name) => !source.includes(`function $Background$${name}$(`)) ||
      !source.includes("function $Notice$decide$(") ||
      !source.includes("function $Notice$advance$(") ||
      ["order", "eligible", "expired"]
        .some((name) => !source.includes(`function $Collection$${name}$(`)) ||
      ["transition", "expired", "background_reofferable"]
        .some((name) => !source.includes(`function $Delivery$${name}$(`)) ||
      ["admit", "evict"].some((name) => !source.includes(`function $Cache$${name}$(`)) ||
      !source.includes("function $Lifecycle$cutoff$(") ||
      !source.includes("function $Lifecycle$finish_gate$(") ||
      !source.includes("function $Lifecycle$reserve_selected$(") ||
      !source.includes("function $Lifecycle$release_unwritten$(") ||
      !source.includes("function $Ticket$initial$(") ||
      !source.includes("function $Ticket$fail$(") ||
      !source.includes("function $Ticket$close$(") ||
      !source.includes("function $Ticket$terminal$(") ||
      !source.includes("function $Ticket$unit$step$(") ||
      !source.includes("function $Ticket$unit$initial$(") ||
      !source.includes("function $Revision$register$(") ||
      !source.includes("function $Revision$superseded$(")) {
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
export const bendNoticeOffer = (items, bytes, skipUnfitting) =>
  run_loop($Handoff$notice_offer$(nat(items), nat(bytes), skipUnfitting));
export const bendAdmissionInitial = (partition, lifetime) =>
  run_loop($Admission$initial$(nat(partition), nat(lifetime)));
export const bendAdmissionStep = (state, partition, lifetime, event) =>
  run_loop($Admission$step$(state, nat(partition), nat(lifetime), normalize(event)));
export const bendAdmissionProspectiveGate = (facts) =>
  run_loop($Admission$prospective_gate$(normalize(facts)));
export const bendAdmissionExpire = (state, token, deadlineReached) =>
  run_loop($Admission$expire$(state, nat(token), deadlineReached));
export const bendAdmissionCloseProspective = (state, at) =>
  run_loop($Admission$close_prospective$(state, nat(at)));
export const bendWorkFinishWait = (unfinished, deadlineReached, continuationBudget) =>
  run_loop($Work$finish_wait$(nat(unfinished), deadlineReached, continuationBudget));
export const bendWorkInitial = () => run_loop($Work$initial$());
export const bendWorkAdmit = (state) => run_loop($Work$admit$(state));
export const bendWorkStartSource = (state, observation) =>
  run_loop($Work$start_source$(state, nat(observation)));
export const bendWorkStartUnit = (state, unit) =>
  run_loop($Work$start_unit$(state, nat(unit)));
export const bendWorkSpawn = (state, observation, count) =>
  run_loop($Work$spawn$(state, nat(observation), nat(count)));
export const bendWorkCompleteSource = (state, observation) =>
  run_loop($Work$complete_source$(state, nat(observation)));
export const bendWorkCachedFinding = (state, observation, count, bytes) =>
  run_loop($Work$cached_finding$(state, nat(observation), nat(count), nat(bytes)));
export const bendWorkOutcome = (state, unit, outcome) =>
  run_loop($Work$outcome$(state, nat(unit), normalize(outcome)));
export const bendWorkInterruptObservation = (state, observation) =>
  run_loop($Work$interrupt_observation$(state, nat(observation)));
export const bendWorkInterruptUnit = (state, unit) =>
  run_loop($Work$interrupt_unit$(state, nat(unit)));
export const bendWorkRetire = (state, unit) =>
  run_loop($Work$retire$(state, nat(unit)));
export const bendWorkReviseFinding = (state, unit, count, bytes) =>
  run_loop($Work$revise_finding$(state, nat(unit), nat(count), nat(bytes)));
export const bendWorkUnfinished = (state) => run_loop($Work$unfinished$(state));
export const bendWorkPendingFindings = (state) => run_loop($Work$pending_findings$(state));
export const bendWorkPendingFor = (state, unit) =>
  run_loop($Work$pending_for$(state, nat(unit)));
export const bendWorkClose = (state) => run_loop($Work$close$(state));
export const bendWorkCancelUnfinished = (state) => run_loop($Work$cancel_unfinished$(state));
export const bendLeaseInitial = (item, round) =>
  run_loop($Handoff$lease$initial$(nat(item), nat(round)));
export const bendLeaseReserve = (state, round, token, surface) =>
  run_loop($Handoff$lease$reserve$(state, nat(round), nat(token), normalize(surface)));
export const bendLeaseOffer = (state, round, token, surface, fresh) =>
  run_loop($Handoff$lease$offer$(state, nat(round), nat(token), normalize(surface), fresh));
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
export const bendRoundReleaseOutput = (state, token) =>
  run_loop($Round$release_output$(state, nat(token)));
export const bendRoundFinishStop = (state, token, close, at) =>
  run_loop($Round$finish_stop$(state, nat(token), close, nat(at)));
export const bendRoundReopen = (state, generation) =>
  run_loop($Round$reopen$(state, nat(generation)));
export const bendBackgroundInitial = () => run_loop($Background$initial$());
export const bendBackgroundClaim = (state, token, active, used, capacity) =>
  run_loop($Background$claim$(state, nat(token), active, nat(used), nat(capacity)));
export const bendBackgroundRelease = (state, token) =>
  run_loop($Background$release$(state, nat(token)));
export const bendBackgroundExpire = (state, elapsed, lifetime) =>
  run_loop($Background$expire$(state, nat(elapsed), nat(lifetime)));
export const bendNoticeDecide = (remaining, count, maximum) =>
  run_loop($Notice$decide$(normalize(remaining), nat(count), nat(maximum)));
export const bendNoticeAdvance = (remaining, count, maximum, suppressed, pending, leased) =>
  run_loop($Notice$advance$(normalize(remaining), nat(count), nat(maximum),
    nat(suppressed), normalize(pending), leased, MAX_NAT));
export const bendCollectionOrder = (leftCycle, leftSequence, rightCycle, rightSequence) =>
  run_loop($Collection$order$(nat(leftCycle), nat(leftSequence), nat(rightCycle), nat(rightSequence)));
export const bendCollectionEligible = (already, turnEnd, cycleComplete, elapsed, window) =>
  run_loop($Collection$eligible$(already, turnEnd, cycleComplete, nat(elapsed), nat(window)));
export const bendCollectionExpired = (elapsed, lifetime) =>
  run_loop($Collection$expired$(nat(elapsed), nat(lifetime)));
export const bendDeliveryTransition = (current, requested) =>
  run_loop($Delivery$transition$(normalize(current), normalize(requested)));
export const bendDeliveryExpired = (phase, elapsed, lifetime) =>
  run_loop($Delivery$expired$(normalize(phase), nat(elapsed), nat(lifetime)));
export const bendDeliveryBackgroundReofferable = (phase, surface) =>
  run_loop($Delivery$background_reofferable$(normalize(phase), normalize(surface)));
export const bendCacheAdmit = (existing, incomingBytes, byteLimit) =>
  run_loop($Cache$admit$(existing, nat(incomingBytes), nat(byteLimit)));
export const bendCacheEvict = (entries, currentBytes, incomingBytes, entryLimit, byteLimit) =>
  run_loop($Cache$evict$(nat(entries), nat(currentBytes), nat(incomingBytes),
    nat(entryLimit), nat(byteLimit)));
export const bendLifecycleCutoff = (round, work, token) =>
  run_loop($Lifecycle$cutoff$(round, work, nat(token)));
export const bendLifecycleFinishGate = (round, work, token, extraUnfinished, deadlineReached) =>
  run_loop($Lifecycle$finish_gate$(round, work, nat(token), nat(extraUnfinished), deadlineReached));
export const bendLifecycleReserveSelected = (round, work, token, selected) =>
  run_loop($Lifecycle$reserve_selected$(round, work, nat(token),
    selected.reduceRight((tail, value) => ({ $: "Con", head: nat(value), tail }), { $: "Nil" })));
export const bendLifecycleReleaseUnwritten = (round, token) =>
  run_loop($Lifecycle$release_unwritten$(round, nat(token)));
export const bendTicketInitial = () => run_loop($Ticket$initial$());
export const bendTicketFail = (phase, reason) =>
  run_loop($Ticket$fail$(phase, normalize(reason)));
export const bendTicketClose = (phase) => run_loop($Ticket$close$(phase));
export const bendTicketTerminal = (phase, facts) =>
  run_loop($Ticket$terminal$(phase, normalize(facts)));
export const bendTicketUnitStep = (stage, event) =>
  run_loop($Ticket$unit$step$(normalize(stage), normalize(event)));
export const bendTicketUnitInitial = () => run_loop($Ticket$unit$initial$());
export const bendRevisionRegister = (hasCurrent, sameInput) =>
  run_loop($Revision$register$(hasCurrent, sameInput));
export const bendRevisionSuperseded = (candidateSubject, targetSubject,
  candidateGeneration, currentGeneration) =>
  run_loop($Revision$superseded$(nat(candidateSubject), nat(targetSubject),
    nat(candidateGeneration), nat(currentGeneration)));
`);
  writeFileSync(join(productRoot, "src/resident/bend-policy.generated.js"),
    `// hapsland-bend-source-sha256:${sourceHash}\n${source}`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
