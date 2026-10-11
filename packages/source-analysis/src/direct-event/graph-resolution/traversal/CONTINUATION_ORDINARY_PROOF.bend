import Base
import ./core.bend as Core
import ./Traversal.bend as CoreTraversal
import ./SPEC.bend as Spec
import ./RELATION.bend as Relation
import ./CONTINUATION_MACHINE_PROOF.bend as Machine
import ./CONTINUATION_REFERENCE_PROOF.bend as Reference
import ./CONTINUATION_STATE_PROOF.bend as State
import ./INTERPRETER_COMPLETION_RELATION.bend as C
import ./patricia-proof/PATRICIA_RELATION.bend as Patricia

# Full actual local branch, with the selected lookup supplied by ordinary lookup.
# The recursive observation equation is the already checked concrete expansion.
def local_expand_if_exact(
  +seen: Bool,
  +fuel: Nat,
  +machine: Core.Machine,
  +declaration: Core.Declaration,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool},
  enough: {Nat.is_le(Relation.spec_bound(CoreTraversal.machine_facts(machine)), fuel) == True{} : Bool},
  found: {
    Spec.find_declaration(CoreTraversal.machine_facts(machine), symbol, expected)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
) -> {
  Machine.evaluate(
    fuel,
    CoreTraversal.local_expand_if(seen, machine, declaration, owner, index, symbol, (depth + 1n : Nat))
  )
    == Reference.observation(
      Spec.child_or_cycle(
        seen,
        State.state(machine),
        CoreTraversal.machine_facts(machine),
        CoreTraversal.machine_path(machine),
        symbol,
        depth,
        expected,
        CoreTraversal.declaration_identity(declaration),
        next => C.build_child(fuel)(Spec.source_child_request(CoreTraversal.declaration_source(declaration), next))
      ),
      machine,
      fuel,
      owner,
      index
    )
    : Relation.Observation
}:
  match seen:
    case True{}: Reference.included_exact(
      fuel,
      machine,
      owner,
      index,
      symbol,
      CoreTraversal.declaration_identity(declaration)
    )
    case False{}:
      %State.declaration_path_exact(declaration, CoreTraversal.machine_path(machine)):
        {Machine.evaluate(fuel, CoreTraversal.local_expand_if(False{}, machine, declaration,
          owner, index, symbol, (depth + 1n : Nat)))
          == Reference.observation(Spec.expanded_result(Spec.as_build(Spec.interpret(fuel,
            Spec.Request{CoreTraversal.machine_facts(machine), _, symbol, expected,
              (depth + 1n : Nat), State.state(machine)})), symbol), machine, fuel, owner, index)
          : Relation.Observation}
      Reference.selected_expansion_exact(
      fuel,
      machine,
      declaration,
      owner,
      index,
      symbol,
      expected,
      (depth + 1n : Nat),
      valid,
      enough,
      found
    )

def observed_cycle(
  +machine: Core.Machine,
  +declaration: Core.Declaration,
  +fuel: Nat,
  +owner: Nat,
  +index: Nat,
  symbol: String,
  depth: Nat,
  expected: Core.ExpectedKind,
  seen: Bool
) -> Relation.Observation:
  Reference.observation(
    Spec.child_or_cycle(
      seen,
      State.state(machine),
      CoreTraversal.machine_facts(machine),
      CoreTraversal.machine_path(machine),
      symbol,
      depth,
      expected,
      CoreTraversal.declaration_identity(declaration),
      next => C.build_child(fuel)(Spec.source_child_request(CoreTraversal.declaration_source(declaration), next))
    ),
    machine,
    fuel,
    owner,
    index
  )

def local_expand_exact(
  +fuel: Nat,
  +machine: Core.Machine,
  +declaration: Core.Declaration,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool},
  enough: {Nat.is_le(Relation.spec_bound(CoreTraversal.machine_facts(machine)), fuel) == True{} : Bool},
  found: {
    Spec.find_declaration(CoreTraversal.machine_facts(machine), symbol, expected)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
) -> {
      Machine.evaluate(
        fuel,
        CoreTraversal.local_expand(machine, declaration, owner, index, symbol, (depth + 1n : Nat))
      )
      == observed_cycle(
        machine,
        declaration,
        fuel,
        owner,
        index,
        symbol,
        depth,
        expected,
        Spec.seen(State.state(machine), CoreTraversal.declaration_identity(declaration))
      )
      : Relation.Observation
    }:
  Equal.trans(
    Relation.Observation,
    Machine.evaluate(
      fuel,
      CoreTraversal.local_expand(machine, declaration, owner, index, symbol, (depth + 1n : Nat))
    ),
    observed_cycle(
      machine,
      declaration,
      fuel,
      owner,
      index,
      symbol,
      depth,
      expected,
      CoreTraversal.has_identity(CoreTraversal.machine_visited(machine), CoreTraversal.declaration_identity(declaration))
    ),
    observed_cycle(
      machine,
      declaration,
      fuel,
      owner,
      index,
      symbol,
      depth,
      expected,
      Spec.seen(State.state(machine), CoreTraversal.declaration_identity(declaration))
    ),
    local_expand_if_exact(
      CoreTraversal.has_identity(CoreTraversal.machine_visited(machine), CoreTraversal.declaration_identity(declaration)),
      fuel,
      machine,
      declaration,
      owner,
      index,
      symbol,
      depth,
      expected,
      valid,
      enough,
      found
    ),
    Equal.cong(
      Bool,
      Relation.Observation,
      observed_cycle(machine, declaration, fuel, owner, index, symbol, depth, expected),
      CoreTraversal.has_identity(CoreTraversal.machine_visited(machine), CoreTraversal.declaration_identity(declaration)),
      Spec.seen(State.state(machine), CoreTraversal.declaration_identity(declaration)),
      State.seen_exact(machine, CoreTraversal.declaration_identity(declaration))
    )
  )

def observed_local_permit(
  +machine: Core.Machine,
  +declaration: Core.Declaration,
  +fuel: Nat,
  +owner: Nat,
  +index: Nat,
  symbol: String,
  depth: Nat,
  expected: Core.ExpectedKind,
  permit: Bool
) -> Relation.Observation:
  Reference.observation(
    Spec.local_allowed(
      permit,
      State.state(machine),
      CoreTraversal.machine_facts(machine),
      CoreTraversal.machine_path(machine),
      symbol,
      depth,
      expected,
      CoreTraversal.declaration_identity(declaration),
      next => C.build_child(fuel)(Spec.source_child_request(CoreTraversal.declaration_source(declaration), next))
    ),
    machine,
    fuel,
    owner,
    index
  )

def local_permit_exact(
  +permit: Bool,
  +fuel: Nat,
  +machine: Core.Machine,
  +declaration: Core.Declaration,
  +imported: Maybe<&2, Core.ImportBinding>,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool},
  enough: {Nat.is_le(Relation.spec_bound(CoreTraversal.machine_facts(machine)), fuel) == True{} : Bool},
  found: {
    Spec.find_declaration(CoreTraversal.machine_facts(machine), symbol, expected)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
) -> {
      Machine.evaluate(
        fuel,
        CoreTraversal.ordinary_budget(
          permit,
          Some{declaration},
          imported,
          machine,
          owner,
          index,
          symbol,
          depth,
          expected
        )
      )
      == observed_local_permit(
        machine,
        declaration,
        fuel,
        owner,
        index,
        symbol,
        depth,
        expected,
        permit
      )
      : Relation.Observation
    }:
  match permit:
    case False{}: Reference.omitted_exact(
      fuel,
      machine,
      owner,
      index,
      symbol,
      Core.ReferenceLimit{}
    )
    case True{}: local_expand_exact(
      fuel,
      machine,
      declaration,
      owner,
      index,
      symbol,
      depth,
      expected,
      valid,
      enough,
      found
    )

