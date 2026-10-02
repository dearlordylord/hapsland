import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const server = readFileSync(resolve(root, "src/resident/server.ts"), "utf8");
const joined = readFileSync(resolve(root, "src/resident/joined-reviews.ts"), "utf8");
const records = readFileSync(resolve(root, "src/resident/ticket-records.ts"), "utf8");
const units = readFileSync(resolve(root, "src/resident/ticket-units.ts"), "utf8");
const ticketState = readFileSync(resolve(root, "packages/agent-flow-bend/TicketState.bend"), "utf8");
if (!ticketState.includes("Record{id: Nat}") ||
    !ticketState.includes("TicketUnit{id: Nat, admission: Nat") ||
    ticketState.includes("phase: Ticket.Phase")) {
  throw new Error("canonical admission record regained aggregate state or reverse unit ownership");
}
for (const name of ["bendTicketInitial", "bendTicketFail", "bendTicketClose",
  "bendTicketTerminal", "bendTicketCollectGate", "bendTicketFinalAuthority",
  "bendTicketUnitStep", "bendTicketUnitInitial", "bendTicketJoinedDisposition",
  "ticket.phase", "unit.current.stage"]) {
  if ([server, units, records, joined].some((source) => source.includes(name))) throw new Error(`resident ticket bypass returned: ${name}`);
}
for (const event of ["ticketOpen", "ticketForget",
  "ticketAddUnit", "ticketStepUnit", "ticketUnitCheck", "ticketCollectGateCheck",
  "ticketFinalAuthorityCheck", "ticketJoinedCheck"]) {
  if (!server.includes(`kind: "${event}"`) && !units.includes(`kind: "${event}"`) && !records.includes(`kind: "${event}"`) && !joined.includes(`kind: "${event}"`)) throw new Error(`canonical ticket event missing: ${event}`);
}
for (const event of ["ticketFail", "ticketClose", "ticketTerminal"]) {
  if ([server, units, records, joined].some((source) => source.includes(`kind: "${event}"`))) throw new Error(`resident retained aggregate ticket event: ${event}`);
}

for (const owner of ["#ticketUnits", "#nextTicketUnitId", "unit.current =", "#tickets", "#nextAdmissionGeneration"]) {
  if (server.includes(owner)) throw new Error(`independent native ticket owner returned: ${owner}`);
}

