import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const server = read("src/resident/server.ts");
const client = read("src/resident/client.ts");
const canonical = read("packages/agent-flow-bend/Canonical.bend");
const collection = read("packages/agent-flow-bend/CollectionState.bend");
for (const source of [server, client, canonical, collection]) {
  assert.doesNotMatch(source, /TicketRecord|TicketUnit|TicketState|#tickets|#ticketUnits|ticketOpen|ticketStepUnit|ticketRetention/,
    "retained tickets or duplicate outcomes returned");
}
assert.equal(existsSync(resolve(root, "packages/agent-flow-bend/TicketState.bend")), false);
for (const event of ["collectorGateCheck", "collectorFinalAuthorityCheck", "reuseMemberCheck"]) {
  assert.ok(server.includes(`kind: "${event}"`), `missing canonical authority/member gate ${event}`);
}
assert.match(client, /operation: "admit-and-collect"/);
assert.doesNotMatch(client, /admitTicketedObservation|collectOutcome/);
assert.match(server, /context\.controller\.abort\(\)/);
assert.match(server, /expiresAt: startedAt \+ 600_000/);
console.log("checked active response authority and zero retained ticket registries");