def local_charged_exact(
  +fuel: Nat,
  +machine: Core.Machine,
  +declaration: Core.Declaration,
  +imported: Maybe<&2, Core.ImportBinding>,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool},
  enough: {Nat.is_le(Relation.spec_bound(CoreTraversal.machine_facts(machine)), fuel) == True{} : Bool},
  found: {
    Spec.find_declaration(CoreTraversal.machine_facts(machine), symbol, expected)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
) -> {
      Machine.evaluate(
        fuel,
        CoreTraversal.ordinary_charged(
          machine,
          Some{declaration},
          imported,
          owner,
          index,
          symbol,
          depth,
          expected
        )
      )
      == Reference.observation(
        Spec.local_budget(
          State.state(machine),
          CoreTraversal.machine_facts(machine),
          CoreTraversal.machine_path(machine),
          symbol,
          depth,
          expected,
          CoreTraversal.declaration_identity(declaration),
          next => C.build_child(fuel)(Spec.source_child_request(CoreTraversal.declaration_source(declaration), next))
        ),
        machine,
        fuel,
        owner,
        index
      )
      : Relation.Observation
    }:
  Equal.trans(
    Relation.Observation,
    Machine.evaluate(
      fuel,
      CoreTraversal.ordinary_charged(
        machine,
        Some{declaration},
        imported,
        owner,
        index,
        symbol,
        depth,
        expected
      )
    ),
    observed_local_permit(
      machine,
      declaration,
      fuel,
      owner,
      index,
      symbol,
      depth,
      expected,
      CoreTraversal.machine_allows(machine)
    ),
    observed_local_permit(
      machine,
      declaration,
      fuel,
      owner,
      index,
      symbol,
      depth,
      expected,
      Spec.allowed(State.state(machine), CoreTraversal.machine_path(machine))
    ),
    local_permit_exact(
      CoreTraversal.machine_allows(machine),
      fuel,
      machine,
      declaration,
      imported,
      owner,
      index,
      symbol,
      depth,
      expected,
      valid,
      enough,
      found
    ),
    Equal.cong(
      Bool,
      Relation.Observation,
      observed_local_permit(machine, declaration, fuel, owner, index, symbol, depth, expected),
      CoreTraversal.machine_allows(machine),
      Spec.allowed(State.state(machine), CoreTraversal.machine_path(machine)),
      State.allowed_exact(machine)
    )
  )

def observed_import_permit(
  +machine: Core.Machine,
  imported: Maybe<&2, Core.ImportBinding>,
  fuel: Nat,
  +owner: Nat,
  +index: Nat,
  symbol: String,
  depth: Nat,
  expected: Core.ExpectedKind,
  permit: Bool
) -> Relation.Observation:
  Reference.observation(
    Spec.import_budget(
      permit,
      imported,
      State.state(machine),
      CoreTraversal.machine_path(machine),
      symbol,
      owner,
      index,
      depth,
      expected
    ),
    machine,
    fuel,
    owner,
    index
  )

def import_permit_exact(
  +permit: Bool,
  +fuel: Nat,
  +machine: Core.Machine,
  +imported: Maybe<&2, Core.ImportBinding>,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind
) -> {
      Machine.evaluate(
        fuel,
        CoreTraversal.ordinary_budget(
          permit,
          None{},
          imported,
          machine,
          owner,
          index,
          symbol,
          depth,
          expected
        )
      )
      == observed_import_permit(
        machine,
        imported,
        fuel,
        owner,
        index,
        symbol,
        depth,
        expected,
        permit
      )
      : Relation.Observation
    }:
  match permit:
    case False{}: Reference.omitted_exact(
      fuel,
      machine,
      owner,
      index,
      symbol,
      Core.ReferenceLimit{}
    )
    case True{}: Reference.import_present_exact(
      fuel,
      machine,
      owner,
      index,
      symbol,
      depth,
      expected,
      imported
    )

def import_charged_exact(
  +fuel: Nat,
  +machine: Core.Machine,
  +imported: Maybe<&2, Core.ImportBinding>,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind
) -> {
      Machine.evaluate(
        fuel,
        CoreTraversal.ordinary_charged(machine, None{}, imported, owner, index, symbol, depth, expected)
      )
      == observed_import_permit(
        machine,
        imported,
        fuel,
        owner,
        index,
        symbol,
        depth,
        expected,
        Spec.allowed(State.state(machine), CoreTraversal.machine_path(machine))
      )
      : Relation.Observation
    }:
  Equal.trans(
    Relation.Observation,
    Machine.evaluate(
      fuel,
      CoreTraversal.ordinary_charged(machine, None{}, imported, owner, index, symbol, depth, expected)
    ),
    observed_import_permit(
      machine,
      imported,
      fuel,
      owner,
      index,
      symbol,
      depth,
      expected,
      CoreTraversal.machine_allows(machine)
    ),
    observed_import_permit(
      machine,
      imported,
      fuel,
      owner,
      index,
      symbol,
      depth,
      expected,
      Spec.allowed(State.state(machine), CoreTraversal.machine_path(machine))
    ),
    import_permit_exact(
      CoreTraversal.machine_allows(machine),
      fuel,
      machine,
      imported,
      owner,
      index,
      symbol,
      depth,
      expected
    ),
    Equal.cong(
      Bool,
      Relation.Observation,
      observed_import_permit(machine, imported, fuel, owner, index, symbol, depth, expected),
      CoreTraversal.machine_allows(machine),
      Spec.allowed(State.state(machine), CoreTraversal.machine_path(machine)),
      State.allowed_exact(machine)
    )
  )

def work_context(+fuel: Nat, +machine: Core.Machine, +declaration: Core.Declaration,
    +owner: Nat, +index: Nat, +symbol: String, +depth: Nat, +expected: Core.ExpectedKind) -> {
      Reference.observation(
        Spec.local_budget(
          State.state(CoreTraversal.charge_machine_work(machine)),
          CoreTraversal.machine_facts(CoreTraversal.charge_machine_work(machine)),
          CoreTraversal.machine_path(CoreTraversal.charge_machine_work(machine)),
          symbol,
          depth,
          expected,
          CoreTraversal.declaration_identity(declaration),
          next => C.build_child(fuel)(Spec.source_child_request(CoreTraversal.declaration_source(declaration), next))
        ),
        CoreTraversal.charge_machine_work(machine),
        fuel,
        owner,
        index
      )
      == Reference.observation(
        Spec.local_budget(
          Spec.local_work(State.state(machine)),
          CoreTraversal.machine_facts(machine),
          CoreTraversal.machine_path(machine),
          symbol,
          depth,
          expected,
          CoreTraversal.declaration_identity(declaration),
          next => C.build_child(fuel)(Spec.source_child_request(CoreTraversal.declaration_source(declaration), next))
        ),
        machine,
        fuel,
        owner,
        index
      )
      : Relation.Observation
    }:
  match machine:
    case Core.Machine{
      +facts,
      +root_path,
      +frames,
      +visited,
      +budget,
      +address,
      +nodes,
      +slots,
      +pending
    }:
      +path = CoreTraversal.frame_path(frames, root_path)
      +machine = {Core.Machine{facts, root_path, frames, visited, budget, address, nodes, slots, pending} : Core.Machine}
      %State.work_exact(machine):
        {
          Reference.observation(
            Spec.local_budget(
              State.state(CoreTraversal.charge_machine_work(machine)),
              facts,
              path,
              symbol,
              depth,
              expected,
              CoreTraversal.declaration_identity(declaration),
              next => C.build_child(fuel)(Spec.source_child_request(CoreTraversal.declaration_source(declaration), next))
            ),
            CoreTraversal.charge_machine_work(machine),
            fuel,
            owner,
            index
          )
          == Reference.observation(
            Spec.local_budget(
              _,
              facts,
              path,
              symbol,
              depth,
              expected,
              CoreTraversal.declaration_identity(declaration),
              next => C.build_child(fuel)(Spec.source_child_request(CoreTraversal.declaration_source(declaration), next))
            ),
            machine,
            fuel,
            owner,
            index
          )
          : Relation.Observation
        }
      Reference.budget_context(
        Spec.local_budget(
          State.state(CoreTraversal.charge_machine_work(machine)),
          facts,
          path,
          symbol,
          depth,
          expected,
          CoreTraversal.declaration_identity(declaration),
          next => C.build_child(fuel)(Spec.source_child_request(CoreTraversal.declaration_source(declaration), next))
        ),
        machine,
        CoreTraversal.charge_work(budget),
        fuel,
        owner,
        index
      )