const state = readFileSync(resolve(root, "src/resident/capacity.ts"), "utf8");
const unitCommit = state.slice(state.indexOf("const unitCommit ="), state.indexOf("const ticketCommit ="));
if (!unitCommit.includes("commitAllEffect(") || /\bcommitAll\(/u.test(unitCommit) ||
    unitCommit.includes("Ref.getUnsafe") || unitCommit.includes("get current()")) {
  throw new Error("ticket-unit operations must compose atomic Effects without capability state getters");
}
if (!server.includes("yield* residentLedger.ticketUnits.markAdviceDelivered") ||
    !server.includes("yield* server.finalize")) {
  throw new Error("delivery finalization must compose ticket-unit Effects in the owning fiber");
}
const ticketCommit = state.slice(state.indexOf("const ticketCommit ="), state.indexOf("const roundCommit ="));
if (!ticketCommit.includes("commitAllEffect(") || /\bcommitAll\(/u.test(ticketCommit) ||
    ticketCommit.includes("Ref.getUnsafe")) {
  throw new Error("ticket operations must compose atomic Effects for commits and reads");
}

if (!state.includes('hasAdmission: Effect.fn("JoinedReviews.hasAdmission")') ||
    !state.includes('retireSuperseded: Effect.fn("JoinedReviews.retireSuperseded")') ||
    !state.includes('commitAllEffect(joinedChange((joined) => joined.retireSuperseded(subject)))') ||
    !server.includes('yield* residentJoined.hasAdmission(item.admissionId)') ||
    !server.includes('yield* residentJoined.retireSuperseded(subject)')) {
  throw new Error("joined admission reads and supersession retirement must compose Effects");
}

for (const operation of ["append", "attachOwner"]) {
  if (!state.includes(`${operation}: Effect.fn("JoinedReviews.${operation}")`) ||
      !server.includes(`yield* residentJoined.${operation}(`)) {
    throw new Error(`joined ${operation} must compose as an Effect`);
  }
}

const joinedSurface = state.slice(state.indexOf("    joinedReviews:"), state.indexOf("    reuse:", state.indexOf("    joinedReviews:")));
if (/\bcommitAll\(|Ref.getUnsafe|joinedCommit/.test(joinedSurface)) {
  throw new Error("joined review service restored a synchronous or unsafe bridge");
}
for (const operation of ["releaseOwner", "settle"]) {
  if (!joinedSurface.includes(`${operation}: Effect.fn("JoinedReviews.${operation}")`) ||
      !server.includes(`yield* residentJoined.${operation}(`)) {
    throw new Error(`joined ${operation} must compose as an Effect`);
  }
}

for (const operation of ["eligible", "revise"]) {
  if (!state.includes(`${operation}: Effect.fn("AdviceRecords.${operation}")`) ||
      !state.includes(`commitAllEffect(adviceChange((operations) => operations.${operation}(...args)))`) ||
      !server.includes(`yield* residentLedger.advice.${operation}(`)) {
    throw new Error(`advice ${operation} must compose as an atomic Effect`);
  }
}

const advicePublication = state.slice(state.indexOf('publish: Effect.fn("AdviceRecords.publish")'), state.indexOf('eligible: Effect.fn("AdviceRecords.eligible")'));
if (!advicePublication.includes("commitAllEffect(") || /\bcommitAll\(/.test(advicePublication) ||
    !server.includes("yield* residentLedger.advice.publish(")) {
  throw new Error("advice publication must atomically compose ticket and joined updates as an Effect");
}

if (!state.includes('insert: Effect.fn("AdviceRecords.insert")') ||
    !state.includes('commitAllEffect(adviceChange((operations) => operations.insert(') ||
    !server.includes('yield* residentLedger.advice.insert(')) {
  throw new Error("advice retention must compose as an atomic Effect");
}

if (!state.includes('reserveLease: Effect.fn("AdviceRecords.reserveLease")') ||
    !state.includes('commitAllEffect(adviceChange((operations) => operations.reserveLease(...args)))') ||
    !server.includes('yield* residentReserveAdviceLease(advice, token)')) {
  throw new Error("advice lease reservation must compose as an atomic Effect");
}

if (!state.includes('updateDelivery: Effect.fn("AdviceRecords.updateDelivery")') ||
    !state.includes('commitAllEffect(adviceChange((operations) => operations.updateDelivery(...args)))') ||
    !server.includes('yield* residentLedger.advice.updateDelivery(') ||
    !server.includes('yield* server.acknowledge(')) {
  throw new Error("delivery updates and acknowledgement must compose Effects");
}

if (!state.includes('checkLease: Effect.fn("AdviceRecords.checkLease")') ||
    !state.includes('commitAllEffect(adviceChange((operations) => operations.checkLease(...args)))') ||
    !server.includes('yield* residentCheckAdviceLease(item, now, stopCollector, sameGroup)')) {
  throw new Error("advice lease checks must compose as atomic Effects");
}

if (!state.includes('releaseLease: Effect.fn("AdviceRecords.releaseLease")') ||
    !state.includes('commitAllEffect(adviceChange((operations) => operations.releaseLease(...args)))') ||
    !server.includes('yield* server.releaseDelivery(') ||
    !server.includes('yield* server.releaseComposedSubmission(')) {
  throw new Error("advice release and composed cleanup must compose Effects");
}

if (!state.includes('start: Effect.fn("AdviceCaptures.start")') ||
    !server.includes('yield* residentLedger.adviceCaptures.start(')) {
  throw new Error("advice capture acquisition must compose as an Effect");
}

const captureSurface = state.slice(state.indexOf("    adviceCaptures: (() =>"), state.indexOf("    notices:", state.indexOf("    adviceCaptures: (() =>")));
if (/\bcommitAll\(|Ref.getUnsafe|captureCommit/.test(captureSurface)) {
  throw new Error("advice capture service restored a synchronous or unsafe bridge");
}
for (const operation of ["resize", "retire", "finish", "count"]) {
  if (!captureSurface.includes(`${operation}: Effect.fn("AdviceCaptures.${operation}")`)) {
    throw new Error(`advice capture ${operation} must compose as an Effect`);
  }
}

if (!state.includes('remove: Effect.fn("AdviceRecords.remove")') ||
    !server.includes('yield* residentLedger.advice.remove(') ||
    !server.includes('yield* residentExpirePending(now)')) {
  throw new Error("advice retirement and expiry must compose Effects");
}

if (!state.includes('current: Effect.fn("AdviceRecords.current")') ||
    !server.includes('yield* residentLedger.advice.current(advice)')) {
  throw new Error("advice lease inspection must use the explicit Effect snapshot read");
}

const revalidateAdvice = server.slice(server.indexOf("  const residentRevalidate ="), server.indexOf("\n  function handle(", server.indexOf("  const residentRevalidate =")));
const selectionFacts = server.slice(server.indexOf("  const residentFindingSelectionFacts ="), server.indexOf("  const residentRegisterRevision ="));
if (revalidateAdvice.includes("advice.evaluations") || selectionFacts.includes("advice.collectionEligible") ||
    !revalidateAdvice.includes("yield* residentLedger.advice.current(advice)") ||
    !selectionFacts.includes("yield* residentLedger.advice.current(advice)")) {
  throw new Error("advice revalidation and finding readiness must read explicit snapshots");
}

const deliverySettlement = server.slice(server.indexOf("  const acknowledge ="), server.indexOf("  function residentReleaseUnacknowledged"));
if (!state.includes('snapshots: Effect.fn("AdviceRecords.snapshots")') ||
    !deliverySettlement.includes("yield* residentLedger.advice.snapshots()") ||
    /residentAdvice\(\)|item\.(evaluations|findings)/.test(deliverySettlement)) {
  throw new Error("acknowledgement and finalization must inspect explicit advice batch snapshots");
}

const submissionSnapshots = server.slice(server.indexOf("  const releaseDelivery ="), server.indexOf("  const releaseComposedSubmission ="));
if (!submissionSnapshots.includes("yield* residentLedger.advice.snapshots()") ||
    /residentAdvice\(\)|(?:advice|item)\.delivery/.test(submissionSnapshots)) {
  throw new Error("delivery release and submission must inspect explicit advice snapshots");
}
