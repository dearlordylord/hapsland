import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const server = readFileSync(resolve(root, "src/resident/server.ts"), "utf8");
for (const name of ["bendTicketInitial", "bendTicketFail", "bendTicketClose",
  "bendTicketTerminal", "bendTicketCollectGate", "bendTicketFinalAuthority",
  "bendTicketUnitStep", "bendTicketUnitInitial", "bendTicketJoinedDisposition",
  "ticket.phase", "unit.current.stage"]) {
  if (server.includes(name)) throw new Error(`resident ticket bypass returned: ${name}`);
}
for (const event of ["ticketOpen", "ticketForget", "ticketFail", "ticketClose",
  "ticketAddUnit", "ticketStepUnit", "ticketUnitCheck", "ticketTerminal", "ticketCollectGateCheck",
  "ticketFinalAuthorityCheck", "ticketJoinedCheck"]) {
  if (!server.includes(`kind: "${event}"`)) throw new Error(`canonical ticket event missing: ${event}`);
}