def work_exact(
  +fuel: Nat,
  +machine: Core.Machine,
  +declaration: Core.Declaration,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool},
  enough: {Nat.is_le(Relation.spec_bound(CoreTraversal.machine_facts(machine)), fuel) == True{} : Bool},
  found: {
    Spec.find_declaration(CoreTraversal.machine_facts(machine), symbol, expected)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
) -> {
      Machine.evaluate(
        fuel,
        CoreTraversal.ordinary_charged(
          CoreTraversal.charge_machine_work(machine),
          Some{declaration},
          None{},
          owner,
          index,
          symbol,
          depth,
          expected
        )
      )
      == Reference.observation(
        Spec.local_budget(
          Spec.local_work(State.state(machine)),
          CoreTraversal.machine_facts(machine),
          CoreTraversal.machine_path(machine),
          symbol,
          depth,
          expected,
          CoreTraversal.declaration_identity(declaration),
          next => C.build_child(fuel)(Spec.source_child_request(CoreTraversal.declaration_source(declaration), next))
        ),
        machine,
        fuel,
        owner,
        index
      )
      : Relation.Observation
    }:
  match machine:
    case Core.Machine{
      +facts,
      +root_path,
      +frames,
      +visited,
      +budget,
      +address,
      +nodes,
      +slots,
      +pending
    }:
      +path = CoreTraversal.frame_path(frames, root_path)
      +machine = {Core.Machine{facts, root_path, frames, visited, budget, address, nodes, slots, pending} : Core.Machine}
      Equal.trans(
        Relation.Observation,
        Machine.evaluate(
          fuel,
          CoreTraversal.ordinary_charged(
            CoreTraversal.charge_machine_work(machine),
            Some{declaration},
            None{},
            owner,
            index,
            symbol,
            depth,
            expected
          )
        ),
        Reference.observation(
          Spec.local_budget(
            State.state(CoreTraversal.charge_machine_work(machine)),
            facts,
            path,
            symbol,
            depth,
            expected,
            CoreTraversal.declaration_identity(declaration),
            next => C.build_child(fuel)(Spec.source_child_request(CoreTraversal.declaration_source(declaration), next))
          ),
          CoreTraversal.charge_machine_work(machine),
          fuel,
          owner,
          index
        ),
        Reference.observation(
          Spec.local_budget(
            Spec.local_work(State.state(machine)),
            facts,
            path,
            symbol,
            depth,
            expected,
            CoreTraversal.declaration_identity(declaration),
            next => C.build_child(fuel)(Spec.source_child_request(CoreTraversal.declaration_source(declaration), next))
          ),
          machine,
          fuel,
          owner,
          index
        ),
        local_charged_exact(
          fuel,
          CoreTraversal.charge_machine_work(machine),
          declaration,
          None{},
          owner,
          index,
          symbol,
          depth,
          expected,
          valid,
          enough,
          found
        ),
        work_context(fuel, machine, declaration, owner, index, symbol, depth, expected)
      )

def observed_kind(
  +machine: Core.Machine,
  +declaration: Core.Declaration,
  +fuel: Nat,
  +owner: Nat,
  +index: Nat,
  symbol: String,
  depth: Nat,
  expected: Core.ExpectedKind,
  kind: Bool
) -> Relation.Observation:
  Reference.observation(
    Spec.local_kind(
      kind,
      State.state(machine),
      CoreTraversal.machine_facts(machine),
      CoreTraversal.machine_path(machine),
      symbol,
      depth,
      expected,
      CoreTraversal.declaration_identity(declaration),
      next => C.build_child(fuel)(Spec.source_child_request(CoreTraversal.declaration_source(declaration), next))
    ),
    machine,
    fuel,
    owner,
    index
  )

def kind_exact(
  +kind: Bool,
  +fuel: Nat,
  +machine: Core.Machine,
  +declaration: Core.Declaration,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool},
  enough: {Nat.is_le(Relation.spec_bound(CoreTraversal.machine_facts(machine)), fuel) == True{} : Bool},
  found: {
    Spec.find_declaration(CoreTraversal.machine_facts(machine), symbol, expected)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
) -> {
      Machine.evaluate(
        fuel,
        CoreTraversal.ordinary_ambiguity(
          Bool.not(kind),
          Some{declaration},
          None{},
          machine,
          owner,
          index,
          symbol,
          depth,
          expected
        )
      )
      == observed_kind(machine, declaration, fuel, owner, index, symbol, depth, expected, kind)
      : Relation.Observation
    }:
  match kind:
    case False{}: Reference.omitted_exact(
      fuel,
      machine,
      owner,
      index,
      symbol,
      Core.UnsupportedTarget{}
    )
    case True{}: work_exact(
      fuel,
      machine,
      declaration,
      owner,
      index,
      symbol,
      depth,
      expected,
      valid,
      enough,
      found
    )

def conflict_exact(
  +imported: Maybe<&2, Core.ImportBinding>,
  +declaration: Core.Declaration,
  +fuel: Nat,
  +machine: Core.Machine,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool},
  enough: {Nat.is_le(Relation.spec_bound(CoreTraversal.machine_facts(machine)), fuel) == True{} : Bool},
  found: {
    Spec.find_declaration(CoreTraversal.machine_facts(machine), symbol, expected)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
) -> {
      Machine.evaluate(
        fuel,
        CoreTraversal.ordinary_ambiguity(
          CoreTraversal.ambiguous(Some{declaration}, imported, expected),
          Some{declaration},
          imported,
          machine,
          owner,
          index,
          symbol,
          depth,
          expected
        )
      )
      == Reference.observation(
        Spec.local_conflict(
          imported,
          declaration,
          State.state(machine),
          CoreTraversal.machine_facts(machine),
          CoreTraversal.machine_path(machine),
          symbol,
          depth,
          expected,
          C.build_child(fuel)
        ),
        machine,
        fuel,
        owner,
        index
      )
      : Relation.Observation
    }:
  match imported declaration:
    case Some{_} Core.Declaration{_, _, _, _, _, +source_path}:
      Reference.omitted_exact(fuel, machine, owner, index, symbol, Core.UnsupportedTarget{})
    case None{} Core.Declaration{+artifact, +identity, +function, +bundled, +references, +source_path}:
      +declaration = {Core.Declaration{artifact, identity, function, bundled, references, source_path} : Core.Declaration}
      Equal.trans(
        Relation.Observation,
        Machine.evaluate(
          fuel,
          CoreTraversal.ordinary_ambiguity(
            Bool.not(CoreTraversal.kind_matches(expected, function)),
            Some{declaration},
            None{},
            machine,
            owner,
            index,
            symbol,
            depth,
            expected
          )
        ),
        observed_kind(
          machine,
          declaration,
          fuel,
          owner,
          index,
          symbol,
          depth,
          expected,
          CoreTraversal.kind_matches(expected, function)
        ),
        observed_kind(
          machine,
          declaration,
          fuel,
          owner,
          index,
          symbol,
          depth,
          expected,
          Spec.matches(expected, function)
        ),
        kind_exact(
          CoreTraversal.kind_matches(expected, function),
          fuel,
          machine,
          declaration,
          owner,
          index,
          symbol,
          depth,
          expected,
          valid,
          enough,
          found
        ),
        Equal.cong(
          Bool,
          Relation.Observation,
          observed_kind(machine, declaration, fuel, owner, index, symbol, depth, expected),
          CoreTraversal.kind_matches(expected, function),
          Spec.matches(expected, function),
          State.kind_exact(expected, function)
        )
      )

def choose_exact(
  +local: Maybe<&2, Core.Declaration>,
  +imported: Maybe<&2, Core.ImportBinding>,
  +fuel: Nat,
  +machine: Core.Machine,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool},
  enough: {Nat.is_le(Relation.spec_bound(CoreTraversal.machine_facts(machine)), fuel) == True{} : Bool},
  found: {
    Spec.find_declaration(CoreTraversal.machine_facts(machine), symbol, expected)
    == local
    : Maybe<&2, Core.Declaration>
  }
) -> {
  Machine.evaluate(
    fuel,
    CoreTraversal.ordinary_ambiguity(
      CoreTraversal.ambiguous(local, imported, expected),
      local,
      imported,
      machine,
      owner,
      index,
      symbol,
      depth,
      expected
    )
  )
    == Reference.observation(
      Spec.choose_local(
        local,
        imported,
        State.state(machine),
        CoreTraversal.machine_facts(machine),
        CoreTraversal.machine_path(machine),
        symbol,
        owner,
        index,
        depth,
        expected,
        C.build_child(fuel)
      ),
      machine,
      fuel,
      owner,
      index
    )
    : Relation.Observation
}:
  match local:
    case None{}: import_charged_exact(
      fuel,
      machine,
      imported,
      owner,
      index,
      symbol,
      depth,
      expected
    )
    case Some{declaration}: conflict_exact(
      imported,
      declaration,
      fuel,
      machine,
      owner,
      index,
      symbol,
      depth,
      expected,
      valid,
      enough,
      found
    )

def observed_target(
  +machine: Core.Machine,
  local: Maybe<&2, Core.Declaration>,
  imported: Maybe<&2, Core.ImportBinding>,
  +fuel: Nat,
  +owner: Nat,
  +index: Nat,
  symbol: String,
  depth: Nat,
  expected: Core.ExpectedKind,
  key: String
) -> Relation.Observation:
  Reference.observation(
    Spec.choose_local(
      local,
      imported,
      Spec.target(State.state(machine), CoreTraversal.machine_path(machine), key),
      CoreTraversal.machine_facts(machine),
      CoreTraversal.machine_path(machine),
      symbol,
      owner,
      index,
      depth,
      expected,
      C.build_child(fuel)
    ),
    machine,
    fuel,
    owner,
    index
  )

