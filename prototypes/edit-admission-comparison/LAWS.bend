# DRAFT: awaiting owner approval. No universal proofs supplied.
import Base
import ./core.bend as C
import ./spec.bend as S

# L1 Exact admission: accept every eligible post and no ineligible post.
# This excludes the vacuous reject-all implementation.
law exact_post:
  for +history: List<&2, C.TraceEvent>
  for +model: C.Model
  for +partition: Nat
  for +live: Nat
  for +tool: Nat
  for +now: Nat
  {C.count(C.post(model, C.run(history, model, C.initial()), partition, live, tool, now)) ==
    (C.count(C.run(history, model, C.initial())) + S.increment(S.eligible(model, C.run(history, model, C.initial()), partition, live, tool, now)) : Nat) : Nat}

# L2 Acceptance joins an open round or opens exactly its successor; refusal does neither.
law post_round:
  for +history: List<&2, C.TraceEvent>
  for +model: C.Model
  for +partition: Nat
  for +live: Nat
  for +tool: Nat
  for +now: Nat
  {C.round(C.post(model, C.run(history, model, C.initial()), partition, live, tool, now)) ==
    S.expected_round(C.run(history, model, C.initial()), S.eligible(model, C.run(history, model, C.initial()), partition, live, tool, now)) : Nat}

law post_active:
  for +history: List<&2, C.TraceEvent>
  for +model: C.Model
  for +partition: Nat
  for +live: Nat
  for +tool: Nat
  for +now: Nat
  {C.active(C.post(model, C.run(history, model, C.initial()), partition, live, tool, now)) ==
    Bool.or(C.active(C.run(history, model, C.initial())), S.eligible(model, C.run(history, model, C.initial()), partition, live, tool, now)) : Bool}

# L3 A pre notification alone never opens a review round or accepts a review.
law pre_boundary:
  for +state: C.State
  for +model: C.Model
  for +partition: Nat
  for +live: Nat
  for +tool: Nat
  for +start: Nat
  for +deadline: Nat
  for +now: Nat
  {(C.count(C.pre(model, state, partition, live, tool, start, deadline, now)), C.round(C.pre(model, state, partition, live, tool, start, deadline, now)), C.active(C.pre(model, state, partition, live, tool, start, deadline, now))) ==
    (C.count(state), C.round(state), C.active(state)) : Nat & Nat & Bool}

# L4 Retained identity stops a repeated post from causing any second effect.
law post_idempotent:
  for +state: C.State
  for +model: C.Model
  for +partition: Nat
  for +live: Nat
  for +tool: Nat
  for +now: Nat
  {C.post(model, C.post(model, state, partition, live, tool, now), partition, live, tool, now) ==
    C.post(model, state, partition, live, tool, now) : C.State}

law retention_bound:
  for state: C.State
  for tool: Nat
  {Nat.is_le(List.length(&2, Nat, C.completed(C.accepted(state, tool))), 1000n) == True{} : Bool}

# L5 Hidden native history cannot give the Current reducer an oracle freshness fact.
law native_erasure:
  for +state: C.State
  for +model: C.Model
  for +tool: Nat
  for +at: Nat
  {(C.step(model, state, C.NativeStart{tool, at}), C.step(model, state, C.NativeComplete{tool, at})) == (state, state) : C.State & C.State}

# L6 Admission/closure/restart preserve a cumulative spending monitor.
# No allowance grant or configured per-round continuation budget is modeled.
# Continue is a monitor event that records one spent allowance; not a budget gate.
law authority_accounting:
  for +state: C.State
  for model: C.Model
  for +event: C.TraceEvent
  {C.spent(C.step(model, state, event)) == (C.spent(state) + S.budget_delta(event) : Nat) : Nat}

# Pin retained sequence exactly, not just an upper bound (reject latest-only mutation).
law retained_sequence:
  for +state: C.State
  for +tool: Nat
  {C.completed(C.accepted(state, tool)) == List.take(&2, Nat, tool <> C.completed(state), 1000n) : List<&2, Nat>}

# L1b Current acceptance carries a same-scope/lifetime pre-start after its closure fence.
# Native freshness follows only with the external premise native start >= pre start.
law current_fence_witness:
  for +history: List<&2, C.TraceEvent>
  for +partition: Nat
  for +live: Nat
  for +tool: Nat
  for +now: Nat
  {Bool.or(Nat.is_eq(C.count(C.post(C.Current{}, C.run(history, C.Current{}, C.initial()), partition, live, tool, now)), C.count(C.run(history, C.Current{}, C.initial()))),
    S.fresh_witness(C.run(history, C.Current{}, C.initial()), partition, live, tool)) == True{} : Bool}
