import Base
import ./core.bend as Core
import ./Own.bend as Own
import ./NUMERIC_SPEC.bend as Spec
import ./NUMERIC_SPEC_RANK.bend as Measure
import ./NUMERIC_SPEC_MEMBERSHIP.bend as Member
import ./NUMERIC_SPEC_MEMBERSHIP_LAWS.bend as Support
import ./NUMERIC_SPEC_MEMBERSHIP_PRIMITIVE_PROOF.bend as Prim
import ./NUMERIC_SPEC_MEMBERSHIP_RECURSIVE_PROOF.bend as Recursive

# Fill the complete approved transport owner before the whole interpreter induction.

def Support.replace_budget_visited_exact(state, budget):
  Prim.replace_budget_visited_exact(state, budget)

def Support.reference_depth_visited_exact(state, depth):
  Prim.reference_depth_visited_exact(state, depth)

def Support.local_work_visited_exact(state):
  Prim.local_work_visited_exact(state)

def Support.target_visited_exact(state, path, identity):
  Prim.target_visited_exact(state, path, identity)

def Support.pending_visited_exact(state, item):
  Prim.pending_visited_exact(state, item)

def Support.bundle_work_visited_exact(already_seen, state):
  Prim.bundle_work_visited_exact(already_seen, state)

def Support.omitted_visited_exact(state, name, reason):
  Prim.omitted_visited_exact(state, name, reason)

def Support.queue_visited_exact(state, path, symbol, owner, index, depth, expected, imported):
  Prim.queue_visited_exact(state, path, symbol, owner, index, depth, expected, imported)

def Support.imported_kind_visited_exact(
  expected,
  type_only,
  state,
  path,
  symbol,
  owner,
  index,
  depth,
  imported
):
  Prim.imported_kind_visited_exact(
    expected,
    type_only,
    state,
    path,
    symbol,
    owner,
    index,
    depth,
    imported
  )

def Support.unresolved_or_import_visited_exact(
  found,
  state,
  path,
  symbol,
  owner,
  index,
  depth,
  expected
):
  Prim.unresolved_or_import_visited_exact(found, state, path, symbol, owner, index, depth, expected)

def Support.import_budget_visited_exact(
  permit,
  imported,
  state,
  path,
  symbol,
  owner,
  index,
  depth,
  expected
):
  Prim.import_budget_visited_exact(
    permit,
    imported,
    state,
    path,
    symbol,
    owner,
    index,
    depth,
    expected
  )

def Support.bundle_queue_visited_exact(state, path, symbol, owner, index, depth, expected, handle):
  Prim.bundle_queue_visited_exact(state, path, symbol, owner, index, depth, expected, handle)

def Support.bundle_finish_visited_exact(
  permit,
  already_seen,
  state,
  path,
  symbol,
  owner,
  index,
  depth,
  expected,
  handle,
  identity
):
  Prim.bundle_finish_visited_exact(
    permit,
    already_seen,
    state,
    path,
    symbol,
    owner,
    index,
    depth,
    expected,
    handle,
    identity
  )

def Support.bundle_budget_visited_exact(
  state,
  already_seen,
  path,
  symbol,
  owner,
  index,
  depth,
  expected,
  handle,
  identity
):
  Prim.bundle_budget_visited_exact(
    state,
    already_seen,
    path,
    symbol,
    owner,
    index,
    depth,
    expected,
    handle,
    identity
  )

def Support.bundle_seen_visited_exact(
  already_seen,
  state,
  path,
  symbol,
  owner,
  index,
  depth,
  expected,
  handle,
  identity
):
  Prim.bundle_seen_visited_exact(
    already_seen,
    state,
    path,
    symbol,
    owner,
    index,
    depth,
    expected,
    handle,
    identity
  )

def Support.bundle_admission_visited_exact(
  valid,
  state,
  path,
  symbol,
  owner,
  index,
  depth,
  expected,
  handle,
  identity
):
  Prim.bundle_admission_visited_exact(
    valid,
    state,
    path,
    symbol,
    owner,
    index,
    depth,
    expected,
    handle,
    identity
  )