def target_context(
  +key: String,
  +local: Maybe<&2, Core.Declaration>,
  +imported: Maybe<&2, Core.ImportBinding>,
  +fuel: Nat,
  +machine: Core.Machine,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind
) -> {
      Reference.observation(
        Spec.choose_local(
          local,
          imported,
          State.state(CoreTraversal.charge_machine_target(machine, key)),
          CoreTraversal.machine_facts(CoreTraversal.charge_machine_target(machine, key)),
          CoreTraversal.machine_path(CoreTraversal.charge_machine_target(machine, key)),
          symbol,
          owner,
          index,
          depth,
          expected,
          C.build_child(fuel)
        ),
        CoreTraversal.charge_machine_target(machine, key),
        fuel,
        owner,
        index
      )
      == observed_target(machine, local, imported, fuel, owner, index, symbol, depth, expected, key)
      : Relation.Observation
    }:
  match machine:
    case Core.Machine{
      +facts,
      +root_path,
      +frames,
      +visited,
      +budget,
      +address,
      +nodes,
      +slots,
      +pending
    }:
      +path = CoreTraversal.frame_path(frames, root_path)
      +machine = {Core.Machine{facts, root_path, frames, visited, budget, address, nodes, slots, pending} : Core.Machine}
      %State.target_exact(machine, key):
        {
          Reference.observation(
            Spec.choose_local(
              local,
              imported,
              State.state(CoreTraversal.charge_machine_target(machine, key)),
              facts,
              path,
              symbol,
              owner,
              index,
              depth,
              expected,
              C.build_child(fuel)
            ),
            CoreTraversal.charge_machine_target(machine, key),
            fuel,
            owner,
            index
          )
          == Reference.observation(
            Spec.choose_local(
              local,
              imported,
              _,
              facts,
              path,
              symbol,
              owner,
              index,
              depth,
              expected,
              C.build_child(fuel)
            ),
            machine,
            fuel,
            owner,
            index
          )
          : Relation.Observation
        }
      Reference.budget_context(
        Spec.choose_local(
          local,
          imported,
          State.state(CoreTraversal.charge_machine_target(machine, key)),
          facts,
          path,
          symbol,
          owner,
          index,
          depth,
          expected,
          C.build_child(fuel)
        ),
        machine,
        CoreTraversal.charge_target(budget, path, key),
        fuel,
        owner,
        index
      )

def target_key_branch_exact(
  +key: String,
  +local: Maybe<&2, Core.Declaration>,
  +imported: Maybe<&2, Core.ImportBinding>,
  +fuel: Nat,
  +machine: Core.Machine,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool},
  enough: {Nat.is_le(Relation.spec_bound(CoreTraversal.machine_facts(machine)), fuel) == True{} : Bool},
  found: {
    Spec.find_declaration(CoreTraversal.machine_facts(machine), symbol, expected)
    == local
    : Maybe<&2, Core.Declaration>
  }
) -> {
      Machine.evaluate(
        fuel,
        CoreTraversal.ordinary_ambiguity(
          CoreTraversal.ambiguous(local, imported, expected),
          local,
          imported,
          CoreTraversal.charge_machine_target(machine, key),
          owner,
          index,
          symbol,
          depth,
          expected
        )
      )
      == observed_target(machine, local, imported, fuel, owner, index, symbol, depth, expected, key)
      : Relation.Observation
    }:
  match machine:
    case Core.Machine{
      +facts,
      +root_path,
      +frames,
      +visited,
      +budget,
      +address,
      +nodes,
      +slots,
      +pending
    }:
      +path = CoreTraversal.frame_path(frames, root_path)
      +machine = {Core.Machine{facts, root_path, frames, visited, budget, address, nodes, slots, pending} : Core.Machine}
      Equal.trans(
        Relation.Observation,
        Machine.evaluate(
          fuel,
          CoreTraversal.ordinary_ambiguity(
            CoreTraversal.ambiguous(local, imported, expected),
            local,
            imported,
            CoreTraversal.charge_machine_target(machine, key),
            owner,
            index,
            symbol,
            depth,
            expected
          )
        ),
        Reference.observation(
          Spec.choose_local(
            local,
            imported,
            State.state(CoreTraversal.charge_machine_target(machine, key)),
            facts,
            path,
            symbol,
            owner,
            index,
            depth,
            expected,
            C.build_child(fuel)
          ),
          CoreTraversal.charge_machine_target(machine, key),
          fuel,
          owner,
          index
        ),
        observed_target(machine, local, imported, fuel, owner, index, symbol, depth, expected, key),
        choose_exact(
          local,
          imported,
          fuel,
          CoreTraversal.charge_machine_target(machine, key),
          owner,
          index,
          symbol,
          depth,
          expected,
          valid,
          enough,
          found
        ),
        target_context(key, local, imported, fuel, machine, owner, index, symbol, depth, expected)
      )

def targets_exact(
  +local: Maybe<&2, Core.Declaration>,
  +imported: Maybe<&2, Core.ImportBinding>,
  +fuel: Nat,
  +machine: Core.Machine,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool},
  enough: {Nat.is_le(Relation.spec_bound(CoreTraversal.machine_facts(machine)), fuel) == True{} : Bool},
  found: {
    Spec.find_declaration(CoreTraversal.machine_facts(machine), symbol, expected)
    == local
    : Maybe<&2, Core.Declaration>
  }
) -> {
      Machine.evaluate(
        fuel,
        CoreTraversal.ordinary_targets(machine, local, imported, owner, index, symbol, depth, expected)
      )
      == Reference.observation(
        Spec.ordinary_found(
          local,
          imported,
          State.state(machine),
          CoreTraversal.machine_facts(machine),
          CoreTraversal.machine_path(machine),
          symbol,
          owner,
          index,
          depth,
          expected,
          C.build_child(fuel)
        ),
        machine,
        fuel,
        owner,
        index
      )
      : Relation.Observation
    }:
  Equal.trans(
    Relation.Observation,
    Machine.evaluate(
      fuel,
      CoreTraversal.ordinary_targets(machine, local, imported, owner, index, symbol, depth, expected)
    ),
    observed_target(
      machine,
      local,
      imported,
      fuel,
      owner,
      index,
      symbol,
      depth,
      expected,
      CoreTraversal.reference_target_key(CoreTraversal.machine_path(machine), symbol, local, imported)
    ),
    observed_target(
      machine,
      local,
      imported,
      fuel,
      owner,
      index,
      symbol,
      depth,
      expected,
      Spec.identity_key(local, imported, CoreTraversal.machine_path(machine), symbol)
    ),
    target_key_branch_exact(
      CoreTraversal.reference_target_key(CoreTraversal.machine_path(machine), symbol, local, imported),
      local,
      imported,
      fuel,
      machine,
      owner,
      index,
      symbol,
      depth,
      expected,
      valid,
      enough,
      found
    ),
    Equal.cong(
      String,
      Relation.Observation,
      observed_target(machine, local, imported, fuel, owner, index, symbol, depth, expected),
      CoreTraversal.reference_target_key(CoreTraversal.machine_path(machine), symbol, local, imported),
      Spec.identity_key(local, imported, CoreTraversal.machine_path(machine), symbol),
      State.target_key_exact(CoreTraversal.machine_path(machine), symbol, local, imported)
    )
  )

def ordinary_exact(
  +fuel: Nat,
  +machine: Core.Machine,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool},
  enough: {Nat.is_le(Relation.spec_bound(CoreTraversal.machine_facts(machine)), fuel) == True{} : Bool}
) -> {
      Machine.evaluate(
        fuel,
        CoreTraversal.ordinary_reference(machine, owner, index, symbol, depth, expected)
      )
      == Reference.observation(
        Spec.ordinary(
          CoreTraversal.machine_facts(machine),
          CoreTraversal.machine_path(machine),
          symbol,
          owner,
          index,
          depth,
          expected,
          State.state(machine),
          C.build_child(fuel)
        ),
        machine,
        fuel,
        owner,
        index
      )
      : Relation.Observation
    }:
  %State.declaration_lookup_exact(CoreTraversal.machine_facts(machine), symbol, expected):
    {
      Machine.evaluate(
        fuel,
        CoreTraversal.ordinary_reference(machine, owner, index, symbol, depth, expected)
      )
      == Reference.observation(
        Spec.ordinary_found(
          _,
          Spec.find_import(CoreTraversal.machine_facts(machine), symbol),
          State.state(machine),
          CoreTraversal.machine_facts(machine),
          CoreTraversal.machine_path(machine),
          symbol,
          owner,
          index,
          depth,
          expected,
          C.build_child(fuel)
        ),
        machine,
        fuel,
        owner,
        index
      )
      : Relation.Observation
    }
  %State.import_lookup_exact(CoreTraversal.machine_facts(machine), symbol):
    {
      Machine.evaluate(
        fuel,
        CoreTraversal.ordinary_reference(machine, owner, index, symbol, depth, expected)
      )
      == Reference.observation(
        Spec.ordinary_found(
          CoreTraversal.declaration_lookup(CoreTraversal.machine_facts(machine), symbol, expected),
          _,
          State.state(machine),
          CoreTraversal.machine_facts(machine),
          CoreTraversal.machine_path(machine),
          symbol,
          owner,
          index,
          depth,
          expected,
          C.build_child(fuel)
        ),
        machine,
        fuel,
        owner,
        index
      )
      : Relation.Observation
    }
  targets_exact(
    CoreTraversal.declaration_lookup(CoreTraversal.machine_facts(machine), symbol, expected),
    CoreTraversal.import_lookup(CoreTraversal.machine_facts(machine), symbol),
    fuel,
    machine,
    owner,
    index,
    symbol,
    depth,
    expected,
    valid,
    enough,
    Equal.sym(
      Maybe<&2, Core.Declaration>,
      CoreTraversal.declaration_lookup(CoreTraversal.machine_facts(machine), symbol, expected),
      Spec.find_declaration(CoreTraversal.machine_facts(machine), symbol, expected),
      State.declaration_lookup_exact(CoreTraversal.machine_facts(machine), symbol, expected)
    )
  )

