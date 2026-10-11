import Base
import ./core.bend as Core
import ./Own.bend as Own
import ./NUMERIC_SPEC.bend as Spec
import ./NUMERIC_SPEC_RANK.bend as Measure
import ./NUMERIC_SPEC_MEMBERSHIP.bend as Member
import ./NUMERIC_SPEC_MEMBERSHIP_PRIMITIVE_PROOF.bend as Prim

# Exact isolated recursive transports from the Astra-approved owner.
law child_or_cycle_preserves_member:
for +fuel: Nat
  for +query: Nat
  for +already_seen: Bool
  for +state: Spec.State
  for +facts: Core.Facts
  for +path: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +identity: Nat
  for present: {Member.member(state, query) == True{} : Bool}
  for child_contract: Member.contract(fuel, query)
  {
    Member.reference_member(
      Spec.child_or_cycle(
        already_seen,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        identity,
        Spec.build_child(Spec.interpret(fuel))
      ),
      query
    )
    == True{}
    : Bool
  }

def child_or_cycle_preserves_member(
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
  match already_seen:
    case True{}: present
    case False{}:
      +request = {Spec.Request{facts, path, symbol, expected, (depth + 1n : Nat), state}: Spec.Request}
      +result = Spec.interpret(fuel, request)
      +build = Spec.as_build(result)
      %Equal.sym(
        Spec.State,
        Member.reference_state(Spec.expanded_result(build, symbol)),
        Measure.build_state(build),
        Prim.expanded_result_state_exact(build, symbol)
      ):
        {Member.member(_, query) == True{} : Bool}
        %Equal.sym(
          Spec.State,
          Measure.build_state(Spec.as_build(result)),
          Measure.result_state(result),
          Prim.as_build_state_exact(result)
        ):
          {Member.member(_, query) == True{} : Bool}
          child_contract(request, present)

law local_allowed_preserves_member:
for +fuel: Nat
  for +query: Nat
  for +permit: Bool
  for +state: Spec.State
  for +facts: Core.Facts
  for +path: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +identity: Nat
  for present: {Member.member(state, query) == True{} : Bool}
  for child_contract: Member.contract(fuel, query)
  {
    Member.reference_member(
      Spec.local_allowed(
        permit,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        identity,
        Spec.build_child(Spec.interpret(fuel))
      ),
      query
    )
    == True{}
    : Bool
  }

def local_allowed_preserves_member(
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
  match permit:
    case False{}: present
    case True{}: child_or_cycle_preserves_member(
      fuel,
      query,
      Spec.seen(state, identity),
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

law local_budget_preserves_member:
for +fuel: Nat
  for +query: Nat
  for +state: Spec.State
  for +facts: Core.Facts
  for +path: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +identity: Nat
  for present: {Member.member(state, query) == True{} : Bool}
  for child_contract: Member.contract(fuel, query)
  {
    Member.reference_member(
      Spec.local_budget(
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        identity,
        Spec.build_child(Spec.interpret(fuel))
      ),
      query
    )
    == True{}
    : Bool
  }

def local_budget_preserves_member(
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
  local_allowed_preserves_member(
    fuel,
    query,
    Spec.allowed(state, path),
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

law local_kind_preserves_member:
for +fuel: Nat
  for +query: Nat
  for +valid: Bool
  for +state: Spec.State
  for +facts: Core.Facts
  for +path: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +identity: Nat
  for present: {Member.member(state, query) == True{} : Bool}
  for child_contract: Member.contract(fuel, query)
  {
    Member.reference_member(
      Spec.local_kind(
        valid,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        identity,
        Spec.build_child(Spec.interpret(fuel))
      ),
      query
    )
    == True{}
    : Bool
  }

def local_kind_preserves_member(
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
  match valid:
    case False{}: present
    case True{}:
      changed_present = {%Equal.sym(Own.Dictionary<Bool>, Measure.visited(Spec.local_work(state)), Measure.visited(state), Prim.local_work_visited_exact(state)):
        {Own.contains(Bool, _, query) == True{} : Bool}
        present
        : {Member.member(Spec.local_work(state), query) == True{} : Bool}}
      local_budget_preserves_member(
        fuel,
        query,
        Spec.local_work(state),
        facts,
        path,
        symbol,
        depth,
        expected,
        identity,
        changed_present,
        child_contract
      )

law local_conflict_preserves_member:
for +fuel: Nat
  for +query: Nat
  for +imported: Maybe<&2, Core.ImportBinding>
  for +declaration: Core.Declaration
  for +state: Spec.State
  for +facts: Core.Facts
  for +path: Nat
  for +symbol: Core.Label
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for present: {Member.member(state, query) == True{} : Bool}
  for child_contract: Member.contract(fuel, query)
  {
    Member.reference_member(
      Spec.local_conflict(
        imported,
        declaration,
        state,
        facts,
        path,
        symbol,
        depth,
        expected,
        Spec.build_child(Spec.interpret(fuel))
      ),
      query
    )
    == True{}
    : Bool
  }

def local_conflict_preserves_member(
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
  match imported declaration:
    case Some{_} _: present
    case None{} Core.Declaration{_, +identity, +function, _, _}:
      local_kind_preserves_member(
        fuel,
        query,
        Spec.matches(expected, function),
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

law choose_local_preserves_member:
for +fuel: Nat
  for +query: Nat
  for +local: Maybe<&2, Core.Declaration>
  for +imported: Maybe<&2, Core.ImportBinding>
  for +state: Spec.State
  for +facts: Core.Facts
  for +path: Nat
  for +symbol: Core.Label
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for present: {Member.member(state, query) == True{} : Bool}
  for child_contract: Member.contract(fuel, query)
  {
    Member.reference_member(
      Spec.choose_local(
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
        Spec.build_child(Spec.interpret(fuel))
      ),
      query
    )
    == True{}
    : Bool
  }

def choose_local_preserves_member(
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
  match local:
    case Some{+declaration}: local_conflict_preserves_member(
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
    case None{}:
      %Equal.sym(
        Own.Dictionary<Bool>,
        Member.reference_visited(
          Spec.import_budget(
            Spec.allowed(state, path),
            imported,
            state,
            path,
            symbol,
            owner,
            index,
            depth,
            expected
          )
        ),
        Measure.visited(state),
        Prim.import_budget_visited_exact(
          Spec.allowed(state, path),
          imported,
          state,
          path,
          symbol,
          owner,
          index,
          depth,
          expected
        )
      ):
      {Own.contains(Bool, _, query) == True{} : Bool}
      present

law ordinary_found_preserves_member:
for +fuel: Nat
  for +query: Nat
  for +local: Maybe<&2, Core.Declaration>
  for +imported: Maybe<&2, Core.ImportBinding>
  for +state: Spec.State
  for +facts: Core.Facts
  for +path: Nat
  for +symbol: Core.Label
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for present: {Member.member(state, query) == True{} : Bool}
  for child_contract: Member.contract(fuel, query)
  {
    Member.reference_member(
      Spec.ordinary_found(
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
        Spec.build_child(Spec.interpret(fuel))
      ),
      query
    )
    == True{}
    : Bool
  }

def ordinary_found_preserves_member(
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
  +identity = Spec.identity_key(local, imported, path, symbol)
  changed_present = {%Equal.sym(Own.Dictionary<Bool>, Measure.visited(Spec.target(state, path, identity)), Measure.visited(state), Prim.target_visited_exact(state, path, identity)):
        {Own.contains(Bool, _, query) == True{} : Bool}
        present
    : {Member.member(Spec.target(state, path, identity), query) == True{} : Bool}}
  choose_local_preserves_member(
    fuel,
    query,
    local,
    imported,
    Spec.target(state, path, identity),
    facts,
    path,
    symbol,
    owner,
    index,
    depth,
    expected,
    changed_present,
    child_contract
  )

law ordinary_preserves_member:
for +fuel: Nat
  for +query: Nat
  for +facts: Core.Facts
  for +path: Nat
  for +symbol: Core.Label
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +state: Spec.State
  for present: {Member.member(state, query) == True{} : Bool}
  for child_contract: Member.contract(fuel, query)
  {
    Member.reference_member(
      Spec.ordinary(
        facts,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        state,
        Spec.build_child(Spec.interpret(fuel))
      ),
      query
    )
    == True{}
    : Bool
  }

def ordinary_preserves_member(
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
  ordinary_found_preserves_member(
    fuel,
    query,
    Spec.find_declaration(facts, symbol, expected),
    Spec.find_import(facts, symbol),
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

law named_preserves_member:
for +fuel: Nat
  for +query: Nat
  for +target_id: Maybe<&2, Nat>
  for +facts: Core.Facts
  for +path: Nat
  for +symbol: Core.Label
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +state: Spec.State
  for present: {Member.member(state, query) == True{} : Bool}
  for child_contract: Member.contract(fuel, query)
  {
    Member.reference_member(
      Spec.named(
        target_id,
        facts,
        path,
        symbol,
        owner,
        index,
        depth,
        expected,
        state,
        Spec.build_child(Spec.interpret(fuel))
      ),
      query
    )
    == True{}
    : Bool
  }

def named_preserves_member(
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
  match target_id:
    case None{}: ordinary_preserves_member(
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
    case Some{+identity}:
      %Equal.sym(
        Own.Dictionary<Bool>,
        Member.reference_visited(
          Spec.bundle_found(
            Spec.supporting(facts, identity),
            identity,
            expected,
            state,
            path,
            symbol,
            owner,
            index,
            depth
          )
        ),
        Measure.visited(state),
        Prim.bundle_found_visited_exact(
          Spec.supporting(facts, identity),
          identity,
          expected,
          state,
          path,
          symbol,
          owner,
          index,
          depth
        )
      ):
      {Own.contains(Bool, _, query) == True{} : Bool}
      present

law by_kind_preserves_member:
for +fuel: Nat
  for +query: Nat
  for +kind: Core.ReferenceKind
  for +target_id: Maybe<&2, Nat>
  for +facts: Core.Facts
  for +path: Nat
  for +symbol: Core.Label
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +expected: Core.ExpectedKind
  for +state: Spec.State
  for present: {Member.member(state, query) == True{} : Bool}
  for child_contract: Member.contract(fuel, query)
  {
    Member.reference_member(
      Spec.by_kind(
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
        Spec.build_child(Spec.interpret(fuel))
      ),
      query
    )
    == True{}
    : Bool
  }

def by_kind_preserves_member(
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
  match kind:
    case Core.Unsupported{}: present
    case Core.Named{}: named_preserves_member(
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

law reference_preserves_member:
for +fuel: Nat
  for +query: Nat
  for +reference: Core.Reference
  for +facts: Core.Facts
  for +path: Nat
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +state: Spec.State
  for present: {Member.member(state, query) == True{} : Bool}
  for child_contract: Member.contract(fuel, query)
  {
    Member.reference_member(
      Spec.reference(
        reference,
        facts,
        path,
        owner,
        index,
        depth,
        state,
        Spec.build_child(Spec.interpret(fuel))
      ),
      query
    )
    == True{}
    : Bool
  }

def reference_preserves_member(
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
  match reference:
    case Core.Reference{+kind, +symbol, +expected, +target_id}:
      changed_present = {%Equal.sym(Own.Dictionary<Bool>, Measure.visited(Spec.reference_depth(state, (depth + 1n : Nat))), Measure.visited(state), Prim.reference_depth_visited_exact(state, (depth + 1n : Nat))):
        {Own.contains(Bool, _, query) == True{} : Bool}
        present
        : {Member.member(Spec.reference_depth(state, (depth + 1n : Nat)), query) == True{} : Bool}}
      by_kind_preserves_member(
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
        Spec.reference_depth(state, (depth + 1n : Nat)),
        changed_present,
        child_contract
      )

law after_reference_preserves_member:
for +fuel: Nat
  for +query: Nat
  for +result: Spec.ReferenceResult
  for +tail: List<&2, Core.Reference>
  for +facts: Core.Facts
  for +path: Nat
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for present: {Member.reference_member(result, query) == True{} : Bool}
  for sibling_contract: Member.contract(fuel, query)
  {
    Member.member(
      Measure.references_state(
        Spec.after_reference(
          result,
          Spec.references_sibling(tail, facts, path, owner, index, depth, Spec.interpret(fuel))
        )
      ),
      query
    )
    == True{}
    : Bool
  }

def after_reference_preserves_member(
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
  match result:
    case Spec.ReferenceFailure{+state}: present
    case Spec.ReferenceResult{+state, +reference}:
      +request = {Spec.ReferencesRequest{tail, facts, path, owner, index, depth, state}: Spec.Request}
      +result = Spec.interpret(fuel, request)
      +references = Spec.as_references(result)
      %Equal.sym(
        Spec.State,
        Measure.references_state(Spec.prepend(references, reference)),
        Measure.references_state(references),
        Prim.prepend_state_exact(references, reference)
      ):
        {Member.member(_, query) == True{} : Bool}
        %Equal.sym(
          Spec.State,
          Measure.references_state(Spec.as_references(result)),
          Measure.result_state(result),
          Prim.as_references_state_exact(result)
        ):
          {Member.member(_, query) == True{} : Bool}
          sibling_contract(request, present)

law references_preserves_member:
for +fuel: Nat
  for +query: Nat
  for +items: List<&2, Core.Reference>
  for +facts: Core.Facts
  for +path: Nat
  for +owner: Nat
  for +index: Nat
  for +depth: Nat
  for +state: Spec.State
  for present: {Member.member(state, query) == True{} : Bool}
  for child_contract: Member.contract(fuel, query)
  for sibling_contract: Member.contract(fuel, query)
  {
    Member.member(
      Measure.references_state(
        Spec.references(
          items,
          facts,
          path,
          owner,
          index,
          depth,
          state,
          Spec.interpret(fuel),
          Spec.interpret(fuel)
        )
      ),
      query
    )
    == True{}
    : Bool
  }

def references_preserves_member(
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
  match items:
    case []: present
    case +head <> +tail:
      +result = Spec.reference(
        head,
        facts,
        path,
        owner,
        index,
        depth,
        state,
        Spec.build_child(Spec.interpret(fuel))
      )
      head_present = reference_preserves_member(
        fuel,
        query,
        head,
        facts,
        path,
        owner,
        index,
        depth,
        state,
        present,
        child_contract
      )
      after_reference_preserves_member(
        fuel,
        query,
        result,
        tail,
        facts,
        path,
        owner,
        (index + 1n : Nat),
        depth,
        head_present,
        sibling_contract
      )

law walk_declaration_preserves_member:
for +fuel: Nat
  for +query: Nat
  for +found: Maybe<&2, Core.Declaration>
  for +facts: Core.Facts
  for +path: Nat
  for +state: Spec.State
  for +depth: Nat
  for present: {Member.member(state, query) == True{} : Bool}
  for child_contract: Member.contract(fuel, query)
  {
    Member.member(
      Measure.build_state(
        Spec.walk_declaration(found, facts, path, state, depth, Spec.interpret(fuel))
      ),
      query
    )
    == True{}
    : Bool
  }

def walk_declaration_preserves_member(
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
  match found:
    case None{}: present
    case Some{Core.Declaration{+artifact, +identity, _, _, +children}}:
      +changed = Spec.enter(state, path, identity)
      +request = {Spec.ReferencesRequest{children, facts, path, Spec.address(state), 0n, depth, changed}: Spec.Request}
      +result = Spec.interpret(fuel, request)
      +references = Spec.as_references(result)
      %Equal.sym(
        Spec.State,
        Measure.build_state(Spec.tree_result(references, Spec.address(state), artifact)),
        Measure.references_state(references),
        Prim.tree_result_state_exact(references, Spec.address(state), artifact)
      ):
        {Member.member(_, query) == True{} : Bool}
        %Equal.sym(
          Spec.State,
          Measure.references_state(Spec.as_references(result)),
          Measure.result_state(result),
          Prim.as_references_state_exact(result)
        ):
          {Member.member(_, query) == True{} : Bool}
          child_contract(
            request,
            Prim.enter_preserves_member(state, path, identity, query, present)
          )

law dispatch_preserves_member:
for +fuel: Nat
  for +query: Nat
  for +request: Spec.Request
  for present: {Member.request_member(request, query) == True{} : Bool}
  for child_contract: Member.contract(fuel, query)
  for sibling_contract: Member.contract(fuel, query)
  {
    Member.result_member(Spec.dispatch(request, Spec.interpret(fuel), Spec.interpret(fuel)), query)
    == True{}
    : Bool
  }

def dispatch_preserves_member(fuel, query, request, present, child_contract, sibling_contract):
  match request:
    case Spec.Request{+facts, +path, +name, +expected, +depth, +state}:
      walk_declaration_preserves_member(
        fuel,
        query,
        Spec.find_declaration(facts, name, expected),
        facts,
        path,
        state,
        depth,
        present,
        child_contract
      )
    case Spec.ReferencesRequest{+items, +facts, +path, +owner, +index, +depth, +state}:
      references_preserves_member(
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
