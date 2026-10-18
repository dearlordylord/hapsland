// Finite emitted-owner checks. Release acknowledgments assume a closed native
// exact-object receipt binding; this does not establish pointer custody or IO drain.
import assert from "node:assert/strict"
import { it } from "node:test"
import owner from "@hapsland/agent-flow-bend/canonical-resolver-owner"
import { initialCanonical, encodeCanonicalEvent } from "@hapsland/canonical-policy/canonical/adapter"
import { projectTrustedCanonical } from "@hapsland/canonical-policy/canonical/canonical-boundary"
import { toOwner, fromOwner, toOwnerCanonical } from "@hapsland/canonical-policy/canonical/child-execution"

const fixture = () => {
  const limits = { globalItems: 100, globalBytes: 10000, partitionItems: 16, partitionBytes: 10000 }
  let state = owner.assembled(toOwnerCanonical(initialCanonical(limits)), owner.initial_custody())
  const accept = (method, ...args) => {
    const result = owner[method](state, ...args)
    assert.equal(result.$, "Advanced", method)
    state = result.state
    return result
  }
  const refuse = (method, ...args) => {
    const result = owner[method](state, ...args)
    assert.equal(result.$, "Rejected", method)
    assert.deepEqual(result.state, state, "refusal must preserve the complete owner state")
  }
  const child = (invocation) => {
    const found = owner.find(invocation, state.children)
    assert.equal(found.$, "Some")
    return found.value
  }
  const event = (event) => accept("canonical_event", toOwner(encodeCanonicalEvent(event)))
  const project = () => projectTrustedCanonical(fromOwner(state.canonical))
  const launch = () => {
    const invocation = state.next_invocation
    accept("launch_admission", invocation + 100)
    return invocation
  }
  const request = (invocation, request) => {
    accept("install", invocation, child(invocation).generation, request + 200, request)
    accept("provider_start", invocation)
    return [invocation, child(invocation).generation, child(invocation).lease.value.id, request]
  }
  const complete = (credential) => accept("provider_completed", credential[0], credential[2], credential[3], 300)
  const reserve = (partition = 1) => {
    event({ kind: "reserveCapacity", partition, bytes: 1024, purpose: "observationDispatch" })
    return project().charges.at(-1).id
  }
  const clear = () => {
    const raw = owner.resident_reconcile(toOwnerCanonical(initialCanonical(limits)), {
      $: "Custody",
      next_invocation: state.next_invocation,
      next_lease: state.next_lease,
      children: state.children
    })
    assert.equal(raw.$, "Published")
    state = owner.assembled(raw.canonical, raw.custody)
  }
  return { accept, refuse, child, event, project, launch, request, complete, reserve, clear, state: () => state }
}

it("Admission issues its own root capability without manufacturing Canonical work", () => {
  const f = fixture()
  const before = f.state().canonical
  const invocation = f.launch()
  assert.deepEqual(f.state().canonical, before)
  assert.deepEqual(f.project().rounds, [])
  assert.deepEqual(f.project().work, [])
  assert.deepEqual(f.child(invocation).scope, {
    $: "AdmissionScope",
    operation: invocation,
    permission: { $: "AdmissionUnreserved" }
  })
  f.refuse("launch", f.child(invocation).scope, 400)
  const credential = f.request(invocation, 0)
  f.refuse("launch_nested", { $: "Parent", invocation, generation: credential[1], request: 0 }, 401)
  f.complete(credential)
  f.accept("terminal", invocation, f.child(invocation).generation, 402)
})

it("Admission holds one receipt and cannot finish before its exact native release acknowledgment", () => {
  const f = fixture(),
    invocation = f.launch(),
    credential = f.request(invocation, 0)
  const charge = f.reserve()
  f.refuse("hold_admission", ...credential, 2, 1, charge, 10)
  f.refuse("hold_admission", ...credential, 1, 1, charge + 1, 10)
  f.refuse("hold_admission", ...credential, 1, 2, charge, 10)
  f.refuse("hold_admission", invocation, credential[1], credential[2] + 1, 0, 1, 1, charge, 10)
  f.refuse("hold_admission", ...credential, 1, 1, charge, 0)
  f.accept("hold_admission", ...credential, 1, 1, charge, 10)
  f.refuse("hold_admission", ...credential, 1, 1, charge, 10)
  f.refuse("release_admission", ...credential, 11)
  const other = f.launch(),
    second = f.request(other, 0)
  f.refuse("hold_admission", ...second, 1, 1, charge, 10)
  f.complete(credential)
  f.refuse("terminal", invocation, f.child(invocation).generation, 402)
  const release = f.request(invocation, 1)
  f.event({ kind: "releaseCapacity", reservation: charge })
  f.refuse("release_admission", ...credential, 10)
  f.accept("release_admission", ...release, 10)
  f.complete(release)
  f.accept("terminal", invocation, f.child(invocation).generation, 403)
  assert.deepEqual(f.project().charges, [])
})