def bound_local_expand_if_exact(+binding: String,
  +seen: Bool,
  +fuel: Nat,
  +machine: Core.Machine,
  +declaration: Core.Declaration,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool},
  enough: {Nat.is_le(Relation.spec_bound(CoreTraversal.machine_facts(machine)), fuel) == True{} : Bool},
  found: {
    Spec.find_declaration(CoreTraversal.machine_facts(machine), binding, expected)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
) -> {
  Machine.evaluate(
    fuel,
    CoreTraversal.local_expand_if(seen, machine, declaration, owner, index, symbol, (depth + 1n : Nat))
  )
    == Reference.observation(
      Spec.child_or_cycle(
        seen,
        State.state(machine),
        CoreTraversal.machine_facts(machine),
        CoreTraversal.machine_path(machine),
        symbol,
        depth,
        expected,
        CoreTraversal.declaration_identity(declaration),
        next => C.build_child(fuel)(Spec.bound_child_request(binding, Spec.source_child_request(CoreTraversal.declaration_source(declaration), next)))
      ),
      machine,
      fuel,
      owner,
      index
    )
    : Relation.Observation
}:
  match seen:
    case True{}: Reference.included_exact(
      fuel,
      machine,
      owner,
      index,
      symbol,
      CoreTraversal.declaration_identity(declaration)
    )
    case False{}:
      %State.declaration_path_exact(declaration, CoreTraversal.machine_path(machine)):
        {Machine.evaluate(fuel, CoreTraversal.local_expand_if(False{}, machine, declaration,
          owner, index, symbol, (depth + 1n : Nat)))
          == Reference.observation(Spec.expanded_result(Spec.as_build(Spec.interpret(fuel,
            Spec.Request{CoreTraversal.machine_facts(machine), _, binding, expected,
              (depth + 1n : Nat), State.state(machine)})), symbol), machine, fuel, owner, index)
          : Relation.Observation}
      Reference.bound_selected_expansion_exact(binding, fuel,
      machine,
      declaration,
      owner,
      index,
      symbol,
      expected,
      (depth + 1n : Nat),
      valid,
      enough,
      found
    )


def bound_observed_cycle(+binding: String,
  +machine: Core.Machine,
  +declaration: Core.Declaration,
  +fuel: Nat,
  +owner: Nat,
  +index: Nat,
  symbol: String,
  depth: Nat,
  expected: Core.ExpectedKind,
  seen: Bool
) -> Relation.Observation:
  Reference.observation(
    Spec.child_or_cycle(
      seen,
      State.state(machine),
      CoreTraversal.machine_facts(machine),
      CoreTraversal.machine_path(machine),
      symbol,
      depth,
      expected,
      CoreTraversal.declaration_identity(declaration),
      next => C.build_child(fuel)(Spec.bound_child_request(binding, Spec.source_child_request(CoreTraversal.declaration_source(declaration), next)))
    ),
    machine,
    fuel,
    owner,
    index
  )


def bound_local_expand_exact(+binding: String,
  +fuel: Nat,
  +machine: Core.Machine,
  +declaration: Core.Declaration,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool},
  enough: {Nat.is_le(Relation.spec_bound(CoreTraversal.machine_facts(machine)), fuel) == True{} : Bool},
  found: {
    Spec.find_declaration(CoreTraversal.machine_facts(machine), binding, expected)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
) -> {
      Machine.evaluate(
        fuel,
        CoreTraversal.local_expand(machine, declaration, owner, index, symbol, (depth + 1n : Nat))
      )
      == bound_observed_cycle(binding,
        machine,
        declaration,
        fuel,
        owner,
        index,
        symbol,
        depth,
        expected,
        Spec.seen(State.state(machine), CoreTraversal.declaration_identity(declaration))
      )
      : Relation.Observation
    }:
  Equal.trans(
    Relation.Observation,
    Machine.evaluate(
      fuel,
      CoreTraversal.local_expand(machine, declaration, owner, index, symbol, (depth + 1n : Nat))
    ),
    bound_observed_cycle(binding,
      machine,
      declaration,
      fuel,
      owner,
      index,
      symbol,
      depth,
      expected,
      CoreTraversal.has_identity(CoreTraversal.machine_visited(machine), CoreTraversal.declaration_identity(declaration))
    ),
    bound_observed_cycle(binding,
      machine,
      declaration,
      fuel,
      owner,
      index,
      symbol,
      depth,
      expected,
      Spec.seen(State.state(machine), CoreTraversal.declaration_identity(declaration))
    ),
    bound_local_expand_if_exact(binding,
      CoreTraversal.has_identity(CoreTraversal.machine_visited(machine), CoreTraversal.declaration_identity(declaration)),
      fuel,
      machine,
      declaration,
      owner,
      index,
      symbol,
      depth,
      expected,
      valid,
      enough,
      found
    ),
    Equal.cong(
      Bool,
      Relation.Observation,
      bound_observed_cycle(binding, machine, declaration, fuel, owner, index, symbol, depth, expected),
      CoreTraversal.has_identity(CoreTraversal.machine_visited(machine), CoreTraversal.declaration_identity(declaration)),
      Spec.seen(State.state(machine), CoreTraversal.declaration_identity(declaration)),
      State.seen_exact(machine, CoreTraversal.declaration_identity(declaration))
    )
  )


def bound_observed_local_permit(+binding: String,
  +machine: Core.Machine,
  +declaration: Core.Declaration,
  +fuel: Nat,
  +owner: Nat,
  +index: Nat,
  symbol: String,
  depth: Nat,
  expected: Core.ExpectedKind,
  permit: Bool
) -> Relation.Observation:
  Reference.observation(
    Spec.local_allowed(
      permit,
      State.state(machine),
      CoreTraversal.machine_facts(machine),
      CoreTraversal.machine_path(machine),
      symbol,
      depth,
      expected,
      CoreTraversal.declaration_identity(declaration),
      next => C.build_child(fuel)(Spec.bound_child_request(binding, Spec.source_child_request(CoreTraversal.declaration_source(declaration), next)))
    ),
    machine,
    fuel,
    owner,
    index
  )


def bound_local_permit_exact(+binding: String,
  +permit: Bool,
  +fuel: Nat,
  +machine: Core.Machine,
  +declaration: Core.Declaration,
  +imported: Maybe<&2, Core.ImportBinding>,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool},
  enough: {Nat.is_le(Relation.spec_bound(CoreTraversal.machine_facts(machine)), fuel) == True{} : Bool},
  found: {
    Spec.find_declaration(CoreTraversal.machine_facts(machine), binding, expected)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
) -> {
      Machine.evaluate(
        fuel,
        CoreTraversal.ordinary_budget(
          permit,
          Some{declaration},
          imported,
          machine,
          owner,
          index,
          symbol,
          depth,
          expected
        )
      )
      == bound_observed_local_permit(binding,
        machine,
        declaration,
        fuel,
        owner,
        index,
        symbol,
        depth,
        expected,
        permit
      )
      : Relation.Observation
    }:
  match permit:
    case False{}: Reference.omitted_exact(
      fuel,
      machine,
      owner,
      index,
      symbol,
      Core.ReferenceLimit{}
    )
    case True{}: bound_local_expand_exact(binding,
      fuel,
      machine,
      declaration,
      owner,
      index,
      symbol,
      depth,
      expected,
      valid,
      enough,
      found
    )


