import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const server = readFileSync(resolve(root, "src/resident/server.ts"), "utf8");
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
  if (server.includes(name)) throw new Error(`resident ticket bypass returned: ${name}`);
}
for (const event of ["ticketOpen", "ticketForget",
  "ticketAddUnit", "ticketStepUnit", "ticketUnitCheck", "ticketCollectGateCheck",
  "ticketFinalAuthorityCheck", "ticketJoinedCheck"]) {
  if (!server.includes(`kind: "${event}"`)) throw new Error(`canonical ticket event missing: ${event}`);
}
for (const event of ["ticketFail", "ticketClose", "ticketTerminal"]) {
  if (server.includes(`kind: "${event}"`)) throw new Error(`resident retained aggregate ticket event: ${event}`);
}
