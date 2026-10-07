import assert from "node:assert/strict"
import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const read = (path) => readFileSync(resolve(root, path), "utf8")
const server = read("packages/resident-runtime/src/resident/server.ts")
const client = read("packages/resident-transport/src/resident/client.ts")
const canonical = read("packages/agent-flow-bend/Canonical.bend")
const collection = read("packages/agent-flow-bend/CollectionState.bend")
const joined = read("packages/resident-runtime/src/resident/joined-reviews.ts")
for (const source of [server, client, canonical, collection]) {
  assert.doesNotMatch(
    source,
    /TicketRecord|TicketUnit|TicketState|#tickets|#ticketUnits|ticketOpen|ticketStepUnit|ticketRetention/,
    "retained tickets or duplicate outcomes returned"
  )
}
assert.equal(existsSync(resolve(root, "packages/agent-flow-bend/TicketState.bend")), false)
for (const event of ["collectorGateCheck", "collectorFinalAuthorityCheck"]) {
  assert.ok(server.includes(`kind: "${event}"`), `missing canonical authority/member gate ${event}`)
}
assert.match(client, /operation: "admit-and-collect"/)
assert.doesNotMatch(client, /admitTicketedObservation|collectOutcome/)
assert.ok(joined.includes('kind: "reuseMemberCheck"'), "joined outcomes bypass canonical member gate")
assert.match(server, /Ref\.make<ResponseContext>\(\{\}\)/)
assert.match(server, /Effect\.raceFirst\(port\.closed\)/)
assert.match(server, /Ref\.set\(context, \{\}\)/)
assert.match(
  server,
  /if \(\(!handedToTransport \|\| port\.errored\(\)\) && token !== undefined\) yield\* server\.releaseDelivery\(token\)/
)
assert.match(server, /Ref\.update\(context, \(state\) => \(\{ \.\.\.state, token: response\.token \}\)\)/)
assert.ok(
  server.includes(
    'if (decoded.operation === "admit-and-collect") yield* port.setIdleTimeout(EDIT_REQUEST_DEADLINE_MS)'
  ),
  "edit RPC lost its declared socket deadline"
)
assert.match(server, /expiresAt: startedAt \+ 600_000/)
console.log("checked active response authority and zero retained ticket registries")