def bound_local_charged_exact(+binding: String,
  +fuel: Nat,
  +machine: Core.Machine,
  +declaration: Core.Declaration,
  +imported: Maybe<&2, Core.ImportBinding>,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool},
  enough: {Nat.is_le(Relation.spec_bound(CoreTraversal.machine_facts(machine)), fuel) == True{} : Bool},
  found: {
    Spec.find_declaration(CoreTraversal.machine_facts(machine), binding, expected)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
) -> {
      Machine.evaluate(
        fuel,
        CoreTraversal.ordinary_charged(
          machine,
          Some{declaration},
          imported,
          owner,
          index,
          symbol,
          depth,
          expected
        )
      )
      == Reference.observation(
        Spec.local_budget(
          State.state(machine),
          CoreTraversal.machine_facts(machine),
          CoreTraversal.machine_path(machine),
          symbol,
          depth,
          expected,
          CoreTraversal.declaration_identity(declaration),
          next => C.build_child(fuel)(Spec.bound_child_request(binding, Spec.source_child_request(CoreTraversal.declaration_source(declaration), next)))
        ),
        machine,
        fuel,
        owner,
        index
      )
      : Relation.Observation
    }:
  Equal.trans(
    Relation.Observation,
    Machine.evaluate(
      fuel,
      CoreTraversal.ordinary_charged(
        machine,
        Some{declaration},
        imported,
        owner,
        index,
        symbol,
        depth,
        expected
      )
    ),
    bound_observed_local_permit(binding,
      machine,
      declaration,
      fuel,
      owner,
      index,
      symbol,
      depth,
      expected,
      CoreTraversal.machine_allows(machine)
    ),
    bound_observed_local_permit(binding,
      machine,
      declaration,
      fuel,
      owner,
      index,
      symbol,
      depth,
      expected,
      Spec.allowed(State.state(machine), CoreTraversal.machine_path(machine))
    ),
    bound_local_permit_exact(binding,
      CoreTraversal.machine_allows(machine),
      fuel,
      machine,
      declaration,
      imported,
      owner,
      index,
      symbol,
      depth,
      expected,
      valid,
      enough,
      found
    ),
    Equal.cong(
      Bool,
      Relation.Observation,
      bound_observed_local_permit(binding, machine, declaration, fuel, owner, index, symbol, depth, expected),
      CoreTraversal.machine_allows(machine),
      Spec.allowed(State.state(machine), CoreTraversal.machine_path(machine)),
      State.allowed_exact(machine)
    )
  )


def bound_work_context(+binding: String, +fuel: Nat, +machine: Core.Machine, +declaration: Core.Declaration,
    +owner: Nat, +index: Nat, +symbol: String, +depth: Nat, +expected: Core.ExpectedKind) -> {
      Reference.observation(
        Spec.local_budget(
          State.state(CoreTraversal.charge_machine_work(machine)),
          CoreTraversal.machine_facts(CoreTraversal.charge_machine_work(machine)),
          CoreTraversal.machine_path(CoreTraversal.charge_machine_work(machine)),
          symbol,
          depth,
          expected,
          CoreTraversal.declaration_identity(declaration),
          next => C.build_child(fuel)(Spec.bound_child_request(binding, Spec.source_child_request(CoreTraversal.declaration_source(declaration), next)))
        ),
        CoreTraversal.charge_machine_work(machine),
        fuel,
        owner,
        index
      )
      == Reference.observation(
        Spec.local_budget(
          Spec.local_work(State.state(machine)),
          CoreTraversal.machine_facts(machine),
          CoreTraversal.machine_path(machine),
          symbol,
          depth,
          expected,
          CoreTraversal.declaration_identity(declaration),
          next => C.build_child(fuel)(Spec.bound_child_request(binding, Spec.source_child_request(CoreTraversal.declaration_source(declaration), next)))
        ),
        machine,
        fuel,
        owner,
        index
      )
      : Relation.Observation
    }:
  match machine:
    case Core.Machine{
      +facts,
      +root_path,
      +frames,
      +visited,
      +budget,
      +address,
      +nodes,
      +slots,
      +pending
    }:
      +path = CoreTraversal.frame_path(frames, root_path)
      +machine = {Core.Machine{facts, root_path, frames, visited, budget, address, nodes, slots, pending} : Core.Machine}
      %State.work_exact(machine):
        {
          Reference.observation(
            Spec.local_budget(
              State.state(CoreTraversal.charge_machine_work(machine)),
              facts,
              path,
              symbol,
              depth,
              expected,
              CoreTraversal.declaration_identity(declaration),
              next => C.build_child(fuel)(Spec.bound_child_request(binding, Spec.source_child_request(CoreTraversal.declaration_source(declaration), next)))
            ),
            CoreTraversal.charge_machine_work(machine),
            fuel,
            owner,
            index
          )
          == Reference.observation(
            Spec.local_budget(
              _,
              facts,
              path,
              symbol,
              depth,
              expected,
              CoreTraversal.declaration_identity(declaration),
              next => C.build_child(fuel)(Spec.bound_child_request(binding, Spec.source_child_request(CoreTraversal.declaration_source(declaration), next)))
            ),
            machine,
            fuel,
            owner,
            index
          )
          : Relation.Observation
        }
      Reference.budget_context(
        Spec.local_budget(
          State.state(CoreTraversal.charge_machine_work(machine)),
          facts,
          path,
          symbol,
          depth,
          expected,
          CoreTraversal.declaration_identity(declaration),
          next => C.build_child(fuel)(Spec.bound_child_request(binding, Spec.source_child_request(CoreTraversal.declaration_source(declaration), next)))
        ),
        machine,
        CoreTraversal.charge_work(budget),
        fuel,
        owner,
        index
      )


def bound_work_exact(+binding: String,
  +fuel: Nat,
  +machine: Core.Machine,
  +declaration: Core.Declaration,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool},
  enough: {Nat.is_le(Relation.spec_bound(CoreTraversal.machine_facts(machine)), fuel) == True{} : Bool},
  found: {
    Spec.find_declaration(CoreTraversal.machine_facts(machine), binding, expected)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
) -> {
      Machine.evaluate(
        fuel,
        CoreTraversal.ordinary_charged(
          CoreTraversal.charge_machine_work(machine),
          Some{declaration},
          None{},
          owner,
          index,
          symbol,
          depth,
          expected
        )
      )
      == Reference.observation(
        Spec.local_budget(
          Spec.local_work(State.state(machine)),
          CoreTraversal.machine_facts(machine),
          CoreTraversal.machine_path(machine),
          symbol,
          depth,
          expected,
          CoreTraversal.declaration_identity(declaration),
          next => C.build_child(fuel)(Spec.bound_child_request(binding, Spec.source_child_request(CoreTraversal.declaration_source(declaration), next)))
        ),
        machine,
        fuel,
        owner,
        index
      )
      : Relation.Observation
    }:
  match machine:
    case Core.Machine{
      +facts,
      +root_path,
      +frames,
      +visited,
      +budget,
      +address,
      +nodes,
      +slots,
      +pending
    }:
      +path = CoreTraversal.frame_path(frames, root_path)
      +machine = {Core.Machine{facts, root_path, frames, visited, budget, address, nodes, slots, pending} : Core.Machine}
      Equal.trans(
        Relation.Observation,
        Machine.evaluate(
          fuel,
          CoreTraversal.ordinary_charged(
            CoreTraversal.charge_machine_work(machine),
            Some{declaration},
            None{},
            owner,
            index,
            symbol,
            depth,
            expected
          )
        ),
        Reference.observation(
          Spec.local_budget(
            State.state(CoreTraversal.charge_machine_work(machine)),
            facts,
            path,
            symbol,
            depth,
            expected,
            CoreTraversal.declaration_identity(declaration),
            next => C.build_child(fuel)(Spec.bound_child_request(binding, Spec.source_child_request(CoreTraversal.declaration_source(declaration), next)))
          ),
          CoreTraversal.charge_machine_work(machine),
          fuel,
          owner,
          index
        ),
        Reference.observation(
          Spec.local_budget(
            Spec.local_work(State.state(machine)),
            facts,
            path,
            symbol,
            depth,
            expected,
            CoreTraversal.declaration_identity(declaration),
            next => C.build_child(fuel)(Spec.bound_child_request(binding, Spec.source_child_request(CoreTraversal.declaration_source(declaration), next)))
          ),
          machine,
          fuel,
          owner,
          index
        ),
        bound_local_charged_exact(binding,
          fuel,
          CoreTraversal.charge_machine_work(machine),
          declaration,
          None{},
          owner,
          index,
          symbol,
          depth,
          expected,
          valid,
          enough,
          found
        ),
        bound_work_context(binding, fuel, machine, declaration, owner, index, symbol, depth, expected)
      )


def bound_observed_kind(+binding: String,
  +machine: Core.Machine,
  +declaration: Core.Declaration,
  +fuel: Nat,
  +owner: Nat,
  +index: Nat,
  symbol: String,
  depth: Nat,
  expected: Core.ExpectedKind,
  kind: Bool
) -> Relation.Observation:
  Reference.observation(
    Spec.local_kind(
      kind,
      State.state(machine),
      CoreTraversal.machine_facts(machine),
      CoreTraversal.machine_path(machine),
      symbol,
      depth,
      expected,
      CoreTraversal.declaration_identity(declaration),
      next => C.build_child(fuel)(Spec.bound_child_request(binding, Spec.source_child_request(CoreTraversal.declaration_source(declaration), next)))
    ),
    machine,
    fuel,
    owner,
    index
  )