def Support.bundle_found_visited_exact(
  found,
  identity,
  expected,
  state,
  path,
  symbol,
  owner,
  index,
  depth
):
  Prim.bundle_found_visited_exact(
    found,
    identity,
    expected,
    state,
    path,
    symbol,
    owner,
    index,
    depth
  )

def Support.enter_preserves_member(state, path, identity, query, present):
  Prim.enter_preserves_member(state, path, identity, query, present)

def Support.expanded_result_state_exact(result, symbol):
  Prim.expanded_result_state_exact(result, symbol)

def Support.prepend_state_exact(result, reference):
  Prim.prepend_state_exact(result, reference)

def Support.as_build_state_exact(result):
  Prim.as_build_state_exact(result)

def Support.as_references_state_exact(result):
  Prim.as_references_state_exact(result)

def Support.tree_result_state_exact(result, owner, artifact):
  Prim.tree_result_state_exact(result, owner, artifact)

def Support.insufficient_state_exact(request):
  Prim.insufficient_state_exact(request)

def Support.child_or_cycle_preserves_member(
  fuel,
  query,
  already_seen,
  state,
  facts,
  path,
  symbol,
  depth,
  expected,
  identity,
  present,
  child_contract
):
  Recursive.child_or_cycle_preserves_member(
    fuel,
    query,
    already_seen,
    state,
    facts,
    path,
    symbol,
    depth,
    expected,
    identity,
    present,
    child_contract
  )

def Support.local_allowed_preserves_member(
  fuel,
  query,
  permit,
  state,
  facts,
  path,
  symbol,
  depth,
  expected,
  identity,
  present,
  child_contract
):
  Recursive.local_allowed_preserves_member(
    fuel,
    query,
    permit,
    state,
    facts,
    path,
    symbol,
    depth,
    expected,
    identity,
    present,
    child_contract
  )

def Support.local_budget_preserves_member(
  fuel,
  query,
  state,
  facts,
  path,
  symbol,
  depth,
  expected,
  identity,
  present,
  child_contract
):
  Recursive.local_budget_preserves_member(
    fuel,
    query,
    state,
    facts,
    path,
    symbol,
    depth,
    expected,
    identity,
    present,
    child_contract
  )

def Support.local_kind_preserves_member(
  fuel,
  query,
  valid,
  state,
  facts,
  path,
  symbol,
  depth,
  expected,
  identity,
  present,
  child_contract
):
  Recursive.local_kind_preserves_member(
    fuel,
    query,
    valid,
    state,
    facts,
    path,
    symbol,
    depth,
    expected,
    identity,
    present,
    child_contract
  )

def Support.local_conflict_preserves_member(
  fuel,
  query,
  imported,
  declaration,
  state,
  facts,
  path,
  symbol,
  depth,
  expected,
  present,
  child_contract
):
  Recursive.local_conflict_preserves_member(
    fuel,
    query,
    imported,
    declaration,
    state,
    facts,
    path,
    symbol,
    depth,
    expected,
    present,
    child_contract
  )

def Support.choose_local_preserves_member(
  fuel,
  query,
  local,
  imported,
  state,
  facts,
  path,
  symbol,
  owner,
  index,
  depth,
  expected,
  present,
  child_contract
):
  Recursive.choose_local_preserves_member(
    fuel,
    query,
    local,
    imported,
    state,
    facts,
    path,
    symbol,
    owner,
    index,
    depth,
    expected,
    present,
    child_contract
  )

def Support.ordinary_found_preserves_member(
  fuel,
  query,
  local,
  imported,
  state,
  facts,
  path,
  symbol,
  owner,
  index,
  depth,
  expected,
  present,
  child_contract
):
  Recursive.ordinary_found_preserves_member(
    fuel,
    query,
    local,
    imported,
    state,
    facts,
    path,
    symbol,
    owner,
    index,
    depth,
    expected,
    present,
    child_contract
  )

