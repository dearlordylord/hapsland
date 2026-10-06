// Prototype: independent witnesses at the public pure-model and owner seams.
import assert from "node:assert/strict"
import { Effect } from "effect"
import { fakeUpdateOwner, initialUpdate, reduceUpdate } from "./update-flow.ts"
import { fakeMaintenanceOwner, initialMaintenance, reduceMaintenance } from "./maintenance-flow.ts"
import { fakeCredentialOwner } from "./credential-owner.ts"
import { initialLogin, reduceLogin } from "./login-flow.ts"
import { initialVerification, reduceVerification } from "./verification-flow.ts"
export async function workflowGuards() {
  const updateOwner = fakeUpdateOwner()
  let update = initialUpdate()
  update = reduceUpdate(update, {
    revision: 0,
    action: { kind: "discovered", commandId: 0, hosts: ["Claude", "Codex"] }
  })
  assert.deepEqual(reduceUpdate(update, { revision: 0, action: { kind: "staged", commandId: 1 } }), update)
  assert.deepEqual(reduceUpdate(update, { revision: 1, action: { kind: "staged", commandId: 999 } }), update)
  update = reduceUpdate(update, { revision: 1, action: { kind: "staged", commandId: 1 } })
  const plans = await Effect.runPromise(updateOwner.preview())
  update = reduceUpdate(update, { revision: 2, action: { kind: "previewed", commandId: 2, plans } })
  update = reduceUpdate(update, { revision: 3, action: { kind: "continue" } })
  assert.deepEqual(
    reduceUpdate(update, { revision: 4, action: { kind: "approve", yes: true, digests: ["wrong"] } }),
    update
  )
  update = reduceUpdate(update, {
    revision: 4,
    action: { kind: "approve", yes: true, digests: plans.map((p) => p.digest) }
  })
  for (const kind of ["exit", "back"] as const)
    assert.deepEqual(reduceUpdate(update, { revision: 5, action: { kind } }), update)
  const staleOwner = fakeUpdateOwner({ stale: true })
  assert((await Effect.runPromise(staleOwner.apply(await Effect.runPromise(staleOwner.preview())))).stale)
  assert.equal(staleOwner.observed().writes, 0)
  const owner = fakeMaintenanceOwner({ hosts: ["Claude"] })
  let maintenance = reduceMaintenance(initialMaintenance(), {
    revision: 0,
    action: { kind: "discovered", commandId: 0, hosts: ["Claude"] }
  })
  const plan = await Effect.runPromise(owner.inspect("Claude", "repair"))
  maintenance = reduceMaintenance(maintenance, { revision: 1, action: { kind: "inspected", commandId: 1, plan } })
  maintenance = reduceMaintenance(maintenance, { revision: 2, action: { kind: "continue" } })
  assert.deepEqual(
    reduceMaintenance(maintenance, { revision: 3, action: { kind: "approve", yes: true, digest: "wrong" } }),
    maintenance
  )
  assert.deepEqual(
    reduceMaintenance(maintenance, { revision: 2, action: { kind: "approve", yes: true, digest: plan.digest } }),
    maintenance
  )
  maintenance = reduceMaintenance(maintenance, {
    revision: 3,
    action: { kind: "approve", yes: true, digest: plan.digest }
  })
  for (const kind of ["exit", "back"] as const)
    assert.deepEqual(reduceMaintenance(maintenance, { revision: 4, action: { kind } }), maintenance)
  assert.deepEqual(
    reduceMaintenance(maintenance, { revision: 4, action: { kind: "applied", commandId: 999, outcome: "complete" } }),
    maintenance
  )
  const credentialOwner = fakeCredentialOwner(),
    credential = await Effect.runPromise(credentialOwner.resolve())
  const login = reduceLogin(initialLogin(), {
    revision: 0,
    action: { kind: "resolved", commandId: 0, credential, writable: true }
  })
  assert.deepEqual(reduceLogin(login, { revision: 0, action: { kind: "captured", commandId: 1 } }), login)
  assert.deepEqual(reduceLogin(login, { revision: 1, action: { kind: "back" } }), login)
  const saving = reduceLogin(login, { revision: 1, action: { kind: "captured", commandId: 1 } })
  assert.deepEqual(reduceLogin(saving, { revision: 2, action: { kind: "exit" } }), saving)
  assert.deepEqual(
    reduceLogin(saving, { revision: 2, action: { kind: "saved", commandId: 999, outcome: "stored", credential } }),
    saving
  )
  const consent = reduceVerification(initialVerification(), {
    revision: 0,
    action: { kind: "resolved", commandId: 0, credential }
  })
  assert.deepEqual(
    reduceVerification(consent, { revision: 1, action: { kind: "consent", yes: true, generation: 999 } }),
    consent
  )
  assert.deepEqual(
    reduceVerification(consent, { revision: 0, action: { kind: "consent", yes: true, generation: 0 } }),
    consent
  )
  const checking = reduceVerification(consent, { revision: 1, action: { kind: "consent", yes: true, generation: 0 } })
  assert.deepEqual(reduceVerification(checking, { revision: 2, action: { kind: "exit" } }), checking)
  assert.deepEqual(
    reduceVerification(checking, { revision: 2, action: { kind: "checked", commandId: 999, outcome: "accepted" } }),
    checking
  )
  const stale = fakeCredentialOwner({ stale: true })
  assert.equal(await Effect.runPromise(stale.verify(await Effect.runPromise(stale.resolve()))), "stale")
  assert.equal(stale.observed().checks, 0)
  return { staleInputs: "passed", staleAuthorization: "passed", writesWaitForOutcome: "passed", realOperations: 0 }
}