def bound_kind_exact(+binding: String,
  +kind: Bool,
  +fuel: Nat,
  +machine: Core.Machine,
  +declaration: Core.Declaration,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool},
  enough: {Nat.is_le(Relation.spec_bound(CoreTraversal.machine_facts(machine)), fuel) == True{} : Bool},
  found: {
    Spec.find_declaration(CoreTraversal.machine_facts(machine), binding, expected)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
) -> {
      Machine.evaluate(
        fuel,
        CoreTraversal.ordinary_ambiguity(
          Bool.not(kind),
          Some{declaration},
          None{},
          machine,
          owner,
          index,
          symbol,
          depth,
          expected
        )
      )
      == bound_observed_kind(binding, machine, declaration, fuel, owner, index, symbol, depth, expected, kind)
      : Relation.Observation
    }:
  match kind:
    case False{}: Reference.omitted_exact(
      fuel,
      machine,
      owner,
      index,
      symbol,
      Core.UnsupportedTarget{}
    )
    case True{}: bound_work_exact(binding,
      fuel,
      machine,
      declaration,
      owner,
      index,
      symbol,
      depth,
      expected,
      valid,
      enough,
      found
    )


def bound_conflict_exact(+binding: String,
  +imported: Maybe<&2, Core.ImportBinding>,
  +declaration: Core.Declaration,
  +fuel: Nat,
  +machine: Core.Machine,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool},
  enough: {Nat.is_le(Relation.spec_bound(CoreTraversal.machine_facts(machine)), fuel) == True{} : Bool},
  found: {
    Spec.find_declaration(CoreTraversal.machine_facts(machine), binding, expected)
    == Some{declaration}
    : Maybe<&2, Core.Declaration>
  }
) -> {
      Machine.evaluate(
        fuel,
        CoreTraversal.ordinary_ambiguity(
          CoreTraversal.ambiguous(Some{declaration}, imported, expected),
          Some{declaration},
          imported,
          machine,
          owner,
          index,
          symbol,
          depth,
          expected
        )
      )
      == Reference.observation(
        Spec.local_conflict(
          imported,
          declaration,
          State.state(machine),
          CoreTraversal.machine_facts(machine),
          CoreTraversal.machine_path(machine),
          symbol,
          depth,
          expected,
          next => C.build_child(fuel)(Spec.bound_child_request(binding, next))
        ),
        machine,
        fuel,
        owner,
        index
      )
      : Relation.Observation
    }:
  match imported declaration:
    case Some{_} Core.Declaration{_, _, _, _, _, +source_path}:
      Reference.omitted_exact(fuel, machine, owner, index, symbol, Core.UnsupportedTarget{})
    case None{} Core.Declaration{+artifact, +identity, +function, +bundled, +references, +source_path}:
      +declaration = {Core.Declaration{artifact, identity, function, bundled, references, source_path} : Core.Declaration}
      Equal.trans(
        Relation.Observation,
        Machine.evaluate(
          fuel,
          CoreTraversal.ordinary_ambiguity(
            Bool.not(CoreTraversal.kind_matches(expected, function)),
            Some{declaration},
            None{},
            machine,
            owner,
            index,
            symbol,
            depth,
            expected
          )
        ),
        bound_observed_kind(binding,
          machine,
          declaration,
          fuel,
          owner,
          index,
          symbol,
          depth,
          expected,
          CoreTraversal.kind_matches(expected, function)
        ),
        bound_observed_kind(binding,
          machine,
          declaration,
          fuel,
          owner,
          index,
          symbol,
          depth,
          expected,
          Spec.matches(expected, function)
        ),
        bound_kind_exact(binding,
          CoreTraversal.kind_matches(expected, function),
          fuel,
          machine,
          declaration,
          owner,
          index,
          symbol,
          depth,
          expected,
          valid,
          enough,
          found
        ),
        Equal.cong(
          Bool,
          Relation.Observation,
          bound_observed_kind(binding, machine, declaration, fuel, owner, index, symbol, depth, expected),
          CoreTraversal.kind_matches(expected, function),
          Spec.matches(expected, function),
          State.kind_exact(expected, function)
        )
      )


def bound_choose_exact(+binding: String,
  +local: Maybe<&2, Core.Declaration>,
  +imported: Maybe<&2, Core.ImportBinding>,
  +fuel: Nat,
  +machine: Core.Machine,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool},
  enough: {Nat.is_le(Relation.spec_bound(CoreTraversal.machine_facts(machine)), fuel) == True{} : Bool},
  found: {
    Spec.find_declaration(CoreTraversal.machine_facts(machine), binding, expected)
    == local
    : Maybe<&2, Core.Declaration>
  }
) -> {
  Machine.evaluate(
    fuel,
    CoreTraversal.ordinary_ambiguity(
      CoreTraversal.ambiguous(local, imported, expected),
      local,
      imported,
      machine,
      owner,
      index,
      symbol,
      depth,
      expected
    )
  )
    == Reference.observation(
      Spec.choose_local(
        local,
        imported,
        State.state(machine),
        CoreTraversal.machine_facts(machine),
        CoreTraversal.machine_path(machine),
        symbol,
        owner,
        index,
        depth,
        expected,
        next => C.build_child(fuel)(Spec.bound_child_request(binding, next))
      ),
      machine,
      fuel,
      owner,
      index
    )
    : Relation.Observation
}:
  match local:
    case None{}: import_charged_exact(
      fuel,
      machine,
      imported,
      owner,
      index,
      symbol,
      depth,
      expected
    )
    case Some{declaration}: bound_conflict_exact(binding,
      imported,
      declaration,
      fuel,
      machine,
      owner,
      index,
      symbol,
      depth,
      expected,
      valid,
      enough,
      found
    )


def bound_observed_target(+binding: String,
  +machine: Core.Machine,
  local: Maybe<&2, Core.Declaration>,
  imported: Maybe<&2, Core.ImportBinding>,
  +fuel: Nat,
  +owner: Nat,
  +index: Nat,
  symbol: String,
  depth: Nat,
  expected: Core.ExpectedKind,
  key: String
) -> Relation.Observation:
  Reference.observation(
    Spec.choose_local(
      local,
      imported,
      Spec.target(State.state(machine), CoreTraversal.machine_path(machine), key),
      CoreTraversal.machine_facts(machine),
      CoreTraversal.machine_path(machine),
      symbol,
      owner,
      index,
      depth,
      expected,
      next => C.build_child(fuel)(Spec.bound_child_request(binding, next))
    ),
    machine,
    fuel,
    owner,
    index
  )


def bound_target_context(+binding: String,
  +key: String,
  +local: Maybe<&2, Core.Declaration>,
  +imported: Maybe<&2, Core.ImportBinding>,
  +fuel: Nat,
  +machine: Core.Machine,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind
) -> {
      Reference.observation(
        Spec.choose_local(
          local,
          imported,
          State.state(CoreTraversal.charge_machine_target(machine, key)),
          CoreTraversal.machine_facts(CoreTraversal.charge_machine_target(machine, key)),
          CoreTraversal.machine_path(CoreTraversal.charge_machine_target(machine, key)),
          symbol,
          owner,
          index,
          depth,
          expected,
          next => C.build_child(fuel)(Spec.bound_child_request(binding, next))
        ),
        CoreTraversal.charge_machine_target(machine, key),
        fuel,
        owner,
        index
      )
      == bound_observed_target(binding, machine, local, imported, fuel, owner, index, symbol, depth, expected, key)
      : Relation.Observation
    }:
  match machine:
    case Core.Machine{
      +facts,
      +root_path,
      +frames,
      +visited,
      +budget,
      +address,
      +nodes,
      +slots,
      +pending
    }:
      +path = CoreTraversal.frame_path(frames, root_path)
      +machine = {Core.Machine{facts, root_path, frames, visited, budget, address, nodes, slots, pending} : Core.Machine}
      %State.target_exact(machine, key):
        {
          Reference.observation(
            Spec.choose_local(
              local,
              imported,
              State.state(CoreTraversal.charge_machine_target(machine, key)),
              facts,
              path,
              symbol,
              owner,
              index,
              depth,
              expected,
              next => C.build_child(fuel)(Spec.bound_child_request(binding, next))
            ),
            CoreTraversal.charge_machine_target(machine, key),
            fuel,
            owner,
            index
          )
          == Reference.observation(
            Spec.choose_local(
              local,
              imported,
              _,
              facts,
              path,
              symbol,
              owner,
              index,
              depth,
              expected,
              next => C.build_child(fuel)(Spec.bound_child_request(binding, next))
            ),
            machine,
            fuel,
            owner,
            index
          )
          : Relation.Observation
        }
      Reference.budget_context(
        Spec.choose_local(
          local,
          imported,
          State.state(CoreTraversal.charge_machine_target(machine, key)),
          facts,
          path,
          symbol,
          owner,
          index,
          depth,
          expected,
          next => C.build_child(fuel)(Spec.bound_child_request(binding, next))
        ),
        machine,
        CoreTraversal.charge_target(budget, path, key),
        fuel,
        owner,
        index
      )