def Support.ordinary_preserves_member(
  fuel,
  query,
  facts,
  path,
  symbol,
  owner,
  index,
  depth,
  expected,
  state,
  present,
  child_contract
):
  Recursive.ordinary_preserves_member(
    fuel,
    query,
    facts,
    path,
    symbol,
    owner,
    index,
    depth,
    expected,
    state,
    present,
    child_contract
  )

def Support.named_preserves_member(
  fuel,
  query,
  target_id,
  facts,
  path,
  symbol,
  owner,
  index,
  depth,
  expected,
  state,
  present,
  child_contract
):
  Recursive.named_preserves_member(
    fuel,
    query,
    target_id,
    facts,
    path,
    symbol,
    owner,
    index,
    depth,
    expected,
    state,
    present,
    child_contract
  )

def Support.by_kind_preserves_member(
  fuel,
  query,
  kind,
  target_id,
  facts,
  path,
  symbol,
  owner,
  index,
  depth,
  expected,
  state,
  present,
  child_contract
):
  Recursive.by_kind_preserves_member(
    fuel,
    query,
    kind,
    target_id,
    facts,
    path,
    symbol,
    owner,
    index,
    depth,
    expected,
    state,
    present,
    child_contract
  )

def Support.reference_preserves_member(
  fuel,
  query,
  reference,
  facts,
  path,
  owner,
  index,
  depth,
  state,
  present,
  child_contract
):
  Recursive.reference_preserves_member(
    fuel,
    query,
    reference,
    facts,
    path,
    owner,
    index,
    depth,
    state,
    present,
    child_contract
  )

def Support.after_reference_preserves_member(
  fuel,
  query,
  result,
  tail,
  facts,
  path,
  owner,
  index,
  depth,
  present,
  sibling_contract
):
  Recursive.after_reference_preserves_member(
    fuel,
    query,
    result,
    tail,
    facts,
    path,
    owner,
    index,
    depth,
    present,
    sibling_contract
  )

def Support.references_preserves_member(
  fuel,
  query,
  items,
  facts,
  path,
  owner,
  index,
  depth,
  state,
  present,
  child_contract,
  sibling_contract
):
  Recursive.references_preserves_member(
    fuel,
    query,
    items,
    facts,
    path,
    owner,
    index,
    depth,
    state,
    present,
    child_contract,
    sibling_contract
  )

def Support.walk_declaration_preserves_member(
  fuel,
  query,
  found,
  facts,
  path,
  state,
  depth,
  present,
  child_contract
):
  Recursive.walk_declaration_preserves_member(
    fuel,
    query,
    found,
    facts,
    path,
    state,
    depth,
    present,
    child_contract
  )

def Support.dispatch_preserves_member(
  fuel,
  query,
  request,
  present,
  child_contract,
  sibling_contract
):
  Recursive.dispatch_preserves_member(
    fuel,
    query,
    request,
    present,
    child_contract,
    sibling_contract
  )

law interpret_preserves_visited:
  for fuel: Nat
  for +request: Spec.Request
  for +identity: Nat
  for present: {
    Own.contains(Bool, Measure.visited(Measure.request_state(request)), identity)
    == True{} : Bool
  }
  {
    Own.contains(
      Bool,
      Measure.visited(Measure.result_state(Spec.interpret(fuel, request))),
      identity
    )
    == True{}
    : Bool
  }


def interpret_preserves_visited(fuel, request, identity, present):
  match fuel:
    case 0n:
      %Equal.sym(
        Spec.State,
        Measure.result_state(Spec.insufficient(request)),
        Measure.request_state(request),
        Prim.insufficient_state_exact(request)
      ):
        {Member.member(_, identity) == True{} : Bool}
        present
    case 1n+++remaining:
      child_contract = {next => occurs => interpret_preserves_visited(remaining, next, identity, occurs): Member.contract(remaining, identity)}
      sibling_contract = {next => occurs => interpret_preserves_visited(remaining, next, identity, occurs): Member.contract(remaining, identity)}
      Support.dispatch_preserves_member(
        remaining,
        identity,
        request,
        present,
        child_contract,
        sibling_contract
      )