it("Admission transfers only a published ingress and cancellation preserves its independent work", () => {
  for (const cancel of [false, true]) {
    const f = fixture(),
      invocation = f.launch(),
      credential = f.request(invocation, 0),
      charge = f.reserve()
    f.accept("hold_admission", ...credential, 1, 1, charge, 10)
    f.event({ kind: "openRound", partition: 1, lifetime: 1 })
    const round = f.project().rounds[0].id
    f.event({ kind: "admitObservation", partition: 1, lifetime: 1, round })
    const observation = f.project().work[0].operation
    f.refuse("transfer_admission", ...credential, round, observation)
    f.event({ kind: "queueDispatch", partition: 1, lifetime: 1, round, operation: observation })
    f.refuse("transfer_admission", ...credential, round + 1, observation)
    f.refuse("transfer_admission", ...credential, round, observation + 1)
    f.accept("transfer_admission", ...credential, round, observation)
    f.refuse("release_admission", ...credential, 10)
    f.refuse("transfer_admission", ...credential, round, observation)
    const committed = f.state().canonical
    if (cancel) {
      f.accept("cancel", invocation)
      f.refuse("cleanup_admission", invocation, f.child(invocation).generation, 10)
    } else {
      f.complete(credential)
      f.accept("terminal", invocation, f.child(invocation).generation, 404)
    }
    assert.deepEqual(f.state().canonical, committed)
    assert.equal(f.project().charges.length, 1)
    assert.equal(f.project().work.length, 1)
    assert.equal(f.project().dispatch.running.length, 1)
  }
})

it("Cancelled Admission retains its held obligation until exact fenced cleanup", () => {
  const f = fixture(),
    invocation = f.launch(),
    credential = f.request(invocation, 0),
    charge = f.reserve()
  f.accept("hold_admission", ...credential, 1, 1, charge, 10)
  f.accept("cancel", invocation)
  const generation = f.child(invocation).generation
  f.refuse("cleanup_admission", invocation, generation, 10)
  f.refuse("release_admission", ...credential, 10)
  f.complete(credential)
  f.event({ kind: "releaseCapacity", reservation: charge })
  f.refuse("cleanup_admission", invocation, generation, 11)
  f.refuse("cleanup_admission", invocation, generation + 1, 10)
  f.accept("cleanup_admission", invocation, generation, 10)
  assert.deepEqual(f.child(invocation).scope.permission, { $: "AdmissionUnreserved" })
  f.refuse("terminal", invocation, generation, 405)
  assert.deepEqual(f.project().charges, [])
})

it("a transferred receipt cannot block a fresh reservation after allocator clear", () => {
  const f = fixture(),
    invocation = f.launch(),
    credential = f.request(invocation, 0),
    charge = f.reserve()
  f.accept("hold_admission", ...credential, 1, 1, charge, 10)
  f.event({ kind: "openRound", partition: 1, lifetime: 1 })
  const round = f.project().rounds[0].id
  f.event({ kind: "admitObservation", partition: 1, lifetime: 1, round })
  const observation = f.project().work[0].operation
  f.event({ kind: "queueDispatch", partition: 1, lifetime: 1, round, operation: observation })
  f.accept("transfer_admission", ...credential, round, observation)
  f.complete(credential)
  f.accept("terminal", invocation, f.child(invocation).generation, 406)
  f.clear()
  assert.equal(f.reserve(), charge, "the actual Canonical allocator reuses its cleared number")
  const next = f.launch(),
    issued = f.request(next, 0)
  f.refuse("hold_admission", ...issued, 1, 1, charge, 10)
  f.accept("hold_admission", ...issued, 1, 1, charge, 11)
})

it("old cancelled receipt cleanup preserves a replacement with the same charge number", () => {
  const f = fixture(),
    invocation = f.launch(),
    credential = f.request(invocation, 0),
    charge = f.reserve()
  f.accept("hold_admission", ...credential, 1, 1, charge, 10)
  f.accept("cancel", invocation)
  f.clear()
  assert.equal(f.reserve(), charge)
  const replacement = f.state().canonical
  f.refuse("cleanup_admission", invocation, f.child(invocation).generation, 10)
  f.complete(credential)
  f.refuse("cleanup_admission", invocation, f.child(invocation).generation, 11)
  f.accept("cleanup_admission", invocation, f.child(invocation).generation, 10)
  assert.deepEqual(f.state().canonical, replacement)
  assert.equal(f.project().charges.length, 1)
})