def bound_target_key_branch_exact(+binding: String,
  +key: String,
  +local: Maybe<&2, Core.Declaration>,
  +imported: Maybe<&2, Core.ImportBinding>,
  +fuel: Nat,
  +machine: Core.Machine,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool},
  enough: {Nat.is_le(Relation.spec_bound(CoreTraversal.machine_facts(machine)), fuel) == True{} : Bool},
  found: {
    Spec.find_declaration(CoreTraversal.machine_facts(machine), binding, expected)
    == local
    : Maybe<&2, Core.Declaration>
  }
) -> {
      Machine.evaluate(
        fuel,
        CoreTraversal.ordinary_ambiguity(
          CoreTraversal.ambiguous(local, imported, expected),
          local,
          imported,
          CoreTraversal.charge_machine_target(machine, key),
          owner,
          index,
          symbol,
          depth,
          expected
        )
      )
      == bound_observed_target(binding, machine, local, imported, fuel, owner, index, symbol, depth, expected, key)
      : Relation.Observation
    }:
  match machine:
    case Core.Machine{
      +facts,
      +root_path,
      +frames,
      +visited,
      +budget,
      +address,
      +nodes,
      +slots,
      +pending
    }:
      +path = CoreTraversal.frame_path(frames, root_path)
      +machine = {Core.Machine{facts, root_path, frames, visited, budget, address, nodes, slots, pending} : Core.Machine}
      Equal.trans(
        Relation.Observation,
        Machine.evaluate(
          fuel,
          CoreTraversal.ordinary_ambiguity(
            CoreTraversal.ambiguous(local, imported, expected),
            local,
            imported,
            CoreTraversal.charge_machine_target(machine, key),
            owner,
            index,
            symbol,
            depth,
            expected
          )
        ),
        Reference.observation(
          Spec.choose_local(
            local,
            imported,
            State.state(CoreTraversal.charge_machine_target(machine, key)),
            facts,
            path,
            symbol,
            owner,
            index,
            depth,
            expected,
            next => C.build_child(fuel)(Spec.bound_child_request(binding, next))
          ),
          CoreTraversal.charge_machine_target(machine, key),
          fuel,
          owner,
          index
        ),
        bound_observed_target(binding, machine, local, imported, fuel, owner, index, symbol, depth, expected, key),
        bound_choose_exact(binding,
          local,
          imported,
          fuel,
          CoreTraversal.charge_machine_target(machine, key),
          owner,
          index,
          symbol,
          depth,
          expected,
          valid,
          enough,
          found
        ),
        bound_target_context(binding, key, local, imported, fuel, machine, owner, index, symbol, depth, expected)
      )


def bound_targets_exact(+binding: String,
  +local: Maybe<&2, Core.Declaration>,
  +imported: Maybe<&2, Core.ImportBinding>,
  +fuel: Nat,
  +machine: Core.Machine,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool},
  enough: {Nat.is_le(Relation.spec_bound(CoreTraversal.machine_facts(machine)), fuel) == True{} : Bool},
  found: {
    Spec.find_declaration(CoreTraversal.machine_facts(machine), binding, expected)
    == local
    : Maybe<&2, Core.Declaration>
  }
) -> {
      Machine.evaluate(
        fuel,
        CoreTraversal.ordinary_targets(machine, local, imported, owner, index, symbol, depth, expected)
      )
      == Reference.observation(
        Spec.ordinary_found(
          local,
          imported,
          State.state(machine),
          CoreTraversal.machine_facts(machine),
          CoreTraversal.machine_path(machine),
          symbol,
          owner,
          index,
          depth,
          expected,
          next => C.build_child(fuel)(Spec.bound_child_request(binding, next))
        ),
        machine,
        fuel,
        owner,
        index
      )
      : Relation.Observation
    }:
  Equal.trans(
    Relation.Observation,
    Machine.evaluate(
      fuel,
      CoreTraversal.ordinary_targets(machine, local, imported, owner, index, symbol, depth, expected)
    ),
    bound_observed_target(binding,
      machine,
      local,
      imported,
      fuel,
      owner,
      index,
      symbol,
      depth,
      expected,
      CoreTraversal.reference_target_key(CoreTraversal.machine_path(machine), symbol, local, imported)
    ),
    bound_observed_target(binding,
      machine,
      local,
      imported,
      fuel,
      owner,
      index,
      symbol,
      depth,
      expected,
      Spec.identity_key(local, imported, CoreTraversal.machine_path(machine), symbol)
    ),
    bound_target_key_branch_exact(binding,
      CoreTraversal.reference_target_key(CoreTraversal.machine_path(machine), symbol, local, imported),
      local,
      imported,
      fuel,
      machine,
      owner,
      index,
      symbol,
      depth,
      expected,
      valid,
      enough,
      found
    ),
    Equal.cong(
      String,
      Relation.Observation,
      bound_observed_target(binding, machine, local, imported, fuel, owner, index, symbol, depth, expected),
      CoreTraversal.reference_target_key(CoreTraversal.machine_path(machine), symbol, local, imported),
      Spec.identity_key(local, imported, CoreTraversal.machine_path(machine), symbol),
      State.target_key_exact(CoreTraversal.machine_path(machine), symbol, local, imported)
    )
  )


def bound_ordinary_exact(+binding: String,
  +fuel: Nat,
  +machine: Core.Machine,
  +owner: Nat,
  +index: Nat,
  +symbol: String,
  +depth: Nat,
  +expected: Core.ExpectedKind,
  valid: {Patricia.canonical(Bool, CoreTraversal.machine_visited(machine)) == True{} : Bool},
  enough: {Nat.is_le(Relation.spec_bound(CoreTraversal.machine_facts(machine)), fuel) == True{} : Bool}
) -> {
      Machine.evaluate(
        fuel,
        CoreTraversal.bound_named_reference(None{}, binding, machine, owner, index, symbol, depth, expected)
      )
      == Reference.observation(
        Spec.bound_named(None{}, binding,
          CoreTraversal.machine_facts(machine),
          CoreTraversal.machine_path(machine),
          symbol,
          owner,
          index,
          depth,
          expected,
          State.state(machine),
          C.build_child(fuel)
        ),
        machine,
        fuel,
        owner,
        index
      )
      : Relation.Observation
    }:
  %State.declaration_lookup_exact(CoreTraversal.machine_facts(machine), binding, expected):
    {
      Machine.evaluate(
        fuel,
        CoreTraversal.bound_named_reference(None{}, binding, machine, owner, index, symbol, depth, expected)
      )
      == Reference.observation(
        Spec.ordinary_found(
          _,
          Spec.find_import(CoreTraversal.machine_facts(machine), symbol),
          State.state(machine),
          CoreTraversal.machine_facts(machine),
          CoreTraversal.machine_path(machine),
          symbol,
          owner,
          index,
          depth,
          expected,
          next => C.build_child(fuel)(Spec.bound_child_request(binding, next))
        ),
        machine,
        fuel,
        owner,
        index
      )
      : Relation.Observation
    }
  %State.import_lookup_exact(CoreTraversal.machine_facts(machine), symbol):
    {
      Machine.evaluate(
        fuel,
        CoreTraversal.bound_named_reference(None{}, binding, machine, owner, index, symbol, depth, expected)
      )
      == Reference.observation(
        Spec.ordinary_found(
          CoreTraversal.declaration_lookup(CoreTraversal.machine_facts(machine), binding, expected),
          _,
          State.state(machine),
          CoreTraversal.machine_facts(machine),
          CoreTraversal.machine_path(machine),
          symbol,
          owner,
          index,
          depth,
          expected,
          next => C.build_child(fuel)(Spec.bound_child_request(binding, next))
        ),
        machine,
        fuel,
        owner,
        index
      )
      : Relation.Observation
    }
  bound_targets_exact(binding,
    CoreTraversal.declaration_lookup(CoreTraversal.machine_facts(machine), binding, expected),
    CoreTraversal.import_lookup(CoreTraversal.machine_facts(machine), symbol),
    fuel,
    machine,
    owner,
    index,
    symbol,
    depth,
    expected,
    valid,
    enough,
    Equal.sym(
      Maybe<&2, Core.Declaration>,
      CoreTraversal.declaration_lookup(CoreTraversal.machine_facts(machine), binding, expected),
      Spec.find_declaration(CoreTraversal.machine_facts(machine), binding, expected),
      State.declaration_lookup_exact(CoreTraversal.machine_facts(machine), binding, expected)
    )
  )
